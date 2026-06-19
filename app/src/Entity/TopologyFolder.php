<?php

namespace App\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

/**
 * User-created folder to organise topologies (schemas) into a tree.
 * Self-referencing parent/children for nesting; scoped to a Context.
 */
#[ORM\Entity]
#[ORM\Table(name: 'topology_folder')]
#[ORM\Index(columns: ['context_id'], name: 'idx_topology_folder_context')]
#[ORM\Index(columns: ['parent_id'], name: 'idx_topology_folder_parent')]
class TopologyFolder
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\ManyToOne(targetEntity: self::class, inversedBy: 'children')]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?self $parent = null;

    #[ORM\OneToMany(targetEntity: self::class, mappedBy: 'parent')]
    #[ORM\OrderBy(['name' => 'ASC'])]
    private Collection $children;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Context $context;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->children = new ArrayCollection();
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getParent(): ?self { return $this->parent; }
    public function setParent(?self $v): static { $this->parent = $v; return $this; }
    /** @return Collection<int, self> */
    public function getChildren(): Collection { return $this->children; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
