<?php

namespace App\Entity;

use App\Repository\EnforceResultRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: EnforceResultRepository::class)]
#[ORM\Table(name: 'enforce_result')]
#[ORM\Index(columns: ['node_id'], name: 'idx_enforce_result_node')]
#[ORM\Index(columns: ['executed_at'], name: 'idx_enforce_result_executed_at')]
class EnforceResult
{
    public const STATUS_SUCCESS = 'success';
    public const STATUS_FAILED = 'failed';
    public const STATUS_SKIPPED = 'skipped';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Node::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Node $node;

    #[ORM\ManyToOne(targetEntity: CompliancePolicy::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?CompliancePolicy $policy = null;

    #[ORM\ManyToOne(targetEntity: ComplianceRule::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?ComplianceRule $rule = null;

    #[ORM\Column(type: 'text')]
    private string $command;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $output = null;

    #[ORM\Column(length: 20)]
    private string $status;

    #[ORM\Column(type: 'integer')]
    private int $attempts = 1;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $error = null;

    #[ORM\Column]
    private \DateTimeImmutable $executedAt;

    public function __construct()
    {
        $this->executedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getNode(): Node { return $this->node; }
    public function setNode(Node $v): static { $this->node = $v; return $this; }
    public function getPolicy(): ?CompliancePolicy { return $this->policy; }
    public function setPolicy(?CompliancePolicy $v): static { $this->policy = $v; return $this; }
    public function getRule(): ?ComplianceRule { return $this->rule; }
    public function setRule(?ComplianceRule $v): static { $this->rule = $v; return $this; }
    public function getCommand(): string { return $this->command; }
    public function setCommand(string $v): static { $this->command = $v; return $this; }
    public function getOutput(): ?string { return $this->output; }
    public function setOutput(?string $v): static { $this->output = $v; return $this; }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $v): static { $this->status = $v; return $this; }
    public function getAttempts(): int { return $this->attempts; }
    public function setAttempts(int $v): static { $this->attempts = $v; return $this; }
    public function getError(): ?string { return $this->error; }
    public function setError(?string $v): static { $this->error = $v; return $this; }
    public function getExecutedAt(): \DateTimeImmutable { return $this->executedAt; }
    public function setExecutedAt(\DateTimeImmutable $v): static { $this->executedAt = $v; return $this; }
}
