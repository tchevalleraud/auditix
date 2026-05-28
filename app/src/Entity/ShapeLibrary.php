<?php

namespace App\Entity;

use App\Repository\ShapeLibraryRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ShapeLibraryRepository::class)]
#[ORM\Table(name: 'shape_library')]
#[ORM\Index(columns: ['context_id'], name: 'idx_shape_library_context')]
class ShapeLibrary
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Context $context;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(length: 128, nullable: true)]
    private ?string $managedByPlugin = null;

    #[ORM\Column(options: ['default' => 0])]
    private int $position = 0;

    /** @var Collection<int, ShapeLibraryItem> */
    #[ORM\OneToMany(mappedBy: 'library', targetEntity: ShapeLibraryItem::class, cascade: ['persist', 'remove'], orphanRemoval: true)]
    #[ORM\OrderBy(['position' => 'ASC', 'id' => 'ASC'])]
    private Collection $items;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $this->items = new ArrayCollection();
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    private function touch(): void { $this->updatedAt = new \DateTimeImmutable(); }

    public function getManagedByPlugin(): ?string { return $this->managedByPlugin; }
    public function setManagedByPlugin(?string $v): static { $this->managedByPlugin = $v; return $this; }
    public function isManagedByPlugin(): bool { return $this->managedByPlugin !== null; }

    public function getId(): ?int { return $this->id; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; $this->touch(); return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; $this->touch(); return $this; }
    public function getPosition(): int { return $this->position; }
    public function setPosition(int $v): static { $this->position = $v; $this->touch(); return $this; }

    /** @return Collection<int, ShapeLibraryItem> */
    public function getItems(): Collection { return $this->items; }

    public function addItem(ShapeLibraryItem $item): static
    {
        if (!$this->items->contains($item)) {
            $this->items->add($item);
            $item->setLibrary($this);
            $this->touch();
        }
        return $this;
    }

    public function removeItem(ShapeLibraryItem $item): static
    {
        if ($this->items->removeElement($item)) {
            $this->touch();
        }
        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
}
