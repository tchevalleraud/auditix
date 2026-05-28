<?php

namespace App\Entity;

use App\Repository\CompliancePolicyRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CompliancePolicyRepository::class)]
class CompliancePolicy
{
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

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Context $context;

    #[ORM\ManyToMany(targetEntity: ComplianceRule::class)]
    #[ORM\JoinTable(name: 'compliance_policy_extra_rules')]
    private Collection $extraRules;

    #[ORM\ManyToMany(targetEntity: Node::class)]
    #[ORM\JoinTable(name: 'compliance_policy_nodes')]
    private Collection $nodes;

    /**
     * Subset of $nodes that were added explicitly by a user (manual add / add by
     * tags) rather than by the auto-match rules. Auto-match sync never removes
     * these, so a one-off node survives even when it doesn't match the rules.
     */
    #[ORM\ManyToMany(targetEntity: Node::class)]
    #[ORM\JoinTable(name: 'compliance_policy_manual_nodes')]
    private Collection $manualNodes;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $matchRules = null;

    #[ORM\Column(length: 128, nullable: true)]
    private ?string $managedByPlugin = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->extraRules = new ArrayCollection();
        $this->nodes = new ArrayCollection();
        $this->manualNodes = new ArrayCollection();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; return $this; }
    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    public function getExtraRules(): Collection { return $this->extraRules; }
    public function addExtraRule(ComplianceRule $rule): static { if (!$this->extraRules->contains($rule)) $this->extraRules->add($rule); return $this; }
    public function removeExtraRule(ComplianceRule $rule): static { $this->extraRules->removeElement($rule); return $this; }
    public function getNodes(): Collection { return $this->nodes; }
    public function addNode(Node $node): static { if (!$this->nodes->contains($node)) $this->nodes->add($node); return $this; }
    public function removeNode(Node $node): static { $this->nodes->removeElement($node); $this->manualNodes->removeElement($node); return $this; }
    public function getManualNodes(): Collection { return $this->manualNodes; }
    public function addManualNode(Node $node): static { $this->addNode($node); if (!$this->manualNodes->contains($node)) $this->manualNodes->add($node); return $this; }
    public function removeManualNode(Node $node): static { $this->manualNodes->removeElement($node); return $this; }
    public function isManualNode(Node $node): bool { return $this->manualNodes->contains($node); }
    public function getMatchRules(): ?array { return $this->matchRules; }
    public function setMatchRules(?array $v): static { $this->matchRules = $v; return $this; }
    public function getManagedByPlugin(): ?string { return $this->managedByPlugin; }
    public function setManagedByPlugin(?string $v): static { $this->managedByPlugin = $v; return $this; }
    public function isManagedByPlugin(): bool { return $this->managedByPlugin !== null; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
