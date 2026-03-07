<?php

namespace App\Entity;

use App\Repository\CliCredentialRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CliCredentialRepository::class)]
class CliCredential
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
    private ?string $protocol = null; // ssh, telnet

    #[ORM\Column(nullable: true)]
    private ?int $port = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $username = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $password = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $enablePassword = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct() { $this->createdAt = new \DateTimeImmutable(); }

    public function getId(): ?int { return $this->id; }
    public function getName(): ?string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getContext(): ?Context { return $this->context; }
    public function setContext(?Context $v): static { $this->context = $v; return $this; }
    public function getProtocol(): ?string { return $this->protocol; }
    public function setProtocol(?string $v): static { $this->protocol = $v; return $this; }
    public function getPort(): ?int { return $this->port; }
    public function setPort(?int $v): static { $this->port = $v; return $this; }
    public function getUsername(): ?string { return $this->username; }
    public function setUsername(?string $v): static { $this->username = $v; return $this; }
    public function getPassword(): ?string { return $this->password; }
    public function setPassword(?string $v): static { $this->password = $v; return $this; }
    public function getEnablePassword(): ?string { return $this->enablePassword; }
    public function setEnablePassword(?string $v): static { $this->enablePassword = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
