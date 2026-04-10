<?php

namespace App\Entity;

use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity]
#[ORM\Table(name: 'topology_map')]
#[ORM\Index(columns: ['context_id'], name: 'idx_topology_map_context')]
class TopologyMap
{
    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Context $context;

    /**
     * Default protocol filter when opening the map (lldp, stp, ospf, bgp, isis, or null = all)
     */
    #[ORM\Column(length: 20, nullable: true)]
    private ?string $defaultProtocol = null;

    /**
     * Persisted node positions, format: { "<deviceId>": {"x": 123, "y": 456}, ... }
     */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $layout = null;

    /**
     * Visual design configuration for cytoscape rendering.
     */
    #[ORM\Column(type: 'json')]
    private array $designConfig = [];

    /**
     * Rules for generating links from inventory data.
     * Array of: { protocol, inventoryCategoryId, remoteNameColumn, remotePortColumn?, chassisIdColumn?, mgmtAddressColumn?, weightColumn? }
     */
    #[ORM\Column(type: 'json')]
    private array $linkRules = [];

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastRefreshedAt = null;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; return $this; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    public function getDefaultProtocol(): ?string { return $this->defaultProtocol; }
    public function setDefaultProtocol(?string $v): static { $this->defaultProtocol = $v; return $this; }
    public function getLayout(): ?array { return $this->layout; }
    public function setLayout(?array $v): static { $this->layout = $v; return $this; }
    public function getDesignConfig(): array { return $this->designConfig; }
    public function setDesignConfig(array $v): static { $this->designConfig = $v; return $this; }
    public function getLinkRules(): array { return $this->linkRules; }
    public function setLinkRules(array $v): static { $this->linkRules = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getLastRefreshedAt(): ?\DateTimeImmutable { return $this->lastRefreshedAt; }
    public function setLastRefreshedAt(?\DateTimeImmutable $v): static { $this->lastRefreshedAt = $v; return $this; }
}
