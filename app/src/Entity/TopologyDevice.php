<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'topology_device')]
#[ORM\Index(columns: ['map_id'], name: 'idx_topology_device_map')]
#[ORM\Index(columns: ['node_id'], name: 'idx_topology_device_node')]
class TopologyDevice
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: TopologyMap::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private TopologyMap $map;

    /**
     * If set, this device is a known Auditix Node. If null, it's an external neighbor
     * discovered via LLDP/CDP/etc. but not managed by Auditix.
     */
    #[ORM\ManyToOne(targetEntity: Node::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Node $node = null;

    /**
     * Display name. For internal nodes, mirrors Node.name. For external neighbors,
     * this is what the discovery protocol reported (e.g. LLDP SysName).
     */
    #[ORM\Column(length: 255)]
    private string $name;

    /**
     * Chassis identifier (MAC, system ID, etc.) — used as a stable key to deduplicate
     * external neighbors across collection runs.
     */
    #[ORM\Column(length: 100, nullable: true)]
    private ?string $chassisId = null;

    /**
     * Management IP reported by the discovery protocol (LLDP Management Address).
     */
    #[ORM\Column(length: 45, nullable: true)]
    private ?string $mgmtAddress = null;

    /**
     * System description / model hint reported by the discovery protocol.
     */
    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $sysDescr = null;

    /**
     * Per-device style override: { bgColor, borderColor, shape, width, height, ... }
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $styleOverride = null;

    public function getStyleOverride(): ?array { return $this->styleOverride; }
    public function setStyleOverride(?array $v): static { $this->styleOverride = $v; return $this; }

    public function getId(): ?int { return $this->id; }
    public function getMap(): TopologyMap { return $this->map; }
    public function setMap(TopologyMap $v): static { $this->map = $v; return $this; }
    public function getNode(): ?Node { return $this->node; }
    public function setNode(?Node $v): static { $this->node = $v; return $this; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getChassisId(): ?string { return $this->chassisId; }
    public function setChassisId(?string $v): static { $this->chassisId = $v; return $this; }
    public function getMgmtAddress(): ?string { return $this->mgmtAddress; }
    public function setMgmtAddress(?string $v): static { $this->mgmtAddress = $v; return $this; }
    public function getSysDescr(): ?string { return $this->sysDescr; }
    public function setSysDescr(?string $v): static { $this->sysDescr = $v; return $this; }

    public function isExternal(): bool { return $this->node === null; }
}
