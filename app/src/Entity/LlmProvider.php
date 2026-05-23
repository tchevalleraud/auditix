<?php

namespace App\Entity;

use App\Repository\LlmProviderRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: LlmProviderRepository::class)]
#[ORM\Table(name: 'llm_provider')]
class LlmProvider
{
    public const TYPE_OPENROUTER = 'openrouter';
    public const TYPE_OLLAMA = 'ollama';
    public const TYPE_OPENAI = 'openai';
    public const TYPE_ANTHROPIC = 'anthropic';

    public const TYPES = [
        self::TYPE_OPENROUTER,
        self::TYPE_OLLAMA,
        self::TYPE_OPENAI,
        self::TYPE_ANTHROPIC,
    ];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 100)]
    private string $name = '';

    #[ORM\Column(length: 32)]
    private string $type = self::TYPE_OPENROUTER;

    #[ORM\Column(length: 512)]
    private string $baseUrl = '';

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $apiKeyEncrypted = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $defaultModel = null;

    #[ORM\Column]
    private bool $enabled = true;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getType(): string { return $this->type; }
    public function setType(string $v): static
    {
        $this->type = in_array($v, self::TYPES, true) ? $v : self::TYPE_OPENROUTER;
        return $this;
    }
    public function getBaseUrl(): string { return $this->baseUrl; }
    public function setBaseUrl(string $v): static { $this->baseUrl = rtrim($v, '/'); return $this; }
    public function getApiKeyEncrypted(): ?string { return $this->apiKeyEncrypted; }
    public function setApiKeyEncrypted(?string $v): static { $this->apiKeyEncrypted = $v; return $this; }
    public function getDefaultModel(): ?string { return $this->defaultModel; }
    public function setDefaultModel(?string $v): static { $this->defaultModel = $v; return $this; }
    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): void { $this->updatedAt = new \DateTimeImmutable(); }
}
