<?php

namespace App\Entity;

use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'lab_task')]
class LabTask
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\ManyToOne(targetEntity: Lab::class, inversedBy: 'tasks')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Lab $lab;

    /** @var Collection<int, CompliancePolicy> */
    #[ORM\ManyToMany(targetEntity: CompliancePolicy::class)]
    #[ORM\JoinTable(name: 'lab_task_compliance_policy')]
    private Collection $policies;

    #[ORM\Column]
    private int $position = 0;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->policies = new ArrayCollection();
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; return $this; }
    public function getLab(): Lab { return $this->lab; }
    public function setLab(Lab $v): static { $this->lab = $v; return $this; }
    /** @return Collection<int, CompliancePolicy> */
    public function getPolicies(): Collection { return $this->policies; }
    public function addPolicy(CompliancePolicy $p): static { if (!$this->policies->contains($p)) { $this->policies->add($p); } return $this; }
    public function removePolicy(CompliancePolicy $p): static { $this->policies->removeElement($p); return $this; }
    public function clearPolicies(): static { $this->policies->clear(); return $this; }
    public function getPosition(): int { return $this->position; }
    public function setPosition(int $v): static { $this->position = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
