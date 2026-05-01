<?php

namespace App\Entity;

use App\Repository\MailServerRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: MailServerRepository::class)]
#[ORM\Table(name: 'mail_server')]
class MailServer
{
    public const ENCRYPTION_NONE = 'none';
    public const ENCRYPTION_TLS = 'tls';
    public const ENCRYPTION_SSL = 'ssl';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 100)]
    private ?string $name = null;

    #[ORM\Column(length: 255)]
    private ?string $host = null;

    #[ORM\Column]
    private int $port = 587;

    #[ORM\Column(length: 10, options: ['default' => 'tls'])]
    private string $encryption = self::ENCRYPTION_TLS;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $username = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $passwordEncrypted = null;

    #[ORM\Column(length: 255)]
    private ?string $fromEmail = null;

    #[ORM\Column(length: 100, nullable: true)]
    private ?string $fromName = null;

    #[ORM\Column(options: ['default' => true])]
    private bool $enabled = true;

    #[ORM\Column(options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getName(): ?string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }

    public function getHost(): ?string { return $this->host; }
    public function setHost(string $v): static { $this->host = $v; return $this; }

    public function getPort(): int { return $this->port; }
    public function setPort(int $v): static { $this->port = $v; return $this; }

    public function getEncryption(): string { return $this->encryption; }
    public function setEncryption(string $v): static
    {
        $this->encryption = in_array($v, [self::ENCRYPTION_NONE, self::ENCRYPTION_TLS, self::ENCRYPTION_SSL], true)
            ? $v
            : self::ENCRYPTION_TLS;
        return $this;
    }

    public function getUsername(): ?string { return $this->username; }
    public function setUsername(?string $v): static { $this->username = $v; return $this; }

    public function getPasswordEncrypted(): ?string { return $this->passwordEncrypted; }
    public function setPasswordEncrypted(?string $v): static { $this->passwordEncrypted = $v; return $this; }

    public function getFromEmail(): ?string { return $this->fromEmail; }
    public function setFromEmail(string $v): static { $this->fromEmail = $v; return $this; }

    public function getFromName(): ?string { return $this->fromName; }
    public function setFromName(?string $v): static { $this->fromName = $v; return $this; }

    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): void { $this->updatedAt = new \DateTimeImmutable(); }
}
