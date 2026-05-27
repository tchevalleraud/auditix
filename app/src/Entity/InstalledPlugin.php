<?php

namespace App\Entity;

use App\Repository\InstalledPluginRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: InstalledPluginRepository::class)]
#[ORM\Table(name: 'installed_plugin')]
class InstalledPlugin
{
    public const SIGNATURE_OFFICIAL = 'official';
    public const SIGNATURE_COMMUNITY = 'community';
    public const SIGNATURE_INVALID = 'invalid';

    public const SIGNATURE_STATUSES = [
        self::SIGNATURE_OFFICIAL,
        self::SIGNATURE_COMMUNITY,
        self::SIGNATURE_INVALID,
    ];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 128, unique: true)]
    private string $identifier;

    #[ORM\Column(length: 32)]
    private string $version;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $description = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $author = null;

    #[ORM\Column(type: Types::TEXT, nullable: true)]
    private ?string $homepage = null;

    #[ORM\Column(length: 64, nullable: true)]
    private ?string $license = null;

    #[ORM\Column(type: Types::JSON)]
    private array $manifest = [];

    #[ORM\Column(length: 512)]
    private string $archivePath;

    #[ORM\Column(length: 64)]
    private string $sha256;

    #[ORM\Column(length: 32)]
    private string $signatureStatus = self::SIGNATURE_COMMUNITY;

    #[ORM\Column(length: 128, nullable: true)]
    private ?string $signatureKeyId = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(name: 'installed_by_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    private ?User $installedBy = null;

    #[ORM\Column]
    private \DateTimeImmutable $installedAt;

    public function __construct()
    {
        $this->installedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getIdentifier(): string { return $this->identifier; }
    public function setIdentifier(string $v): static { $this->identifier = $v; return $this; }

    public function getVersion(): string { return $this->version; }
    public function setVersion(string $v): static { $this->version = $v; return $this; }

    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }

    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; return $this; }

    public function getAuthor(): ?string { return $this->author; }
    public function setAuthor(?string $v): static { $this->author = $v; return $this; }

    public function getHomepage(): ?string { return $this->homepage; }
    public function setHomepage(?string $v): static { $this->homepage = $v; return $this; }

    public function getLicense(): ?string { return $this->license; }
    public function setLicense(?string $v): static { $this->license = $v; return $this; }

    public function getManifest(): array { return $this->manifest; }
    public function setManifest(array $v): static { $this->manifest = $v; return $this; }

    public function getArchivePath(): string { return $this->archivePath; }
    public function setArchivePath(string $v): static { $this->archivePath = $v; return $this; }

    public function getSha256(): string { return $this->sha256; }
    public function setSha256(string $v): static { $this->sha256 = $v; return $this; }

    public function getSignatureStatus(): string { return $this->signatureStatus; }
    public function setSignatureStatus(string $v): static
    {
        $this->signatureStatus = in_array($v, self::SIGNATURE_STATUSES, true) ? $v : self::SIGNATURE_INVALID;
        return $this;
    }

    public function getSignatureKeyId(): ?string { return $this->signatureKeyId; }
    public function setSignatureKeyId(?string $v): static { $this->signatureKeyId = $v; return $this; }

    public function getInstalledBy(): ?User { return $this->installedBy; }
    public function setInstalledBy(?User $v): static { $this->installedBy = $v; return $this; }

    public function getInstalledAt(): \DateTimeImmutable { return $this->installedAt; }
    public function setInstalledAt(\DateTimeImmutable $v): static { $this->installedAt = $v; return $this; }
}
