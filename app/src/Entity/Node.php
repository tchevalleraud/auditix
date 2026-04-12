<?php

namespace App\Entity;

use App\Repository\NodeRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: NodeRepository::class)]
class Node
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $name = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private ?Context $context = null;

    #[ORM\Column(length: 45)]
    private ?string $ipAddress = null;

    #[ORM\ManyToOne(targetEntity: Editor::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Editor $manufacturer = null;

    #[ORM\ManyToOne(targetEntity: DeviceModel::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?DeviceModel $model = null;

    #[ORM\ManyToOne(targetEntity: Profile::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?Profile $profile = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $hostname = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $discoveredModel = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $discoveredVersion = null;

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $productModel = null;

    #[ORM\Column(length: 1, nullable: true)]
    private ?string $score = null; // A, B, C, D, E, F (combined global grade)

    #[ORM\Column(length: 1, nullable: true)]
    private ?string $complianceScore = null; // A, B, C, D, E, F

    #[ORM\Column(length: 1, nullable: true)]
    private ?string $vulnerabilityScore = null; // A, B, C, D, E, F

    #[ORM\Column(length: 1, nullable: true)]
    private ?string $systemUpdateScore = null; // A, B, C, D, E, F

    #[ORM\Column(length: 10)]
    private string $policy = 'audit'; // audit, enforce

    #[ORM\Column(length: 10, nullable: true)]
    private ?string $complianceEvaluating = null; // null, "pending", "running"

    #[ORM\Column(nullable: true)]
    private ?bool $isReachable = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastPingAt = null;

    #[ORM\ManyToMany(targetEntity: NodeTag::class)]
    #[ORM\JoinTable(name: 'node_node_tag')]
    private Collection $tags;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    public function __construct()
    {
        $this->tags = new ArrayCollection();
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): ?string { return $this->name; }
    public function setName(?string $v): static { $this->name = $v; return $this; }
    public function getContext(): ?Context { return $this->context; }
    public function setContext(?Context $v): static { $this->context = $v; return $this; }
    public function getIpAddress(): ?string { return $this->ipAddress; }
    public function setIpAddress(string $v): static { $this->ipAddress = $v; return $this; }
    public function getManufacturer(): ?Editor { return $this->manufacturer; }
    public function setManufacturer(?Editor $v): static { $this->manufacturer = $v; return $this; }
    public function getModel(): ?DeviceModel { return $this->model; }
    public function setModel(?DeviceModel $v): static { $this->model = $v; return $this; }
    public function getProfile(): ?Profile { return $this->profile; }
    public function setProfile(?Profile $v): static { $this->profile = $v; return $this; }
    public function getHostname(): ?string { return $this->hostname; }
    public function setHostname(?string $v): static { $this->hostname = $v; return $this; }
    public function getDiscoveredModel(): ?string { return $this->discoveredModel; }
    public function setDiscoveredModel(?string $v): static { $this->discoveredModel = $v; return $this; }
    public function getDiscoveredVersion(): ?string { return $this->discoveredVersion; }
    public function setDiscoveredVersion(?string $v): static { $this->discoveredVersion = $v; return $this; }
    public function getProductModel(): ?string { return $this->productModel; }
    public function setProductModel(?string $v): static { $this->productModel = $v; return $this; }
    public function getScore(): ?string { return $this->score; }
    public function setScore(?string $v): static { $this->score = $v; return $this; }
    public function getComplianceScore(): ?string { return $this->complianceScore; }
    public function setComplianceScore(?string $v): static { $this->complianceScore = $v; return $this; }
    public function getVulnerabilityScore(): ?string { return $this->vulnerabilityScore; }
    public function setVulnerabilityScore(?string $v): static { $this->vulnerabilityScore = $v; return $this; }
    public function getSystemUpdateScore(): ?string { return $this->systemUpdateScore; }
    public function setSystemUpdateScore(?string $v): static { $this->systemUpdateScore = $v; return $this; }
    public function getPolicy(): string { return $this->policy; }
    public function setPolicy(string $v): static { $this->policy = $v; return $this; }
    public function getComplianceEvaluating(): ?string { return $this->complianceEvaluating; }
    public function setComplianceEvaluating(?string $v): static { $this->complianceEvaluating = $v; return $this; }
    public function getIsReachable(): ?bool { return $this->isReachable; }
    public function setIsReachable(?bool $v): static { $this->isReachable = $v; return $this; }
    public function getLastPingAt(): ?\DateTimeImmutable { return $this->lastPingAt; }
    public function setLastPingAt(?\DateTimeImmutable $v): static { $this->lastPingAt = $v; return $this; }
    /** @return Collection<int, NodeTag> */
    public function getTags(): Collection { return $this->tags; }
    public function addTag(NodeTag $tag): static { if (!$this->tags->contains($tag)) { $this->tags->add($tag); } return $this; }
    public function removeTag(NodeTag $tag): static { $this->tags->removeElement($tag); return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
}
