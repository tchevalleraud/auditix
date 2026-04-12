<?php

namespace App\Entity;

use App\Repository\CveDeviceModelRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: CveDeviceModelRepository::class)]
#[ORM\UniqueConstraint(name: 'uniq_cve_device_model', columns: ['cve_id', 'device_model_id'])]
class CveDeviceModel
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\ManyToOne(targetEntity: Cve::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Cve $cve = null;

    #[ORM\ManyToOne(targetEntity: DeviceModel::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?DeviceModel $deviceModel = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getCve(): ?Cve { return $this->cve; }
    public function setCve(?Cve $v): static { $this->cve = $v; return $this; }
    public function getDeviceModel(): ?DeviceModel { return $this->deviceModel; }
    public function setDeviceModel(?DeviceModel $v): static { $this->deviceModel = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
