<?php

namespace App\Entity;

use App\Repository\CollectionRuleExtractRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CollectionRuleExtractRepository::class)]
class CollectionRuleExtract
{
    public const KEY_MODE_MANUAL = 'manual';
    public const KEY_MODE_EXTRACT = 'extract';

    public const EXTRACT_MODE_LINE = 'line';
    public const EXTRACT_MODE_BLOCK = 'block';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(length: 1000)]
    private string $regex;

    #[ORM\Column]
    private bool $multiline = false;

    #[ORM\Column(length: 10)]
    private string $keyMode = self::KEY_MODE_MANUAL;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $keyManual = null;

    #[ORM\ManyToOne(targetEntity: self::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?self $keyExtract = null;

    #[ORM\Column(nullable: true)]
    private ?int $keyGroup = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $keyLabel = null;

    #[ORM\Column(nullable: true)]
    private ?int $valueGroup = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $valueMap = null;

    #[ORM\ManyToOne(targetEntity: InventoryCategory::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?InventoryCategory $category = null;

    #[ORM\Column(length: 50, nullable: true)]
    private ?string $nodeField = null;

    #[ORM\Column(nullable: true)]
    private ?int $nodeFieldGroup = null;

    /**
     * Extraction mode: 'line' applies regex per line (default), 'block' splits
     * text by blockSeparator first and applies regex within each block.
     */
    #[ORM\Column(length: 10)]
    private string $extractMode = self::EXTRACT_MODE_LINE;

    /**
     * Block mode only: regex that identifies the start of each block.
     * Must use the /m flag convention for line-anchored patterns (e.g. ^Port:\s+(\S+)).
     * Each match starts a new block; the text between two consecutive matches is one block.
     */
    #[ORM\Column(length: 1000, nullable: true)]
    private ?string $blockSeparator = null;

    /**
     * Block mode only: which capture group from blockSeparator to use as the
     * entry key for all inventory entries produced within this block.
     * If null, the normal keyMode/keyGroup/keyManual logic is used instead.
     */
    #[ORM\Column(nullable: true)]
    private ?int $blockKeyGroup = null;

    #[ORM\Column]
    private int $position = 0;

    #[ORM\ManyToOne(targetEntity: CollectionRule::class, inversedBy: 'extracts')]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private CollectionRule $rule;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getRegex(): string { return $this->regex; }
    public function setRegex(string $v): static { $this->regex = $v; return $this; }
    public function isMultiline(): bool { return $this->multiline; }
    public function setMultiline(bool $v): static { $this->multiline = $v; return $this; }
    public function getKeyMode(): string { return $this->keyMode; }
    public function setKeyMode(string $v): static { $this->keyMode = $v; return $this; }
    public function getKeyManual(): ?string { return $this->keyManual; }
    public function setKeyManual(?string $v): static { $this->keyManual = $v; return $this; }
    public function getKeyExtract(): ?self { return $this->keyExtract; }
    public function setKeyExtract(?self $v): static { $this->keyExtract = $v; return $this; }
    public function getKeyGroup(): ?int { return $this->keyGroup; }
    public function setKeyGroup(?int $v): static { $this->keyGroup = $v; return $this; }
    public function getKeyLabel(): ?string { return $this->keyLabel; }
    public function setKeyLabel(?string $v): static { $this->keyLabel = $v; return $this; }
    public function getValueGroup(): ?int { return $this->valueGroup; }
    public function setValueGroup(?int $v): static { $this->valueGroup = $v; return $this; }
    public function getValueMap(): ?array { return $this->valueMap; }
    public function setValueMap(?array $v): static { $this->valueMap = $v; return $this; }
    public function getCategory(): ?InventoryCategory { return $this->category; }
    public function setCategory(?InventoryCategory $v): static { $this->category = $v; return $this; }
    public function getNodeField(): ?string { return $this->nodeField; }
    public function setNodeField(?string $v): static { $this->nodeField = $v; return $this; }
    public function getNodeFieldGroup(): ?int { return $this->nodeFieldGroup; }
    public function setNodeFieldGroup(?int $v): static { $this->nodeFieldGroup = $v; return $this; }
    public function getExtractMode(): string { return $this->extractMode; }
    public function setExtractMode(string $v): static { $this->extractMode = $v; return $this; }
    public function getBlockSeparator(): ?string { return $this->blockSeparator; }
    public function setBlockSeparator(?string $v): static { $this->blockSeparator = $v; return $this; }
    public function getBlockKeyGroup(): ?int { return $this->blockKeyGroup; }
    public function setBlockKeyGroup(?int $v): static { $this->blockKeyGroup = $v; return $this; }
    public function getPosition(): int { return $this->position; }
    public function setPosition(int $v): static { $this->position = $v; return $this; }
    public function getRule(): CollectionRule { return $this->rule; }
    public function setRule(CollectionRule $v): static { $this->rule = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
