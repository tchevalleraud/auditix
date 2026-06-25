<?php

namespace App\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
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

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $messageLong = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $recommendation = null;

    #[ORM\Column(length: 10, nullable: true)]
    private ?string $recommendationType = null;

    #[ORM\Column]
    private \DateTimeImmutable $evaluatedAt;

    /**
     * True when this result comes from a rule evaluated per inventory key
     * (loop mode); the per-key detail lives in {@see $items}.
     */
    #[ORM\Column]
    private bool $perKey = false;

    #[ORM\Column]
    private int $itemsTotal = 0;

    #[ORM\Column]
    private int $itemsNonCompliant = 0;

    /** @var Collection<int, ComplianceResultItem> */
    #[ORM\OneToMany(mappedBy: 'result', targetEntity: ComplianceResultItem::class, cascade: ['persist', 'remove'], orphanRemoval: true)]
    private Collection $items;

    public function __construct()
    {
        $this->evaluatedAt = new \DateTimeImmutable();
        $this->items = new ArrayCollection();
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
    public function getMessageLong(): ?string { return $this->messageLong; }
    public function setMessageLong(?string $v): static { $this->messageLong = $v; return $this; }
    public function getRecommendation(): ?string { return $this->recommendation; }
    public function setRecommendation(?string $v): static { $this->recommendation = $v; return $this; }
    public function getRecommendationType(): ?string { return $this->recommendationType; }
    public function setRecommendationType(?string $v): static { $this->recommendationType = $v === null ? null : ($v === 'cli' ? 'cli' : 'text'); return $this; }
    public function getEvaluatedAt(): \DateTimeImmutable { return $this->evaluatedAt; }
    public function setEvaluatedAt(\DateTimeImmutable $v): static { $this->evaluatedAt = $v; return $this; }
    public function isPerKey(): bool { return $this->perKey; }
    public function setPerKey(bool $v): static { $this->perKey = $v; return $this; }
    public function getItemsTotal(): int { return $this->itemsTotal; }
    public function setItemsTotal(int $v): static { $this->itemsTotal = $v; return $this; }
    public function getItemsNonCompliant(): int { return $this->itemsNonCompliant; }
    public function setItemsNonCompliant(int $v): static { $this->itemsNonCompliant = $v; return $this; }

    /** @return Collection<int, ComplianceResultItem> */
    public function getItems(): Collection { return $this->items; }

    public function addItem(ComplianceResultItem $item): static
    {
        if (!$this->items->contains($item)) {
            $this->items->add($item);
            $item->setResult($this);
        }

        return $this;
    }

    /**
     * Penalty factor in [0,1]: 1.0 for a normal rule, or the share of failing
     * items for a per-key rule (so a rule with 3/48 failing interfaces weighs
     * proportionally less than one fully non-compliant).
     */
    public function getPenaltyFactor(): float
    {
        if (!$this->perKey || $this->itemsTotal <= 0) {
            return 1.0;
        }

        return min(1.0, $this->itemsNonCompliant / $this->itemsTotal);
    }
}
