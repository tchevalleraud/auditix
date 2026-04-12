<?php

namespace App\Entity;

use App\Repository\VendorPluginRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: VendorPluginRepository::class)]
#[ORM\UniqueConstraint(name: 'uniq_vendor_plugin_context', columns: ['context_id', 'plugin_identifier'])]
class VendorPlugin
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Context $context = null;

    #[ORM\Column(length: 100)]
    private ?string $pluginIdentifier = null;

    #[ORM\Column]
    private bool $enabled = false;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastSyncAt = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $lastSyncStatus = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $configuration = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getContext(): ?Context { return $this->context; }
    public function setContext(?Context $v): static { $this->context = $v; return $this; }
    public function getPluginIdentifier(): ?string { return $this->pluginIdentifier; }
    public function setPluginIdentifier(string $v): static { $this->pluginIdentifier = $v; return $this; }
    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }
    public function getLastSyncAt(): ?\DateTimeImmutable { return $this->lastSyncAt; }
    public function setLastSyncAt(?\DateTimeImmutable $v): static { $this->lastSyncAt = $v; return $this; }
    public function getLastSyncStatus(): ?string { return $this->lastSyncStatus; }
    public function setLastSyncStatus(?string $v): static { $this->lastSyncStatus = $v; return $this; }
    public function getConfiguration(): ?array { return $this->configuration; }
    public function setConfiguration(?array $v): static { $this->configuration = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
