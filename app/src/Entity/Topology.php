<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'topology')]
#[ORM\Index(columns: ['context_id'], name: 'idx_topology_context')]
#[ORM\Index(columns: ['context_id', 'is_primary'], name: 'idx_topology_context_primary')]
class Topology
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

    #[ORM\ManyToOne(targetEntity: TopologyFolder::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?TopologyFolder $folder = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(name: 'is_primary', options: ['default' => false])]
    private bool $isPrimary = false;

    /**
     * Default visual config for nodes in this topology.
     * Shape: { shape, width, height, borderWidth, borderColor, bgColor, labelElements: [...] }
     */
    #[ORM\Column(type: 'json')]
    private array $nodeDesign = [];

    /**
     * Persisted positions: { "<nodeId>": {"x": number, "y": number}, ... }
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $layout = null;

    /**
     * Persisted viewport: { "pan": {"x","y"}, "zoom": number }
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $viewport = null;

    /**
     * Map-level options: { aggregateParallelLinks: bool, aggregateBorderColor: string, aggregateFillColor: string, ... }
     */
    #[ORM\Column(name: 'map_options', type: 'json', nullable: true)]
    private ?array $mapOptions = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    private function touch(): void { $this->updatedAt = new \DateTimeImmutable(); }

    public function getId(): ?int { return $this->id; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; $this->touch(); return $this; }
    public function getFolder(): ?TopologyFolder { return $this->folder; }
    public function setFolder(?TopologyFolder $v): static { $this->folder = $v; $this->touch(); return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; $this->touch(); return $this; }
    public function isPrimary(): bool { return $this->isPrimary; }
    public function setIsPrimary(bool $v): static { $this->isPrimary = $v; $this->touch(); return $this; }
    public function getNodeDesign(): array { return $this->nodeDesign; }
    public function setNodeDesign(array $v): static { $this->nodeDesign = $v; $this->touch(); return $this; }
    public function getLayout(): ?array { return $this->layout; }
    public function setLayout(?array $v): static { $this->layout = $v; $this->touch(); return $this; }
    public function getViewport(): ?array { return $this->viewport; }
    public function setViewport(?array $v): static { $this->viewport = $v; $this->touch(); return $this; }
    public function getMapOptions(): ?array { return $this->mapOptions; }
    public function setMapOptions(?array $v): static { $this->mapOptions = $v; $this->touch(); return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }

    /**
     * Default node design returned for new topologies.
     */
    public static function defaultNodeDesign(): array
    {
        return [
            'shape' => 'round-rectangle',
            'width' => 100,
            'height' => 40,
            'borderWidth' => 0.5,
            'borderColor' => '#94a3b8',
            'bgColor' => '#ffffff',
            'labelElements' => [
                [
                    'field' => 'hostname',
                    'x' => 0,
                    'y' => 0,
                    'fontSize' => 11,
                    'color' => '#1e293b',
                    'fontWeight' => 600,
                    'fontFamily' => 'sans-serif',
                    'fontStyle' => 'normal',
                    'textAlign' => 'center',
                ],
            ],
        ];
    }
}
