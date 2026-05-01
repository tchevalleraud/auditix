<?php

namespace App\Controller\Api;

use App\Entity\OidcProvider;
use App\Security\OidcAuthenticator;
use App\Service\OidcDiscoveryService;
use App\Service\OidcProviderService;
use Psr\Log\LoggerInterface;
use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\RedirectResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;

#[Route('/api/auth/oidc')]
class OidcController extends AbstractController
{
    public function __construct(
        private readonly OidcProviderService $providerService,
        private readonly OidcDiscoveryService $discovery,
        private readonly LoggerInterface $logger,
    ) {
    }

    #[Route('/status', name: 'api_oidc_status', methods: ['GET'])]
    public function status(): JsonResponse
    {
        $providers = array_map(
            fn (OidcProvider $p) => [
                'slug' => $p->getSlug(),
                'name' => $p->getName(),
                'buttonLabel' => $p->getButtonLabel(),
                'buttonColor' => $p->getButtonColor(),
                'buttonIconUrl' => $p->getButtonIconUrl(),
                'startUrl' => '/api/auth/oidc/' . $p->getSlug() . '/start',
            ],
            $this->providerService->listEnabled(),
        );
        return $this->json(['providers' => $providers]);
    }

    #[Route('/{slug}/start', name: 'api_oidc_start', methods: ['GET'], requirements: ['slug' => '[a-zA-Z0-9_-]+'])]
    public function start(string $slug, Request $request): Response
    {
        $provider = $this->providerService->findBySlug($slug);
        if ($provider === null || !$provider->isReady()) {
            return new RedirectResponse('/login?oidc_error=' . rawurlencode('OIDC provider not configured'));
        }

        try {
            $discovery = $this->discovery->discover((string) $provider->getDiscoveryUrl());
        } catch (\Throwable $e) {
            $this->logger->error('OIDC discovery failed at start', ['provider' => $slug, 'error' => $e->getMessage()]);
            return new RedirectResponse('/login?oidc_error=' . rawurlencode('OIDC discovery failed'));
        }

        $authorizeEndpoint = $discovery['authorization_endpoint'] ?? null;
        if (!is_string($authorizeEndpoint)) {
            return new RedirectResponse('/login?oidc_error=' . rawurlencode('Discovery missing authorization_endpoint'));
        }

        $state = bin2hex(random_bytes(16));
        $nonce = bin2hex(random_bytes(16));
        $session = $request->getSession();
        $session->set(OidcAuthenticator::SESSION_STATE, $state);
        $session->set(OidcAuthenticator::SESSION_NONCE, $nonce);
        $session->set(OidcAuthenticator::SESSION_PROVIDER_SLUG, $slug);

        $returnTo = $request->query->get('return_to');
        if (is_string($returnTo) && str_starts_with($returnTo, '/') && !str_starts_with($returnTo, '//')) {
            $session->set(OidcAuthenticator::SESSION_RETURN_TO, $returnTo);
        }

        $params = [
            'response_type' => 'code',
            'client_id' => $provider->getClientId(),
            'redirect_uri' => OidcAuthenticator::buildRedirectUri($request, $slug),
            'scope' => $provider->getScopes(),
            'state' => $state,
            'nonce' => $nonce,
        ];
        $url = $authorizeEndpoint . (str_contains($authorizeEndpoint, '?') ? '&' : '?') . http_build_query($params);
        return new RedirectResponse($url);
    }

    #[Route('/{slug}/callback', name: 'api_oidc_callback', methods: ['GET'], requirements: ['slug' => '[a-zA-Z0-9_-]+'])]
    public function callback(string $slug, Request $request): Response
    {
        $error = $request->query->get('error');
        if (is_string($error) && $error !== '') {
            $description = $request->query->get('error_description');
            $message = is_string($description) && $description !== '' ? $description : $error;
            return new RedirectResponse('/login?oidc_error=' . rawurlencode($message));
        }
        return new RedirectResponse('/login?oidc_error=' . rawurlencode('Missing authorization code'));
    }
}
