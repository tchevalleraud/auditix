<?php

namespace App\Entity;

use App\Repository\WorkerPoolSettingsRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: WorkerPoolSettingsRepository::class)]
#[ORM\Table(name: 'worker_pool_settings')]
class WorkerPoolSettings
{
    public const QUEUE_MONITORING = 'monitoring';
    public const QUEUE_COLLECTOR = 'collector';
    public const QUEUE_GENERATOR = 'generator';
    public const QUEUE_COMPLIANCE = 'compliance';
    public const QUEUE_VULNERABILITY = 'vulnerability';
    public const QUEUE_SYSTEM_UPDATE = 'system_update';

    public const QUEUES = [
        self::QUEUE_MONITORING,
        self::QUEUE_COLLECTOR,
        self::QUEUE_GENERATOR,
        self::QUEUE_COMPLIANCE,
        self::QUEUE_VULNERABILITY,
        self::QUEUE_SYSTEM_UPDATE,
    ];

    #[ORM\Id]
    #[ORM\Column(length: 64)]
    private string $queue;

    #[ORM\Column(length: 64)]
    private string $serviceName;

    #[ORM\Column(options: ['default' => true])]
    private bool $enabled = true;

    #[ORM\Column(options: ['default' => 1])]
    private int $minContainers = 1;

    #[ORM\Column(options: ['default' => 1])]
    private int $maxContainers = 1;

    #[ORM\Column(options: ['default' => 1])]
    private int $minProcessesPerContainer = 1;

    #[ORM\Column(options: ['default' => 2])]
    private int $maxProcessesPerContainer = 2;

    #[ORM\Column(options: ['default' => 5])]
    private int $scaleUpThreshold = 5;

    #[ORM\Column(options: ['default' => 120])]
    private int $scaleDownIdleSeconds = 120;

    #[ORM\Column(options: ['default' => 512])]
    private int $memoryLimitMb = 512;

    #[ORM\Column(options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $updatedAt;

    public function __construct(string $queue, string $serviceName)
    {
        $this->queue = $queue;
        $this->serviceName = $serviceName;
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getQueue(): string { return $this->queue; }
    public function getServiceName(): string { return $this->serviceName; }
    public function setServiceName(string $v): static { $this->serviceName = $v; return $this; }

    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }

    public function getMinContainers(): int { return $this->minContainers; }
    public function setMinContainers(int $v): static
    {
        $this->minContainers = max(1, $v);
        if ($this->maxContainers < $this->minContainers) {
            $this->maxContainers = $this->minContainers;
        }
        return $this;
    }

    public function getMaxContainers(): int { return $this->maxContainers; }
    public function setMaxContainers(int $v): static
    {
        $this->maxContainers = max($this->minContainers, $v);
        return $this;
    }

    public function getMinProcessesPerContainer(): int { return $this->minProcessesPerContainer; }
    public function setMinProcessesPerContainer(int $v): static
    {
        $this->minProcessesPerContainer = max(1, $v);
        if ($this->maxProcessesPerContainer < $this->minProcessesPerContainer) {
            $this->maxProcessesPerContainer = $this->minProcessesPerContainer;
        }
        return $this;
    }

    public function getMaxProcessesPerContainer(): int { return $this->maxProcessesPerContainer; }
    public function setMaxProcessesPerContainer(int $v): static
    {
        $this->maxProcessesPerContainer = max($this->minProcessesPerContainer, $v);
        return $this;
    }

    public function getScaleUpThreshold(): int { return $this->scaleUpThreshold; }
    public function setScaleUpThreshold(int $v): static { $this->scaleUpThreshold = max(1, $v); return $this; }

    public function getScaleDownIdleSeconds(): int { return $this->scaleDownIdleSeconds; }
    public function setScaleDownIdleSeconds(int $v): static { $this->scaleDownIdleSeconds = max(10, $v); return $this; }

    public function getMemoryLimitMb(): int { return $this->memoryLimitMb; }
    public function setMemoryLimitMb(int $v): static { $this->memoryLimitMb = max(64, $v); return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): void { $this->updatedAt = new \DateTimeImmutable(); }
}
