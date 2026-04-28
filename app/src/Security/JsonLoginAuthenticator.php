<?php

namespace App\Security;

use App\Entity\User;
use App\Repository\UserRepository;
use App\Service\TotpService;
use Doctrine\ORM\EntityManagerInterface;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Authentication\Token\Storage\TokenStorageInterface;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Core\Exception\CustomUserMessageAuthenticationException;
use Symfony\Component\Security\Http\Authenticator\AbstractAuthenticator;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\Credentials\PasswordCredentials;
use Symfony\Component\Security\Http\Authenticator\Passport\Passport;
use Symfony\Component\Security\Http\Authenticator\Passport\SelfValidatingPassport;

class JsonLoginAuthenticator extends AbstractAuthenticator
{
    public function __construct(
        private readonly UserRepository $users,
        private readonly TotpService $totp,
        private readonly EntityManagerInterface $em,
        private readonly TokenStorageInterface $tokenStorage,
    ) {}

    public function supports(Request $request): ?bool
    {
        if ($request->getMethod() !== 'POST') {
            return false;
        }
        $path = $request->getPathInfo();
        return $path === '/api/login' || $path === '/api/login/totp';
    }

    public function authenticate(Request $request): Passport
    {
        $data = $this->decodeJson($request);
        $path = $request->getPathInfo();

        if ($path === '/api/login/totp') {
            return $this->authenticateTotpStep($data);
        }

        return $this->authenticatePasswordStep($data);
    }

    /**
     * @param array<string, mixed> $data
     */
    private function authenticatePasswordStep(array $data): Passport
    {
        $username = isset($data['username']) ? trim((string) $data['username']) : '';
        $password = isset($data['password']) ? (string) $data['password'] : '';

        if ($username === '' || $password === '') {
            throw new CustomUserMessageAuthenticationException('Invalid credentials.');
        }

        return new Passport(
            new UserBadge($username, function (string $identifier): User {
                $user = $this->users->findOneBy(['username' => $identifier]);
                if (!$user) {
                    throw new CustomUserMessageAuthenticationException('Invalid credentials.');
                }
                return $user;
            }),
            new PasswordCredentials($password),
        );
    }

    /**
     * @param array<string, mixed> $data
     */
    private function authenticateTotpStep(array $data): Passport
    {
        $challenge = isset($data['challenge']) ? (string) $data['challenge'] : '';
        $code = isset($data['code']) ? (string) $data['code'] : '';

        if ($challenge === '' || $code === '') {
            throw new CustomUserMessageAuthenticationException('Missing TOTP credentials.');
        }

        $payload = $this->totp->verifyChallenge($challenge);
        if ($payload === null) {
            throw new CustomUserMessageAuthenticationException('Invalid or expired challenge.');
        }

        $user = $this->users->find($payload['uid']);
        if (!$user || !$user->isTotpEnabled() || $user->getTotpSecret() === null) {
            throw new CustomUserMessageAuthenticationException('Invalid credentials.');
        }

        $accepted = $this->totp->verifyCode($user->getTotpSecret(), $code);
        if (!$accepted) {
            $codes = $user->getTotpBackupCodes() ?? [];
            $remaining = $this->totp->consumeBackupCode($codes, $code);
            if ($remaining === null) {
                throw new CustomUserMessageAuthenticationException('Invalid TOTP code.');
            }
            $user->setTotpBackupCodes($remaining);
            $this->em->flush();
        }

        return new SelfValidatingPassport(
            new UserBadge($user->getUserIdentifier(), fn () => $user),
        );
    }

    /**
     * @return array<string, mixed>
     */
    private function decodeJson(Request $request): array
    {
        $content = $request->getContent();
        if ($content === '') {
            return [];
        }
        $decoded = json_decode($content, true);
        return is_array($decoded) ? $decoded : [];
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token, string $firewallName): ?Response
    {
        $user = $token->getUser();
        if ($user instanceof User
            && $request->getPathInfo() === '/api/login'
            && $user->isTotpEnabled()
            && $user->getTotpSecret() !== null
        ) {
            // Block the session: TOTP step is required before issuing a session.
            $this->tokenStorage->setToken(null);
            if ($request->hasSession()) {
                $request->getSession()->invalidate();
            }
            return new JsonResponse(
                [
                    'totp_required' => true,
                    'challenge' => $this->totp->issueChallenge($user),
                ],
                Response::HTTP_CONFLICT,
            );
        }

        return null;
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): ?Response
    {
        return new JsonResponse(
            ['error' => $exception->getMessageKey()],
            Response::HTTP_UNAUTHORIZED,
        );
    }
}
