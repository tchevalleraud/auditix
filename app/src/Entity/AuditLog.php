<?php

namespace App\Entity;

use App\Repository\AuditLogRepository;
use Doctrine\DBAL\Types\Types;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: AuditLogRepository::class)]
#[ORM\Table(name: 'audit_log')]
#[ORM\Index(columns: ['logged_at'], name: 'idx_audit_log_logged_at')]
#[ORM\Index(columns: ['category'], name: 'idx_audit_log_category')]
#[ORM\Index(columns: ['level'], name: 'idx_audit_log_level')]
class AuditLog
{
    public const CATEGORY_AUTH = 'auth';
    public const CATEGORY_API = 'api';
    public const CATEGORY_WORKER = 'worker';
    public const CATEGORY_ERROR = 'error';
    public const CATEGORY_SYSTEM = 'system';

    public const CATEGORIES = [
        self::CATEGORY_AUTH,
        self::CATEGORY_API,
        self::CATEGORY_WORKER,
        self::CATEGORY_ERROR,
        self::CATEGORY_SYSTEM,
    ];

    public const LEVEL_DEBUG = 'debug';
    public const LEVEL_INFO = 'info';
    public const LEVEL_NOTICE = 'notice';
    public const LEVEL_WARNING = 'warning';
    public const LEVEL_ERROR = 'error';
    public const LEVEL_CRITICAL = 'critical';

    public const LEVELS = [
        self::LEVEL_DEBUG,
        self::LEVEL_INFO,
        self::LEVEL_NOTICE,
        self::LEVEL_WARNING,
        self::LEVEL_ERROR,
        self::LEVEL_CRITICAL,
    ];

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column(type: Types::BIGINT)]
    private ?string $id = null;

    #[ORM\Column]
    private \DateTimeImmutable $loggedAt;

    #[ORM\Column(length: 16)]
    private string $level = self::LEVEL_INFO;

    #[ORM\Column(length: 16)]
    private string $category = self::CATEGORY_SYSTEM;

    #[ORM\Column(length: 100)]
    private string $action = '';

    #[ORM\Column(length: 255, nullable: true)]
    private ?string $actor = null;

    #[ORM\Column(length: 64, nullable: true)]
    private ?string $sourceIp = null;

    #[ORM\Column(type: Types::TEXT)]
    private string $message = '';

    #[ORM\Column(type: Types::JSON, nullable: true)]
    private ?array $context = null;

    public function __construct()
    {
        $this->loggedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id === null ? null : (int) $this->id; }

    public function getLoggedAt(): \DateTimeImmutable { return $this->loggedAt; }
    public function setLoggedAt(\DateTimeImmutable $v): static { $this->loggedAt = $v; return $this; }

    public function getLevel(): string { return $this->level; }
    public function setLevel(string $v): static
    {
        $this->level = in_array($v, self::LEVELS, true) ? $v : self::LEVEL_INFO;
        return $this;
    }

    public function getCategory(): string { return $this->category; }
    public function setCategory(string $v): static
    {
        $this->category = in_array($v, self::CATEGORIES, true) ? $v : self::CATEGORY_SYSTEM;
        return $this;
    }

    public function getAction(): string { return $this->action; }
    public function setAction(string $v): static { $this->action = $v; return $this; }

    public function getActor(): ?string { return $this->actor; }
    public function setActor(?string $v): static { $this->actor = $v; return $this; }

    public function getSourceIp(): ?string { return $this->sourceIp; }
    public function setSourceIp(?string $v): static { $this->sourceIp = $v; return $this; }

    public function getMessage(): string { return $this->message; }
    public function setMessage(string $v): static { $this->message = $v; return $this; }

    public function getContext(): ?array { return $this->context; }
    public function setContext(?array $v): static { $this->context = $v; return $this; }
}
