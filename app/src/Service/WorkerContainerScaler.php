<?php

namespace App\Service;

use App\Entity\WorkerPoolSettings;
use App\Repository\WorkerPoolSettingsRepository;
use Psr\Log\LoggerInterface;
use Psr\Log\NullLogger;

class WorkerContainerScaler
{
    /** @var array<string, int> queue => last time backlog was high */
    private array $highBacklogSince = [];

    /** @var array<string, int> queue => last time backlog was zero */
    private array $idleSince = [];

    public function __construct(
        private readonly WorkerPoolSettingsRepository $repository,
        private readonly DockerApiClient $docker,
        private readonly RabbitMqManagementClient $rabbit,
        private LoggerInterface $logger = new NullLogger(),
    ) {
    }

    public function setLogger(LoggerInterface $logger): void
    {
        $this->logger = $logger;
    }

    /**
     * Reconcile each queue's container count to the desired value.
     * @return array<string, array{queue: string, current: int, desired: int, action: string, message: ?string}>
     */
    public function reconcileAll(): array
    {
        if (!$this->docker->isAvailable()) {
            return [];
        }

        $results = [];
        foreach ($this->repository->findAllOrdered() as $settings) {
            $results[$settings->getQueue()] = $this->reconcileOne($settings);
        }
        return $results;
    }

    /**
     * @return array{queue: string, current: int, desired: int, action: string, message: ?string}
     */
    public function reconcileOne(WorkerPoolSettings $settings): array
    {
        $service = $settings->getServiceName();
        $queue = $settings->getQueue();
        $now = time();

        $containers = $this->listLiveContainers($service);
        $currentCount = count($containers);

        if (!$settings->isEnabled()) {
            // Scale down to zero when disabled
            $message = null;
            if ($currentCount > 0) {
                $this->scaleDown($settings, $containers, $currentCount);
                $message = 'disabled, scaled down';
            }
            return [
                'queue' => $queue,
                'current' => $currentCount,
                'desired' => 0,
                'action' => $currentCount > 0 ? 'scale_down' : 'noop',
                'message' => $message,
            ];
        }

        $desired = $this->decideDesiredContainers($settings, $currentCount, $now);

        // Always enforce min/max bounds
        $desired = max($settings->getMinContainers(), min($settings->getMaxContainers(), $desired));

        if ($desired > $currentCount) {
            $created = $this->scaleUp($settings, $containers, $desired - $currentCount);
            return [
                'queue' => $queue,
                'current' => $currentCount + $created,
                'desired' => $desired,
                'action' => 'scale_up',
                'message' => sprintf('spawned %d container(s)', $created),
            ];
        }

        if ($desired < $currentCount) {
            $removed = $this->scaleDown($settings, $containers, $currentCount - $desired);
            return [
                'queue' => $queue,
                'current' => $currentCount - $removed,
                'desired' => $desired,
                'action' => 'scale_down',
                'message' => sprintf('removed %d container(s)', $removed),
            ];
        }

        return [
            'queue' => $queue,
            'current' => $currentCount,
            'desired' => $desired,
            'action' => 'noop',
            'message' => null,
        ];
    }

    private function decideDesiredContainers(WorkerPoolSettings $settings, int $current, int $now): int
    {
        // Hard bounds enforcement: if the user lowered max or raised min, snap
        // to the new bound immediately without waiting for idle / backlog.
        if ($current > $settings->getMaxContainers()) {
            unset($this->idleSince[$settings->getQueue()], $this->highBacklogSince[$settings->getQueue()]);
            return $settings->getMaxContainers();
        }
        if ($current < $settings->getMinContainers()) {
            unset($this->idleSince[$settings->getQueue()], $this->highBacklogSince[$settings->getQueue()]);
            return $settings->getMinContainers();
        }

        $queue = $settings->getQueue();
        $stats = $this->rabbit->getQueueStats($queue);

        if ($stats === null) {
            return max($current, $settings->getMinContainers());
        }

        $ready = $stats['ready'];
        $unacked = $stats['unacked'];
        $consumers = max(1, $stats['consumers']);

        // High backlog => scale up after 30s sustained
        $threshold = $settings->getScaleUpThreshold();
        $totalBacklogPerConsumer = $ready / $consumers;

        if ($totalBacklogPerConsumer >= $threshold && $current >= $settings->getMaxContainers()) {
            // already maxed out, can't scale up further
            unset($this->highBacklogSince[$queue]);
        } elseif ($totalBacklogPerConsumer >= $threshold) {
            $this->highBacklogSince[$queue] ??= $now;
            if ($now - $this->highBacklogSince[$queue] >= 30) {
                unset($this->highBacklogSince[$queue]);
                $this->logger->info('Scaling up containers', ['queue' => $queue, 'ready' => $ready, 'consumers' => $consumers]);
                return min($settings->getMaxContainers(), $current + 1);
            }
        } else {
            unset($this->highBacklogSince[$queue]);
        }

        // No backlog and no work for `scaleDownIdleSeconds` => scale down
        if ($ready === 0 && $unacked === 0) {
            $this->idleSince[$queue] ??= $now;
            if ($current > $settings->getMinContainers() && ($now - $this->idleSince[$queue]) >= $settings->getScaleDownIdleSeconds()) {
                unset($this->idleSince[$queue]);
                $this->logger->info('Scaling down containers', ['queue' => $queue]);
                return max($settings->getMinContainers(), $current - 1);
            }
        } else {
            unset($this->idleSince[$queue]);
        }

        return $current;
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    public function listLiveContainers(string $service): array
    {
        $containers = $this->docker->listContainersByService($service, true);
        return array_values(array_filter($containers, function (array $c): bool {
            $state = strtolower((string) ($c['State'] ?? ''));
            return $state === 'running' || $state === 'created' || $state === 'restarting';
        }));
    }

    /**
     * @param array<int, array<string, mixed>> $existing
     */
    private function scaleUp(WorkerPoolSettings $settings, array $existing, int $count): int
    {
        $crossService = false;
        $template = $existing[0] ?? null;

        if ($template === null) {
            // Fallback: borrow any other worker container of the project as template.
            // We then patch Cmd/Env/Labels/Aliases to make it look like our service.
            $template = $this->findCrossServiceTemplate($settings->getServiceName());
            if ($template === null) {
                $this->logger->warning('Cannot scale up: no template container available (no other worker either)', [
                    'service' => $settings->getServiceName(),
                ]);
                return 0;
            }
            $crossService = true;
        }

        $templateId = (string) ($template['Id'] ?? '');
        $inspected = $this->docker->inspectContainer($templateId);
        if ($inspected === null) {
            return 0;
        }

        // Include ALL containers (incl. stopped) of this service so we can
        // reuse stopped ones rather than colliding on their name (HTTP 409).
        $allOfService = $this->docker->listContainersByService($settings->getServiceName(), true);
        $existingNumbers = $this->extractContainerNumbers($allOfService);
        $stoppedById = [];
        foreach ($allOfService as $c) {
            $state = strtolower((string) ($c['State'] ?? ''));
            if (!in_array($state, ['running', 'created', 'restarting'], true)) {
                $num = $this->extractContainerNumber($c);
                $stoppedById[$num] = (string) ($c['Id'] ?? '');
            }
        }

        $created = 0;

        for ($i = 0; $i < $count; $i++) {
            // Reuse a stopped container of this service if one exists
            if (!empty($stoppedById)) {
                $reuseNumber = array_key_first($stoppedById);
                $reuseId = $stoppedById[$reuseNumber];
                unset($stoppedById[$reuseNumber]);
                if ($this->docker->startContainer($reuseId)) {
                    $this->logger->info('Reused stopped container', [
                        'service' => $settings->getServiceName(),
                        'number' => $reuseNumber,
                    ]);
                    $created++;
                    continue;
                }
                // Reuse failed; remove it so its name is freed
                $this->docker->removeContainer($reuseId, true);
            }

            $nextNumber = $this->findNextAvailableNumber($existingNumbers);
            $name = sprintf('%s-%s-%d', $this->docker->getProject(), $settings->getServiceName(), $nextNumber);
            $config = $this->buildConfigFromTemplate($inspected, $settings->getServiceName(), $nextNumber, $settings->getQueue(), $crossService);

            $result = $this->docker->createContainer($name, $config);
            if ($result === null) {
                // Conflict on name? Drop the orphan and let the next tick retry.
                if (str_contains($this->docker->lastError, 'already in use')) {
                    $this->cleanupOrphan($name);
                }
                $this->logger->error('Failed to create container', ['name' => $name, 'docker' => $this->docker->lastError]);
                continue;
            }

            if (!$this->docker->startContainer($result['Id'])) {
                $this->logger->error('Failed to start container', ['name' => $name]);
                $this->docker->removeContainer($result['Id'], true);
                continue;
            }

            $existingNumbers[] = $nextNumber;
            $created++;
        }

        return $created;
    }

    private function cleanupOrphan(string $name): void
    {
        $c = $this->docker->findContainerByName($name);
        if ($c === null) {
            return;
        }
        $id = (string) ($c['Id'] ?? '');
        if ($id !== '') {
            $this->docker->removeContainer($id, true);
            $this->logger->info('Removed orphan container', ['name' => $name]);
        }
    }

    /**
     * Find any other running worker container in the project to use as template.
     * Used when the target service has 0 containers (e.g. after re-enabling).
     *
     * @return array<string, mixed>|null
     */
    private function findCrossServiceTemplate(string $excludeService): ?array
    {
        foreach (WorkerPoolSettings::QUEUES as $queue) {
            $candidateService = 'worker-' . str_replace('_', '-', $queue);
            if ($candidateService === $excludeService) {
                continue;
            }
            $cs = $this->listLiveContainers($candidateService);
            if (!empty($cs)) {
                return $cs[0];
            }
        }
        // Last resort: any worker-* container alive
        foreach (['worker-monitoring', 'worker-collector', 'worker-generator', 'worker-compliance', 'worker-vulnerability', 'worker-system-update', 'worker-orchestrator', 'worker-scheduler', 'worker-cleanup'] as $svc) {
            if ($svc === $excludeService) {
                continue;
            }
            $cs = $this->listLiveContainers($svc);
            if (!empty($cs)) {
                return $cs[0];
            }
        }
        return null;
    }

    /**
     * @param array<int, array<string, mixed>> $containers
     */
    private function scaleDown(WorkerPoolSettings $settings, array $containers, int $count): int
    {
        // Sort by container number DESC so we remove the newest replicas first
        usort($containers, function (array $a, array $b): int {
            return $this->extractContainerNumber($b) <=> $this->extractContainerNumber($a);
        });

        $removed = 0;
        for ($i = 0; $i < min($count, count($containers)); $i++) {
            $id = (string) ($containers[$i]['Id'] ?? '');
            if ($id === '') {
                continue;
            }

            // Don't kill the original "1" replica unless explicitly disabled
            $number = $this->extractContainerNumber($containers[$i]);
            if ($number === 1 && $settings->isEnabled() && $settings->getMinContainers() >= 1) {
                continue;
            }

            $this->docker->stopContainer($id, 30);
            $this->docker->removeContainer($id, true);
            $removed++;
        }

        return $removed;
    }

    /**
     * @param array<int, array<string, mixed>> $containers
     * @return array<int, int>
     */
    private function extractContainerNumbers(array $containers): array
    {
        $numbers = [];
        foreach ($containers as $c) {
            $numbers[] = $this->extractContainerNumber($c);
        }
        return array_values(array_filter($numbers, fn(int $n) => $n > 0));
    }

    /**
     * @param array<string, mixed> $container
     */
    private function extractContainerNumber(array $container): int
    {
        $labels = $container['Labels'] ?? [];
        if (isset($labels['com.docker.compose.container-number'])) {
            return (int) $labels['com.docker.compose.container-number'];
        }
        $names = $container['Names'] ?? [];
        $name = is_array($names) && !empty($names) ? (string) $names[0] : '';
        if (preg_match('/-(\d+)$/', trim($name, '/'), $m)) {
            return (int) $m[1];
        }
        return 0;
    }

    /**
     * @param array<int, int> $existingNumbers
     */
    private function findNextAvailableNumber(array $existingNumbers): int
    {
        sort($existingNumbers);
        for ($i = 1; $i <= 1000; $i++) {
            if (!in_array($i, $existingNumbers, true)) {
                return $i;
            }
        }
        return count($existingNumbers) + 1;
    }

    /**
     * @param array<string, mixed> $inspected
     * @return array<string, mixed>
     */
    private function buildConfigFromTemplate(array $inspected, string $serviceName, int $number, ?string $queue = null, bool $crossService = false): array
    {
        $config = $inspected['Config'] ?? [];
        $hostConfig = $inspected['HostConfig'] ?? [];
        $networkSettings = $inspected['NetworkSettings'] ?? [];

        // Update labels: keep compose labels so the container shows up in
        // `docker compose ps`. Override service-specific keys when needed.
        $labels = is_array($config['Labels'] ?? null) ? $config['Labels'] : [];
        $labels['com.docker.compose.container-number'] = (string) $number;
        if ($crossService) {
            $labels['com.docker.compose.service'] = $serviceName;
            // Drop the borrowed config-hash; this container's effective config
            // differs from the template service. `docker compose ps` will not
            // see it, but it will still run correctly.
            unset($labels['com.docker.compose.config-hash']);
        }

        $cmd = $config['Cmd'] ?? null;
        $env = $config['Env'] ?? null;
        if ($crossService && $queue !== null) {
            // Force the worker pool command for the target queue
            $cmd = ['php', 'bin/console', 'app:worker:pool', $queue];
            // Replace WORKER_SERVICE_NAME in env
            if (is_array($env)) {
                $patched = [];
                $found = false;
                foreach ($env as $line) {
                    if (is_string($line) && str_starts_with($line, 'WORKER_SERVICE_NAME=')) {
                        $patched[] = 'WORKER_SERVICE_NAME=' . $serviceName;
                        $found = true;
                    } else {
                        $patched[] = $line;
                    }
                }
                if (!$found) {
                    $patched[] = 'WORKER_SERVICE_NAME=' . $serviceName;
                }
                $env = $patched;
            }
        }

        $networks = is_array($networkSettings['Networks'] ?? null) ? $networkSettings['Networks'] : [];
        $networkConfig = ['EndpointsConfig' => []];
        $shortId = substr((string) ($inspected['Id'] ?? ''), 0, 12);
        foreach ($networks as $netName => $netData) {
            $aliases = [$serviceName];
            if (is_array($netData['Aliases'] ?? null)) {
                foreach ($netData['Aliases'] as $alias) {
                    if (!is_string($alias)) {
                        continue;
                    }
                    if ($alias === $shortId || $alias === '') {
                        continue;
                    }
                    if (!in_array($alias, $aliases, true)) {
                        $aliases[] = $alias;
                    }
                }
            }
            $networkConfig['EndpointsConfig'][$netName] = ['Aliases' => $aliases];
        }

        $cleanHostConfig = [
            'Binds' => $hostConfig['Binds'] ?? null,
            'NetworkMode' => $hostConfig['NetworkMode'] ?? 'default',
            'RestartPolicy' => $hostConfig['RestartPolicy'] ?? ['Name' => 'unless-stopped'],
            'LogConfig' => $this->normalizeLogConfig($hostConfig['LogConfig'] ?? null),
            'Memory' => $hostConfig['Memory'] ?? 0,
            'CpuShares' => $hostConfig['CpuShares'] ?? 0,
            'AutoRemove' => false,
            'Privileged' => $hostConfig['Privileged'] ?? false,
            'CapAdd' => $hostConfig['CapAdd'] ?? null,
            'CapDrop' => $hostConfig['CapDrop'] ?? null,
            'Devices' => $hostConfig['Devices'] ?? null,
            'GroupAdd' => $hostConfig['GroupAdd'] ?? null,
            'OomKillDisable' => $hostConfig['OomKillDisable'] ?? null,
            'PidMode' => $hostConfig['PidMode'] ?? '',
            'IpcMode' => $hostConfig['IpcMode'] ?? '',
            'UTSMode' => $hostConfig['UTSMode'] ?? '',
            'UsernsMode' => $hostConfig['UsernsMode'] ?? '',
            'ReadonlyRootfs' => $hostConfig['ReadonlyRootfs'] ?? false,
            'SecurityOpt' => $hostConfig['SecurityOpt'] ?? null,
            'ShmSize' => $hostConfig['ShmSize'] ?? 0,
        ];

        return [
            'Hostname' => null,
            'Image' => $config['Image'] ?? null,
            'Cmd' => $cmd,
            'Entrypoint' => $config['Entrypoint'] ?? null,
            'Env' => $env,
            'Labels' => $labels,
            'WorkingDir' => $config['WorkingDir'] ?? null,
            'User' => $config['User'] ?? null,
            'AttachStdin' => false,
            'AttachStdout' => false,
            'AttachStderr' => false,
            'Tty' => $config['Tty'] ?? false,
            'OpenStdin' => $config['OpenStdin'] ?? false,
            'HostConfig' => $cleanHostConfig,
            'NetworkingConfig' => $networkConfig,
        ];
    }

    /**
     * Docker expects HostConfig.LogConfig.Config as a map, not an array.
     * When inspected output returns an empty PHP array `[]` it serializes to `[]`
     * which Docker rejects. Force it to an object (\stdClass).
     *
     * @param mixed $logConfig
     * @return array<string, mixed>|null
     */
    private function normalizeLogConfig(mixed $logConfig): ?array
    {
        if (!is_array($logConfig)) {
            return null;
        }
        $type = $logConfig['Type'] ?? null;
        $cfg = $logConfig['Config'] ?? null;
        $normalized = ['Type' => $type ?: 'json-file'];
        if (is_array($cfg) && !empty($cfg) && !array_is_list($cfg)) {
            $normalized['Config'] = $cfg;
        } else {
            $normalized['Config'] = new \stdClass();
        }
        return $normalized;
    }
}
