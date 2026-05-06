<?php

namespace App\Entity;

use App\Repository\CollectionTagRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CollectionTagRepository::class)]
#[ORM\Table(name: 'collection_tag')]
#[ORM\UniqueConstraint(name: 'uniq_collection_tag_node_name', columns: ['node_id', 'name'])]
#[ORM\UniqueConstraint(name: 'uniq_collection_tag_collection_name', columns: ['collection_id', 'name'])]
#[ORM\Index(columns: ['name'], name: 'idx_collection_tag_name')]
class CollectionTag
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Collection::class, inversedBy: 'collectionTags')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Collection $collection;

    #[ORM\ManyToOne(targetEntity: Node::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Node $node;

    #[ORM\Column(length: 100)]
    private string $name;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getCollection(): Collection { return $this->collection; }
    public function setCollection(Collection $v): static { $this->collection = $v; return $this; }
    public function getNode(): Node { return $this->node; }
    public function setNode(Node $v): static { $this->node = $v; return $this; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
