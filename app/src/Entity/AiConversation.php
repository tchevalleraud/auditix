<?php

namespace App\Entity;

use App\Repository\AiConversationRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: AiConversationRepository::class)]
#[ORM\Table(name: 'ai_conversation')]
#[ORM\Index(name: 'idx_ai_conv_user_assistant', columns: ['user_id', 'assistant_id'])]
class AiConversation
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: User::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?User $user = null;

    #[ORM\ManyToOne(targetEntity: AiAssistant::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?AiAssistant $assistant = null;

    #[ORM\Column(length: 255)]
    private string $title = 'New conversation';

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column]
    private \DateTimeImmutable $updatedAt;

    /**
     * When true, tool results execute and are sent to the LLM without a user
     * confirmation step. False by default: each result pauses the loop so the
     * user can review the actual payload before approving.
     */
    #[ORM\Column]
    private bool $autoApproveTools = false;

    /** @var Collection<int, AiMessage> */
    #[ORM\OneToMany(targetEntity: AiMessage::class, mappedBy: 'conversation', cascade: ['persist', 'remove'], orphanRemoval: true)]
    #[ORM\OrderBy(['createdAt' => 'ASC', 'id' => 'ASC'])]
    private Collection $messages;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
        $this->messages = new ArrayCollection();
    }

    public function getId(): ?int { return $this->id; }
    public function getUser(): ?User { return $this->user; }
    public function setUser(User $v): static { $this->user = $v; return $this; }
    public function getAssistant(): ?AiAssistant { return $this->assistant; }
    public function setAssistant(AiAssistant $v): static { $this->assistant = $v; return $this; }
    public function getContext(): ?Context { return $this->assistant?->getContext(); }
    public function getTitle(): string { return $this->title; }
    public function setTitle(string $v): static { $this->title = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): void { $this->updatedAt = new \DateTimeImmutable(); }

    public function isAutoApproveTools(): bool { return $this->autoApproveTools; }
    public function setAutoApproveTools(bool $v): static { $this->autoApproveTools = $v; return $this; }

    /** @return Collection<int, AiMessage> */
    public function getMessages(): Collection { return $this->messages; }

    public function addMessage(AiMessage $m): static
    {
        if (!$this->messages->contains($m)) {
            $this->messages->add($m);
            $m->setConversation($this);
        }
        return $this;
    }
}
