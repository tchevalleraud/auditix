<?php

namespace App\Entity;

use App\Repository\ReportSchemaRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ReportSchemaRepository::class)]
#[ORM\Table(name: 'report_schema')]
#[ORM\Index(columns: ['context_id'], name: 'idx_report_schema_context')]
class ReportSchema
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

    #[ORM\ManyToOne(targetEntity: ReportSchemaFolder::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?ReportSchemaFolder $folder = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    /**
     * Persisted viewport: { "pan": {"x","y"}, "zoom": number }
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $viewport = null;

    /**
     * Persisted canvas dimensions in world units (null = auto-fit on elements bounding box).
     * Shape: { "width": number, "height": number }
     */
    #[ORM\Column(name: 'canvas_size', type: 'json', nullable: true)]
    private ?array $canvasSize = null;

    #[ORM\Column(name: 'grid_size', type: 'integer', options: ['default' => 20])]
    private int $gridSize = 20;

    #[ORM\Column(name: 'snap_to_grid', options: ['default' => true])]
    private bool $snapToGrid = true;

    /**
     * Free-form Excalidraw-style elements. Each entry is a discriminated union keyed by
     * `kind` (shape | text | image | line | freedraw | bezier | group | node_card_styled | node_card_table).
     * See plan glistening-sprouting-zebra.md for the full element schema.
     */
    #[ORM\Column(type: 'json')]
    private array $elements = [];

    #[ORM\Column(length: 128, nullable: true)]
    private ?string $managedByPlugin = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getManagedByPlugin(): ?string { return $this->managedByPlugin; }
    public function setManagedByPlugin(?string $v): static { $this->managedByPlugin = $v; return $this; }
    public function isManagedByPlugin(): bool { return $this->managedByPlugin !== null; }

    private function touch(): void { $this->updatedAt = new \DateTimeImmutable(); }

    public function getId(): ?int { return $this->id; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; $this->touch(); return $this; }
    public function getFolder(): ?ReportSchemaFolder { return $this->folder; }
    public function setFolder(?ReportSchemaFolder $v): static { $this->folder = $v; $this->touch(); return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; $this->touch(); return $this; }
    public function getViewport(): ?array { return $this->viewport; }
    public function setViewport(?array $v): static { $this->viewport = $v; $this->touch(); return $this; }
    public function getCanvasSize(): ?array { return $this->canvasSize; }
    public function setCanvasSize(?array $v): static { $this->canvasSize = $v; $this->touch(); return $this; }
    public function getGridSize(): int { return $this->gridSize; }
    public function setGridSize(int $v): static { $this->gridSize = $v; $this->touch(); return $this; }
    public function getSnapToGrid(): bool { return $this->snapToGrid; }
    public function setSnapToGrid(bool $v): static { $this->snapToGrid = $v; $this->touch(); return $this; }
    public function getElements(): array { return $this->elements; }
    public function setElements(array $v): static { $this->elements = $v; $this->touch(); return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
}
