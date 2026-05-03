<?php

namespace App\Service;

use App\Entity\SyslogServer;
use App\Repository\SyslogServerRepository;
use Psr\Log\LoggerInterface;

class SyslogForwarder
{
    private const SEVERITIES = [
        SyslogServer::LEVEL_EMERGENCY => 0,
        SyslogServer::LEVEL_ALERT => 1,
        SyslogServer::LEVEL_CRITICAL => 2,
        SyslogServer::LEVEL_ERROR => 3,
        SyslogServer::LEVEL_WARNING => 4,
        SyslogServer::LEVEL_NOTICE => 5,
        SyslogServer::LEVEL_INFO => 6,
        SyslogServer::LEVEL_DEBUG => 7,
    ];

    /** @var array<int,SyslogServer>|null */
    private ?array $serversCache = null;

    public function __construct(
        private readonly SyslogServerRepository $repository,
        private readonly LoggerInterface $logger,
    ) {}

    /**
     * @param array<string,mixed> $context
     */
    public function broadcast(
        string $level,
        string $category,
        string $action,
        string $message,
        array $context = [],
    ): void {
        $servers = $this->getEnabledServers();
        if ($servers === []) {
            return;
        }

        $hostname = gethostname() ?: 'auditix';
        $procId = (string) getmypid();
        $structured = $this->formatStructuredData($category, $action, $context);

        foreach ($servers as $server) {
            if (!$this->shouldForward($level, $server->getMinLevel())) {
                continue;
            }
            try {
                $this->sendTo($server, $level, $hostname, $procId, $structured, $message);
            } catch (\Throwable $e) {
                $this->logger->warning('Failed to forward log to syslog server "{name}": {error}', [
                    'name' => $server->getName(),
                    'error' => $e->getMessage(),
                ]);
            }
        }
    }

    public function testServer(SyslogServer $server, string $message = 'Auditix syslog test'): void
    {
        $hostname = gethostname() ?: 'auditix';
        $procId = (string) getmypid();
        $this->sendTo($server, SyslogServer::LEVEL_INFO, $hostname, $procId, '-', $message);
    }

    public function clearCache(): void
    {
        $this->serversCache = null;
    }

    /** @return list<SyslogServer> */
    private function getEnabledServers(): array
    {
        if ($this->serversCache === null) {
            $this->serversCache = $this->repository->findEnabled();
        }
        return $this->serversCache;
    }

    private function shouldForward(string $eventLevel, string $minLevel): bool
    {
        $eventSev = self::SEVERITIES[$eventLevel] ?? 6;
        $minSev = self::SEVERITIES[$minLevel] ?? 6;
        return $eventSev <= $minSev;
    }

    /**
     * @param array<string,mixed> $context
     */
    private function formatStructuredData(string $category, string $action, array $context): string
    {
        $sd = sprintf('category="%s" action="%s"', $this->escapeSdValue($category), $this->escapeSdValue($action));
        foreach ($context as $key => $value) {
            if (is_scalar($value) || $value === null) {
                $sd .= sprintf(' %s="%s"', $this->sanitizeSdName((string) $key), $this->escapeSdValue((string) ($value ?? '')));
            }
        }
        return '[auditix@53595 ' . $sd . ']';
    }

    private function sanitizeSdName(string $name): string
    {
        $clean = preg_replace('/[^A-Za-z0-9_-]/', '_', $name) ?? 'k';
        return $clean === '' ? 'k' : substr($clean, 0, 32);
    }

    private function escapeSdValue(string $value): string
    {
        return str_replace(['\\', '"', ']'], ['\\\\', '\\"', '\\]'], $value);
    }

    private function sendTo(
        SyslogServer $server,
        string $level,
        string $hostname,
        string $procId,
        string $structured,
        string $message,
    ): void {
        $severity = self::SEVERITIES[$level] ?? 6;
        $priority = $server->getFacility() * 8 + $severity;
        $timestamp = (new \DateTimeImmutable())->format('Y-m-d\TH:i:s.uP');
        $appName = $this->sanitizePrintAscii($server->getAppName(), 48);
        $cleanHost = $this->sanitizePrintAscii($hostname, 255);
        $cleanProc = $this->sanitizePrintAscii($procId, 128);
        $payload = sprintf(
            '<%d>1 %s %s %s %s - %s %s',
            $priority,
            $timestamp,
            $cleanHost,
            $appName,
            $cleanProc,
            $structured,
            $this->sanitizeMessage($message),
        );

        $proto = $server->getProtocol() === SyslogServer::PROTOCOL_TCP ? 'tcp' : 'udp';
        $address = sprintf('%s://%s:%d', $proto, $server->getHost(), $server->getPort());
        $errno = 0;
        $errstr = '';
        $socket = @stream_socket_client($address, $errno, $errstr, 3);
        if ($socket === false) {
            throw new \RuntimeException(sprintf('Cannot connect to %s: %s', $address, $errstr ?: 'unknown error'));
        }
        try {
            stream_set_timeout($socket, 3);
            $framed = $proto === 'tcp' ? $payload . "\n" : $payload;
            $written = @fwrite($socket, $framed);
            if ($written === false) {
                throw new \RuntimeException('Failed to write payload to ' . $address);
            }
        } finally {
            @fclose($socket);
        }
    }

    private function sanitizePrintAscii(string $v, int $maxLen): string
    {
        $clean = preg_replace('/[^\x21-\x7E]/', '_', $v) ?? '-';
        if ($clean === '') {
            return '-';
        }
        return substr($clean, 0, $maxLen);
    }

    private function sanitizeMessage(string $msg): string
    {
        $msg = str_replace(["\r", "\n", "\0"], [' ', ' ', ''], $msg);
        if (strlen($msg) > 4096) {
            $msg = substr($msg, 0, 4093) . '...';
        }
        return $msg;
    }
}
