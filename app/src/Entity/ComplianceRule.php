<?php

namespace App\Entity;

use App\Repository\ComplianceRuleRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ComplianceRuleRepository::class)]
class ComplianceRule
{
    public const SOURCE_NONE = 'none';
    public const SOURCE_INVENTORY = 'inventory';
    public const SOURCE_COLLECTION = 'collection';
    public const SOURCE_SSH = 'ssh';

    public const RESULT_CAPTURE = 'capture';
    public const RESULT_MATCH = 'match';
    public const RESULT_COUNT = 'count';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 100, nullable: true)]
    private ?string $identifier = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column]
    private bool $enabled = true;

    #[ORM\Column(length: 20)]
    private string $sourceType = self::SOURCE_NONE;

    // Inventory source fields
    #[ORM\ManyToOne(targetEntity: InventoryCategory::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?InventoryCategory $sourceCategory = null;

    #[ORM\Column(length: 500, nullable: true)]
    private ?string $sourceKey = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $sourceValue = null;

    // Collection source fields
    #[ORM\Column(length: 255, nullable: true)]
    private ?string $sourceCommand = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $sourceTag = null;

    #[ORM\Column(length: 1000, nullable: true)]
    private ?string $sourceRegex = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $sourceResultMode = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $sourceValueMap = null;

    #[ORM\Column(nullable: true)]
    private ?int $sourceKeyGroup = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $conditionTree = null;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $multiRowMessages = null;

    #[ORM\ManyToOne(targetEntity: ComplianceRuleFolder::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?ComplianceRuleFolder $folder = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Context $context;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getIdentifier(): ?string { return $this->identifier; }
    public function setIdentifier(?string $v): static { $this->identifier = $v; return $this; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; return $this; }
    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }
    public function getSourceType(): string { return $this->sourceType; }
    public function setSourceType(string $v): static { $this->sourceType = $v; return $this; }
    public function getSourceCategory(): ?InventoryCategory { return $this->sourceCategory; }
    public function setSourceCategory(?InventoryCategory $v): static { $this->sourceCategory = $v; return $this; }
    public function getSourceKey(): ?string { return $this->sourceKey; }
    public function setSourceKey(?string $v): static { $this->sourceKey = $v; return $this; }
    public function getSourceValue(): ?string { return $this->sourceValue; }
    public function setSourceValue(?string $v): static { $this->sourceValue = $v; return $this; }
    public function getSourceCommand(): ?string { return $this->sourceCommand; }
    public function setSourceCommand(?string $v): static { $this->sourceCommand = $v; return $this; }
    public function getSourceTag(): ?string { return $this->sourceTag; }
    public function setSourceTag(?string $v): static { $this->sourceTag = $v; return $this; }
    public function getSourceRegex(): ?string { return $this->sourceRegex; }
    public function setSourceRegex(?string $v): static { $this->sourceRegex = $v; return $this; }
    public function getSourceResultMode(): ?string { return $this->sourceResultMode; }
    public function setSourceResultMode(?string $v): static { $this->sourceResultMode = $v; return $this; }
    public function getSourceValueMap(): ?array { return $this->sourceValueMap; }
    public function setSourceValueMap(?array $v): static { $this->sourceValueMap = $v; return $this; }
    public function getSourceKeyGroup(): ?int { return $this->sourceKeyGroup; }
    public function setSourceKeyGroup(?int $v): static { $this->sourceKeyGroup = $v; return $this; }
    public function getConditionTree(): ?array { return $this->conditionTree; }
    public function setConditionTree(?array $v): static { $this->conditionTree = $v; return $this; }
    public function getMultiRowMessages(): ?array { return $this->multiRowMessages; }
    public function setMultiRowMessages(?array $v): static { $this->multiRowMessages = $v; return $this; }
    public function getFolder(): ?ComplianceRuleFolder { return $this->folder; }
    public function setFolder(?ComplianceRuleFolder $v): static { $this->folder = $v; return $this; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
