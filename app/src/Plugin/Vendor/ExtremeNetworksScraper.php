<?php

namespace App\Plugin\Vendor;

use App\Plugin\LifecycleData;
use Smalot\PdfParser\Parser as PdfParser;
use Symfony\Contracts\HttpClient\HttpClientInterface;

class ExtremeNetworksScraper
{
    private const URLS = [
        'switch_engine' => 'https://www.extremenetworks.com/support/compatibility-matrices/sw-release-extremexos-eos',
        'fabric_engine' => 'https://www.extremenetworks.com/support/compatibility-matrices/software-release-recommendations-for-voss-vsp-8600',
        'ers' => 'https://www.extremenetworks.com/support/compatibility-matrices/software-release-recommendations-for-ers-stackable-switches',
        'eos_page' => 'https://www.extremenetworks.com/support/end-of-sale-and-end-of-support-products',
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
     * Scrape all Extreme Networks compatibility pages for lifecycle data.
     *
     * @return LifecycleData[]
     */
    public function scrapeLifecycleData(): array
    {
        $entries = [];

        // 1. Switch Engine / EXOS page — recommended versions
        $entries = array_merge($entries, $this->scrapeSwitchEnginePage());

        // 2. Fabric Engine / VOSS page — recommended versions
        $entries = array_merge($entries, $this->scrapeFabricEnginePage());

        // 3. ERS page — recommended versions
        $entries = array_merge($entries, $this->scrapeErsPage());

        // 4. EoS page — lifecycle dates from PDF bulletins
        $eosData = $this->scrapeEosPage();

        // Merge EoS dates into existing entries
        return $this->mergeEosDates($entries, $eosData);
    }

    /**
     * Scrape Switch Engine / EXOS recommendations.
     * Columns: Platform | Maintenance Release | Feature Release
     *
     * @return LifecycleData[]
     */
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

            // Determine software name from the version string
            $softwareName = $this->detectSoftwareName($maintenanceRaw);

            // Some platforms (V300, V400) support both Switch Engine and EXOS
            // Handle "OR" in version strings
            if (stripos($maintenanceRaw, ' OR ') !== false) {
                $parts = preg_split('/\s+OR\s+/i', $maintenanceRaw);
                foreach ($parts as $part) {
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

    /**
     * Scrape Fabric Engine / VOSS recommendations.
     * Columns: Platform | Maintenance Release | Latest Feature Release | Effective Date
     *
     * @return LifecycleData[]
     */
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

            // Default to "Fabric Engine" for this page
            if ($softwareName === 'Unknown') {
                $softwareName = 'Fabric Engine';
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

    /**
     * Scrape ERS recommendations.
     * Columns: Platform | Maintenance Release | Latest Feature Release | Effective Date
     *
     * @return LifecycleData[]
     */
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

    // ─── Helpers ───

    private function fetchPage(string $url): ?string
    {
        try {
            $response = $this->httpClient->request('GET', $url, self::REQUEST_OPTS);
            return $response->getContent();
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Parse all table rows from the first HTML table found.
     *
     * @return array<int, array<int, string>> rows of cells
     */
    private function parseHtmlTable(string $html): array
    {
        $rows = [];

        // Find the table body
        if (!preg_match_all(
            '/<tr[^>]*>(.*?)<\/tr>/si',
            $html,
            $trMatches
        )) {
            return $rows;
        }

        foreach ($trMatches[1] as $trContent) {
            $cells = [];
            if (preg_match_all('/<t[dh][^>]*>(.*?)<\/t[dh]>/si', $trContent, $tdMatches)) {
                foreach ($tdMatches[1] as $cell) {
                    $cells[] = strip_tags($cell);
                }
            }
            if (!empty($cells)) {
                $rows[] = $cells;
            }
        }

        return $rows;
    }

    /**
     * Detect software platform name from a version string.
     */
    private function detectSoftwareName(string $versionString): string
    {
        $lower = strtolower($versionString);

        if (str_contains($lower, 'fabric engine')) return 'Fabric Engine';
        if (str_contains($lower, 'switch engine')) return 'Switch Engine';
        if (str_contains($lower, 'voss')) return 'Fabric Engine';
        if (str_contains($lower, 'exos')) return 'EXOS';
        if (str_contains($lower, 'vsp8600')) return 'Fabric Engine';
        if (str_contains($lower, 'version')) return 'ERS';

        return 'Unknown';
    }

    /**
     * Extract the version number from a string like "Switch Engine 32.7.3.15-Patch1-33"
     * or "VOSS 8.10.9.0" or "Version 7.9.6".
     */
    private function extractVersion(string $raw): ?string
    {
        $raw = trim($raw);
        if (empty($raw) || $raw === '-' || $raw === 'N/A') return null;

        // Match version pattern: digits.digits.digits[.digits][-PatchX-Y]
        if (preg_match('/(\d+\.\d+\.\d+(?:\.\d+)?(?:-Patch\d+-\d+)?)/', $raw, $m)) {
            return $m[1];
        }

        return null;
    }

    /**
     * Normalize platform name: "5320-16P-2MXT-2X" → "5320",
     * "VSP4900" → "VSP 4900", "ERS 3500" → "ERS 3500", etc.
     */
    private function normalizePlatform(string $platform): string
    {
        $platform = trim($platform);

        // Remove sub-model details like "-16P-2MXT-2X" or "(copper)" or "(all other models)"
        $platform = preg_replace('/\s*\(.*?\)\s*/', '', $platform);
        $platform = preg_replace('/-\d+[A-Z].*$/i', '', $platform);

        // Add space in "VSP4900" → "VSP 4900", "XA1400" → "XA1400"
        $platform = preg_replace('/^(VSP)(\d)/', '$1 $2', $platform);

        return trim($platform);
    }

    /**
     * Build regex model patterns for auto-linking DeviceModels.
     */
    private function buildModelPatterns(string $platform): array
    {
        // Extract the core identifier
        $escaped = preg_quote($platform, '/');

        // For platforms like "VSP 4900", match with or without space
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

    // ─── EoS / EoL scraping from PDF bulletins ───

    /**
     * Scrape the EoS page to get PDF bulletin URLs, download and parse them.
     *
     * @return array<string, array{eos: ?\DateTimeImmutable, eosm: ?\DateTimeImmutable, eosl: ?\DateTimeImmutable}>
     *         Keyed by normalized product family name (e.g., "VSP 4900", "5520", "X465")
     */
    private function scrapeEosPage(): array
    {
        $html = $this->fetchPage(self::URLS['eos_page']);
        if (!$html) return [];

        // Extract table rows: Posting date | Family | Product Name | Bulletin link
        $rows = $this->parseHtmlTable($html);
        $bulletins = [];

        foreach ($rows as $row) {
            $family = $this->cleanText($row[1] ?? '');
            $productName = $this->cleanText($row[2] ?? '');
            $bulletinCell = $row[3] ?? '';

            // Only process switching/routing products
            $lowerFamily = strtolower($family);
            $lowerProduct = strtolower($productName);
            if (!$this->isRelevantEosProduct($lowerFamily, $lowerProduct)) {
                continue;
            }

            // Extract PDF URL from <a href="...">
            // The raw cell may still contain HTML since we need the href
            if (preg_match('/href=["\']([^"\']+)["\']/', $row[3] ?? '', $m)) {
                $pdfUrl = $m[1];
            } else {
                continue;
            }

            // Avoid re-downloading the same PDF
            if (isset($bulletins[$pdfUrl])) continue;
            $bulletins[$pdfUrl] = $productName;
        }

        // Re-parse table to get href from raw HTML (parseHtmlTable strips tags)
        $pdfUrls = $this->extractPdfUrls($html);

        // Download and parse each PDF
        $results = [];
        foreach ($pdfUrls as $url => $productName) {
            if (!$this->isRelevantEosProduct('', strtolower($productName))) continue;

            $pdfData = $this->parsePdfBulletin($url);
            foreach ($pdfData as $family => $dates) {
                // Keep the earliest EOS and latest EOSL per product family
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

    /**
     * Extract PDF bulletin URLs from the EoS page raw HTML.
     *
     * @return array<string, string> URL => product name
     */
    private function extractPdfUrls(string $html): array
    {
        $urls = [];

        if (!preg_match_all('/<tr[^>]*>(.*?)<\/tr>/si', $html, $trMatches)) {
            return $urls;
        }

        foreach ($trMatches[1] as $trContent) {
            // Extract cells keeping HTML for the last cell (bulletin link)
            $cells = [];
            if (preg_match_all('/<td[^>]*>(.*?)<\/td>/si', $trContent, $tdMatches)) {
                $cells = $tdMatches[1];
            }
            if (count($cells) < 4) continue;

            $productName = strip_tags($cells[2] ?? '');
            $bulletinHtml = $cells[3] ?? '';

            if (preg_match('/href=["\']([^"\']+)["\']/', $bulletinHtml, $m)) {
                $url = $m[1];
                if (!isset($urls[$url])) {
                    $urls[$url] = $productName;
                }
            }
        }

        return $urls;
    }

    /**
     * Check if a product from the EoS page is relevant to our hardware catalog.
     */
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
     * Download a PDF bulletin and extract EOS/EOSM/EOSL dates per product family.
     *
     * PDF structure: tables with columns "Marketing Part #" | "Description" | "EOS" | ["EOSM"] | "EOSL"
     * Dates in format MM/DD/YYYY or M/D/YYYY.
     *
     * @return array<string, array{eos: ?\DateTimeImmutable, eosm: ?\DateTimeImmutable, eosl: ?\DateTimeImmutable}>
     */
    private function parsePdfBulletin(string $url): array
    {
        try {
            $response = $this->httpClient->request('GET', $url, [
                'timeout' => 30,
                'headers' => ['User-Agent' => 'Auditix/1.0 (Lifecycle Sync)'],
            ]);
            $pdfContent = $response->getContent();
        } catch (\Throwable) {
            return [];
        }

        try {
            $parser = new PdfParser();
            $pdf = $parser->parseContent($pdfContent);
            $text = $pdf->getText();
        } catch (\Throwable) {
            return [];
        }

        return $this->extractDatesFromPdfText($text);
    }

    /**
     * Extract lifecycle dates from PDF text content.
     * Looks for SKU lines followed by dates in MM/DD/YYYY format.
     *
     * @return array<string, array{eos: ?\DateTimeImmutable, eosm: ?\DateTimeImmutable, eosl: ?\DateTimeImmutable}>
     */
    private function extractDatesFromPdfText(string $text): array
    {
        $results = [];

        // Find all date patterns in the text
        // Pattern: SKU-like text followed by description then dates
        // Dates appear as MM/DD/YYYY or M/D/YYYY
        $lines = preg_split('/\n/', $text);

        $datePattern = '/(\d{1,2}\/\d{1,2}\/\d{4})/';

        // Collect all lines with dates and try to associate them with product families
        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line)) continue;

            // Find dates on this line
            preg_match_all($datePattern, $line, $dateMatches);
            if (empty($dateMatches[1])) continue;

            // Try to identify which product family this SKU belongs to
            $family = $this->identifyProductFamily($line);
            if (!$family) continue;

            $dates = $dateMatches[1];
            $eos = $this->parseDateMDY($dates[0] ?? null);
            // If 3 dates: EOS, EOSM, EOSL. If 2 dates: EOS, EOSL
            $eosl = $this->parseDateMDY(count($dates) >= 3 ? ($dates[2] ?? null) : ($dates[1] ?? null));
            $eosm = count($dates) >= 3 ? $this->parseDateMDY($dates[1] ?? null) : null;

            if (!isset($results[$family])) {
                $results[$family] = ['eos' => $eos, 'eosm' => $eosm, 'eosl' => $eosl];
            }
        }

        return $results;
    }

    /**
     * Identify which product family a SKU or line belongs to.
     * E.g., "VSP-4900-48P-B1-S" → "VSP 4900", "5520-24T" → "5520"
     */
    private function identifyProductFamily(string $line): ?string
    {
        // ERS and VSP patterns MUST be checked first — they have prefixes
        // that prevent false matches with universal platform numbers.
        // E.g., "ERS-5520" must match "ERS 5520", not "5520".
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
            // Universal platforms — match only when followed by a dash and
            // sub-model suffix (e.g., "5520-24T", "7720-32C") to avoid
            // false positives with numbers appearing in unrelated text.
            // Also must NOT be preceded by "ERS".
            '/(?<!ERS[- ])(?<!ERS)\b7830-\d/i' => '7830',
            '/(?<!ERS[- ])(?<!ERS)\b7720-\d/i' => '7720',
            '/(?<!ERS[- ])(?<!ERS)\b7520-\d/i' => '7520',
            '/(?<!ERS[- ])(?<!ERS)\b5720-\d/i' => '5720',
            '/(?<!ERS[- ])(?<!ERS)\b5520-\d/i' => '5520',
            '/(?<!ERS[- ])(?<!ERS)\b5420-\d/i' => '5420',
            '/(?<!ERS[- ])(?<!ERS)\b5420M-/i' => '5420',
            '/(?<!ERS[- ])(?<!ERS)\b5320-\d/i' => '5320',
            '/(?<!ERS[- ])(?<!ERS)\b5120-\d/i' => '5120',
            '/(?<!ERS[- ])(?<!ERS)\b4220-\d/i' => '4220',
            '/(?<!ERS[- ])(?<!ERS)\b4120-\d/i' => '4120',
            '/\bX870\b/i' => 'X870',
            '/\bX695\b/i' => 'X695',
            '/\bX690\b/i' => 'X690',
            '/\bX670/i' => 'X670-G2',
            '/\bX620/i' => 'X620',
            '/\bX590\b/i' => 'X590',
            '/\bX465\b/i' => 'X465',
            '/\bX460/i' => 'X460-G2',
            '/\bX450/i' => 'X450-G2',
            '/\bX440/i' => 'X440-G2',
            '/\bX435\b/i' => 'X435',
            '/\bXA1400\b/i' => 'XA1400',
            '/\bV400\b/i' => 'V400',
            '/\bV300\b/i' => 'V300',
            '/\bAP510/i' => 'AP',
            '/\bAP650/i' => 'AP',
            '/\bAP5020/i' => 'AP',
        ];

        foreach ($patterns as $regex => $family) {
            if (preg_match($regex, $line)) {
                return $family;
            }
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
     * Merge EoS dates from PDF bulletins into the lifecycle entries from version pages.
     *
     * @param LifecycleData[] $entries
     * @param array<string, array{eos: ?\DateTimeImmutable, eosm: ?\DateTimeImmutable, eosl: ?\DateTimeImmutable}> $eosData
     * @return LifecycleData[]
     */
    private function mergeEosDates(array $entries, array $eosData): array
    {
        if (empty($eosData)) return $entries;

        $result = [];
        foreach ($entries as $entry) {
            // Extract the hardware name from "5520 (Fabric Engine)" → "5520"
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
