<?php

namespace App\Entity;

use App\Repository\AiAssistantRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: AiAssistantRepository::class)]
#[ORM\Table(name: 'ai_assistant')]
#[ORM\Index(name: 'idx_ai_assistant_context', columns: ['context_id'])]
class AiAssistant
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Context $context = null;

    #[ORM\Column(length: 100)]
    private string $name = '';

    #[ORM\ManyToOne(targetEntity: LlmProvider::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'RESTRICT')]
    private ?LlmProvider $provider = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $model = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $systemPrompt = null;

    #[ORM\Column]
    private bool $enabled = true;

    /**
     * When true, the assistant can call read-only tools (list nodes, query
     * compliance, etc.). Tool results are anonymised before being sent to
     * the LLM so cloud providers never see real hostnames or IPs.
     */
    #[ORM\Column]
    private bool $toolsEnabled = false;

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
    public function getContext(): ?Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getProvider(): ?LlmProvider { return $this->provider; }
    public function setProvider(LlmProvider $v): static { $this->provider = $v; return $this; }
    public function getModel(): ?string { return $this->model; }
    public function setModel(?string $v): static { $this->model = $v; return $this; }
    public function getSystemPrompt(): ?string { return $this->systemPrompt; }
    public function setSystemPrompt(?string $v): static { $this->systemPrompt = $v; return $this; }
    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }
    public function isToolsEnabled(): bool { return $this->toolsEnabled; }
    public function setToolsEnabled(bool $v): static { $this->toolsEnabled = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): void { $this->updatedAt = new \DateTimeImmutable(); }

    /**
     * The model to use when sending a request: prefer the assistant-specific
     * value, otherwise fall back to the provider's default. Returning null
     * means the caller (UI / chat endpoint) should fail with a clear error.
     */
    public function getEffectiveModel(): ?string
    {
        if ($this->model !== null && $this->model !== '') {
            return $this->model;
        }
        return $this->provider?->getDefaultModel();
    }
}
