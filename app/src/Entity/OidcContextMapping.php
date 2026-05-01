<?php

namespace App\Entity;

use App\Repository\OidcContextMappingRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: OidcContextMappingRepository::class)]
#[ORM\Table(name: 'oidc_context_mapping')]
#[ORM\Index(name: 'idx_oidc_context_mapping_claim', columns: ['claim_value'])]
class OidcContextMapping
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: OidcProvider::class)]
    #[ORM\JoinColumn(name: 'provider_id', referencedColumnName: 'id', nullable: false, onDelete: 'CASCADE')]
    private ?OidcProvider $provider = null;

    #[ORM\Column(length: 255)]
    private ?string $claimValue = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Context $context = null;

    #[ORM\Column(options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getProvider(): ?OidcProvider { return $this->provider; }
    public function setProvider(OidcProvider $v): static { $this->provider = $v; return $this; }

    public function getClaimValue(): ?string { return $this->claimValue; }
    public function setClaimValue(string $v): static { $this->claimValue = $v; return $this; }

    public function getContext(): ?Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
