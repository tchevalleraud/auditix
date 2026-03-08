<?php

namespace App\Entity;

use App\Repository\CollectionRuleRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CollectionRuleRepository::class)]
class CollectionRule
{
    public const SOURCE_LOCAL = 'local';
    public const SOURCE_SSH = 'ssh';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column]
    private bool $enabled = true;

    #[ORM\Column(length: 10)]
    private string $source = self::SOURCE_LOCAL;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $command = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $tag = null;

    #[ORM\ManyToOne(targetEntity: CollectionRuleFolder::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?CollectionRuleFolder $folder = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Context $context;

    #[ORM\ManyToMany(targetEntity: DeviceModel::class, mappedBy: 'manualRules')]
    private Collection $models;

    #[ORM\OneToMany(targetEntity: CollectionRuleExtract::class, mappedBy: 'rule', cascade: ['persist', 'remove'], orphanRemoval: true)]
    #[ORM\OrderBy(['position' => 'ASC'])]
    private Collection $extracts;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->models = new ArrayCollection();
        $this->extracts = new ArrayCollection();
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; return $this; }
    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }
    public function getSource(): string { return $this->source; }
    public function setSource(string $v): static { $this->source = $v; return $this; }
    public function getCommand(): ?string { return $this->command; }
    public function setCommand(?string $v): static { $this->command = $v; return $this; }
    public function getTag(): ?string { return $this->tag; }
    public function setTag(?string $v): static { $this->tag = $v; return $this; }
    public function getFolder(): ?CollectionRuleFolder { return $this->folder; }
    public function setFolder(?CollectionRuleFolder $v): static { $this->folder = $v; return $this; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    /** @return Collection<int, DeviceModel> */
    public function getModels(): Collection { return $this->models; }
    /** @return Collection<int, CollectionRuleExtract> */
    public function getExtracts(): Collection { return $this->extracts; }
    public function addExtract(CollectionRuleExtract $e): static { if (!$this->extracts->contains($e)) { $this->extracts->add($e); $e->setRule($this); } return $this; }
    public function removeExtract(CollectionRuleExtract $e): static { $this->extracts->removeElement($e); return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
