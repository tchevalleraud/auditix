<?php

namespace App\Entity;

use App\Repository\ProductRangeRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ProductRangeRepository::class)]
class ProductRange
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private ?string $name = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\ManyToOne(targetEntity: Editor::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Editor $manufacturer = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Context $context = null;

    #[ORM\Column(length: 50, nullable: true)]
    private ?string $recommendedVersion = null;

    #[ORM\Column(length: 50, nullable: true)]
    private ?string $currentVersion = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $releaseDate = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $endOfSaleDate = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $endOfSupportDate = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $endOfLifeDate = null;

    #[ORM\Column(length: 100, nullable: true)]
    private ?string $pluginSource = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastSyncedAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): ?string { return $this->name; }
    public function setName(string $name): static { $this->name = $name; return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; return $this; }
    public function getManufacturer(): ?Editor { return $this->manufacturer; }
    public function setManufacturer(?Editor $v): static { $this->manufacturer = $v; return $this; }
    public function getContext(): ?Context { return $this->context; }
    public function setContext(?Context $v): static { $this->context = $v; return $this; }
    public function getRecommendedVersion(): ?string { return $this->recommendedVersion; }
    public function setRecommendedVersion(?string $v): static { $this->recommendedVersion = $v; return $this; }
    public function getCurrentVersion(): ?string { return $this->currentVersion; }
    public function setCurrentVersion(?string $v): static { $this->currentVersion = $v; return $this; }
    public function getReleaseDate(): ?\DateTimeImmutable { return $this->releaseDate; }
    public function setReleaseDate(?\DateTimeImmutable $v): static { $this->releaseDate = $v; return $this; }
    public function getEndOfSaleDate(): ?\DateTimeImmutable { return $this->endOfSaleDate; }
    public function setEndOfSaleDate(?\DateTimeImmutable $v): static { $this->endOfSaleDate = $v; return $this; }
    public function getEndOfSupportDate(): ?\DateTimeImmutable { return $this->endOfSupportDate; }
    public function setEndOfSupportDate(?\DateTimeImmutable $v): static { $this->endOfSupportDate = $v; return $this; }
    public function getEndOfLifeDate(): ?\DateTimeImmutable { return $this->endOfLifeDate; }
    public function setEndOfLifeDate(?\DateTimeImmutable $v): static { $this->endOfLifeDate = $v; return $this; }
    public function getPluginSource(): ?string { return $this->pluginSource; }
    public function setPluginSource(?string $v): static { $this->pluginSource = $v; return $this; }
    public function getLastSyncedAt(): ?\DateTimeImmutable { return $this->lastSyncedAt; }
    public function setLastSyncedAt(?\DateTimeImmutable $v): static { $this->lastSyncedAt = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
