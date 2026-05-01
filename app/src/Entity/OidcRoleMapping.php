<?php

namespace App\Entity;

use App\Repository\OidcRoleMappingRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: OidcRoleMappingRepository::class)]
#[ORM\Table(name: 'oidc_role_mapping')]
#[ORM\Index(name: 'idx_oidc_role_mapping_claim', columns: ['claim_value'])]
class OidcRoleMapping
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

    #[ORM\Column(length: 64)]
    private ?string $grantedRole = null;

    #[ORM\Column(options: ['default' => 0])]
    private int $priority = 0;

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

    public function getGrantedRole(): ?string { return $this->grantedRole; }
    public function setGrantedRole(string $v): static { $this->grantedRole = $v; return $this; }

    public function getPriority(): int { return $this->priority; }
    public function setPriority(int $v): static { $this->priority = $v; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
