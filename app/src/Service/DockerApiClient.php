<?php

namespace App\Service;

use Symfony\Component\DependencyInjection\Attribute\Autowire;

class DockerApiClient
{
    private const SOCKET_PATH = '/var/run/docker.sock';

    public function __construct(
        #[Autowire('%env(DOCKER_COMPOSE_PROJECT)%')]
        private readonly string $project = 'auditix',
    ) {
    }

    public function isAvailable(): bool
    {
        return file_exists(self::SOCKET_PATH);
    }

    public function getProject(): string
    {
        return $this->project;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function findContainerByName(string $name): ?array
    {
        $filters = json_encode(['name' => [ltrim($name, '/')]]);
        $data = $this->get('/containers/json?all=true&filters=' . urlencode($filters));
        if (!is_array($data)) {
            return null;
        }
        foreach ($data as $c) {
            $names = $c['Names'] ?? [];
            $cname = is_array($names) && !empty($names) ? trim((string) $names[0], '/') : '';
            if ($cname === ltrim($name, '/')) {
                return $c;
            }
        }
        return null;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listContainersByService(string $service, bool $all = true): array
    {
        $filters = json_encode([
            'label' => [
                'com.docker.compose.project=' . $this->project,
                'com.docker.compose.service=' . $service,
            ],
        ]);
        $url = '/containers/json?all=' . ($all ? 'true' : 'false') . '&filters=' . urlencode($filters);
        $data = $this->get($url);
        return is_array($data) ? $data : [];
    }

    /**
     * @return array<string, mixed>|null
     */
    public function inspectContainer(string $id): ?array
    {
        $data = $this->get('/containers/' . rawurlencode($id) . '/json');
        return is_array($data) ? $data : null;
    }

    /**
     * @param array<string, mixed> $config
     * @return array{Id: string}|null
     */
    public string $lastError = '';

    public function createContainer(string $name, array $config): ?array
    {
        $response = $this->request('POST', '/containers/create?name=' . rawurlencode($name), $config);
        if (!is_array($response) || !isset($response['Id'])) {
            return null;
        }
        return ['Id' => (string) $response['Id']];
    }

    public function startContainer(string $id): bool
    {
        $code = $this->requestRaw('POST', '/containers/' . rawurlencode($id) . '/start', null);
        return $code === 204 || $code === 304;
    }

    public function stopContainer(string $id, int $timeoutSeconds = 30): bool
    {
        $code = $this->requestRaw('POST', '/containers/' . rawurlencode($id) . '/stop?t=' . $timeoutSeconds, null);
        return $code === 204 || $code === 304;
    }

    public function removeContainer(string $id, bool $force = false): bool
    {
        $code = $this->requestRaw('DELETE', '/containers/' . rawurlencode($id) . ($force ? '?force=true' : ''), null);
        return $code === 204 || $code === 404;
    }

    public function killContainer(string $id, string $signal = 'SIGTERM'): bool
    {
        $code = $this->requestRaw('POST', '/containers/' . rawurlencode($id) . '/kill?signal=' . rawurlencode($signal), '');
        return $code === 204;
    }

    private function get(string $path): mixed
    {
        if (!$this->isAvailable()) {
            return null;
        }
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_UNIX_SOCKET_PATH => self::SOCKET_PATH,
            CURLOPT_URL => 'http://localhost' . $path,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 8,
        ]);
        $response = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code !== 200 || !is_string($response)) {
            return null;
        }
        return json_decode($response, true);
    }

    private function request(string $method, string $path, mixed $body): mixed
    {
        if (!$this->isAvailable()) {
            return null;
        }
        $ch = curl_init();
        $payload = $body === null ? '' : json_encode($body);
        curl_setopt_array($ch, [
            CURLOPT_UNIX_SOCKET_PATH => self::SOCKET_PATH,
            CURLOPT_URL => 'http://localhost' . $path,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 15,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        ]);
        $response = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($code < 200 || $code >= 300) {
            $this->lastError = sprintf('http=%d body=%s', $code, is_string($response) ? substr($response, 0, 500) : 'n/a');
            return null;
        }
        if (!is_string($response) || $response === '') {
            return [];
        }
        return json_decode($response, true);
    }

    private function requestRaw(string $method, string $path, ?string $body): int
    {
        if (!$this->isAvailable()) {
            return 0;
        }
        $ch = curl_init();
        curl_setopt_array($ch, [
            CURLOPT_UNIX_SOCKET_PATH => self::SOCKET_PATH,
            CURLOPT_URL => 'http://localhost' . $path,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 60,
            CURLOPT_CUSTOMREQUEST => $method,
            CURLOPT_POSTFIELDS => $body ?? '',
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
        ]);
        curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        return (int) $code;
    }
}
