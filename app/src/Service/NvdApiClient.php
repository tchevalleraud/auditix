<?php

namespace App\Service;

use Psr\Log\LoggerInterface;
use Symfony\Contracts\HttpClient\HttpClientInterface;

class NvdApiClient
{
    private const BASE_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
    private const RATE_LIMIT_NO_KEY_MS = 6000;
    private const RATE_LIMIT_WITH_KEY_MS = 600;

    private float $lastRequestTime = 0;

    public function __construct(
        private readonly HttpClientInterface $httpClient,
        private readonly LoggerInterface $logger,
    ) {}

    /**
     * Search CVEs by keyword (e.g. "cisco catalyst").
     * @return array<array{cveId: string, description: ?string, cvssScore: ?float, cvssVector: ?string, severity: string, publishedAt: ?string, modifiedAt: ?string}>
     */
    public function searchByKeyword(string $keyword, ?string $apiKey = null, int $startIndex = 0): array
    {
        $params = [
            'keywordSearch' => $keyword,
            'startIndex' => $startIndex,
            'resultsPerPage' => 200,
        ];

        return $this->fetchCves($params, $apiKey);
    }

    /**
     * @return array{results: array, totalResults: int, startIndex: int}
     */
    private function fetchCves(array $params, ?string $apiKey): array
    {
        $this->rateLimit($apiKey);

        $headers = [];
        if ($apiKey) {
            $headers['apiKey'] = $apiKey;
        }

        try {
            $response = $this->httpClient->request('GET', self::BASE_URL, [
                'query' => $params,
                'headers' => $headers,
                'timeout' => 30,
            ]);

            $data = $response->toArray();
            $results = $this->parseResponse($data);

            return [
                'results' => $results,
                'totalResults' => $data['totalResults'] ?? 0,
                'startIndex' => $data['startIndex'] ?? 0,
            ];
        } catch (\Throwable $e) {
            $this->logger->error('NVD API request failed: ' . $e->getMessage(), [
                'params' => $params,
            ]);
            return ['results' => [], 'totalResults' => 0, 'startIndex' => 0];
        }
    }

    /**
     * Fetch all pages for a keyword search.
     * @return array<array{cveId: string, description: ?string, cvssScore: ?float, cvssVector: ?string, severity: string, publishedAt: ?string, modifiedAt: ?string}>
     */
    public function searchAllByKeyword(string $keyword, ?string $apiKey = null): array
    {
        $allResults = [];
        $startIndex = 0;

        do {
            $response = $this->searchByKeyword($keyword, $apiKey, $startIndex);
            $allResults = array_merge($allResults, $response['results']);
            $startIndex += 200;
        } while ($startIndex < $response['totalResults']);

        return $allResults;
    }

    private function parseResponse(array $data): array
    {
        $results = [];

        foreach ($data['vulnerabilities'] ?? [] as $item) {
            $cve = $item['cve'] ?? [];
            $cveId = $cve['id'] ?? null;
            if (!$cveId) continue;

            $description = null;
            foreach ($cve['descriptions'] ?? [] as $desc) {
                if (($desc['lang'] ?? '') === 'en') {
                    $description = $desc['value'] ?? null;
                    break;
                }
            }
            if (!$description) {
                $description = ($cve['descriptions'][0]['value'] ?? null);
            }

            [$cvssScore, $cvssVector] = $this->extractCvss($cve);

            // Extract version range from CPE configurations
            $versionInfo = $this->extractVersionRange($cve);

            $results[] = [
                'cveId' => $cveId,
                'description' => $description,
                'cvssScore' => $cvssScore,
                'cvssVector' => $cvssVector,
                'severity' => $cvssScore !== null ? self::cvssToSeverity($cvssScore) : 'none',
                'publishedAt' => $cve['published'] ?? null,
                'modifiedAt' => $cve['lastModified'] ?? null,
                'versionStartIncluding' => $versionInfo['startIncluding'],
                'versionEndExcluding' => $versionInfo['endExcluding'],
                'versionEndIncluding' => $versionInfo['endIncluding'],
            ];
        }

        return $results;
    }

    private function extractCvss(array $cve): array
    {
        // Try CVSS v3.1 first
        foreach ($cve['metrics']['cvssMetricV31'] ?? [] as $metric) {
            if (isset($metric['cvssData'])) {
                return [
                    $metric['cvssData']['baseScore'] ?? null,
                    $metric['cvssData']['vectorString'] ?? null,
                ];
            }
        }

        // Fallback to CVSS v3.0
        foreach ($cve['metrics']['cvssMetricV30'] ?? [] as $metric) {
            if (isset($metric['cvssData'])) {
                return [
                    $metric['cvssData']['baseScore'] ?? null,
                    $metric['cvssData']['vectorString'] ?? null,
                ];
            }
        }

        // Fallback to CVSS v2.0
        foreach ($cve['metrics']['cvssMetricV2'] ?? [] as $metric) {
            if (isset($metric['cvssData'])) {
                return [
                    $metric['cvssData']['baseScore'] ?? null,
                    $metric['cvssData']['vectorString'] ?? null,
                ];
            }
        }

        return [null, null];
    }

    /**
     * Extract version range from CPE configurations.
     * Handles both explicit version ranges (versionStartIncluding/versionEndExcluding)
     * and exact versions embedded in the CPE string (e.g. cpe:2.3:o:vendor:product:5.6.0:*).
     */
    private function extractVersionRange(array $cve): array
    {
        $result = ['startIncluding' => null, 'endExcluding' => null, 'endIncluding' => null];

        foreach ($cve['configurations'] ?? [] as $cfg) {
            foreach ($cfg['nodes'] ?? [] as $node) {
                foreach ($node['cpeMatch'] ?? [] as $match) {
                    if (!($match['vulnerable'] ?? false)) continue;

                    if (isset($match['versionStartIncluding'])) {
                        $result['startIncluding'] = $match['versionStartIncluding'];
                    }
                    if (isset($match['versionEndExcluding'])) {
                        $result['endExcluding'] = $match['versionEndExcluding'];
                    }
                    if (isset($match['versionEndIncluding'])) {
                        $result['endIncluding'] = $match['versionEndIncluding'];
                    }

                    // If we found explicit version bounds, use them
                    if ($result['startIncluding'] || $result['endExcluding'] || $result['endIncluding']) {
                        return $result;
                    }

                    // No explicit bounds — check if CPE contains an exact version
                    // CPE format: cpe:2.3:type:vendor:product:version:update:...
                    $cpeParts = explode(':', $match['criteria'] ?? '');
                    if (count($cpeParts) >= 6) {
                        $cpeVersion = $cpeParts[5];
                        if ($cpeVersion !== '*' && $cpeVersion !== '-') {
                            // Exact version match: both start and end inclusive
                            $result['startIncluding'] = $cpeVersion;
                            $result['endIncluding'] = $cpeVersion;
                            return $result;
                        }
                    }
                }
            }
        }

        return $result;
    }

    public static function cvssToSeverity(float $score): string
    {
        if ($score >= 9.0) return 'critical';
        if ($score >= 7.0) return 'high';
        if ($score >= 4.0) return 'medium';
        if ($score >= 0.1) return 'low';
        return 'none';
    }

    private function rateLimit(?string $apiKey): void
    {
        $delay = $apiKey ? self::RATE_LIMIT_WITH_KEY_MS : self::RATE_LIMIT_NO_KEY_MS;
        $now = microtime(true) * 1000;
        $elapsed = $now - $this->lastRequestTime;

        if ($elapsed < $delay && $this->lastRequestTime > 0) {
            usleep((int) (($delay - $elapsed) * 1000));
        }

        $this->lastRequestTime = microtime(true) * 1000;
    }
}
