<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'topology_protocol')]
#[ORM\Index(columns: ['topology_id'], name: 'idx_topology_protocol_topology')]
class TopologyProtocol
{
    public const TYPE_LLDP = 'lldp';
    public const TYPE_ISIS = 'isis';

    public const TYPES = [self::TYPE_LLDP, self::TYPE_ISIS];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Topology::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Topology $topology;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(length: 32)]
    private string $type = self::TYPE_LLDP;

    #[ORM\ManyToOne(targetEntity: InventoryCategory::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?InventoryCategory $inventoryCategory = null;

    /**
     * Column mapping inside the inventory category:
     *   { destNodeColumn, nodeMatchField, localPortColumn, remotePortColumn, metricColumn }
     */
    #[ORM\Column(type: 'json')]
    private array $mapping = [];

    /**
     * Default visual style applied to the generated edges:
     *   { type, color, width, dash, curveTension, aggregationGroup }
     */
    #[ORM\Column(type: 'json')]
    private array $edgeStyle = [];

    #[ORM\Column]
    private bool $enabled = true;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastGeneratedAt = null;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getTopology(): Topology { return $this->topology; }
    public function setTopology(Topology $v): static { $this->topology = $v; return $this; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getType(): string { return $this->type; }
    public function setType(string $v): static { $this->type = $v; return $this; }
    public function getInventoryCategory(): ?InventoryCategory { return $this->inventoryCategory; }
    public function setInventoryCategory(?InventoryCategory $v): static { $this->inventoryCategory = $v; return $this; }
    public function getMapping(): array { return $this->mapping; }
    public function setMapping(array $v): static { $this->mapping = $v; return $this; }
    public function getEdgeStyle(): array { return $this->edgeStyle; }
    public function setEdgeStyle(array $v): static { $this->edgeStyle = $v; return $this; }
    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getLastGeneratedAt(): ?\DateTimeImmutable { return $this->lastGeneratedAt; }
    public function setLastGeneratedAt(?\DateTimeImmutable $v): static { $this->lastGeneratedAt = $v; return $this; }

    public static function defaultMapping(): array
    {
        return [
            // Common
            'destNodeColumn' => '',
            'nodeMatchField' => 'auto', // auto | name | hostname | ipAddress
            'localPortColumn' => '',
            'remotePortColumn' => '',
            'metricColumn' => '',
            // ISIS-specific: per-link area qualifier (e.g. "HOME"/"REMOTE") that resolves
            // through a separate area inventory category into the real area address.
            'linkAreaColumn' => '',
            'areaCategoryId' => null,
            'areaColumn' => '',
        ];
    }

    public static function defaultEdgeStyle(): array
    {
        return [
            'type' => 'straight',
            'color' => '#6366f1',
            'width' => 0.5,
            'dash' => 'solid',
            'curveTension' => 0.3,
            'aggregationGroup' => null,
        ];
    }
}
