<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'topology_cluster_member')]
#[ORM\UniqueConstraint(name: 'uniq_cluster_node_pair', columns: ['cluster_id', 'node_id'])]
#[ORM\Index(columns: ['cluster_id'], name: 'idx_topology_cluster_member_cluster')]
#[ORM\Index(columns: ['node_id'], name: 'idx_topology_cluster_member_node')]
class TopologyClusterMember
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: TopologyCluster::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private TopologyCluster $cluster;

    #[ORM\ManyToOne(targetEntity: Node::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Node $node;

    public function getId(): ?int { return $this->id; }
    public function getCluster(): TopologyCluster { return $this->cluster; }
    public function setCluster(TopologyCluster $v): static { $this->cluster = $v; return $this; }
    public function getNode(): Node { return $this->node; }
    public function setNode(Node $v): static { $this->node = $v; return $this; }
}
