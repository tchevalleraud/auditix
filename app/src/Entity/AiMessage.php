<?php

namespace App\Entity;

use App\Repository\AiMessageRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: AiMessageRepository::class)]
#[ORM\Table(name: 'ai_message')]
class AiMessage
{
    public const ROLE_USER = 'user';
    public const ROLE_ASSISTANT = 'assistant';
    public const ROLE_SYSTEM = 'system';
    /**
     * The assistant asked to call a tool. `content` carries an optional
     * preamble (often empty), `metadata.tool_calls` carries the structured
     * call list (id/name/arguments).
     */
    public const ROLE_TOOL_CALL = 'tool_call';
    /**
     * Result of a previous tool call. `content` is the (anonymised) tool
     * output, `metadata.tool_call_id` ties it back to the call.
     */
    public const ROLE_TOOL = 'tool';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: AiConversation::class, inversedBy: 'messages')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?AiConversation $conversation = null;

    #[ORM\Column(length: 16)]
    private string $role = self::ROLE_USER;

    #[ORM\Column(type: 'text')]
    private string $content = '';

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    /** Free-form payload — tool_call list, tool_call_id, etc. */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $metadata = null;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getConversation(): ?AiConversation { return $this->conversation; }
    public function setConversation(AiConversation $v): static { $this->conversation = $v; return $this; }
    public function getRole(): string { return $this->role; }
    public function setRole(string $v): static { $this->role = $v; return $this; }
    public function getContent(): string { return $this->content; }
    public function setContent(string $v): static { $this->content = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getMetadata(): ?array { return $this->metadata; }
    public function setMetadata(?array $v): static { $this->metadata = $v; return $this; }
}
