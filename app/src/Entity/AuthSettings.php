<?php

namespace App\Entity;

use App\Repository\AuthSettingsRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: AuthSettingsRepository::class)]
#[ORM\Table(name: 'auth_settings')]
class AuthSettings
{
    public const SINGLETON_ID = 1;

    #[ORM\Id]
    #[ORM\Column]
    private int $id = self::SINGLETON_ID;

    #[ORM\Column(options: ['default' => 8])]
    private int $passwordMinLength = 8;

    #[ORM\Column(options: ['default' => 128])]
    private int $passwordMaxLength = 128;

    #[ORM\Column(options: ['default' => false])]
    private bool $passwordRequireUppercase = false;

    #[ORM\Column(options: ['default' => false])]
    private bool $passwordRequireLowercase = false;

    #[ORM\Column(options: ['default' => false])]
    private bool $passwordRequireDigit = false;

    #[ORM\Column(options: ['default' => false])]
    private bool $passwordRequireSymbol = false;

    #[ORM\Column(options: ['default' => 300])]
    private int $idleTimeoutSeconds = 300;

    #[ORM\Column(options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): int { return $this->id; }

    public function getPasswordMinLength(): int { return $this->passwordMinLength; }
    public function setPasswordMinLength(int $v): static { $this->passwordMinLength = max(1, $v); return $this; }

    public function getPasswordMaxLength(): int { return $this->passwordMaxLength; }
    public function setPasswordMaxLength(int $v): static { $this->passwordMaxLength = max($this->passwordMinLength, $v); return $this; }

    public function isPasswordRequireUppercase(): bool { return $this->passwordRequireUppercase; }
    public function setPasswordRequireUppercase(bool $v): static { $this->passwordRequireUppercase = $v; return $this; }

    public function isPasswordRequireLowercase(): bool { return $this->passwordRequireLowercase; }
    public function setPasswordRequireLowercase(bool $v): static { $this->passwordRequireLowercase = $v; return $this; }

    public function isPasswordRequireDigit(): bool { return $this->passwordRequireDigit; }
    public function setPasswordRequireDigit(bool $v): static { $this->passwordRequireDigit = $v; return $this; }

    public function isPasswordRequireSymbol(): bool { return $this->passwordRequireSymbol; }
    public function setPasswordRequireSymbol(bool $v): static { $this->passwordRequireSymbol = $v; return $this; }

    public function getIdleTimeoutSeconds(): int { return $this->idleTimeoutSeconds; }
    public function setIdleTimeoutSeconds(int $v): static { $this->idleTimeoutSeconds = max(60, $v); return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): void { $this->updatedAt = new \DateTimeImmutable(); }
}
