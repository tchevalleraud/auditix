<?php

namespace App\Entity;

use App\Repository\ReportThemeRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: ReportThemeRepository::class)]
class ReportTheme
{
    public const DEFAULT_STYLES = [
        'colors' => [
            'primary' => '#1e293b',
            'secondary' => '#3b82f6',
        ],
        'body' => [
            'font' => 'Calibri',
            'size' => 11,
            'color' => '#1e293b',
        ],
        'headings' => [
            ['level' => 1, 'font' => 'Calibri', 'size' => 26, 'bold' => true, 'italic' => false, 'color' => '#1e293b', 'background' => '', 'spaceBefore' => 4, 'spaceAfter' => 2],
            ['level' => 2, 'font' => 'Calibri', 'size' => 22, 'bold' => true, 'italic' => false, 'color' => '#1e293b', 'background' => '', 'spaceBefore' => 4, 'spaceAfter' => 2],
            ['level' => 3, 'font' => 'Calibri', 'size' => 18, 'bold' => true, 'italic' => false, 'color' => '#334155', 'background' => '', 'spaceBefore' => 3, 'spaceAfter' => 1],
            ['level' => 4, 'font' => 'Calibri', 'size' => 15, 'bold' => true, 'italic' => false, 'color' => '#334155', 'background' => '', 'spaceBefore' => 3, 'spaceAfter' => 1],
            ['level' => 5, 'font' => 'Calibri', 'size' => 13, 'bold' => true, 'italic' => false, 'color' => '#475569', 'background' => '', 'spaceBefore' => 2, 'spaceAfter' => 1],
            ['level' => 6, 'font' => 'Calibri', 'size' => 11, 'bold' => true, 'italic' => true, 'color' => '#475569', 'background' => '', 'spaceBefore' => 2, 'spaceAfter' => 1],
        ],
        'paragraph' => [
            'alignment' => 'left',
            'lineBefore' => 0,
            'lineAfter' => 0,
            'blockSpacing' => 4,
            'spaceBefore' => 2,
            'spaceAfter' => 2,
        ],
        'table' => [
            'headerBg' => '#1e293b',
            'headerColor' => '#ffffff',
            'borderColor' => '#e2e8f0',
            'alternateRows' => true,
            'alternateBg' => '#f8fafc',
            'fontSize' => 0,
        ],
        'cliCommand' => [
            'font' => 'Consolas',
            'size' => 9,
            'bgColor' => '#f1f5f9',
            'textColor' => '#1e293b',
            'borderColor' => '#e2e8f0',
            'borderRadius' => 2,
            'lineNumberColor' => '#94a3b8',
            'showLineNumbers' => true,
            'padding' => 3,
            'lineSpacing' => 1.4,
            'showHeader' => true,
            'headerBgColor' => '#1e293b',
            'headerTextColor' => '#ffffff',
        ],
        'header' => [
            'enabled' => true,
            'separator' => true,
            'separatorColor' => '#e2e8f0',
            'offset' => 5,
            'left' => ['type' => 'variable', 'variable' => 'title', 'style' => ['font' => 'Calibri', 'size' => 8, 'bold' => false, 'italic' => false, 'color' => '#64748b']],
            'center' => ['type' => 'none'],
            'right' => ['type' => 'none'],
        ],
        'footer' => [
            'enabled' => true,
            'separator' => true,
            'separatorColor' => '#e2e8f0',
            'offset' => 5,
            'left' => ['type' => 'variable', 'variable' => 'title', 'style' => ['font' => 'Calibri', 'size' => 8, 'bold' => false, 'italic' => false, 'color' => '#64748b']],
            'center' => ['type' => 'none'],
            'right' => ['type' => 'pageNumber', 'style' => ['font' => 'Calibri', 'size' => 8, 'bold' => false, 'italic' => false, 'color' => '#64748b']],
        ],
        'headingNumbering' => true,
        'toc' => [
            'dotLeader' => true,
            'lineSpacing' => 8,
            'levels' => [
                ['level' => 1, 'font' => 'Calibri', 'size' => 12, 'bold' => true, 'italic' => false, 'color' => '#1e293b'],
                ['level' => 2, 'font' => 'Calibri', 'size' => 11, 'bold' => false, 'italic' => false, 'color' => '#1e293b'],
                ['level' => 3, 'font' => 'Calibri', 'size' => 10, 'bold' => false, 'italic' => false, 'color' => '#334155'],
                ['level' => 4, 'font' => 'Calibri', 'size' => 10, 'bold' => false, 'italic' => true, 'color' => '#334155'],
                ['level' => 5, 'font' => 'Calibri', 'size' => 9, 'bold' => false, 'italic' => true, 'color' => '#475569'],
                ['level' => 6, 'font' => 'Calibri', 'size' => 9, 'bold' => false, 'italic' => true, 'color' => '#475569'],
            ],
        ],
        'margins' => [
            'top' => 20,
            'bottom' => 20,
            'left' => 20,
            'right' => 20,
        ],
        'coverPage' => [
            'background' => '#ffffff',
            'elements' => [],
        ],
    ];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column]
    private bool $isDefault = false;

    #[ORM\Column(type: 'json')]
    private array $styles = [];

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'CASCADE')]
    private ?Context $context = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->styles = self::DEFAULT_STYLES;
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; return $this; }
    public function isDefault(): bool { return $this->isDefault; }
    public function setIsDefault(bool $v): static { $this->isDefault = $v; return $this; }
    public function getStyles(): array { return $this->styles; }
    public function setStyles(array $v): static { $this->styles = $v; return $this; }
    public function getContext(): ?Context { return $this->context; }
    public function setContext(?Context $v): static { $this->context = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
