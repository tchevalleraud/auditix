<?php

namespace App\Entity;

use App\Repository\NodeDynamicTagRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: NodeDynamicTagRepository::class)]
#[ORM\UniqueConstraint(name: 'node_dynamic_tag_unique', columns: ['node_id', 'tag_id'])]
class NodeDynamicTag
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Node::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Node $node;

    #[ORM\ManyToOne(targetEntity: NodeTag::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private NodeTag $tag;

    #[ORM\ManyToOne(targetEntity: CollectionRule::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?CollectionRule $rule = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getNode(): Node { return $this->node; }
    public function setNode(Node $v): static { $this->node = $v; return $this; }
    public function getTag(): NodeTag { return $this->tag; }
    public function setTag(NodeTag $v): static { $this->tag = $v; return $this; }
    public function getRule(): ?CollectionRule { return $this->rule; }
    public function setRule(?CollectionRule $v): static { $this->rule = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
