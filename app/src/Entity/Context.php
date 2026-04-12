<?php

namespace App\Entity;

use App\Repository\ContextRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ContextRepository::class)]
class Context
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private ?string $name = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column]
    private bool $monitoringEnabled = false;

    #[ORM\Column]
    private int $snmpRetentionMinutes = 120;

    #[ORM\Column]
    private int $snmpPollIntervalSeconds = 60;

    #[ORM\Column]
    private int $icmpPollIntervalSeconds = 60;

    #[ORM\Column]
    private bool $isDefault = false;

    #[ORM\Column]
    private bool $publicEnabled = false;

    #[ORM\Column(length: 64, nullable: true)]
    private ?string $publicToken = null;

    #[ORM\Column]
    private bool $vulnerabilityEnabled = false;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $nvdApiKey = null;

    #[ORM\Column]
    private int $vulnerabilitySyncIntervalHours = 24;

    #[ORM\Column]
    private float $vulnerabilityScoreWeight = 0.3;

    #[ORM\Column]
    private float $complianceScoreWeight = 0.7;

    #[ORM\Column]
    private bool $systemUpdateEnabled = false;

    #[ORM\Column]
    private float $systemUpdateScoreWeight = 0.0;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastVulnerabilitySyncAt = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $lastVulnerabilitySyncStatus = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    /** @var Collection<int, User> */
    #[ORM\ManyToMany(targetEntity: User::class, inversedBy: 'contexts')]
    #[ORM\JoinTable(name: 'context_user')]
    private Collection $users;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->users = new ArrayCollection();
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

    public function isMonitoringEnabled(): bool
    {
        return $this->monitoringEnabled;
    }

    public function setMonitoringEnabled(bool $monitoringEnabled): static
    {
        $this->monitoringEnabled = $monitoringEnabled;
        return $this;
    }

    public function getSnmpRetentionMinutes(): int
    {
        return $this->snmpRetentionMinutes;
    }

    public function setSnmpRetentionMinutes(int $snmpRetentionMinutes): static
    {
        $this->snmpRetentionMinutes = $snmpRetentionMinutes;
        return $this;
    }

    public function getSnmpPollIntervalSeconds(): int
    {
        return $this->snmpPollIntervalSeconds;
    }

    public function setSnmpPollIntervalSeconds(int $snmpPollIntervalSeconds): static
    {
        $this->snmpPollIntervalSeconds = max(5, $snmpPollIntervalSeconds);
        return $this;
    }

    public function getIcmpPollIntervalSeconds(): int
    {
        return $this->icmpPollIntervalSeconds;
    }

    public function setIcmpPollIntervalSeconds(int $icmpPollIntervalSeconds): static
    {
        $this->icmpPollIntervalSeconds = max(5, $icmpPollIntervalSeconds);
        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }

    public function isDefault(): bool
    {
        return $this->isDefault;
    }

    public function setIsDefault(bool $isDefault): static
    {
        $this->isDefault = $isDefault;
        return $this;
    }

    /** @return Collection<int, User> */
    public function getUsers(): Collection
    {
        return $this->users;
    }

    public function addUser(User $user): static
    {
        if (!$this->users->contains($user)) {
            $this->users->add($user);
        }
        return $this;
    }

    public function removeUser(User $user): static
    {
        $this->users->removeElement($user);
        return $this;
    }

    public function isPublicEnabled(): bool { return $this->publicEnabled; }
    public function setPublicEnabled(bool $v): static { $this->publicEnabled = $v; return $this; }
    public function getPublicToken(): ?string { return $this->publicToken; }
    public function setPublicToken(?string $v): static { $this->publicToken = $v; return $this; }

    public function generatePublicToken(): string
    {
        $this->publicToken = bin2hex(random_bytes(32));
        return $this->publicToken;
    }

    public function isVulnerabilityEnabled(): bool { return $this->vulnerabilityEnabled; }
    public function setVulnerabilityEnabled(bool $v): static { $this->vulnerabilityEnabled = $v; return $this; }
    public function getNvdApiKey(): ?string { return $this->nvdApiKey; }
    public function setNvdApiKey(?string $v): static { $this->nvdApiKey = $v; return $this; }
    public function getVulnerabilitySyncIntervalHours(): int { return $this->vulnerabilitySyncIntervalHours; }
    public function setVulnerabilitySyncIntervalHours(int $v): static { $this->vulnerabilitySyncIntervalHours = max(1, $v); return $this; }
    public function getVulnerabilityScoreWeight(): float { return $this->vulnerabilityScoreWeight; }
    public function setVulnerabilityScoreWeight(float $v): static { $this->vulnerabilityScoreWeight = $v; return $this; }
    public function getComplianceScoreWeight(): float { return $this->complianceScoreWeight; }
    public function setComplianceScoreWeight(float $v): static { $this->complianceScoreWeight = $v; return $this; }
    public function isSystemUpdateEnabled(): bool { return $this->systemUpdateEnabled; }
    public function setSystemUpdateEnabled(bool $v): static { $this->systemUpdateEnabled = $v; return $this; }
    public function getSystemUpdateScoreWeight(): float { return $this->systemUpdateScoreWeight; }
    public function setSystemUpdateScoreWeight(float $v): static { $this->systemUpdateScoreWeight = $v; return $this; }
    public function getLastVulnerabilitySyncAt(): ?\DateTimeImmutable { return $this->lastVulnerabilitySyncAt; }
    public function setLastVulnerabilitySyncAt(?\DateTimeImmutable $v): static { $this->lastVulnerabilitySyncAt = $v; return $this; }
    public function getLastVulnerabilitySyncStatus(): ?string { return $this->lastVulnerabilitySyncStatus; }
    public function setLastVulnerabilitySyncStatus(?string $v): static { $this->lastVulnerabilitySyncStatus = $v; return $this; }
}
