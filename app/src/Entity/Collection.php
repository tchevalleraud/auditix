<?php

namespace App\Entity;

use App\Repository\CollectionRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CollectionRepository::class)]
#[ORM\Index(columns: ['status'], name: 'idx_collection_status')]
class Collection
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_RUNNING = 'running';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_FAILED = 'failed';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Node::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Node $node;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Context $context;

    #[ORM\Column(type: 'json')]
    private array $tags = [];

    #[ORM\Column(length: 20)]
    private string $status = self::STATUS_PENDING;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $worker = null;

    #[ORM\Column]
    private int $commandCount = 0;

    #[ORM\Column]
    private int $completedCount = 0;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $error = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $startedAt = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $completedAt = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getNode(): Node { return $this->node; }
    public function setNode(Node $v): static { $this->node = $v; return $this; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    public function getTags(): array { return $this->tags; }
    public function setTags(array $v): static { $this->tags = array_values(array_unique($v)); return $this; }
    public function addTag(string $tag): static { if (!in_array($tag, $this->tags, true)) { $this->tags[] = $tag; } return $this; }
    public function removeTag(string $tag): static { $this->tags = array_values(array_filter($this->tags, fn($t) => $t !== $tag)); return $this; }
    public function getStatus(): string { return $this->status; }
    public function setStatus(string $v): static { $this->status = $v; return $this; }
    public function getWorker(): ?string { return $this->worker; }
    public function setWorker(?string $v): static { $this->worker = $v; return $this; }
    public function getCommandCount(): int { return $this->commandCount; }
    public function setCommandCount(int $v): static { $this->commandCount = $v; return $this; }
    public function getCompletedCount(): int { return $this->completedCount; }
    public function setCompletedCount(int $v): static { $this->completedCount = $v; return $this; }
    public function getError(): ?string { return $this->error; }
    public function setError(?string $v): static { $this->error = $v; return $this; }
    public function getStartedAt(): ?\DateTimeImmutable { return $this->startedAt; }
    public function setStartedAt(?\DateTimeImmutable $v): static { $this->startedAt = $v; return $this; }
    public function getCompletedAt(): ?\DateTimeImmutable { return $this->completedAt; }
    public function setCompletedAt(?\DateTimeImmutable $v): static { $this->completedAt = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function getStoragePath(): string
    {
        return 'collections/' . $this->id;
    }
}
