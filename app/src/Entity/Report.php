<?php

namespace App\Entity;

use App\Repository\ReportRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ReportRepository::class)]
class Report
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(length: 20)]
    private string $type = 'word';

    #[ORM\Column(length: 255)]
    private string $title = '';

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $subtitle = null;

    #[ORM\Column]
    private bool $showTableOfContents = true;

    #[ORM\Column]
    private bool $showAuthorsPage = true;

    #[ORM\Column]
    private bool $showRevisionPage = false;

    #[ORM\Column]
    private bool $showIllustrationsPage = false;

    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $tags = null;

    #[ORM\Column(type: 'json')]
    private array $blocks = [];

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Context $context;

    #[ORM\ManyToOne(targetEntity: ReportTheme::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?ReportTheme $theme = null;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $generatingStatus = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $generatedAt = null;

    #[ORM\Column(length: 500, nullable: true)]
    private ?string $generatedFile = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $updatedAt = null;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; return $this; }
    public function getType(): string { return $this->type; }
    public function setType(string $v): static { $this->type = $v; return $this; }
    public function getTitle(): string { return $this->title; }
    public function setTitle(string $v): static { $this->title = $v; return $this; }
    public function getSubtitle(): ?string { return $this->subtitle; }
    public function setSubtitle(?string $v): static { $this->subtitle = $v; return $this; }
    public function getShowTableOfContents(): bool { return $this->showTableOfContents; }
    public function setShowTableOfContents(bool $v): static { $this->showTableOfContents = $v; return $this; }
    public function getShowAuthorsPage(): bool { return $this->showAuthorsPage; }
    public function setShowAuthorsPage(bool $v): static { $this->showAuthorsPage = $v; return $this; }
    public function getShowRevisionPage(): bool { return $this->showRevisionPage; }
    public function setShowRevisionPage(bool $v): static { $this->showRevisionPage = $v; return $this; }
    public function getShowIllustrationsPage(): bool { return $this->showIllustrationsPage; }
    public function setShowIllustrationsPage(bool $v): static { $this->showIllustrationsPage = $v; return $this; }
    public function getTags(): ?array { return $this->tags; }
    public function setTags(?array $v): static { $this->tags = $v; return $this; }
    public function getBlocks(): array { return $this->blocks; }
    public function setBlocks(array $v): static { $this->blocks = $v; return $this; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    public function getTheme(): ?ReportTheme { return $this->theme; }
    public function setTheme(?ReportTheme $v): static { $this->theme = $v; return $this; }
    public function getGeneratingStatus(): ?string { return $this->generatingStatus; }
    public function setGeneratingStatus(?string $v): static { $this->generatingStatus = $v; return $this; }
    public function getGeneratedAt(): ?\DateTimeImmutable { return $this->generatedAt; }
    public function setGeneratedAt(?\DateTimeImmutable $v): static { $this->generatedAt = $v; return $this; }
    public function getGeneratedFile(): ?string { return $this->generatedFile; }
    public function setGeneratedFile(?string $v): static { $this->generatedFile = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): ?\DateTimeImmutable { return $this->updatedAt; }
    public function setUpdatedAt(?\DateTimeImmutable $v): static { $this->updatedAt = $v; return $this; }
}
