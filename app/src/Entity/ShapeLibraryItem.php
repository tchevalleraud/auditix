<?php

namespace App\Entity;

use App\Repository\ShapeLibraryItemRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ShapeLibraryItemRepository::class)]
#[ORM\Table(name: 'shape_library_item')]
#[ORM\Index(columns: ['library_id'], name: 'idx_shape_library_item_library')]
class ShapeLibraryItem
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: ShapeLibrary::class, inversedBy: 'items')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ShapeLibrary $library;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $keywords = null;

    /**
     * A bundle of SchemaElement objects normalised to the origin (0,0).
     * Stamped onto the canvas (cloned, ids regenerated, offset) when dropped.
     */
    #[ORM\Column(type: 'json')]
    private array $payload = [];

    #[ORM\Column(type: 'float', options: ['default' => 0])]
    private float $width = 0;

    #[ORM\Column(type: 'float', options: ['default' => 0])]
    private float $height = 0;

    #[ORM\Column(name: 'preview_svg', type: 'text', nullable: true)]
    private ?string $previewSvg = null;

    #[ORM\Column(options: ['default' => 0])]
    private int $position = 0;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getLibrary(): ShapeLibrary { return $this->library; }
    public function setLibrary(ShapeLibrary $v): static { $this->library = $v; return $this; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getKeywords(): ?string { return $this->keywords; }
    public function setKeywords(?string $v): static { $this->keywords = $v; return $this; }
    public function getPayload(): array { return $this->payload; }
    public function setPayload(array $v): static { $this->payload = $v; return $this; }
    public function getWidth(): float { return $this->width; }
    public function setWidth(float $v): static { $this->width = $v; return $this; }
    public function getHeight(): float { return $this->height; }
    public function setHeight(float $v): static { $this->height = $v; return $this; }
    public function getPreviewSvg(): ?string { return $this->previewSvg; }
    public function setPreviewSvg(?string $v): static { $this->previewSvg = $v; return $this; }
    public function getPosition(): int { return $this->position; }
    public function setPosition(int $v): static { $this->position = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
