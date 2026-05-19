<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'topology_annotation')]
#[ORM\Index(columns: ['topology_id'], name: 'idx_topology_annotation_topology')]
class TopologyAnnotation
{
    public const TYPE_TEXT = 'text';
    public const TYPE_IMAGE = 'image';
    public const TYPE_SHAPE = 'shape';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Topology::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Topology $topology;

    #[ORM\Column(length: 16)]
    private string $type = self::TYPE_TEXT;

    #[ORM\Column(type: 'float')]
    private float $x = 0.0;

    #[ORM\Column(type: 'float')]
    private float $y = 0.0;

    #[ORM\Column(type: 'float')]
    private float $width = 120.0;

    #[ORM\Column(type: 'float')]
    private float $height = 40.0;

    #[ORM\Column(type: 'float')]
    private float $rotation = 0.0;

    #[ORM\Column(name: 'z_index', type: 'integer')]
    private int $zIndex = 0;

    /**
     * Type-specific payload:
     * - text: { text, fontSize, color, fontFamily, fontWeight, textAlign, bgColor, padding }
     * - image: { url, opacity }
     * - shape: { kind: rectangle|ellipse, fill, stroke, strokeWidth, dash, opacity, fillOpacity, borderRadius }
     */
    #[ORM\Column(type: 'json')]
    private array $data = [];

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getTopology(): Topology { return $this->topology; }
    public function setTopology(Topology $v): static { $this->topology = $v; return $this; }
    public function getType(): string { return $this->type; }
    public function setType(string $v): static { $this->type = $v; return $this; }
    public function getX(): float { return $this->x; }
    public function setX(float $v): static { $this->x = $v; return $this; }
    public function getY(): float { return $this->y; }
    public function setY(float $v): static { $this->y = $v; return $this; }
    public function getWidth(): float { return $this->width; }
    public function setWidth(float $v): static { $this->width = $v; return $this; }
    public function getHeight(): float { return $this->height; }
    public function setHeight(float $v): static { $this->height = $v; return $this; }
    public function getRotation(): float { return $this->rotation; }
    public function setRotation(float $v): static { $this->rotation = $v; return $this; }
    public function getZIndex(): int { return $this->zIndex; }
    public function setZIndex(int $v): static { $this->zIndex = $v; return $this; }
    public function getData(): array { return $this->data; }
    public function setData(array $v): static { $this->data = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }

    public static function defaultDataFor(string $type): array
    {
        return match ($type) {
            self::TYPE_TEXT => [
                'text' => 'Texte',
                'fontSize' => 14,
                'color' => '#1e293b',
                'fontFamily' => 'sans-serif',
                'fontWeight' => 400,
                'textAlign' => 'center',
                'bgColor' => null,
                'padding' => 4,
            ],
            self::TYPE_IMAGE => [
                'url' => '',
                'opacity' => 1.0,
            ],
            self::TYPE_SHAPE => [
                'kind' => 'rectangle',
                'fill' => '#3b82f6',
                'stroke' => '#1e40af',
                'strokeWidth' => 1,
                'dash' => 'solid',
                'opacity' => 1.0,
                'fillOpacity' => 0.2,
                'borderRadius' => 4,
            ],
            default => [],
        };
    }
}
