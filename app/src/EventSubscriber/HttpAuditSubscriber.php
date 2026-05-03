<?php

namespace App\EventSubscriber;

use App\Entity\AuditLog;
use App\Entity\User;
use App\Service\AuditLogger;
use Symfony\Bundle\SecurityBundle\Security;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\HttpKernel\Event\RequestEvent;
use Symfony\Component\HttpKernel\Event\TerminateEvent;
use Symfony\Component\HttpKernel\KernelEvents;

class HttpAuditSubscriber implements EventSubscriberInterface
{
    private const START_KEY = '_audit_started_at';

    private const SKIP_PATH_PREFIXES = [
        '/api/avatars/',
        '/api/logos/',
        '/api/block-images/',
    ];

    private const SKIP_GET_PATHS = [
        '/api/me',
        '/api/version-check',
        '/api/public/readyz',
        '/api/public/livez',
        '/api/public/healthz',
    ];

    public function __construct(
        private readonly AuditLogger $audit,
        private readonly Security $security,
    ) {}

    public static function getSubscribedEvents(): array
    {
        return [
            KernelEvents::REQUEST => ['onRequest', 4096],
            KernelEvents::TERMINATE => ['onTerminate', 0],
        ];
    }

    public function onRequest(RequestEvent $event): void
    {
        if (!$event->isMainRequest()) {
            return;
        }
        $request = $event->getRequest();
        if (!$this->isApiPath($request->getPathInfo())) {
            return;
        }
        $request->attributes->set(self::START_KEY, microtime(true));
    }

    public function onTerminate(TerminateEvent $event): void
    {
        $request = $event->getRequest();
        $path = $request->getPathInfo();
        if (!$this->isApiPath($path)) {
            return;
        }

        $method = strtoupper($request->getMethod());
        $status = $event->getResponse()->getStatusCode();

        if ($this->shouldSkip($method, $path, $status)) {
            return;
        }

        $start = $request->attributes->get(self::START_KEY);
        $duration = is_float($start) ? (microtime(true) - $start) * 1000 : null;

        $level = match (true) {
            $status >= 500 => AuditLog::LEVEL_ERROR,
            $status >= 400 => AuditLog::LEVEL_WARNING,
            default => AuditLog::LEVEL_INFO,
        };
        $category = $status >= 500 ? AuditLog::CATEGORY_ERROR : AuditLog::CATEGORY_API;

        $username = $this->resolveUsername();
        $clientIp = $request->getClientIp();
        $base = $duration !== null
            ? sprintf('%s %s -> %d (%.0fms)', $method, $path, $status, $duration)
            : sprintf('%s %s -> %d', $method, $path, $status);
        $by = match (true) {
            $username !== null && $clientIp !== null => sprintf(' [%s @ %s]', $username, $clientIp),
            $username !== null => sprintf(' [%s]', $username),
            $clientIp !== null => sprintf(' [anonymous @ %s]', $clientIp),
            default => '',
        };
        $message = $base . $by;

        $this->audit->log(
            $level,
            $category,
            'http.' . strtolower($method),
            $message,
            $username,
            [
                'method' => $method,
                'path' => $path,
                'status' => $status,
                'duration_ms' => $duration !== null ? round($duration, 1) : null,
                'query' => $request->getQueryString() ?: null,
            ],
            $clientIp,
        );
    }

    private function isApiPath(string $path): bool
    {
        return str_starts_with($path, '/api/');
    }

    private function shouldSkip(string $method, string $path, int $status): bool
    {
        // Auth events are already covered by AuthAuditSubscriber.
        if (in_array($path, ['/api/login', '/api/login/totp', '/api/logout'], true)) {
            return true;
        }
        foreach (self::SKIP_PATH_PREFIXES as $prefix) {
            if (str_starts_with($path, $prefix)) {
                return true;
            }
        }
        if ($method === 'GET' && in_array($path, self::SKIP_GET_PATHS, true) && $status < 400) {
            return true;
        }
        return false;
    }

    private function resolveUsername(): ?string
    {
        $user = $this->security->getUser();
        if ($user instanceof User) {
            return $user->getUserIdentifier();
        }
        if ($user !== null) {
            return $user->getUserIdentifier();
        }
        return null;
    }
}
