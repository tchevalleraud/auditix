<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'topology_link')]
#[ORM\Index(columns: ['map_id'], name: 'idx_topology_link_map')]
#[ORM\Index(columns: ['source_device_id'], name: 'idx_topology_link_source')]
#[ORM\Index(columns: ['target_device_id'], name: 'idx_topology_link_target')]
class TopologyLink
{
    public const PROTOCOL_LLDP = 'lldp';
    public const PROTOCOL_STP = 'stp';
    public const PROTOCOL_OSPF = 'ospf';
    public const PROTOCOL_BGP = 'bgp';
    public const PROTOCOL_ISIS = 'isis';
    public const PROTOCOL_MANUAL = 'manual';

    public const STATUS_UP = 'up';
    public const STATUS_DOWN = 'down';
    public const STATUS_UNKNOWN = 'unknown';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: TopologyMap::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private TopologyMap $map;

    #[ORM\ManyToOne(targetEntity: TopologyDevice::class)]
    #[ORM\JoinColumn(name: 'source_device_id', nullable: false, onDelete: 'CASCADE')]
    private TopologyDevice $sourceDevice;

    #[ORM\ManyToOne(targetEntity: TopologyDevice::class)]
    #[ORM\JoinColumn(name: 'target_device_id', nullable: false, onDelete: 'CASCADE')]
    private TopologyDevice $targetDevice;

    #[ORM\Column(length: 20)]
    private string $protocol; // lldp, stp, ospf, bgp, isis

    #[ORM\Column(length: 100, nullable: true)]
    private ?string $sourcePort = null;

    #[ORM\Column(length: 100, nullable: true)]
    private ?string $targetPort = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $status = null; // up, down, unknown

    /**
     * Optional numeric weight: ISIS metric, OSPF cost, BGP local-pref, etc.
     */
    #[ORM\Column(nullable: true)]
    private ?int $weight = null;

    /**
     * Free-form metadata: STP role/state, BGP peer AS, OSPF area, ISIS level, etc.
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $metadata = null;

    /**
     * Per-link style override: { color, width, style, ... }
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $styleOverride = null;

    #[ORM\Column(type: 'boolean', options: ['default' => false])]
    private bool $isManual = false;

    #[ORM\Column]
    private \DateTimeImmutable $discoveredAt;

    public function __construct()
    {
        $this->discoveredAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getMap(): TopologyMap { return $this->map; }
    public function setMap(TopologyMap $v): static { $this->map = $v; return $this; }
    public function getSourceDevice(): TopologyDevice { return $this->sourceDevice; }
    public function setSourceDevice(TopologyDevice $v): static { $this->sourceDevice = $v; return $this; }
    public function getTargetDevice(): TopologyDevice { return $this->targetDevice; }
    public function setTargetDevice(TopologyDevice $v): static { $this->targetDevice = $v; return $this; }
    public function getProtocol(): string { return $this->protocol; }
    public function setProtocol(string $v): static { $this->protocol = $v; return $this; }
    public function getSourcePort(): ?string { return $this->sourcePort; }
    public function setSourcePort(?string $v): static { $this->sourcePort = $v; return $this; }
    public function getTargetPort(): ?string { return $this->targetPort; }
    public function setTargetPort(?string $v): static { $this->targetPort = $v; return $this; }
    public function getStatus(): ?string { return $this->status; }
    public function setStatus(?string $v): static { $this->status = $v; return $this; }
    public function getWeight(): ?int { return $this->weight; }
    public function setWeight(?int $v): static { $this->weight = $v; return $this; }
    public function getMetadata(): ?array { return $this->metadata; }
    public function setMetadata(?array $v): static { $this->metadata = $v; return $this; }
    public function getStyleOverride(): ?array { return $this->styleOverride; }
    public function setStyleOverride(?array $v): static { $this->styleOverride = $v; return $this; }
    public function getIsManual(): bool { return $this->isManual; }
    public function setIsManual(bool $v): static { $this->isManual = $v; return $this; }
    public function getDiscoveredAt(): \DateTimeImmutable { return $this->discoveredAt; }
    public function setDiscoveredAt(\DateTimeImmutable $v): static { $this->discoveredAt = $v; return $this; }
}
