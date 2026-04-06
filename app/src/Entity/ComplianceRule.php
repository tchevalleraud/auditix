<?php

namespace App\Entity;

use App\Repository\ComplianceRuleRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ComplianceRuleRepository::class)]
class ComplianceRule
{
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

    #[ORM\Column(type: 'json')]
    private array $dataSources = [];

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
    public function getDataSources(): array { return $this->dataSources; }
    public function setDataSources(array $v): static { $this->dataSources = $v; return $this; }
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
