<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'topology_node')]
#[ORM\UniqueConstraint(name: 'uniq_topology_node_pair', columns: ['topology_id', 'node_id'])]
#[ORM\Index(columns: ['topology_id'], name: 'idx_topology_node_topology')]
#[ORM\Index(columns: ['node_id'], name: 'idx_topology_node_node')]
class TopologyNode
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Topology::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Topology $topology;

    #[ORM\ManyToOne(targetEntity: Node::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Node $node;

    /**
     * Per-node design override. Null = inherits Topology.nodeDesign.
     * Same shape as Topology.nodeDesign.
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $styleOverride = null;

    #[ORM\Column]
    private \DateTimeImmutable $addedAt;

    public function __construct()
    {
        $this->addedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getTopology(): Topology { return $this->topology; }
    public function setTopology(Topology $v): static { $this->topology = $v; return $this; }
    public function getNode(): Node { return $this->node; }
    public function setNode(Node $v): static { $this->node = $v; return $this; }
    public function getStyleOverride(): ?array { return $this->styleOverride; }
    public function setStyleOverride(?array $v): static { $this->styleOverride = $v; return $this; }
    public function getAddedAt(): \DateTimeImmutable { return $this->addedAt; }
}
