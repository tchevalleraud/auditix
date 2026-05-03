<?php

namespace App\EventSubscriber;

use App\Entity\AuditLog;
use App\Entity\User;
use App\Service\AuditLogger;
use Symfony\Component\EventDispatcher\EventSubscriberInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Http\Event\LoginFailureEvent;
use Symfony\Component\Security\Http\Event\LoginSuccessEvent;
use Symfony\Component\Security\Http\Event\LogoutEvent;

class AuthAuditSubscriber implements EventSubscriberInterface
{
    public function __construct(
        private readonly AuditLogger $audit,
    ) {}

    public static function getSubscribedEvents(): array
    {
        return [
            LoginSuccessEvent::class => 'onLoginSuccess',
            LoginFailureEvent::class => 'onLoginFailure',
            LogoutEvent::class => 'onLogout',
        ];
    }

    public function onLoginSuccess(LoginSuccessEvent $event): void
    {
        $user = $event->getUser();
        $request = $event->getRequest();
        $path = $request->getPathInfo();

        // The first /api/login step may not be a real success (TOTP pending).
        if ($path === '/api/login' && $user instanceof User && $user->isTotpEnabled() && $user->getTotpSecret() !== null) {
            $this->audit->log(
                AuditLog::LEVEL_INFO,
                AuditLog::CATEGORY_AUTH,
                'login.totp_required',
                sprintf('Password accepted for "%s", TOTP step required', $user->getUserIdentifier()),
                $user->getUserIdentifier(),
                ['firewall' => $event->getFirewallName()],
            );
            return;
        }

        $username = $user instanceof User ? $user->getUserIdentifier() : (string) $event->getAuthenticatedToken()->getUserIdentifier();
        $action = $path === '/api/login/totp' ? 'login.totp_success' : 'login.success';
        $this->audit->log(
            AuditLog::LEVEL_INFO,
            AuditLog::CATEGORY_AUTH,
            $action,
            sprintf('User "%s" signed in', $username),
            $username,
            [
                'firewall' => $event->getFirewallName(),
                'authenticator' => $event->getAuthenticator()::class,
            ],
        );
    }

    public function onLoginFailure(LoginFailureEvent $event): void
    {
        $request = $event->getRequest();
        $username = $this->extractUsername($request->getContent());
        $exception = $event->getException();
        $reason = $exception instanceof AuthenticationException
            ? $exception->getMessageKey()
            : $exception->getMessage();

        $this->audit->log(
            AuditLog::LEVEL_WARNING,
            AuditLog::CATEGORY_AUTH,
            'login.failure',
            $username !== null
                ? sprintf('Failed login for "%s": %s', $username, $reason)
                : sprintf('Failed login attempt: %s', $reason),
            $username,
            [
                'firewall' => $event->getFirewallName(),
                'reason' => $reason,
                'path' => $request->getPathInfo(),
            ],
        );
    }

    public function onLogout(LogoutEvent $event): void
    {
        $token = $event->getToken();
        $user = $token?->getUser();
        $username = $user instanceof User
            ? $user->getUserIdentifier()
            : ($token?->getUserIdentifier());

        if ($username === null) {
            return;
        }

        $this->audit->log(
            AuditLog::LEVEL_INFO,
            AuditLog::CATEGORY_AUTH,
            'logout',
            sprintf('User "%s" signed out', $username),
            $username,
        );
    }

    private function extractUsername(string $body): ?string
    {
        if ($body === '') {
            return null;
        }
        $decoded = json_decode($body, true);
        if (!is_array($decoded)) {
            return null;
        }
        $username = $decoded['username'] ?? null;
        if (is_string($username) && $username !== '') {
            return trim($username);
        }
        return null;
    }
}
