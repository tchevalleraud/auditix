<?php

namespace App\Entity;

use App\Repository\MailReportRepository;
use Doctrine\Common\Collections\ArrayCollection;
use Doctrine\Common\Collections\Collection;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: MailReportRepository::class)]
#[ORM\Table(name: 'mail_report')]
class MailReport
{
    public const TYPE_GENERAL = 'general';
    public const TYPE_NODE = 'node';

    public const STATUS_IDLE = null;
    public const STATUS_PENDING = 'pending';
    public const STATUS_SENDING = 'sending';
    public const STATUS_SENT = 'sent';
    public const STATUS_FAILED = 'failed';

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 255)]
    private string $name;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $description = null;

    #[ORM\Column(length: 10)]
    private string $locale = 'fr';

    #[ORM\Column(length: 255)]
    private string $subject = '';

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $preheader = null;

    #[ORM\Column(length: 10)]
    private string $type = self::TYPE_GENERAL;

    #[ORM\Column(type: 'json')]
    private array $blocks = [];

    /** @var array<int, int>|null  context user IDs */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $recipientUserIds = null;

    /** @var array<int, string>|null external email addresses */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $recipientExternalEmails = null;

    #[ORM\ManyToOne(targetEntity: Context::class)]
    #[ORM\JoinColumn(nullable: false, onDelete: 'CASCADE')]
    private Context $context;

    #[ORM\ManyToOne(targetEntity: ReportTheme::class)]
    #[ORM\JoinColumn(nullable: false)]
    private ReportTheme $theme;

    #[ORM\ManyToOne(targetEntity: MailServer::class)]
    #[ORM\JoinColumn(nullable: true, onDelete: 'SET NULL')]
    private ?MailServer $mailServer = null;

    #[ORM\ManyToMany(targetEntity: Node::class)]
    #[ORM\JoinTable(name: 'mail_report_node')]
    private Collection $nodes;

    #[ORM\Column(length: 20, nullable: true)]
    private ?string $sendingStatus = null;

    #[ORM\Column(type: 'text', nullable: true)]
    private ?string $lastError = null;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $lastSentAt = null;

    /** @var array<int, array<string, mixed>>|null  history of sends */
    #[ORM\Column(type: 'json', nullable: true)]
    private ?array $sendHistory = null;

    #[ORM\Column(length: 128, nullable: true)]
    private ?string $managedByPlugin = null;

    #[ORM\Column]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(nullable: true)]
    private ?\DateTimeImmutable $updatedAt = null;

    public function __construct()
    {
        $this->nodes = new ArrayCollection();
        $this->createdAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }
    public function getName(): string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }
    public function getDescription(): ?string { return $this->description; }
    public function setDescription(?string $v): static { $this->description = $v; return $this; }
    public function getLocale(): string { return $this->locale; }
    public function setLocale(string $v): static { $this->locale = $v; return $this; }
    public function getSubject(): string { return $this->subject; }
    public function setSubject(string $v): static { $this->subject = $v; return $this; }
    public function getPreheader(): ?string { return $this->preheader; }
    public function setPreheader(?string $v): static { $this->preheader = $v; return $this; }
    public function getType(): string { return $this->type; }
    public function setType(string $v): static { $this->type = $v; return $this; }
    public function getBlocks(): array { return $this->blocks; }
    public function setBlocks(array $v): static { $this->blocks = $v; return $this; }
    public function getRecipientUserIds(): ?array { return $this->recipientUserIds; }
    public function setRecipientUserIds(?array $v): static { $this->recipientUserIds = $v; return $this; }
    public function getRecipientExternalEmails(): ?array { return $this->recipientExternalEmails; }
    public function setRecipientExternalEmails(?array $v): static { $this->recipientExternalEmails = $v; return $this; }
    public function getContext(): Context { return $this->context; }
    public function setContext(Context $v): static { $this->context = $v; return $this; }
    public function getTheme(): ReportTheme { return $this->theme; }
    public function setTheme(ReportTheme $v): static { $this->theme = $v; return $this; }
    public function getMailServer(): ?MailServer { return $this->mailServer; }
    public function setMailServer(?MailServer $v): static { $this->mailServer = $v; return $this; }
    /** @return Collection<int, Node> */
    public function getNodes(): Collection { return $this->nodes; }
    public function addNode(Node $node): static { if (!$this->nodes->contains($node)) { $this->nodes->add($node); } return $this; }
    public function removeNode(Node $node): static { $this->nodes->removeElement($node); return $this; }
    public function getSendingStatus(): ?string { return $this->sendingStatus; }
    public function setSendingStatus(?string $v): static { $this->sendingStatus = $v; return $this; }
    public function getLastError(): ?string { return $this->lastError; }
    public function setLastError(?string $v): static { $this->lastError = $v; return $this; }
    public function getLastSentAt(): ?\DateTimeImmutable { return $this->lastSentAt; }
    public function setLastSentAt(?\DateTimeImmutable $v): static { $this->lastSentAt = $v; return $this; }
    public function getSendHistory(): ?array { return $this->sendHistory; }
    public function setSendHistory(?array $v): static { $this->sendHistory = $v; return $this; }
    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getManagedByPlugin(): ?string { return $this->managedByPlugin; }
    public function setManagedByPlugin(?string $v): static { $this->managedByPlugin = $v; return $this; }
    public function isManagedByPlugin(): bool { return $this->managedByPlugin !== null; }
    public function getUpdatedAt(): ?\DateTimeImmutable { return $this->updatedAt; }
    public function setUpdatedAt(?\DateTimeImmutable $v): static { $this->updatedAt = $v; return $this; }
}
