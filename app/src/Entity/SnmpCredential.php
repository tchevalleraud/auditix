<?php

namespace App\Entity;

use App\Repository\SnmpCredentialRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: SnmpCredentialRepository::class)]
class SnmpCredential
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

    #[ORM\Column(length: 10)]
    private ?string $version = null; // v1, v2c, v3

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $community = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $username = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $securityLevel = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $authProtocol = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $authPassword = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $privProtocol = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $privPassword = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct() { $this->createdAt = new \DateTimeImmutable(); }

    public function getId(): ?int { return $this->id; }
    public function getName(): ?string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getContext(): ?Context { return $this->context; }
    public function setContext(?Context $v): static { $this->context = $v; return $this; }
    public function getVersion(): ?string { return $this->version; }
    public function setVersion(?string $v): static { $this->version = $v; return $this; }
    public function getCommunity(): ?string { return $this->community; }
    public function setCommunity(?string $v): static { $this->community = $v; return $this; }
    public function getUsername(): ?string { return $this->username; }
    public function setUsername(?string $v): static { $this->username = $v; return $this; }
    public function getSecurityLevel(): ?string { return $this->securityLevel; }
    public function setSecurityLevel(?string $v): static { $this->securityLevel = $v; return $this; }
    public function getAuthProtocol(): ?string { return $this->authProtocol; }
    public function setAuthProtocol(?string $v): static { $this->authProtocol = $v; return $this; }
    public function getAuthPassword(): ?string { return $this->authPassword; }
    public function setAuthPassword(?string $v): static { $this->authPassword = $v; return $this; }
    public function getPrivProtocol(): ?string { return $this->privProtocol; }
    public function setPrivProtocol(?string $v): static { $this->privProtocol = $v; return $this; }
    public function getPrivPassword(): ?string { return $this->privPassword; }
    public function setPrivPassword(?string $v): static { $this->privPassword = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
