<?php

namespace App\Entity;

use App\Repository\SyslogServerRepository;
use Doctrine\ORM\Mapping as ORM;

#[ORM\Entity(repositoryClass: SyslogServerRepository::class)]
#[ORM\Table(name: 'syslog_server')]
class SyslogServer
{
    public const PROTOCOL_UDP = 'udp';
    public const PROTOCOL_TCP = 'tcp';

    public const LEVEL_DEBUG = 'debug';
    public const LEVEL_INFO = 'info';
    public const LEVEL_NOTICE = 'notice';
    public const LEVEL_WARNING = 'warning';
    public const LEVEL_ERROR = 'error';
    public const LEVEL_CRITICAL = 'critical';
    public const LEVEL_ALERT = 'alert';
    public const LEVEL_EMERGENCY = 'emergency';

    public const LEVELS = [
        self::LEVEL_DEBUG,
        self::LEVEL_INFO,
        self::LEVEL_NOTICE,
        self::LEVEL_WARNING,
        self::LEVEL_ERROR,
        self::LEVEL_CRITICAL,
        self::LEVEL_ALERT,
        self::LEVEL_EMERGENCY,
    ];

    public const FACILITY_USER = 1;
    public const FACILITY_LOCAL0 = 16;
    public const FACILITY_LOCAL1 = 17;
    public const FACILITY_LOCAL2 = 18;
    public const FACILITY_LOCAL3 = 19;
    public const FACILITY_LOCAL4 = 20;
    public const FACILITY_LOCAL5 = 21;
    public const FACILITY_LOCAL6 = 22;
    public const FACILITY_LOCAL7 = 23;

    #[ORM\Id]
    #[ORM\GeneratedValue]
    #[ORM\Column]
    private ?int $id = null;

    #[ORM\Column(length: 100)]
    private ?string $name = null;

    #[ORM\Column(length: 255)]
    private ?string $host = null;

    #[ORM\Column]
    private int $port = 514;

    #[ORM\Column(length: 8, options: ['default' => 'udp'])]
    private string $protocol = self::PROTOCOL_UDP;

    #[ORM\Column(length: 16, options: ['default' => 'info'])]
    private string $minLevel = self::LEVEL_INFO;

    #[ORM\Column(options: ['default' => 16])]
    private int $facility = self::FACILITY_LOCAL0;

    #[ORM\Column(length: 100, options: ['default' => 'auditix'])]
    private string $appName = 'auditix';

    #[ORM\Column(options: ['default' => true])]
    private bool $enabled = true;

    #[ORM\Column(options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $createdAt;

    #[ORM\Column(options: ['default' => 'CURRENT_TIMESTAMP'])]
    private \DateTimeImmutable $updatedAt;

    public function __construct()
    {
        $this->createdAt = new \DateTimeImmutable();
        $this->updatedAt = new \DateTimeImmutable();
    }

    public function getId(): ?int { return $this->id; }

    public function getName(): ?string { return $this->name; }
    public function setName(string $v): static { $this->name = $v; return $this; }

    public function getHost(): ?string { return $this->host; }
    public function setHost(string $v): static { $this->host = $v; return $this; }

    public function getPort(): int { return $this->port; }
    public function setPort(int $v): static { $this->port = $v; return $this; }

    public function getProtocol(): string { return $this->protocol; }
    public function setProtocol(string $v): static
    {
        $this->protocol = in_array($v, [self::PROTOCOL_UDP, self::PROTOCOL_TCP], true)
            ? $v
            : self::PROTOCOL_UDP;
        return $this;
    }

    public function getMinLevel(): string { return $this->minLevel; }
    public function setMinLevel(string $v): static
    {
        $this->minLevel = in_array($v, self::LEVELS, true) ? $v : self::LEVEL_INFO;
        return $this;
    }

    public function getFacility(): int { return $this->facility; }
    public function setFacility(int $v): static
    {
        $this->facility = ($v >= 0 && $v <= 23) ? $v : self::FACILITY_LOCAL0;
        return $this;
    }

    public function getAppName(): string { return $this->appName; }
    public function setAppName(string $v): static
    {
        $v = trim($v);
        $this->appName = $v === '' ? 'auditix' : $v;
        return $this;
    }

    public function isEnabled(): bool { return $this->enabled; }
    public function setEnabled(bool $v): static { $this->enabled = $v; return $this; }

    public function getCreatedAt(): \DateTimeImmutable { return $this->createdAt; }
    public function getUpdatedAt(): \DateTimeImmutable { return $this->updatedAt; }
    public function touch(): void { $this->updatedAt = new \DateTimeImmutable(); }
}
