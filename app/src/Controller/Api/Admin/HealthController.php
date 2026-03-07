<?php

namespace App\Controller\Api\Admin;

use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/health')]
class HealthController extends AbstractController
{
    #[Route('', methods: ['GET'])]
    public function index(Connection $connection): JsonResponse
    {
        $containers = $this->getDockerContainers();
        $services = [];

        // Infrastructure services
        $infraServices = ['nginx', 'node', 'php', 'postgres', 'rabbitmq', 'mercure'];
        foreach ($infraServices as $serviceName) {
            $entry = ['name' => $serviceName, 'status' => 'unknown'];
            $matching = array_filter($containers, fn($c) => ($c['service'] ?? '') === $serviceName);

            if (!empty($matching)) {
                $container = reset($matching);
                $state = $container['state'] ?? '';
                $entry['status'] = $state === 'running' ? 'healthy' : 'unhealthy';

                if (!empty($container['health'])) {
                    $entry['status'] = $container['health'] === 'healthy' ? 'healthy' : 'unhealthy';
                }

                $entry['image'] = $container['image'] ?? null;
            }

            // Enrich with version info
            if ($serviceName === 'php' && $entry['status'] === 'healthy') {
                $entry['version'] = PHP_VERSION;
            }
            if ($serviceName === 'postgres' && $entry['status'] === 'healthy') {
                try {
                    $result = $connection->executeQuery("SELECT version()")->fetchOne();
                    if ($result && preg_match('/PostgreSQL ([\d.]+)/', $result, $m)) {
                        $entry['version'] = $m[1];
                    }
                } catch (\Throwable) {}
            }

            $services[] = $entry;
        }

        // Worker services — group by service name, count replicas
        $workerServices = ['worker-scheduler', 'worker-monitoring', 'worker-collector', 'worker-generator', 'worker-cleanup'];
        foreach ($workerServices as $workerName) {
            $matching = array_filter($containers, fn($c) => ($c['service'] ?? '') === $workerName);
            $total = count($matching);
            $running = count(array_filter($matching, fn($c) => ($c['state'] ?? '') === 'running'));

            $status = 'unknown';
            if ($total > 0) {
                $status = $running === $total ? 'healthy' : ($running > 0 ? 'degraded' : 'unhealthy');
            }

            $services[] = [
                'name' => $workerName,
                'status' => $status,
                'replicas' => $running,
                'totalReplicas' => $total,
            ];
        }

        return $this->json($services);
    }

    private function getDockerContainers(): array
    {
        $socketPath = '/var/run/docker.sock';
        if (!file_exists($socketPath)) {
            return [];
        }

        $project = $_ENV['DOCKER_COMPOSE_PROJECT'] ?? 'auditix';

        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_UNIX_SOCKET_PATH => $socketPath,
            CURLOPT_URL => 'http://localhost/containers/json?all=true&filters=' . urlencode(json_encode([
                'label' => ["com.docker.compose.project=$project"],
            ])),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 5,
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode !== 200 || !$response) {
            return [];
        }

        $data = json_decode($response, true);
        if (!is_array($data)) {
            return [];
        }

        $containers = [];
        foreach ($data as $container) {
            $labels = $container['Labels'] ?? [];
            $state = strtolower($container['State'] ?? 'unknown');

            // Extract health from Status field (e.g. "Up 3 hours (healthy)")
            $statusStr = $container['Status'] ?? '';
            $health = '';
            if (preg_match('/\((healthy|unhealthy)\)/', $statusStr, $m)) {
                $health = $m[1];
            }

            $containers[] = [
                'service' => $labels['com.docker.compose.service'] ?? '',
                'state' => $state,
                'health' => $health,
                'image' => $container['Image'] ?? '',
            ];
        }

        return $containers;
    }
}
