<?php

namespace App\Controller\Api\Admin;

use App\Repository\WorkerPoolSettingsRepository;
use App\Service\RabbitMqManagementClient;
use Doctrine\DBAL\Connection;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/admin/health')]
class HealthController extends AbstractController
{
    private const SCALABLE_SERVICES = [
        'worker-monitoring',
        'worker-collector',
        'worker-generator',
        'worker-compliance',
        'worker-vulnerability',
        'worker-system-update',
    ];

    private const SINGLETON_WORKERS = [
        'worker-scheduler',
        'worker-cleanup',
        'worker-orchestrator',
        'worker-supervisor',
    ];

    public function __construct(
        private readonly WorkerPoolSettingsRepository $poolRepo,
        private readonly RabbitMqManagementClient $rabbit,
    ) {
    }

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

            if ($serviceName === 'php' && $entry['status'] === 'healthy') {
                $entry['version'] = PHP_VERSION;
            }
            if ($serviceName === 'postgres' && $entry['status'] === 'healthy') {
                try {
                    $result = $connection->executeQuery('SELECT version()')->fetchOne();
                    if ($result && preg_match('/PostgreSQL ([\d.]+)/', $result, $m)) {
                        $entry['version'] = $m[1];
                    }
                } catch (\Throwable) {}
            }

            $services[] = $entry;
        }

        // Singleton workers (not auto-scaled)
        foreach (self::SINGLETON_WORKERS as $workerName) {
            $services[] = $this->summarizeWorker($workerName, $containers);
        }

        // Scalable workers — enrich with pool settings + queue stats
        $poolByService = [];
        foreach ($this->poolRepo->findAllOrdered() as $settings) {
            $poolByService[$settings->getServiceName()] = $settings;
        }

        foreach (self::SCALABLE_SERVICES as $workerName) {
            $entry = $this->summarizeWorker($workerName, $containers);
            $settings = $poolByService[$workerName] ?? null;
            if ($settings !== null) {
                $stats = $this->rabbit->getQueueStats($settings->getQueue());
                $entry['pool'] = [
                    'queue' => $settings->getQueue(),
                    'enabled' => $settings->isEnabled(),
                    'minContainers' => $settings->getMinContainers(),
                    'maxContainers' => $settings->getMaxContainers(),
                    'minProcesses' => $settings->getMinProcessesPerContainer(),
                    'maxProcesses' => $settings->getMaxProcessesPerContainer(),
                    'queueReady' => $stats['ready'] ?? null,
                    'queueUnacked' => $stats['unacked'] ?? null,
                    'queueConsumers' => $stats['consumers'] ?? null,
                ];
            }
            $services[] = $entry;
        }

        return $this->json($services);
    }

    private function summarizeWorker(string $workerName, array $containers): array
    {
        $matching = array_filter($containers, fn($c) => ($c['service'] ?? '') === $workerName);
        $total = count($matching);
        $running = count(array_filter($matching, fn($c) => ($c['state'] ?? '') === 'running'));

        $status = 'unknown';
        if ($total > 0) {
            $status = $running === $total ? 'healthy' : ($running > 0 ? 'degraded' : 'unhealthy');
        }

        return [
            'name' => $workerName,
            'status' => $status,
            'replicas' => $running,
            'totalReplicas' => $total,
        ];
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
