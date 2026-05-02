<?php

namespace App\Repository;

use App\Entity\WorkerPoolSettings;
use Doctrine\Bundle\DoctrineBundle\Repository\ServiceEntityRepository;
use Doctrine\Persistence\ManagerRegistry;

/**
 * @extends ServiceEntityRepository<WorkerPoolSettings>
 */
class WorkerPoolSettingsRepository extends ServiceEntityRepository
{
    private const SERVICE_MAP = [
        WorkerPoolSettings::QUEUE_MONITORING => 'worker-monitoring',
        WorkerPoolSettings::QUEUE_COLLECTOR => 'worker-collector',
        WorkerPoolSettings::QUEUE_GENERATOR => 'worker-generator',
        WorkerPoolSettings::QUEUE_COMPLIANCE => 'worker-compliance',
        WorkerPoolSettings::QUEUE_VULNERABILITY => 'worker-vulnerability',
        WorkerPoolSettings::QUEUE_SYSTEM_UPDATE => 'worker-system-update',
    ];

    public function __construct(ManagerRegistry $registry)
    {
        parent::__construct($registry, WorkerPoolSettings::class);
    }

    /**
     * @return WorkerPoolSettings[]
     */
    public function findAllOrdered(): array
    {
        $existing = $this->findBy([], ['queue' => 'ASC']);
        $byQueue = [];
        foreach ($existing as $row) {
            $byQueue[$row->getQueue()] = $row;
        }

        $em = $this->getEntityManager();
        $created = false;
        foreach (WorkerPoolSettings::QUEUES as $queue) {
            if (!isset($byQueue[$queue])) {
                $serviceName = self::SERVICE_MAP[$queue] ?? ('worker-' . str_replace('_', '-', $queue));
                $row = new WorkerPoolSettings($queue, $serviceName);
                $this->applyDefaults($row);
                $em->persist($row);
                $byQueue[$queue] = $row;
                $created = true;
            }
        }
        if ($created) {
            $em->flush();
        }

        $ordered = [];
        foreach (WorkerPoolSettings::QUEUES as $queue) {
            $ordered[] = $byQueue[$queue];
        }
        return $ordered;
    }

    public function findByQueue(string $queue): ?WorkerPoolSettings
    {
        return $this->find($queue);
    }

    public function findByServiceName(string $serviceName): ?WorkerPoolSettings
    {
        return $this->findOneBy(['serviceName' => $serviceName]);
    }

    private function applyDefaults(WorkerPoolSettings $row): void
    {
        match ($row->getQueue()) {
            WorkerPoolSettings::QUEUE_COLLECTOR => $row
                ->setMinContainers(1)
                ->setMaxContainers(3)
                ->setMinProcessesPerContainer(2)
                ->setMaxProcessesPerContainer(4)
                ->setMemoryLimitMb(256),
            WorkerPoolSettings::QUEUE_MONITORING => $row
                ->setMinContainers(1)
                ->setMaxContainers(2)
                ->setMinProcessesPerContainer(2)
                ->setMaxProcessesPerContainer(4)
                ->setMemoryLimitMb(256),
            WorkerPoolSettings::QUEUE_GENERATOR => $row
                ->setMinContainers(1)
                ->setMaxContainers(2)
                ->setMinProcessesPerContainer(1)
                ->setMaxProcessesPerContainer(2)
                ->setMemoryLimitMb(512),
            WorkerPoolSettings::QUEUE_COMPLIANCE => $row
                ->setMinContainers(1)
                ->setMaxContainers(2)
                ->setMinProcessesPerContainer(1)
                ->setMaxProcessesPerContainer(2)
                ->setMemoryLimitMb(256),
            WorkerPoolSettings::QUEUE_VULNERABILITY,
            WorkerPoolSettings::QUEUE_SYSTEM_UPDATE => $row
                ->setMinContainers(1)
                ->setMaxContainers(1)
                ->setMinProcessesPerContainer(1)
                ->setMaxProcessesPerContainer(1)
                ->setMemoryLimitMb(256),
            default => null,
        };
    }
}
