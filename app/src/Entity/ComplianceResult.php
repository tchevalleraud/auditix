<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Index(columns: ['policy_id', 'node_id'], name: 'idx_result_policy_node')]
#[ORM\Index(columns: ['node_id'], name: 'idx_result_node')]
#[ORM\UniqueConstraint(name: 'uniq_result_policy_rule_node', columns: ['policy_id', 'rule_id', 'node_id'])]
class ComplianceResult
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: CompliancePolicy::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private CompliancePolicy $policy;

    #[ORM\ManyToOne(targetEntity: ComplianceRule::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ComplianceRule $rule;

    #[ORM\ManyToOne(targetEntity: Node::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Node $node;

    #[ORM\Column(length: 20)]
    private string $status; // compliant, non_compliant, error, not_applicable, skipped

    #[ORM\Column(length: 10, nullable: true)]
    private ?string $severity = null; // info, low, medium, high, critical

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $message = null;

    #[ORM\Column]
    private \DateTimeImmutable $evaluatedAt;

    public function __construct()
    {
        $this->evaluatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getPolicy(): CompliancePolicy { return $this->policy; }
    public function setPolicy(CompliancePolicy $v): static { $this->policy = $v; return $this; }
    public function getRule(): ComplianceRule { return $this->rule; }
    public function setRule(ComplianceRule $v): static { $this->rule = $v; return $this; }
    public function getNode(): Node { return $this->node; }
    public function setNode(Node $v): static { $this->node = $v; return $this; }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $v): static { $this->status = $v; return $this; }
    public function getSeverity(): ?string { return $this->severity; }
    public function setSeverity(?string $v): static { $this->severity = $v; return $this; }
    public function getMessage(): ?string { return $this->message; }
    public function setMessage(?string $v): static { $this->message = $v; return $this; }
    public function getEvaluatedAt(): \DateTimeImmutable { return $this->evaluatedAt; }
    public function setEvaluatedAt(\DateTimeImmutable $v): static { $this->evaluatedAt = $v; return $this; }
}
