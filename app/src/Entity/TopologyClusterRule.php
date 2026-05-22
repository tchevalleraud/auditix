<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

/**
 * Declarative recipe that produces clusters by grouping the topology's member
 * nodes on a shared inventory value. Sister to TopologyProtocol but for
 * clusters instead of edges: pick a category + column, regenerate, and every
 * distinct value becomes a TopologyCluster whose members are the nodes that
 * share that value.
 */
#[ORM\Entity]
#[ORM\Table(name: 'topology_cluster_rule')]
#[ORM\Index(columns: ['topology_id'], name: 'idx_topology_cluster_rule_topology')]
class TopologyClusterRule
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Topology::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Topology $topology;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\ManyToOne(targetEntity: InventoryCategory::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?InventoryCategory $inventoryCategory = null;

    /**
     * Column whose value defines the group: every distinct value becomes a
     * cluster name; every node with at least one entry carrying that value
     * becomes a member.
     */
    #[ORM\Column(length: 255)]
    private string $groupByColumn = '';

    /**
     * Default visual style copied onto every generated cluster. User edits made
     * to the generated cluster's style are preserved across regenerations (we
     * key off the cluster's name).
     */
    #[ORM\Column(type: 'json')]
    private array $clusterStyle = [];

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
    public function getInventoryCategory(): ?InventoryCategory { return $this->inventoryCategory; }
    public function setInventoryCategory(?InventoryCategory $v): static { $this->inventoryCategory = $v; return $this; }
    public function getGroupByColumn(): string { return $this->groupByColumn; }
    public function setGroupByColumn(string $v): static { $this->groupByColumn = $v; return $this; }
    public function getClusterStyle(): array { return $this->clusterStyle; }
    public function setClusterStyle(array $v): static { $this->clusterStyle = $v; return $this; }
    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getLastGeneratedAt(): ?\DateTimeImmutable { return $this->lastGeneratedAt; }
    public function setLastGeneratedAt(?\DateTimeImmutable $v): static { $this->lastGeneratedAt = $v; return $this; }
}
