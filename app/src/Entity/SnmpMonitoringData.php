<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Index(name: 'idx_snmp_data_node_cat_time', columns: ['node_id', 'category', 'recorded_at'])]
class SnmpMonitoringData
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: 'bigint')]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Node::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Node $node = null;

    #[ORM\Column(length: 50)]
    private ?string $category = null;

    #[ORM\Column(length: 255)]
    private ?string $oid = null;

    #[ORM\Column(type: 'text')]
    private ?string $rawValue = null;

    #[ORM\Column(type: 'float', nullable: true)]
    private ?float $numericValue = null;

    #[ORM\Column(type: 'datetimetz_immutable')]
    private ?\DateTimeImmutable $recordedAt = null;

    public function __construct()
    {
        $this->recordedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getNode(): ?Node { return $this->node; }
    public function setNode(?Node $v): static { $this->node = $v; return $this; }

    public function getCategory(): ?string { return $this->category; }
    public function setCategory(string $v): static { $this->category = $v; return $this; }

    public function getOid(): ?string { return $this->oid; }
    public function setOid(string $v): static { $this->oid = $v; return $this; }

    public function getRawValue(): ?string { return $this->rawValue; }
    public function setRawValue(string $v): static { $this->rawValue = $v; return $this; }

    public function getNumericValue(): ?float { return $this->numericValue; }
    public function setNumericValue(?float $v): static { $this->numericValue = $v; return $this; }

    public function getRecordedAt(): ?\DateTimeImmutable { return $this->recordedAt; }
    public function setRecordedAt(\DateTimeImmutable $v): static { $this->recordedAt = $v; return $this; }
}
