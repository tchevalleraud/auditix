<?php

namespace App\Entity;

use App\Repository\ScheduleRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ScheduleRepository::class)]
class Schedule
{
    public const PHASE_COLLECTION = 'collection';
    public const PHASE_COMPLIANCE = 'compliance';
    public const PHASE_REPORT = 'report';

    public const STATUS_DISPATCHING = 'dispatching';
    public const STATUS_RUNNING = 'running';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Context $context;

    #[ORM\Column(length: 255)]
    private string $cronExpression;

    #[ORM\Column]
    private bool $enabled = true;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $currentPhase = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $currentPhaseStatus = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastTriggeredAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastCompletedAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $nextRunAt = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $collectionNodeIds = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $complianceNodeIds = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $reportIds = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $collectionIds = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $updatedAt = null;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    public function getCronExpression(): string { return $this->cronExpression; }
    public function setCronExpression(string $v): static { $this->cronExpression = $v; return $this; }
    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }
    public function getCurrentPhase(): ?string { return $this->currentPhase; }
    public function setCurrentPhase(?string $v): static { $this->currentPhase = $v; return $this; }
    public function getCurrentPhaseStatus(): ?string { return $this->currentPhaseStatus; }
    public function setCurrentPhaseStatus(?string $v): static { $this->currentPhaseStatus = $v; return $this; }
    public function getLastTriggeredAt(): ?\DateTimeImmutable { return $this->lastTriggeredAt; }
    public function setLastTriggeredAt(?\DateTimeImmutable $v): static { $this->lastTriggeredAt = $v; return $this; }
    public function getLastCompletedAt(): ?\DateTimeImmutable { return $this->lastCompletedAt; }
    public function setLastCompletedAt(?\DateTimeImmutable $v): static { $this->lastCompletedAt = $v; return $this; }
    public function getNextRunAt(): ?\DateTimeImmutable { return $this->nextRunAt; }
    public function setNextRunAt(?\DateTimeImmutable $v): static { $this->nextRunAt = $v; return $this; }
    public function getCollectionNodeIds(): ?array { return $this->collectionNodeIds; }
    public function setCollectionNodeIds(?array $v): static { $this->collectionNodeIds = $v; return $this; }
    public function getComplianceNodeIds(): ?array { return $this->complianceNodeIds; }
    public function setComplianceNodeIds(?array $v): static { $this->complianceNodeIds = $v; return $this; }
    public function getReportIds(): ?array { return $this->reportIds; }
    public function setReportIds(?array $v): static { $this->reportIds = $v; return $this; }
    public function getCollectionIds(): ?array { return $this->collectionIds; }
    public function setCollectionIds(?array $v): static { $this->collectionIds = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): ?\DateTimeImmutable { return $this->updatedAt; }
    public function setUpdatedAt(?\DateTimeImmutable $v): static { $this->updatedAt = $v; return $this; }

    public function isIdle(): bool
    {
        return $this->currentPhase === null;
    }

    public function getFirstPhase(): ?string
    {
        if (!empty($this->collectionNodeIds)) return self::PHASE_COLLECTION;
        if (!empty($this->complianceNodeIds)) return self::PHASE_COMPLIANCE;
        if (!empty($this->reportIds)) return self::PHASE_REPORT;
        return null;
    }

    public function getNextPhase(string $completedPhase): ?string
    {
        if ($completedPhase === self::PHASE_COLLECTION) {
            if (!empty($this->complianceNodeIds)) return self::PHASE_COMPLIANCE;
            if (!empty($this->reportIds)) return self::PHASE_REPORT;
        }
        if ($completedPhase === self::PHASE_COMPLIANCE) {
            if (!empty($this->reportIds)) return self::PHASE_REPORT;
        }
        return null;
    }
}
