<?php

namespace App\Entity;

use App\Repository\InventoryCategoryRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: InventoryCategoryRepository::class)]
class InventoryCategory
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Context $context;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $keyLabel = null;

    /**
     * Ordered list of column configs: [{ label: string, visible: bool }].
     * Columns not present here are appended (visible) when discovered.
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $columnConfig = null;

    /**
     * Sort config: { column: string|null, direction: 'asc'|'desc' }.
     * If column is null, rows are sorted by the entry key.
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $sortConfig = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getKeyLabel(): ?string { return $this->keyLabel; }
    public function setKeyLabel(?string $v): static { $this->keyLabel = $v; return $this; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    public function getColumnConfig(): ?array { return $this->columnConfig; }
    public function setColumnConfig(?array $v): static { $this->columnConfig = $v; return $this; }
    public function getSortConfig(): ?array { return $this->sortConfig; }
    public function setSortConfig(?array $v): static { $this->sortConfig = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
