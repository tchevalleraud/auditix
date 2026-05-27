<?php

namespace App\Controller\Api\Admin;

use Symfony\Bundle\FrameworkBundle\Controller\AbstractController;
use Symfony\Component\DependencyInjection\Attribute\Autowire;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Symfony\Component\Routing\Attribute\Route;
use Symfony\Component\Security\Http\Attribute\IsGranted;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Vendor Plugin marketplace endpoint.
 *
 * Phase 4 (stub) : if `MARKETPLACE_URL` env var is set, this endpoint proxies
 * the upstream JSON list of available plugins. Otherwise it returns an empty
 * list. A future phase will add `POST /install` to download + install from a
 * marketplace entry.
 */
#[Route('/api/admin/marketplace')]
#[IsGranted('ROLE_ADMIN')]
class MarketplaceController extends AbstractController
{
    public function __construct(
        private readonly HttpClientInterface $http,
        #[Autowire(env: 'default::MARKETPLACE_URL')] private readonly ?string $marketplaceUrl,
    ) {}

    #[Route('/plugins', methods: ['GET'])]
    public function plugins(): JsonResponse
    {
        if ($this->marketplaceUrl === null || $this->marketplaceUrl === '') {
            return $this->json([
                'enabled' => false,
                'plugins' => [],
                'message' => 'Marketplace is not configured on this instance.',
            ]);
        }

        try {
            $response = $this->http->request('GET', rtrim($this->marketplaceUrl, '/') . '/plugins', [
                'timeout' => 10,
            ]);
            $data = $response->toArray(false);
        } catch (\Throwable $e) {
            throw new HttpException(502, 'Failed to reach marketplace: ' . $e->getMessage());
        }

        return $this->json([
            'enabled' => true,
            'source' => $this->marketplaceUrl,
            'plugins' => is_array($data['plugins'] ?? null) ? $data['plugins'] : [],
        ]);
    }
}
