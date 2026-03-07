<?php

namespace App\Entity;

use App\Repository\CollectionCommandRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CollectionCommandRepository::class)]
class CollectionCommand
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(type: 'text')]
    private string $commands;

    #[ORM\Column]
    private bool $enabled = true;

    #[ORM\ManyToOne(targetEntity: CollectionFolder::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?CollectionFolder $folder = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Context $context;

    #[ORM\ManyToMany(targetEntity: DeviceModel::class, mappedBy: 'manualCommands')]
    private Collection $models;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->models = new ArrayCollection();
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; return $this; }
    public function getCommands(): string { return $this->commands; }
    public function setCommands(string $v): static { $this->commands = $v; return $this; }
    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }
    public function getFolder(): ?CollectionFolder { return $this->folder; }
    public function setFolder(?CollectionFolder $v): static { $this->folder = $v; return $this; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    /** @return Collection<int, DeviceModel> */
    public function getModels(): Collection { return $this->models; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
