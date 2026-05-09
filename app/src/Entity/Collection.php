<?php

namespace App\Entity;

use App\Repository\CollectionRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection as DoctrineCollection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CollectionRepository::class)]
#[ORM\Index(columns: ['status'], name: 'idx_collection_status')]
class Collection
{
    public const STATUS_PENDING = 'pending';
    public const STATUS_RUNNING = 'running';
    public const STATUS_COMPLETED = 'completed';
    public const STATUS_FAILED = 'failed';

    public const EXTRACT_STATUS_PENDING = 'pending';
    public const EXTRACT_STATUS_RUNNING = 'running';
    public const EXTRACT_STATUS_COMPLETED = 'completed';
    public const EXTRACT_STATUS_FAILED = 'failed';

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

    /** @var DoctrineCollection<int, CollectionTag> */
    #[ORM\OneToMany(mappedBy: 'collection', targetEntity: CollectionTag::class, cascade: ['persist', 'remove'], orphanRemoval: true)]
    private DoctrineCollection $collectionTags;

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

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $extractStatus = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastExtractedAt = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $extractError = null;

    /** @var string[]|null Tags to apply only after a successful collect — null when already applied. */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $pendingTags = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->collectionTags = new ArrayCollection();
    }

    public function getId(): ?int { return $this->id; }
    public function getNode(): Node { return $this->node; }
    public function setNode(Node $v): static { $this->node = $v; return $this; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }

    /** @return DoctrineCollection<int, CollectionTag> */
    public function getCollectionTags(): DoctrineCollection { return $this->collectionTags; }

    /** @return string[] */
    public function getTagNames(): array
    {
        $names = [];
        foreach ($this->collectionTags as $t) {
            $names[] = $t->getName();
        }
        return $names;
    }

    public function hasTag(string $name): bool
    {
        foreach ($this->collectionTags as $t) {
            if ($t->getName() === $name) return true;
        }
        return false;
    }

    public function getCollectionTag(string $name): ?CollectionTag
    {
        foreach ($this->collectionTags as $t) {
            if ($t->getName() === $name) return $t;
        }
        return null;
    }

    /** @return string[] */
    public function getTags(): array { return $this->getTagNames(); }

    public function setTags(array $names): static
    {
        $names = array_values(array_unique(array_filter(array_map('strval', $names), fn($n) => $n !== '')));
        $keep = array_flip($names);
        // Only remove tags that are not in the new list (preserve existing tag rows
        // so their inventory entries — bound via FK cascade — are not lost).
        foreach ($this->collectionTags->toArray() as $t) {
            if (!isset($keep[$t->getName()])) {
                $this->collectionTags->removeElement($t);
            }
        }
        foreach ($names as $n) {
            if (!$this->hasTag($n)) {
                $this->addTag($n);
            }
        }
        return $this;
    }

    public function addTag(string $name): static
    {
        if ($name === '' || $this->hasTag($name)) return $this;
        if (!isset($this->node)) {
            throw new \LogicException('Cannot add a tag before the collection node is set');
        }
        $t = new CollectionTag();
        $t->setCollection($this);
        $t->setNode($this->node);
        $t->setName($name);
        $this->collectionTags->add($t);
        return $this;
    }

    public function removeTag(string $name): static
    {
        foreach ($this->collectionTags->toArray() as $t) {
            if ($t->getName() === $name) {
                $this->collectionTags->removeElement($t);
            }
        }
        return $this;
    }
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
    public function getExtractStatus(): ?string { return $this->extractStatus; }
    public function setExtractStatus(?string $v): static { $this->extractStatus = $v; return $this; }
    public function getLastExtractedAt(): ?\DateTimeImmutable { return $this->lastExtractedAt; }
    public function setLastExtractedAt(?\DateTimeImmutable $v): static { $this->lastExtractedAt = $v; return $this; }
    public function getExtractError(): ?string { return $this->extractError; }
    public function setExtractError(?string $v): static { $this->extractError = $v; return $this; }

    /** @return string[] */
    public function getPendingTags(): array { return $this->pendingTags ?? []; }
    public function setPendingTags(?array $names): static
    {
        if ($names === null) { $this->pendingTags = null; return $this; }
        $clean = array_values(array_unique(array_filter(array_map('strval', $names), fn($n) => $n !== '')));
        $this->pendingTags = $clean ?: null;
        return $this;
    }
    public function clearPendingTags(): static { $this->pendingTags = null; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public function getStoragePath(): string
    {
        return 'collections/' . $this->id;
    }
}
