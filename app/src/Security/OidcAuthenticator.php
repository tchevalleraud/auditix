<?php

namespace App\Security;

use App\Entity\OidcProvider;
use App\Entity\User;
use App\Repository\UserRepository;
use App\Service\OidcAuthorizationException;
use App\Service\OidcProviderService;
use App\Service\OidcTokenService;
use App\Service\UserProvisioningService;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Security\Core\Authentication\Token\TokenInterface;
use Symfony\Component\Security\Core\Exception\AuthenticationException;
use Symfony\Component\Security\Core\Exception\CustomUserMessageAuthenticationException;
use Symfony\Component\Security\Http\Authenticator\AbstractAuthenticator;
use Symfony\Component\Security\Http\Authenticator\Passport\Badge\UserBadge;
use Symfony\Component\Security\Http\Authenticator\Passport\Passport;
use Symfony\Component\Security\Http\Authenticator\Passport\SelfValidatingPassport;

class OidcAuthenticator extends AbstractAuthenticator
{
    public const SESSION_STATE = '_oidc_state';
    public const SESSION_NONCE = '_oidc_nonce';
    public const SESSION_RETURN_TO = '_oidc_return_to';
    public const SESSION_PROVIDER_SLUG = '_oidc_provider_slug';

    private const CALLBACK_PATTERN = '#^/api/auth/oidc/([a-zA-Z0-9_-]+)/callback$#';

    public function __construct(
        private readonly OidcProviderService $providerService,
        private readonly OidcTokenService $tokenService,
        private readonly UserProvisioningService $provisioning,
        private readonly UserRepository $users,
        private readonly LoggerInterface $logger,
    ) {
    }

    public function supports(Request $request): ?bool
    {
        return $request->getMethod() === 'GET'
            && preg_match(self::CALLBACK_PATTERN, $request->getPathInfo()) === 1
            && $request->query->has('code');
    }

    public function authenticate(Request $request): Passport
    {
        if (!preg_match(self::CALLBACK_PATTERN, $request->getPathInfo(), $m)) {
            throw new CustomUserMessageAuthenticationException('Invalid OIDC callback path.');
        }
        $slug = $m[1];

        $provider = $this->providerService->findBySlug($slug);
        if ($provider === null || !$provider->isReady()) {
            throw new CustomUserMessageAuthenticationException('OIDC provider not configured.');
        }

        $session = $request->getSession();
        $expectedState = $session->get(self::SESSION_STATE);
        $expectedNonce = $session->get(self::SESSION_NONCE);
        $expectedSlug = $session->get(self::SESSION_PROVIDER_SLUG);
        $session->remove(self::SESSION_STATE);
        $session->remove(self::SESSION_NONCE);
        $session->remove(self::SESSION_PROVIDER_SLUG);

        $state = $request->query->get('state');
        if (!is_string($expectedState) || $expectedState === '' || !hash_equals($expectedState, (string) $state)) {
            throw new CustomUserMessageAuthenticationException('Invalid OIDC state.');
        }
        if (!is_string($expectedNonce) || $expectedNonce === '') {
            throw new CustomUserMessageAuthenticationException('Missing OIDC nonce.');
        }
        if (!is_string($expectedSlug) || $expectedSlug !== $slug) {
            throw new CustomUserMessageAuthenticationException('OIDC provider mismatch.');
        }

        $clientSecret = $this->providerService->getDecryptedClientSecret($provider);
        if ($clientSecret === null) {
            throw new CustomUserMessageAuthenticationException('OIDC client secret unavailable.');
        }

        $code = (string) $request->query->get('code');
        $redirectUri = $this->buildRedirectUri($request, $slug);

        try {
            $tokens = $this->tokenService->exchangeCode(
                (string) $provider->getDiscoveryUrl(),
                (string) $provider->getClientId(),
                $clientSecret,
                $code,
                $redirectUri,
            );
            $claims = $this->tokenService->validateIdToken(
                (string) $provider->getDiscoveryUrl(),
                $tokens['id_token'],
                (string) $provider->getClientId(),
                $expectedNonce,
            );
            $user = $this->provisioning->findOrProvision($provider, $claims);
        } catch (OidcAuthorizationException $e) {
            throw new CustomUserMessageAuthenticationException($e->getMessage());
        } catch (\Throwable $e) {
            $this->logger->error('OIDC authentication failed', ['provider' => $slug, 'error' => $e->getMessage()]);
            throw new CustomUserMessageAuthenticationException('OIDC authentication failed.');
        }

        return new SelfValidatingPassport(
            new UserBadge($user->getUserIdentifier(), function () use ($user): User {
                $fresh = $this->users->find($user->getId());
                if ($fresh === null) {
                    throw new CustomUserMessageAuthenticationException('User vanished after provisioning.');
                }
                return $fresh;
            }),
        );
    }

    public function onAuthenticationSuccess(Request $request, TokenInterface $token, string $firewallName): ?Response
    {
        $session = $request->hasSession() ? $request->getSession() : null;
        $returnTo = '/';
        if ($session !== null) {
            $stored = $session->get(self::SESSION_RETURN_TO);
            $session->remove(self::SESSION_RETURN_TO);
            if (is_string($stored) && str_starts_with($stored, '/') && !str_starts_with($stored, '//')) {
                $returnTo = $stored;
            }
        }
        return new RedirectResponse($returnTo);
    }

    public function onAuthenticationFailure(Request $request, AuthenticationException $exception): ?Response
    {
        $message = $exception instanceof CustomUserMessageAuthenticationException
            ? $exception->getMessageKey()
            : 'OIDC authentication failed.';
        $url = '/login?oidc_error=' . rawurlencode($message);
        return new RedirectResponse($url);
    }

    public static function buildRedirectUri(Request $request, string $slug): string
    {
        return $request->getSchemeAndHttpHost() . '/api/auth/oidc/' . $slug . '/callback';
    }
}
