<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * Per-key detail of a per-loop compliance result: one row per inventory entryKey
 * (e.g. one per interface) evaluated by a rule running in inventory-loop mode.
 * The parent ComplianceResult keeps the aggregated (worst-case) verdict.
 */
#[ORM\Entity]
#[ORM\Table(name: 'compliance_result_item')]
#[ORM\Index(columns: ['result_id'], name: 'idx_result_item_result')]
#[ORM\UniqueConstraint(name: 'uniq_result_item_key', columns: ['result_id', 'item_key'])]
class ComplianceResultItem
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: ComplianceResult::class, inversedBy: 'items')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ComplianceResult $result;

    #[ORM\Column(length: 255)]
    private string $itemKey;

    #[ORM\Column(length: 20)]
    private string $status;

    #[ORM\Column(length: 10, nullable: true)]
    private ?string $severity = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $message = null;

    public function getId(): ?int { return $this->id; }
    public function getResult(): ComplianceResult { return $this->result; }
    public function setResult(ComplianceResult $v): static { $this->result = $v; return $this; }
    public function getItemKey(): string { return $this->itemKey; }
    public function setItemKey(string $v): static { $this->itemKey = $v; return $this; }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $v): static { $this->status = $v; return $this; }
    public function getSeverity(): ?string { return $this->severity; }
    public function setSeverity(?string $v): static { $this->severity = $v; return $this; }
    public function getMessage(): ?string { return $this->message; }
    public function setMessage(?string $v): static { $this->message = $v; return $this; }
}
