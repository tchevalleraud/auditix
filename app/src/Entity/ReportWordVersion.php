<?php

namespace App\Entity;

use App\Repository\ReportWordVersionRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ReportWordVersionRepository::class)]
#[ORM\Table(name: 'report_word_version')]
#[ORM\Index(name: 'idx_report_word_version_report', columns: ['report_id'])]
class ReportWordVersion
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_RUNNING = 'running';
    public const STATUS_FAILED = 'failed';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Report::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Report $report;

    /**
     * Target node for `node`-type reports. Null for `general` reports.
     */
    #[ORM\ManyToOne(targetEntity: Node::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?Node $node = null;

    /**
     * Snapshot of the node label at generation time, so the versions table stays
     * readable even if the node is later renamed or detached.
     */
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $nodeLabel = null;

    /**
     * Incremental version number, scoped per report (and per node for node reports).
     */
    #[ORM\Column]
    private int $versionNumber = 1;

    #[ORM\Column(length: 500, nullable: true)]
    private ?string $filePath = null;

    #[ORM\Column(nullable: true)]
    private ?int $fileSize = null;

    /**
     * null = ready, 'pending'/'running' while generating, 'failed' on error.
     */
    #[ORM\Column(length: 20, nullable: true)]
    private ?string $status = self::STATUS_PENDING;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $error = null;

    #[ORM\Column]
    private bool $isCurrent = false;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $createdBy = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getReport(): Report { return $this->report; }
    public function setReport(Report $v): static { $this->report = $v; return $this; }
    public function getNode(): ?Node { return $this->node; }
    public function setNode(?Node $v): static { $this->node = $v; return $this; }
    public function getNodeLabel(): ?string { return $this->nodeLabel; }
    public function setNodeLabel(?string $v): static { $this->nodeLabel = $v; return $this; }
    public function getVersionNumber(): int { return $this->versionNumber; }
    public function setVersionNumber(int $v): static { $this->versionNumber = $v; return $this; }
    public function getFilePath(): ?string { return $this->filePath; }
    public function setFilePath(?string $v): static { $this->filePath = $v; return $this; }
    public function getFileSize(): ?int { return $this->fileSize; }
    public function setFileSize(?int $v): static { $this->fileSize = $v; return $this; }
    public function getStatus(): ?string { return $this->status; }
    public function setStatus(?string $v): static { $this->status = $v; return $this; }
    public function getError(): ?string { return $this->error; }
    public function setError(?string $v): static { $this->error = $v; return $this; }
    public function isCurrent(): bool { return $this->isCurrent; }
    public function setIsCurrent(bool $v): static { $this->isCurrent = $v; return $this; }
    public function getCreatedBy(): ?string { return $this->createdBy; }
    public function setCreatedBy(?string $v): static { $this->createdBy = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function setCreatedAt(\DateTimeImmutable $v): static { $this->createdAt = $v; return $this; }
}
