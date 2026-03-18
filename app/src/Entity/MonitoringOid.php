<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
class MonitoringOid
{
    public const CATEGORY_CPU = 'cpu';
    public const CATEGORY_MEMORY = 'memory';
    public const CATEGORY_DISK = 'disk';
    public const CATEGORY_TEMPERATURE = 'temperature';
    public const CATEGORY_INTERFACE_IN = 'interface_in';
    public const CATEGORY_INTERFACE_OUT = 'interface_out';

    public const CATEGORIES = [
        self::CATEGORY_CPU,
        self::CATEGORY_MEMORY,
        self::CATEGORY_DISK,
        self::CATEGORY_TEMPERATURE,
        self::CATEGORY_INTERFACE_IN,
        self::CATEGORY_INTERFACE_OUT,
    ];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: DeviceModel::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?DeviceModel $deviceModel = null;

    #[ORM\Column(length: 50)]
    private ?string $category = null;

    #[ORM\Column(length: 255)]
    private ?string $oid = null;

    #[ORM\Column]
    private bool $enabled = true;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int
    {
        return $this->id;
    }

    public function getDeviceModel(): ?DeviceModel
    {
        return $this->deviceModel;
    }

    public function setDeviceModel(?DeviceModel $deviceModel): static
    {
        $this->deviceModel = $deviceModel;
        return $this;
    }

    public function getCategory(): ?string
    {
        return $this->category;
    }

    public function setCategory(string $category): static
    {
        $this->category = $category;
        return $this;
    }

    public function getOid(): ?string
    {
        return $this->oid;
    }

    public function setOid(string $oid): static
    {
        $this->oid = $oid;
        return $this;
    }

    public function isEnabled(): bool
    {
        return $this->enabled;
    }

    public function setEnabled(bool $enabled): static
    {
        $this->enabled = $enabled;
        return $this;
    }

    public function getCreatedAt(): \DateTimeImmutable
    {
        return $this->createdAt;
    }
}
