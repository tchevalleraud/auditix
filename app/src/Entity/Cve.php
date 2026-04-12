<?php

namespace App\Entity;

use App\Repository\CveRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CveRepository::class)]
#[ORM\UniqueConstraint(name: 'uniq_cve_context', columns: ['context_id', 'cve_id'])]
class Cve
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Context $context = null;

    #[ORM\Column(length: 20)]
    private ?string $cveId = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(nullable: true)]
    private ?float $cvssScore = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $cvssVector = null;

    #[ORM\Column(length: 10)]
    private string $severity = 'none';

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $publishedAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $modifiedAt = null;

    #[ORM\Column(length: 50, nullable: true)]
    private ?string $versionStartIncluding = null;

    #[ORM\Column(length: 50, nullable: true)]
    private ?string $versionEndExcluding = null;

    #[ORM\Column(length: 50, nullable: true)]
    private ?string $versionEndIncluding = null;

    #[ORM\Column]
    private \DateTimeImmutable $syncedAt;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $now = new \DateTimeImmutable();
        $this->syncedAt = $now;
        $this->createdAt = $now;
    }

    public function getId(): ?int { return $this->id; }
    public function getContext(): ?Context { return $this->context; }
    public function setContext(?Context $v): static { $this->context = $v; return $this; }
    public function getCveId(): ?string { return $this->cveId; }
    public function setCveId(string $v): static { $this->cveId = $v; return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; return $this; }
    public function getCvssScore(): ?float { return $this->cvssScore; }
    public function setCvssScore(?float $v): static { $this->cvssScore = $v; return $this; }
    public function getCvssVector(): ?string { return $this->cvssVector; }
    public function setCvssVector(?string $v): static { $this->cvssVector = $v; return $this; }
    public function getSeverity(): string { return $this->severity; }
    public function setSeverity(string $v): static { $this->severity = $v; return $this; }
    public function getPublishedAt(): ?\DateTimeImmutable { return $this->publishedAt; }
    public function setPublishedAt(?\DateTimeImmutable $v): static { $this->publishedAt = $v; return $this; }
    public function getModifiedAt(): ?\DateTimeImmutable { return $this->modifiedAt; }
    public function setModifiedAt(?\DateTimeImmutable $v): static { $this->modifiedAt = $v; return $this; }
    public function getVersionStartIncluding(): ?string { return $this->versionStartIncluding; }
    public function setVersionStartIncluding(?string $v): static { $this->versionStartIncluding = $v; return $this; }
    public function getVersionEndExcluding(): ?string { return $this->versionEndExcluding; }
    public function setVersionEndExcluding(?string $v): static { $this->versionEndExcluding = $v; return $this; }
    public function getVersionEndIncluding(): ?string { return $this->versionEndIncluding; }
    public function setVersionEndIncluding(?string $v): static { $this->versionEndIncluding = $v; return $this; }
    public function getSyncedAt(): \DateTimeImmutable { return $this->syncedAt; }
    public function setSyncedAt(\DateTimeImmutable $v): static { $this->syncedAt = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
