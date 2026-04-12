<?php

namespace App\Entity;

use App\Repository\DeviceModelRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: DeviceModelRepository::class)]
class DeviceModel
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private ?string $name = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\ManyToOne(targetEntity: Editor::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Editor $manufacturer = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Context $context = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $connectionScript = null;

    #[ORM\Column(length: 1, nullable: true)]
    private ?string $sendCtrlChar = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $nvdKeyword = null;

    #[ORM\ManyToMany(targetEntity: CollectionCommand::class, inversedBy: 'models')]
    #[ORM\JoinTable(name: 'device_model_collection_command')]
    private Collection $manualCommands;

    #[ORM\ManyToMany(targetEntity: CollectionRule::class, inversedBy: 'models')]
    #[ORM\JoinTable(name: 'device_model_collection_rule')]
    private Collection $manualRules;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->manualCommands = new ArrayCollection();
        $this->manualRules = new ArrayCollection();
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getName(): ?string
    {
        return $this->name;
    }

    public function setName(string $name): static
    {
        $this->name = $name;
        return $this;
    }

    public function getDescription(): ?string
    {
        return $this->description;
    }

    public function setDescription(?string $description): static
    {
        $this->description = $description;
        return $this;
    }

    public function getManufacturer(): ?Editor
    {
        return $this->manufacturer;
    }

    public function setManufacturer(?Editor $manufacturer): static
    {
        $this->manufacturer = $manufacturer;
        return $this;
    }

    public function getConnectionScript(): ?string
    {
        return $this->connectionScript;
    }

    public function setConnectionScript(?string $connectionScript): static
    {
        $this->connectionScript = $connectionScript;
        return $this;
    }

    public function getSendCtrlChar(): ?string
    {
        return $this->sendCtrlChar;
    }

    public function setSendCtrlChar(?string $sendCtrlChar): static
    {
        $this->sendCtrlChar = $sendCtrlChar ? strtoupper($sendCtrlChar) : null;
        return $this;
    }

    public function getContext(): ?Context
    {
        return $this->context;
    }

    public function setContext(?Context $context): static
    {
        $this->context = $context;
        return $this;
    }

    /** @return Collection<int, CollectionCommand> */
    public function getManualCommands(): Collection { return $this->manualCommands; }

    public function addManualCommand(CollectionCommand $cmd): static
    {
        if (!$this->manualCommands->contains($cmd)) {
            $this->manualCommands->add($cmd);
        }
        return $this;
    }

    public function removeManualCommand(CollectionCommand $cmd): static
    {
        $this->manualCommands->removeElement($cmd);
        return $this;
    }

    /** @return Collection<int, CollectionRule> */
    public function getManualRules(): Collection { return $this->manualRules; }

    public function addManualRule(CollectionRule $rule): static
    {
        if (!$this->manualRules->contains($rule)) {
            $this->manualRules->add($rule);
        }
        return $this;
    }

    public function removeManualRule(CollectionRule $rule): static
    {
        $this->manualRules->removeElement($rule);
        return $this;
    }

    public function getNvdKeyword(): ?string { return $this->nvdKeyword; }
    public function setNvdKeyword(?string $v): static { $this->nvdKeyword = $v; return $this; }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
