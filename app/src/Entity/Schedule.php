<?php

namespace App\Entity;

use App\Repository\ScheduleRepository;
use Doctrine\ORM\EntityManagerInterface;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ScheduleRepository::class)]
class Schedule
{
    public const PHASE_COLLECT = 'collect';
    public const PHASE_EXTRACT = 'extract';
    public const PHASE_CLEANUP = 'cleanup';
    public const PHASE_COMPLIANCE = 'compliance';
    public const PHASE_REPORT = 'report';
    public const PHASE_MAIL = 'mail';

    public const STATUS_DISPATCHING = 'dispatching';
    public const STATUS_RUNNING = 'running';

    public const NODE_MODE_ALL = 'all';
    public const NODE_MODE_TAG = 'tag';
    public const NODE_MODE_INDIVIDUAL = 'individual';

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

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $nodeSelectionMode = null;

    #[ORM\Column(nullable: true)]
    private ?int $nodeTagId = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $nodeIds = null;

    #[ORM\Column]
    private bool $collectEnabled = false;

    #[ORM\Column]
    private bool $extractEnabled = false;

    #[ORM\Column]
    private bool $cleanupEnabled = false;

    #[ORM\Column]
    private bool $complianceEnabled = false;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $reportIds = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $mailReportIds = null;

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
    public function getNodeSelectionMode(): ?string { return $this->nodeSelectionMode; }
    public function setNodeSelectionMode(?string $v): static { $this->nodeSelectionMode = $v; return $this; }
    public function getNodeTagId(): ?int { return $this->nodeTagId; }
    public function setNodeTagId(?int $v): static { $this->nodeTagId = $v; return $this; }
    public function getNodeIds(): ?array { return $this->nodeIds; }
    public function setNodeIds(?array $v): static { $this->nodeIds = $v; return $this; }
    public function isCollectEnabled(): bool { return $this->collectEnabled; }
    public function setCollectEnabled(bool $v): static { $this->collectEnabled = $v; return $this; }
    public function isExtractEnabled(): bool { return $this->extractEnabled; }
    public function setExtractEnabled(bool $v): static { $this->extractEnabled = $v; return $this; }
    public function isCleanupEnabled(): bool { return $this->cleanupEnabled; }
    public function setCleanupEnabled(bool $v): static { $this->cleanupEnabled = $v; return $this; }
    public function isComplianceEnabled(): bool { return $this->complianceEnabled; }
    public function setComplianceEnabled(bool $v): static { $this->complianceEnabled = $v; return $this; }
    public function getReportIds(): ?array { return $this->reportIds; }
    public function setReportIds(?array $v): static { $this->reportIds = $v; return $this; }
    public function getMailReportIds(): ?array { return $this->mailReportIds; }
    public function setMailReportIds(?array $v): static { $this->mailReportIds = $v; return $this; }
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
        if ($this->collectEnabled) return self::PHASE_COLLECT;
        if ($this->extractEnabled) return self::PHASE_EXTRACT;
        if ($this->cleanupEnabled) return self::PHASE_CLEANUP;
        if ($this->complianceEnabled) return self::PHASE_COMPLIANCE;
        if (!empty($this->reportIds)) return self::PHASE_REPORT;
        if (!empty($this->mailReportIds)) return self::PHASE_MAIL;
        return null;
    }

    public function getNextPhase(string $completedPhase): ?string
    {
        $order = [
            self::PHASE_COLLECT,
            self::PHASE_EXTRACT,
            self::PHASE_CLEANUP,
            self::PHASE_COMPLIANCE,
            self::PHASE_REPORT,
            self::PHASE_MAIL,
        ];
        $idx = array_search($completedPhase, $order, true);
        if ($idx === false) return null;

        for ($i = $idx + 1; $i < count($order); $i++) {
            $p = $order[$i];
            if ($p === self::PHASE_EXTRACT && $this->extractEnabled) return $p;
            if ($p === self::PHASE_CLEANUP && $this->cleanupEnabled) return $p;
            if ($p === self::PHASE_COMPLIANCE && $this->complianceEnabled) return $p;
            if ($p === self::PHASE_REPORT && !empty($this->reportIds)) return $p;
            if ($p === self::PHASE_MAIL && !empty($this->mailReportIds)) return $p;
        }
        return null;
    }

    /**
     * Resolve the effective list of Node IDs to operate on, based on
     * `nodeSelectionMode` ('all' | 'tag' | 'individual'). Combines manual
     * tags (Node ↔ NodeTag) and dynamic tags (NodeDynamicTag) when in tag mode.
     *
     * @return int[]
     */
    public function resolveNodeIds(EntityManagerInterface $em): array
    {
        $mode = $this->nodeSelectionMode;
        $contextId = $this->context->getId();

        if ($mode === self::NODE_MODE_ALL) {
            $rows = $em->createQuery(
                'SELECT n.id FROM App\Entity\Node n WHERE n.context = :ctx'
            )->setParameter('ctx', $contextId)->getArrayResult();
            return array_map(fn($r) => (int) $r['id'], $rows);
        }

        if ($mode === self::NODE_MODE_TAG && $this->nodeTagId) {
            $tagId = $this->nodeTagId;

            $manualRows = $em->createQuery(
                'SELECT DISTINCT n.id FROM App\Entity\Node n JOIN n.tags t WHERE n.context = :ctx AND t.id = :tagId'
            )->setParameters(['ctx' => $contextId, 'tagId' => $tagId])->getArrayResult();

            $dynamicRows = $em->createQuery(
                'SELECT DISTINCT IDENTITY(d.node) AS id FROM App\Entity\NodeDynamicTag d JOIN d.node n WHERE n.context = :ctx AND d.tag = :tagId'
            )->setParameters(['ctx' => $contextId, 'tagId' => $tagId])->getArrayResult();

            $ids = [];
            foreach ($manualRows as $r) $ids[(int) $r['id']] = true;
            foreach ($dynamicRows as $r) $ids[(int) $r['id']] = true;
            return array_keys($ids);
        }

        if ($mode === self::NODE_MODE_INDIVIDUAL && !empty($this->nodeIds)) {
            // Filter by context for safety
            $rows = $em->createQuery(
                'SELECT n.id FROM App\Entity\Node n WHERE n.context = :ctx AND n.id IN (:ids)'
            )->setParameters(['ctx' => $contextId, 'ids' => $this->nodeIds])->getArrayResult();
            return array_map(fn($r) => (int) $r['id'], $rows);
        }

        return [];
    }
}
