<?php

namespace Auditix\Plugin\ExtremeNetworksLifecycle;

use App\Plugin\LifecycleData;
use Smalot\PdfParser\Parser as PdfParser;
use Symfony\Contracts\HttpClient\HttpClientInterface;

/**
 * Scraper Extreme Networks (pages de compatibilité + bulletins PDF EoS).
 *
 * Sources publiques :
 *  - Compatibility matrices (Switch Engine / EXOS, Fabric Engine / VOSS, ERS)
 *  - Page End-of-Sale → bulletins PDF par produit (dates EoS / EoSupport / EoL)
 *
 * Auto-suffisant : pas de dépendance au DI Symfony. HttpClient injecté par
 * l'entry class, Smalot\PdfParser résolu via l'autoloader global Composer.
 */
final class Scraper
{
    private const URLS = [
        'switch_engine' => 'https://www.extremenetworks.com/support/compatibility-matrices/sw-release-extremexos-eos',
        'fabric_engine' => 'https://www.extremenetworks.com/support/compatibility-matrices/software-release-recommendations-for-voss-vsp-8600',
        'ers'           => 'https://www.extremenetworks.com/support/compatibility-matrices/software-release-recommendations-for-ers-stackable-switches',
        'eos_page'      => 'https://www.extremenetworks.com/support/end-of-sale-and-end-of-support-products',
    ];

    private const REQUEST_OPTS = [
        'timeout' => 30,
        'headers' => [
            'User-Agent' => 'Auditix/1.0 (Lifecycle Sync)',
            'Accept' => 'text/html',
        ],
    ];

    public function __construct(
        private readonly HttpClientInterface $httpClient,
    ) {}

    /**
     * @param string[] $ranges Gammes à scraper : switch_engine, fabric_engine, ers.
     * @return LifecycleData[]
     */
    public function scrapeLifecycleData(array $ranges = ['switch_engine', 'fabric_engine', 'ers']): array
    {
        $entries = [];
        if (in_array('switch_engine', $ranges, true)) {
            $entries = array_merge($entries, $this->scrapeSwitchEnginePage());
        }
        if (in_array('fabric_engine', $ranges, true)) {
            $entries = array_merge($entries, $this->scrapeFabricEnginePage());
        }
        if (in_array('ers', $ranges, true)) {
            $entries = array_merge($entries, $this->scrapeErsPage());
        }

        if ($entries === []) {
            return [];
        }

        // La page EoS porte les dates communes ; le merge ne s'applique qu'aux
        // entrées retenues, donc inutile de la scraper si rien n'est sélectionné.
        $eosData = $this->scrapeEosPage();
        return $this->mergeEosDates($entries, $eosData);
    }

    /** @return LifecycleData[] */
    private function scrapeSwitchEnginePage(): array
    {
        $html = $this->fetchPage(self::URLS['switch_engine']);
        if (!$html) return [];

        $rows = $this->parseHtmlTable($html);
        $entries = [];

        foreach ($rows as $row) {
            $platform = $this->cleanText($row[0] ?? '');
            $maintenanceRaw = $this->cleanText($row[1] ?? '');
            $featureRaw = $this->cleanText($row[2] ?? '');

            if (empty($platform) || $this->isHeaderRow($platform)) continue;

            $normalizedPlatform = $this->normalizePlatform($platform);
            $maintenanceVersion = $this->extractVersion($maintenanceRaw);
            $featureVersion = $this->extractVersion($featureRaw);
            $softwareName = $this->detectSoftwareName($maintenanceRaw);

            if (stripos($maintenanceRaw, ' OR ') !== false) {
                foreach (preg_split('/\s+OR\s+/i', $maintenanceRaw) as $part) {
                    $sw = $this->detectSoftwareName($part);
                    $ver = $this->extractVersion($part);
                    $entries[] = new LifecycleData(
                        productRangeName: $normalizedPlatform . ' (' . $sw . ')',
                        recommendedVersion: $ver,
                        currentVersion: $this->extractVersion($featureRaw),
                        modelPatterns: $this->buildModelPatterns($normalizedPlatform),
                    );
                }
                continue;
            }

            $entries[] = new LifecycleData(
                productRangeName: $normalizedPlatform . ' (' . $softwareName . ')',
                recommendedVersion: $maintenanceVersion,
                currentVersion: $featureVersion,
                modelPatterns: $this->buildModelPatterns($normalizedPlatform),
            );
        }
        return $entries;
    }

    /** @return LifecycleData[] */
    private function scrapeFabricEnginePage(): array
    {
        $html = $this->fetchPage(self::URLS['fabric_engine']);
        if (!$html) return [];

        $rows = $this->parseHtmlTable($html);
        $entries = [];

        foreach ($rows as $row) {
            $platform = $this->cleanText($row[0] ?? '');
            $maintenanceRaw = $this->cleanText($row[1] ?? '');
            $featureRaw = $this->cleanText($row[2] ?? '');

            if (empty($platform) || $this->isHeaderRow($platform)) continue;

            $normalizedPlatform = $this->normalizePlatform($platform);
            $maintenanceVersion = $this->extractVersion($maintenanceRaw);
            $featureVersion = $this->extractVersion($featureRaw);
            $softwareName = $this->detectSoftwareName($maintenanceRaw);
            if ($softwareName === 'Unknown') $softwareName = 'Fabric Engine';

            $entries[] = new LifecycleData(
                productRangeName: $normalizedPlatform . ' (' . $softwareName . ')',
                recommendedVersion: $maintenanceVersion,
                currentVersion: $featureVersion,
                modelPatterns: $this->buildModelPatterns($normalizedPlatform),
            );
        }
        return $entries;
    }

    /** @return LifecycleData[] */
    private function scrapeErsPage(): array
    {
        $html = $this->fetchPage(self::URLS['ers']);
        if (!$html) return [];

        $rows = $this->parseHtmlTable($html);
        $entries = [];

        foreach ($rows as $row) {
            $platform = $this->cleanText($row[0] ?? '');
            $maintenanceRaw = $this->cleanText($row[1] ?? '');
            $featureRaw = $this->cleanText($row[2] ?? '');

            if (empty($platform) || $this->isHeaderRow($platform)) continue;

            $normalizedPlatform = $this->normalizePlatform($platform);
            $maintenanceVersion = $this->extractVersion($maintenanceRaw);
            $featureVersion = $this->extractVersion($featureRaw);

            $entries[] = new LifecycleData(
                productRangeName: $normalizedPlatform . ' (ERS)',
                recommendedVersion: $maintenanceVersion,
                currentVersion: $featureVersion,
                modelPatterns: $this->buildModelPatterns($normalizedPlatform),
            );
        }
        return $entries;
    }

    private function fetchPage(string $url): ?string
    {
        try {
            return $this->httpClient->request('GET', $url, self::REQUEST_OPTS)->getContent();
        } catch (\Throwable) {
            return null;
        }
    }

    /** @return array<int, array<int, string>> */
    private function parseHtmlTable(string $html): array
    {
        $rows = [];
        if (!preg_match_all('/<tr[^>]*>(.*?)<\/tr>/si', $html, $trMatches)) return $rows;

        foreach ($trMatches[1] as $trContent) {
            $cells = [];
            if (preg_match_all('/<t[dh][^>]*>(.*?)<\/t[dh]>/si', $trContent, $tdMatches)) {
                foreach ($tdMatches[1] as $cell) $cells[] = strip_tags($cell);
            }
            if (!empty($cells)) $rows[] = $cells;
        }
        return $rows;
    }

    private function detectSoftwareName(string $versionString): string
    {
        $lower = strtolower($versionString);
        if (str_contains($lower, 'fabric engine')) return 'Fabric Engine';
        if (str_contains($lower, 'switch engine')) return 'Switch Engine';
        if (str_contains($lower, 'voss'))          return 'Fabric Engine';
        if (str_contains($lower, 'exos'))          return 'EXOS';
        if (str_contains($lower, 'vsp8600'))       return 'Fabric Engine';
        if (str_contains($lower, 'version'))       return 'ERS';
        return 'Unknown';
    }

    private function extractVersion(string $raw): ?string
    {
        $raw = trim($raw);
        if (empty($raw) || $raw === '-' || $raw === 'N/A') return null;
        if (preg_match('/(\d+\.\d+\.\d+(?:\.\d+)?(?:-Patch\d+-\d+)?)/', $raw, $m)) return $m[1];
        return null;
    }

    private function normalizePlatform(string $platform): string
    {
        $platform = trim($platform);
        $platform = preg_replace('/\s*\(.*?\)\s*/', '', $platform);
        $platform = preg_replace('/-\d+[A-Z].*$/i', '', $platform);
        $platform = preg_replace('/^(VSP)(\d)/', '$1 $2', $platform);
        return trim($platform);
    }

    private function buildModelPatterns(string $platform): array
    {
        $escaped = preg_quote($platform, '/');
        $pattern = str_replace('\\ ', '\\s*', $escaped);
        return ['/' . $pattern . '/i'];
    }

    private function cleanText(string $text): string
    {
        return trim(preg_replace('/\s+/', ' ', $text));
    }

    private function isHeaderRow(string $text): bool
    {
        $lower = strtolower($text);
        return str_contains($lower, 'platform')
            || str_contains($lower, 'product')
            || str_contains($lower, 'column');
    }

    /**
     * @return array<string, array{eos: ?\DateTimeImmutable, eosm: ?\DateTimeImmutable, eosl: ?\DateTimeImmutable}>
     */
    private function scrapeEosPage(): array
    {
        $html = $this->fetchPage(self::URLS['eos_page']);
        if (!$html) return [];

        $pdfUrls = $this->extractPdfUrls($html);

        $results = [];
        foreach ($pdfUrls as $url => $productName) {
            if (!$this->isRelevantEosProduct('', strtolower($productName))) continue;

            $pdfData = $this->parsePdfBulletin($url);
            foreach ($pdfData as $family => $dates) {
                if (!isset($results[$family])) {
                    $results[$family] = $dates;
                } else {
                    if ($dates['eos'] && (!$results[$family]['eos'] || $dates['eos'] < $results[$family]['eos'])) {
                        $results[$family]['eos'] = $dates['eos'];
                    }
                    if ($dates['eosl'] && (!$results[$family]['eosl'] || $dates['eosl'] > $results[$family]['eosl'])) {
                        $results[$family]['eosl'] = $dates['eosl'];
                    }
                }
            }
        }
        return $results;
    }

    /** @return array<string, string> URL => product name */
    private function extractPdfUrls(string $html): array
    {
        $urls = [];
        if (!preg_match_all('/<tr[^>]*>(.*?)<\/tr>/si', $html, $trMatches)) return $urls;

        foreach ($trMatches[1] as $trContent) {
            $cells = [];
            if (preg_match_all('/<td[^>]*>(.*?)<\/td>/si', $trContent, $tdMatches)) $cells = $tdMatches[1];
            if (count($cells) < 4) continue;

            $productName = strip_tags($cells[2] ?? '');
            $bulletinHtml = $cells[3] ?? '';
            if (preg_match('/href=["\']([^"\']+)["\']/', $bulletinHtml, $m)) {
                $url = $m[1];
                if (!isset($urls[$url])) $urls[$url] = $productName;
            }
        }
        return $urls;
    }

    private function isRelevantEosProduct(string $family, string $product): bool
    {
        $keywords = [
            'extremeswitching', 'switching', 'routing', 'vsp', 'ers',
            '5320', '5420', '5520', '5720', '7520', '7720', '7830',
            '4120', '4220', '5120',
            'x435', 'x440', 'x450', 'x460', 'x465', 'x590', 'x620', 'x670', 'x690', 'x695', 'x870',
            'v300', 'v400',
        ];
        $combined = $family . ' ' . $product;
        foreach ($keywords as $kw) {
            if (str_contains($combined, $kw)) return true;
        }
        return false;
    }

    /**
     * @return array<string, array{eos: ?\DateTimeImmutable, eosm: ?\DateTimeImmutable, eosl: ?\DateTimeImmutable}>
     */
    private function parsePdfBulletin(string $url): array
    {
        try {
            $pdfContent = $this->httpClient->request('GET', $url, [
                'timeout' => 30,
                'headers' => ['User-Agent' => 'Auditix/1.0 (Lifecycle Sync)'],
            ])->getContent();
        } catch (\Throwable) {
            return [];
        }

        try {
            $parser = new PdfParser();
            $text = $parser->parseContent($pdfContent)->getText();
        } catch (\Throwable) {
            return [];
        }

        return $this->extractDatesFromPdfText($text);
    }

    /**
     * @return array<string, array{eos: ?\DateTimeImmutable, eosm: ?\DateTimeImmutable, eosl: ?\DateTimeImmutable}>
     */
    private function extractDatesFromPdfText(string $text): array
    {
        $results = [];
        $datePattern = '/(\d{1,2}\/\d{1,2}\/\d{4})/';

        foreach (preg_split('/\n/', $text) as $line) {
            $line = trim($line);
            if (empty($line)) continue;

            preg_match_all($datePattern, $line, $dateMatches);
            if (empty($dateMatches[1])) continue;

            $family = $this->identifyProductFamily($line);
            if (!$family) continue;

            $dates = $dateMatches[1];
            $eos = $this->parseDateMDY($dates[0] ?? null);
            $eosl = $this->parseDateMDY(count($dates) >= 3 ? ($dates[2] ?? null) : ($dates[1] ?? null));
            $eosm = count($dates) >= 3 ? $this->parseDateMDY($dates[1] ?? null) : null;

            if (!isset($results[$family])) {
                $results[$family] = ['eos' => $eos, 'eosm' => $eosm, 'eosl' => $eosl];
            }
        }
        return $results;
    }

    private function identifyProductFamily(string $line): ?string
    {
        $patterns = [
            '/\bVSP[- ]?8600/i' => 'VSP 8600',
            '/\bVSP[- ]?8400/i' => 'VSP 8400',
            '/\bVSP[- ]?8200/i' => 'VSP 8200',
            '/\bVSP[- ]?7400/i' => 'VSP 7400',
            '/\bVSP[- ]?7200/i' => 'VSP 7200',
            '/\bVSP[- ]?4900/i' => 'VSP 4900',
            '/\bVSP[- ]?4850/i' => 'VSP 4850',
            '/\bVSP[- ]?4450/i' => 'VSP 4450',
            '/\bERS[- ]?5900/i' => 'ERS 5900',
            '/\bERS[- ]?5520/i' => 'ERS 5520',
            '/\bERS[- ]?4900/i' => 'ERS 4900',
            '/\bERS[- ]?4800/i' => 'ERS 4800',
            '/\bERS[- ]?3600/i' => 'ERS 3600',
            '/\bERS[- ]?3500/i' => 'ERS 3500',
            '/(?<!ERS[- ])(?<!ERS)\b7830-\d/i' => '7830',
            '/(?<!ERS[- ])(?<!ERS)\b7720-\d/i' => '7720',
            '/(?<!ERS[- ])(?<!ERS)\b7520-\d/i' => '7520',
            '/(?<!ERS[- ])(?<!ERS)\b5720-\d/i' => '5720',
            '/(?<!ERS[- ])(?<!ERS)\b5520-\d/i' => '5520',
            '/(?<!ERS[- ])(?<!ERS)\b5420-\d/i' => '5420',
            '/(?<!ERS[- ])(?<!ERS)\b5420M-/i'  => '5420',
            '/(?<!ERS[- ])(?<!ERS)\b5320-\d/i' => '5320',
            '/(?<!ERS[- ])(?<!ERS)\b5120-\d/i' => '5120',
            '/(?<!ERS[- ])(?<!ERS)\b4220-\d/i' => '4220',
            '/(?<!ERS[- ])(?<!ERS)\b4120-\d/i' => '4120',
            '/\bX870\b/i'   => 'X870',
            '/\bX695\b/i'   => 'X695',
            '/\bX690\b/i'   => 'X690',
            '/\bX670/i'     => 'X670-G2',
            '/\bX620/i'     => 'X620',
            '/\bX590\b/i'   => 'X590',
            '/\bX465\b/i'   => 'X465',
            '/\bX460/i'     => 'X460-G2',
            '/\bX450/i'     => 'X450-G2',
            '/\bX440/i'     => 'X440-G2',
            '/\bX435\b/i'   => 'X435',
            '/\bXA1400\b/i' => 'XA1400',
            '/\bV400\b/i'   => 'V400',
            '/\bV300\b/i'   => 'V300',
            '/\bAP510/i'    => 'AP',
            '/\bAP650/i'    => 'AP',
            '/\bAP5020/i'   => 'AP',
        ];
        foreach ($patterns as $regex => $family) {
            if (preg_match($regex, $line)) return $family;
        }
        return null;
    }

    private function parseDateMDY(?string $text): ?\DateTimeImmutable
    {
        if (!$text) return null;
        $dt = \DateTimeImmutable::createFromFormat('m/d/Y', $text);
        if ($dt !== false) return $dt->setTime(0, 0);
        $dt = \DateTimeImmutable::createFromFormat('n/j/Y', $text);
        if ($dt !== false) return $dt->setTime(0, 0);
        return null;
    }

    /**
     * @param LifecycleData[] $entries
     * @param array<string, array{eos: ?\DateTimeImmutable, eosm: ?\DateTimeImmutable, eosl: ?\DateTimeImmutable}> $eosData
     * @return LifecycleData[]
     */
    private function mergeEosDates(array $entries, array $eosData): array
    {
        if (empty($eosData)) return $entries;

        $result = [];
        foreach ($entries as $entry) {
            $hwName = preg_replace('/\s*\(.*$/', '', $entry->productRangeName);

            if (isset($eosData[$hwName])) {
                $dates = $eosData[$hwName];
                $result[] = new LifecycleData(
                    productRangeName: $entry->productRangeName,
                    recommendedVersion: $entry->recommendedVersion,
                    currentVersion: $entry->currentVersion,
                    releaseDate: $entry->releaseDate,
                    endOfSaleDate: $dates['eos'] ?? $entry->endOfSaleDate,
                    endOfSupportDate: $dates['eosm'] ?? $entry->endOfSupportDate,
                    endOfLifeDate: $dates['eosl'] ?? $entry->endOfLifeDate,
                    modelPatterns: $entry->modelPatterns,
                );
            } else {
                $result[] = $entry;
            }
        }
        return $result;
    }
}
