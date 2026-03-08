<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\UniqueConstraint(name: 'node_cat_key_col', columns: ['node_id', 'category_id', 'entry_key', 'col_label'])]
class NodeInventoryEntry
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Node::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Node $node;

    #[ORM\ManyToOne(targetEntity: InventoryCategory::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?InventoryCategory $category = null;

    #[ORM\Column(length: 255)]
    private string $categoryName;

    #[ORM\Column(length: 500)]
    private string $entryKey;

    #[ORM\Column(length: 255)]
    private string $colLabel;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $value = null;

    #[ORM\ManyToOne(targetEntity: CollectionRule::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?CollectionRule $rule = null;

    #[ORM\ManyToOne(targetEntity: Collection::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Collection $collection = null;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getNode(): Node { return $this->node; }
    public function setNode(Node $v): static { $this->node = $v; return $this; }
    public function getCategory(): ?InventoryCategory { return $this->category; }
    public function setCategory(?InventoryCategory $v): static { $this->category = $v; return $this; }
    public function getCategoryName(): string { return $this->categoryName; }
    public function setCategoryName(string $v): static { $this->categoryName = $v; return $this; }
    public function getEntryKey(): string { return $this->entryKey; }
    public function setEntryKey(string $v): static { $this->entryKey = $v; return $this; }
    public function getColLabel(): string { return $this->colLabel; }
    public function setColLabel(string $v): static { $this->colLabel = $v; return $this; }
    public function getValue(): ?string { return $this->value; }
    public function setValue(?string $v): static { $this->value = $v; return $this; }
    public function getRule(): ?CollectionRule { return $this->rule; }
    public function setRule(?CollectionRule $v): static { $this->rule = $v; return $this; }
    public function getCollection(): ?Collection { return $this->collection; }
    public function setCollection(?Collection $v): static { $this->collection = $v; return $this; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function setUpdatedAt(\DateTimeImmutable $v): static { $this->updatedAt = $v; return $this; }
}
