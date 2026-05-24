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
    public const TYPE_STP  = 'stp';
    public const TYPE_MSTP = 'mstp';

    public const TYPES = [self::TYPE_LLDP, self::TYPE_ISIS, self::TYPE_STP, self::TYPE_MSTP];

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
            // auto | name | hostname | ipAddress | inventory
            // When 'inventory', the matcher uses nodeMatchInventoryCategoryId +
            // nodeMatchInventoryKey (optional entryKey filter) +
            // nodeMatchInventoryColumn (column to read) to build a value→Node
            // index. The destination value from the LLDP/ISIS row resolves
            // against any inventory cell the user pinpoints (e.g. a chassis ID
            // that's not a stock node field). When nodeMatchInventoryKey is
            // empty, every row in the column is indexed; when set, only the
            // entries with the matching entryKey are.
            'nodeMatchField' => 'auto',
            'nodeMatchInventoryCategoryId' => null,
            'nodeMatchInventoryKey' => '',
            'nodeMatchInventoryColumn' => '',
            'localPortColumn' => '',
            'remotePortColumn' => '',
            'metricColumn' => '',
            // LLDP-specific aggregation lookup: marks each generated port with the
            // LAG/Port-channel id it belongs to. The lookup can live in a separate
            // inventory category (e.g. "Port-channel members") where each row's
            // entryKey is a port name and one column holds the LAG id.
            //   - aggregationCategoryId  (optional, ?int): category to query. If null,
            //     the LLDP category is reused.
            //   - aggregationKeyColumn   (optional, string): column from the LLDP row
            //     whose value is used as the lookup key (entryKey) into the
            //     aggregation category. Falls back to the local port (entryKey or
            //     localPortColumn) when empty.
            //   - aggregationValueColumn (optional, string): column in the aggregation
            //     category holding the LAG id (e.g. "Po1", "ae0"). When empty,
            //     aggregation lookup is disabled.
            'aggregationCategoryId' => null,
            'aggregationKeyColumn' => '',
            'aggregationValueColumn' => '',
            // ISIS-specific: per-link area qualifier (e.g. "HOME"/"REMOTE") that resolves
            // through a separate area inventory category into the real area address.
            'linkAreaColumn' => '',
            'areaCategoryId' => null,
            'areaColumn' => '',
            // STP / MSTP — LLDP-driven topology with separate inventory sources.
            //
            // The protocol's primary category (inventoryCategoryId) holds the LLDP
            // adjacencies: one row per local port with the remote neighbor identifier
            // and the remote port. Adjacencies are resolved by matching the LLDP
            // "remote neighbor" against the local identity of every other device,
            // which is itself read from a "local identity" inventory category.
            //
            //   Page 2 — Bridge (root detection):
            //     stpBridgeCategoryId  : category holding Bridge ID / Root ID per instance
            //     stpBridgeIdColumn    : Bridge ID column
            //     stpRootIdColumn      : Root ID column
            //
            //   Page 3 — Ports, three sections:
            //
            //   1. Local identity (the hostname/chassis ID neighbors see when
            //      they look at us via LLDP). Per-device row in any inventory
            //      category; the entryKey filter is optional.
            //     stpLocalCategoryId   : category holding the local identity
            //     stpLocalEntryKey     : optional entryKey filter
            //     stpLocalColumn       : column whose value is compared against
            //                            the LLDP remote neighbor field
            //
            //   2. LLDP adjacencies (= the protocol's primary inventoryCategoryId).
            //      Re-uses the standard LLDP keys:
            //     localPortColumn      : column holding the local port
            //     destNodeColumn       : column holding the REMOTE NEIGHBOR (matched
            //                            against stpLocalColumn values to find the
            //                            target Node)
            //     remotePortColumn     : column holding the remote port (optional)
            //
            //   3. Port state (state/role/cost/instance). Lives in a potentially
            //      different category — extractor sources often split LLDP from STP.
            //     stpStateCategoryId   : category holding the per-port state rows
            //     stpStatePortColumn   : port name column on the state rows
            //     stpStateColumn       : state column (Forwarding/Blocking/...)
            //     stpRoleColumn        : role column (Root/Designated/Alternate/...)
            //     stpInstanceColumn    : instance ID column (MSTP — required to
            //                            split adjacencies per-instance)
            //     metricColumn         : cost column (optional)
            'stpLocalCategoryId' => null,
            'stpLocalEntryKey' => '',
            'stpLocalColumn' => '',
            'stpStateCategoryId' => null,
            'stpStatePortColumn' => '',
            'stpStateColumn' => '',
            'stpRoleColumn' => '',
            'stpInstanceColumn' => '',
            'stpPriorityColumn' => '',
            'stpBridgeCategoryId' => null,
            'stpBridgeIdColumn' => '',
            'stpRootIdColumn' => '',
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
