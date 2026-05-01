<?php

namespace App\Service;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Psr\Log\LoggerInterface;
use Symfony\Component\HttpClient\Exception\TransportException;
use Symfony\Contracts\HttpClient\HttpClientInterface;

class OidcTokenService
{
    private const REQUEST_TIMEOUT_SECONDS = 10;
    private const CLOCK_SKEW_SECONDS = 60;

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly OidcDiscoveryService $discovery,
        private readonly LoggerInterface $logger,
    ) {
    }

    /**
     * Exchange an authorization code for tokens at the token endpoint.
     *
     * @return array{id_token: string, access_token: string, refresh_token?: string}
     * @throws \RuntimeException on token endpoint failure
     */
    public function exchangeCode(
        string $discoveryUrl,
        string $clientId,
        string $clientSecret,
        string $code,
        string $redirectUri,
    ): array {
        $discovery = $this->discovery->discover($discoveryUrl);
        $tokenEndpoint = $discovery['token_endpoint'] ?? null;
        if (!is_string($tokenEndpoint)) {
            throw new \RuntimeException('OIDC discovery missing token_endpoint');
        }

        try {
            $response = $this->httpClient->request('POST', $tokenEndpoint, [
                'timeout' => self::REQUEST_TIMEOUT_SECONDS,
                'auth_basic' => [$clientId, $clientSecret],
                'headers' => [
                    'Content-Type' => 'application/x-www-form-urlencoded',
                    'Accept' => 'application/json',
                ],
                'body' => http_build_query([
                    'grant_type' => 'authorization_code',
                    'code' => $code,
                    'redirect_uri' => $redirectUri,
                ]),
            ]);
            $status = $response->getStatusCode();
            $body = $response->getContent(false);
            if ($status !== 200) {
                $this->logger->warning('OIDC token endpoint returned non-200', ['status' => $status, 'body' => $body]);
                throw new \RuntimeException(sprintf('Token endpoint returned HTTP %d', $status));
            }
            $data = json_decode($body, true);
            if (!is_array($data) || !isset($data['id_token'], $data['access_token'])) {
                throw new \RuntimeException('Token endpoint returned malformed payload');
            }
            return $data;
        } catch (TransportException $e) {
            throw new \RuntimeException('Token endpoint transport error: ' . $e->getMessage(), 0, $e);
        }
    }

    /**
     * Validate an ID token: signature (via JWKS), issuer, audience, nonce, expiry.
     *
     * @return array<string, mixed> the decoded claims
     * @throws \RuntimeException on validation failure
     */
    public function validateIdToken(
        string $discoveryUrl,
        string $idToken,
        string $expectedAudience,
        string $expectedNonce,
    ): array {
        $discovery = $this->discovery->discover($discoveryUrl);
        $issuer = $discovery['issuer'] ?? null;
        $jwksUri = $discovery['jwks_uri'] ?? null;
        if (!is_string($issuer) || !is_string($jwksUri)) {
            throw new \RuntimeException('OIDC discovery missing issuer or jwks_uri');
        }

        $jwks = $this->discovery->fetchJwks($jwksUri);
        $keys = JWK::parseKeySet($jwks);

        JWT::$leeway = self::CLOCK_SKEW_SECONDS;
        try {
            $decoded = JWT::decode($idToken, $keys);
        } catch (\Throwable $e) {
            throw new \RuntimeException('ID token signature/format invalid: ' . $e->getMessage(), 0, $e);
        }

        $claims = (array) $decoded;

        if (($claims['iss'] ?? null) !== $issuer) {
            throw new \RuntimeException('ID token issuer mismatch');
        }
        $aud = $claims['aud'] ?? null;
        $audList = is_array($aud) ? $aud : [$aud];
        if (!in_array($expectedAudience, $audList, true)) {
            throw new \RuntimeException('ID token audience mismatch');
        }
        if (($claims['nonce'] ?? null) !== $expectedNonce) {
            throw new \RuntimeException('ID token nonce mismatch');
        }
        if (!isset($claims['sub']) || !is_string($claims['sub']) || $claims['sub'] === '') {
            throw new \RuntimeException('ID token missing sub claim');
        }

        return $this->normalizeClaims($claims);
    }

    /**
     * Recursively convert stdClass to associative arrays for easier dot-notation access.
     *
     * @param array<string, mixed>|object $claims
     * @return array<string, mixed>
     */
    private function normalizeClaims(array|object $claims): array
    {
        $arr = is_object($claims) ? (array) $claims : $claims;
        $out = [];
        foreach ($arr as $k => $v) {
            $out[$k] = is_object($v) || (is_array($v) && $this->isAssoc($v))
                ? $this->normalizeClaims($v)
                : $v;
        }
        return $out;
    }

    /**
     * @param array<int|string, mixed> $arr
     */
    private function isAssoc(array $arr): bool
    {
        if ($arr === []) {
            return false;
        }
        return array_keys($arr) !== range(0, count($arr) - 1);
    }
}
