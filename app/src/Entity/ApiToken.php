<?php

namespace App\Entity;

use App\Repository\ApiTokenRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ApiTokenRepository::class)]
#[ORM\Index(columns: ['token_hash'], name: 'idx_api_token_hash')]
class ApiToken
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(length: 64, unique: true)]
    private string $tokenHash;

    #[ORM\Column(length: 8)]
    private string $tokenPrefix;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private User $user;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Context $context;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $expiresAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastUsedAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public static function create(string $name, User $user, Context $context, ?\DateTimeImmutable $expiresAt = null): array
    {
        $plaintext = bin2hex(random_bytes(32));

        $token = new self();
        $token->name = $name;
        $token->tokenHash = hash('sha256', $plaintext);
        $token->tokenPrefix = substr($plaintext, 0, 8);
        $token->user = $user;
        $token->context = $context;
        $token->expiresAt = $expiresAt;

        return [$token, $plaintext];
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function getTokenHash(): string { return $this->tokenHash; }
    public function getTokenPrefix(): string { return $this->tokenPrefix; }
    public function getUser(): User { return $this->user; }
    public function getContext(): Context { return $this->context; }
    public function getExpiresAt(): ?\DateTimeImmutable { return $this->expiresAt; }
    public function getLastUsedAt(): ?\DateTimeImmutable { return $this->lastUsedAt; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function isExpired(): bool
    {
        return $this->expiresAt !== null && $this->expiresAt < new \DateTimeImmutable();
    }

    public function markUsed(): void
    {
        $this->lastUsedAt = new \DateTimeImmutable();
    }
}
