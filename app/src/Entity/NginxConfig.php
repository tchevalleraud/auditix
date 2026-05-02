<?php

namespace App\Entity;

use App\Repository\NginxConfigRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: NginxConfigRepository::class)]
#[ORM\Table(name: 'nginx_config')]
class NginxConfig
{
    public const SINGLETON_ID = 1;

    public const MODE_HTTP = 'http';
    public const MODE_HTTPS = 'https';
    public const MODE_HTTP_HTTPS = 'http_https';

    public const MODES = [self::MODE_HTTP, self::MODE_HTTPS, self::MODE_HTTP_HTTPS];

    #[ORM\Id]
    #[ORM\Column]
    private int $id = self::SINGLETON_ID;

    #[ORM\Column(length: 20, options: ['default' => self::MODE_HTTP])]
    private string $mode = self::MODE_HTTP;

    #[ORM\Column(length: 255, options: ['default' => 'localhost'])]
    private string $serverName = 'localhost';

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $certificateEncrypted = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $privateKeyEncrypted = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $certificateChainEncrypted = null;

    #[ORM\Column(type: Types::JSON, nullable: true)]
    private ?array $certificateInfo = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $appliedAt = null;

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

    public function getMode(): string { return $this->mode; }
    public function setMode(string $v): static
    {
        $this->mode = in_array($v, self::MODES, true) ? $v : self::MODE_HTTP;
        return $this;
    }

    public function getServerName(): string { return $this->serverName; }
    public function setServerName(string $v): static
    {
        $v = trim($v);
        $this->serverName = $v === '' ? 'localhost' : $v;
        return $this;
    }

    public function getCertificateEncrypted(): ?string { return $this->certificateEncrypted; }
    public function setCertificateEncrypted(?string $v): static { $this->certificateEncrypted = $v; return $this; }

    public function getPrivateKeyEncrypted(): ?string { return $this->privateKeyEncrypted; }
    public function setPrivateKeyEncrypted(?string $v): static { $this->privateKeyEncrypted = $v; return $this; }

    public function getCertificateChainEncrypted(): ?string { return $this->certificateChainEncrypted; }
    public function setCertificateChainEncrypted(?string $v): static { $this->certificateChainEncrypted = $v; return $this; }

    public function hasCertificate(): bool
    {
        return $this->certificateEncrypted !== null && $this->privateKeyEncrypted !== null;
    }

    public function getCertificateInfo(): ?array { return $this->certificateInfo; }
    public function setCertificateInfo(?array $v): static { $this->certificateInfo = $v; return $this; }

    public function getAppliedAt(): ?\DateTimeImmutable { return $this->appliedAt; }
    public function setAppliedAt(?\DateTimeImmutable $v): static { $this->appliedAt = $v; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): void { $this->updatedAt = new \DateTimeImmutable(); }
}
