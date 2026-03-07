<?php

namespace App\Entity;

use App\Repository\ProfileRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ProfileRepository::class)]
class Profile
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private ?string $name = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Context $context = null;

    #[ORM\ManyToOne(targetEntity: SnmpCredential::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?SnmpCredential $snmpCredential = null;

    #[ORM\ManyToOne(targetEntity: CliCredential::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?CliCredential $cliCredential = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getName(): ?string { return $this->name; }
    public function setName(string $name): static { $this->name = $name; return $this; }

    public function getContext(): ?Context { return $this->context; }
    public function setContext(?Context $context): static { $this->context = $context; return $this; }

    public function getSnmpCredential(): ?SnmpCredential { return $this->snmpCredential; }
    public function setSnmpCredential(?SnmpCredential $v): static { $this->snmpCredential = $v; return $this; }

    public function getCliCredential(): ?CliCredential { return $this->cliCredential; }
    public function setCliCredential(?CliCredential $v): static { $this->cliCredential = $v; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
