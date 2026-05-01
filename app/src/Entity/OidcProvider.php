<?php

namespace App\Entity;

use App\Repository\OidcProviderRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: OidcProviderRepository::class)]
#[ORM\Table(name: 'oidc_provider')]
#[ORM\UniqueConstraint(name: 'uniq_oidc_provider_slug', columns: ['slug'])]
class OidcProvider
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 50)]
    private ?string $slug = null;

    #[ORM\Column(length: 100)]
    private ?string $name = null;

    #[ORM\Column(options: ['default' => false])]
    private bool $enabled = false;

    #[ORM\Column(length: 500, nullable: true)]
    private ?string $discoveryUrl = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $clientId = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $clientSecretEncrypted = null;

    #[ORM\Column(length: 255, options: ['default' => 'openid profile email'])]
    private string $scopes = 'openid profile email';

    #[ORM\Column(length: 100, nullable: true)]
    private ?string $buttonLabel = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $buttonColor = null;

    #[ORM\Column(length: 500, nullable: true)]
    private ?string $buttonIconUrl = null;

    #[ORM\Column(length: 100, options: ['default' => 'preferred_username'])]
    private string $claimUsername = 'preferred_username';

    #[ORM\Column(length: 100, options: ['default' => 'email'])]
    private string $claimEmail = 'email';

    #[ORM\Column(length: 100, options: ['default' => 'given_name'])]
    private string $claimFirstname = 'given_name';

    #[ORM\Column(length: 100, options: ['default' => 'family_name'])]
    private string $claimLastname = 'family_name';

    #[ORM\Column(length: 100, options: ['default' => 'realm_access.roles'])]
    private string $claimRoles = 'realm_access.roles';

    #[ORM\Column(length: 100, nullable: true)]
    private ?string $claimGroups = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $requiredRole = null;

    #[ORM\Column(options: ['default' => true])]
    private bool $autoProvisioning = true;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(name: 'default_context_id', referencedColumnName: 'id', nullable: true, onDelete: 'SET NULL')]
    private ?Context $defaultContext = null;

    #[ORM\Column(options: ['default' => 0])]
    private int $sortOrder = 0;

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

    public function getSlug(): ?string { return $this->slug; }
    public function setSlug(string $v): static { $this->slug = $v; return $this; }

    public function getName(): ?string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }

    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }

    public function getDiscoveryUrl(): ?string { return $this->discoveryUrl; }
    public function setDiscoveryUrl(?string $v): static { $this->discoveryUrl = $v; return $this; }

    public function getClientId(): ?string { return $this->clientId; }
    public function setClientId(?string $v): static { $this->clientId = $v; return $this; }

    public function getClientSecretEncrypted(): ?string { return $this->clientSecretEncrypted; }
    public function setClientSecretEncrypted(?string $v): static { $this->clientSecretEncrypted = $v; return $this; }

    public function getScopes(): string { return $this->scopes; }
    public function setScopes(string $v): static { $this->scopes = $v; return $this; }

    public function getButtonLabel(): ?string { return $this->buttonLabel; }
    public function setButtonLabel(?string $v): static { $this->buttonLabel = $v; return $this; }

    public function getButtonColor(): ?string { return $this->buttonColor; }
    public function setButtonColor(?string $v): static { $this->buttonColor = $v; return $this; }

    public function getButtonIconUrl(): ?string { return $this->buttonIconUrl; }
    public function setButtonIconUrl(?string $v): static { $this->buttonIconUrl = $v; return $this; }

    public function getClaimUsername(): string { return $this->claimUsername; }
    public function setClaimUsername(string $v): static { $this->claimUsername = $v; return $this; }

    public function getClaimEmail(): string { return $this->claimEmail; }
    public function setClaimEmail(string $v): static { $this->claimEmail = $v; return $this; }

    public function getClaimFirstname(): string { return $this->claimFirstname; }
    public function setClaimFirstname(string $v): static { $this->claimFirstname = $v; return $this; }

    public function getClaimLastname(): string { return $this->claimLastname; }
    public function setClaimLastname(string $v): static { $this->claimLastname = $v; return $this; }

    public function getClaimRoles(): string { return $this->claimRoles; }
    public function setClaimRoles(string $v): static { $this->claimRoles = $v; return $this; }

    public function getClaimGroups(): ?string { return $this->claimGroups; }
    public function setClaimGroups(?string $v): static { $this->claimGroups = $v; return $this; }

    public function getRequiredRole(): ?string { return $this->requiredRole; }
    public function setRequiredRole(?string $v): static { $this->requiredRole = $v; return $this; }

    public function isAutoProvisioning(): bool { return $this->autoProvisioning; }
    public function setAutoProvisioning(bool $v): static { $this->autoProvisioning = $v; return $this; }

    public function getDefaultContext(): ?Context { return $this->defaultContext; }
    public function setDefaultContext(?Context $v): static { $this->defaultContext = $v; return $this; }

    public function getSortOrder(): int { return $this->sortOrder; }
    public function setSortOrder(int $v): static { $this->sortOrder = $v; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): void { $this->updatedAt = new \DateTimeImmutable(); }

    public function isReady(): bool
    {
        return $this->enabled
            && $this->discoveryUrl !== null
            && $this->clientId !== null
            && $this->clientSecretEncrypted !== null;
    }
}
