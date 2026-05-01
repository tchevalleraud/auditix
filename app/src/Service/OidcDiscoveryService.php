<?php

namespace App\Service;

use Psr\Log\LoggerInterface;
use Symfony\Component\HttpClient\Exception\TransportException;
use Symfony\Contracts\Cache\CacheInterface;
use Symfony\Contracts\Cache\ItemInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

class OidcDiscoveryService
{
    private const CACHE_TTL_SECONDS = 3600;
    private const REQUEST_TIMEOUT_SECONDS = 10;

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly CacheInterface $cache,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * Fetch and cache the OIDC discovery document for the given URL.
     *
     * @return array<string, mixed>
     * @throws \RuntimeException on network or parse failure
     */
    public function discover(string $discoveryUrl): array
    {
        $key = 'oidc.discovery.' . sha1($discoveryUrl);
        return $this->cache->get($key, function (ItemInterface $item) use ($discoveryUrl): array {
            $item->expiresAfter(self::CACHE_TTL_SECONDS);
            return $this->fetch($discoveryUrl);
        });
    }

    /**
     * Fetch the JWKS document for token signature verification.
     *
     * @return array<string, mixed>
     * @throws \RuntimeException on network or parse failure
     */
    public function fetchJwks(string $jwksUri): array
    {
        $key = 'oidc.jwks.' . sha1($jwksUri);
        return $this->cache->get($key, function (ItemInterface $item) use ($jwksUri): array {
            $item->expiresAfter(self::CACHE_TTL_SECONDS);
            return $this->fetch($jwksUri);
        });
    }

    public function invalidate(string $discoveryUrl): void
    {
        $this->cache->delete('oidc.discovery.' . sha1($discoveryUrl));
    }

    /**
     * @return array<string, mixed>
     */
    private function fetch(string $url): array
    {
        try {
            $response = $this->httpClient->request('GET', $url, [
                'timeout' => self::REQUEST_TIMEOUT_SECONDS,
                'headers' => ['Accept' => 'application/json'],
            ]);
            $status = $response->getStatusCode();
            if ($status !== 200) {
                throw new \RuntimeException(sprintf('OIDC fetch failed: HTTP %d on %s', $status, $url));
            }
            $body = $response->getContent(false);
            $data = json_decode($body, true);
            if (!is_array($data)) {
                throw new \RuntimeException(sprintf('OIDC fetch returned invalid JSON from %s', $url));
            }
            return $data;
        } catch (TransportException $e) {
            $this->logger->warning('OIDC discovery transport error', ['url' => $url, 'error' => $e->getMessage()]);
            throw new \RuntimeException(sprintf('OIDC fetch transport error: %s', $e->getMessage()), 0, $e);
        }
    }
}
