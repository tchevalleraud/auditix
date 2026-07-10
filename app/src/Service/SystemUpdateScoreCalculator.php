<?php

namespace App\Service;

use App\Entity\Context;
use App\Entity\Node;
use App\Entity\ProductRange;
use Doctrine\ORM\EntityManagerInterface;

class SystemUpdateScoreCalculator
{
    public function __construct(
        private readonly EntityManagerInterface $em,
        private readonly StackResolver $stackResolver,
    ) {}

    /**
     * Calculate the system-update sub-score for a node. When the context has the
     * stack feature enabled, the node is made of several physical units and its
     * score is the WORST of its units — a stack is only as healthy as its most
     * at-risk member. A plain node resolves to a single (implicit) unit, so the
     * result is identical to the pre-stack behaviour.
     *
     * @return array{grade: string, score: float, details: array}
     */
    public function calculateForNode(Node $node): array
    {
        return $this->calculateForUnits($node)['composite'];
    }

    /**
     * Per-unit lifecycle analysis for a (possibly stacked) node.
     *
     * @return array{units: array<int, array>, composite: array{grade: string, score: float, details: array}}
     */
    public function calculateForUnits(Node $node): array
    {
        $context = $node->getContext();
        $units = $this->stackResolver->resolveUnits($node, $context?->getStackConfig());

        $unitResults = [];
        foreach ($units as $unit) {
            $range = $this->findProductRangeForModel($unit->model, $unit->version, $context);
            $calc = $this->calculateForModel($unit->version, $range);
            $unitResults[] = [
                'key' => $unit->key,
                'serial' => $unit->serial,
                'model' => $unit->model,
                'version' => $unit->version,
                'implicit' => $unit->implicit,
                'productRange' => $range?->getName(),
                'grade' => $calc['grade'],
                'score' => $calc['score'],
                'details' => $calc['details'],
            ];
        }

        // Composite = worst (lowest-scoring) unit.
        $composite = null;
        foreach ($unitResults as $r) {
            if ($composite === null || $r['score'] < $composite['score']) {
                $composite = ['grade' => $r['grade'], 'score' => $r['score'], 'details' => $r['details']];
            }
        }
        if ($composite === null) {
            $composite = ['grade' => 'A', 'score' => 100.0, 'details' => ['reason' => 'no_units']];
        }
        if (count($unitResults) > 1) {
            $composite['details']['stackUnitCount'] = count($unitResults);
        }

        return ['units' => $unitResults, 'composite' => $composite];
    }

    /**
     * Resolve and persist the product range(s) for a node as stored variables:
     *  - node.productRange       → the range driving the lifecycle (worst unit,
     *                              or simply the single node's range)
     *  - node.stackUnitRanges    → per-unit range ids for a real stack, else null
     *
     * The caller is responsible for flushing.
     */
    public function resolveAndPersistRanges(Node $node): void
    {
        $context = $node->getContext();
        $units = $this->stackResolver->resolveUnits($node, $context?->getStackConfig());

        $perUnit = [];
        $worstScore = null;
        $worstRange = null;

        foreach ($units as $unit) {
            $range = $this->findProductRangeForModel($unit->model, $unit->version, $context);
            if (!$unit->implicit) {
                $perUnit[$unit->key] = $range?->getId();
            }
            $calc = $this->calculateForModel($unit->version, $range);
            if ($worstScore === null || $calc['score'] < $worstScore) {
                $worstScore = $calc['score'];
                $worstRange = $range;
            }
        }

        $node->setProductRange($worstRange);
        $node->setStackUnitRanges($perUnit === [] ? null : $perUnit);
    }

    /**
     * Score a single model/version against its product range lifecycle data
     * (version currency + lifecycle dates).
     *
     * @return array{grade: string, score: float, details: array}
     */
    public function calculateForModel(?string $version, ?ProductRange $productRange): array
    {
        if (!$productRange) {
            return [
                'grade' => 'A',
                'score' => 100.0,
                'details' => ['reason' => 'no_product_range'],
            ];
        }

        $details = [];
        $now = new \DateTimeImmutable();

        // Lifecycle dates cascade: EoL implies EoS and EoSupport are also reached.
        // If a later milestone exists but an earlier one is missing, infer it.
        $eolDate = $productRange->getEndOfLifeDate();
        $eosDate = $productRange->getEndOfSaleDate();
        $eospDate = $productRange->getEndOfSupportDate();

        // If EoL is set, EoS and EoSupport must also be past (they happen before EoL)
        if ($eolDate) {
            if (!$eosDate) $eosDate = $eolDate;
            if (!$eospDate) $eospDate = $eolDate;
        }
        // If EoSupport is set, EoS must also be past
        if ($eospDate && !$eosDate) {
            $eosDate = $eospDate;
        }

        // 1. Version currency (0-40 points)
        $versionPoints = $this->scoreVersion(
            $version,
            $productRange->getRecommendedVersion(),
        );
        $details['version'] = $versionPoints;

        // Lifecycle weights reflect severity:
        //  - End of Sale: product can no longer be purchased but is still under support (mild)
        //  - End of Support: no more software fixes, hardware still replaceable (medium)
        //  - End of Life: definitively unsupported (severe)
        // Each sub-score decays linearly to 0 as the date approaches and stays at 0 once passed.

        // 2. End of Sale proximity (0-10 points)
        $eosPoints = $this->scoreDateProximity($eosDate, $now, 10);
        $details['endOfSale'] = $eosPoints;

        // 3. End of Support proximity (0-20 points)
        $eospPoints = $this->scoreDateProximity($eospDate, $now, 20);
        $details['endOfSupport'] = $eospPoints;

        // 4. End of Life proximity (0-30 points)
        $eolPoints = $this->scoreDateProximity($eolDate, $now, 30);
        $details['endOfLife'] = $eolPoints;

        $score = $versionPoints['points'] + $eosPoints['points'] + $eospPoints['points'] + $eolPoints['points'];
        $score = max(0, min(100, $score));

        $grade = self::scoreToGrade($score);

        $details['productRange'] = $productRange->getName();
        $details['recommendedVersion'] = $productRange->getRecommendedVersion();
        $details['discoveredVersion'] = $version;

        return [
            'grade' => $grade,
            'score' => $score,
            'details' => $details,
        ];
    }

    /**
     * Score based on version comparison (0-40 points).
     */
    private function scoreVersion(?string $nodeVersion, ?string $recommendedVersion): array
    {
        if (!$nodeVersion || !$recommendedVersion) {
            return ['points' => 25, 'status' => 'unknown'];
        }

        $cmp = version_compare($nodeVersion, $recommendedVersion);

        if ($cmp >= 0) {
            return ['points' => 40, 'status' => 'current'];
        }

        // Estimate how far behind by comparing major.minor components
        $nodeParts = explode('.', $nodeVersion);
        $recParts = explode('.', $recommendedVersion);

        $nodeMajorMinor = ($nodeParts[0] ?? '0') . '.' . ($nodeParts[1] ?? '0');
        $recMajorMinor = ($recParts[0] ?? '0') . '.' . ($recParts[1] ?? '0');

        if (version_compare($nodeMajorMinor, $recMajorMinor, '==')) {
            // Same major.minor, just a patch behind
            return ['points' => 30, 'status' => 'patch_behind'];
        }

        // One minor version behind
        $recMinor = (int) ($recParts[1] ?? 0);
        $nodeMinor = (int) ($nodeParts[1] ?? 0);
        $recMajor = (int) ($recParts[0] ?? 0);
        $nodeMajor = (int) ($nodeParts[0] ?? 0);

        if ($nodeMajor === $recMajor && ($recMinor - $nodeMinor) <= 1) {
            return ['points' => 30, 'status' => 'one_minor_behind'];
        }

        return ['points' => 15, 'status' => 'outdated'];
    }

    /**
     * Score based on date proximity (0-$maxPoints).
     * Score decays linearly across a 24-month horizon and drops to 0 once the date is reached.
     */
    private function scoreDateProximity(
        ?\DateTimeImmutable $date,
        \DateTimeImmutable $now,
        float $maxPoints,
        float $horizonMonths = 24.0,
    ): array {
        if (!$date) {
            return ['points' => $maxPoints, 'status' => 'no_date'];
        }

        $diff = $now->diff($date);
        $months = $diff->y * 12 + $diff->m + ($diff->d / 30);

        if ($date < $now) {
            return ['points' => 0.0, 'status' => 'past', 'months_ago' => round($months, 1)];
        }

        if ($months >= $horizonMonths) {
            return ['points' => $maxPoints, 'status' => 'safe', 'months_remaining' => round($months, 1)];
        }

        $points = round($maxPoints * ($months / $horizonMonths), 1);
        $status = $months <= 6 ? 'imminent' : 'approaching';

        return ['points' => $points, 'status' => $status, 'months_remaining' => round($months, 1)];
    }

    public static function scoreToGrade(float $score): string
    {
        if ($score >= 90) return 'A';
        if ($score >= 75) return 'B';
        if ($score >= 60) return 'C';
        if ($score >= 45) return 'D';
        if ($score >= 30) return 'E';
        return 'F';
    }

    /**
     * Find the matching ProductRange for a node using its discoveredModel field.
     * Matches against explicit modelPatterns first, then the range name prefix,
     * disambiguating by version. Public so controllers can also resolve the
     * product range for display.
     */
    public function findProductRange(Node $node): ?ProductRange
    {
        return $this->findProductRangeForModel(
            $node->getDiscoveredModel(),
            $node->getDiscoveredVersion(),
            $node->getContext(),
        );
    }

    /**
     * Find the matching ProductRange for an arbitrary model string (a stack unit
     * model, or a node's discoveredModel). Matches against each range's explicit
     * modelPatterns first, then falls back to the range name prefix, and
     * disambiguates by version. Public so callers can resolve per-unit ranges.
     */
    public function findProductRangeForModel(?string $discoveredModel, ?string $version, ?Context $context): ?ProductRange
    {
        if (!$discoveredModel) return null;

        $ranges = $this->em->getRepository(ProductRange::class)->findBy(['context' => $context]);

        // First try: exact name match (e.g., discoveredModel = "5520 (Fabric Engine)")
        foreach ($ranges as $range) {
            if (strcasecmp($range->getName(), $discoveredModel) === 0) {
                return $range;
            }
        }

        // Second try: explicit regex patterns take priority over the name heuristic.
        // e.g., a range named "ERS 4900 (ERS)" with modelPatterns ["^ERS49"] reliably
        // matches a discovered "ERS4900GTS-PWR+" even though the names don't align.
        $patternCandidates = [];
        foreach ($ranges as $range) {
            foreach ($range->getModelPatterns() ?? [] as $pattern) {
                if ($this->modelMatchesPattern($pattern, $discoveredModel)) {
                    $patternCandidates[] = $range;
                    break;
                }
            }
        }
        if ($patternCandidates !== []) {
            return $this->disambiguate($patternCandidates, $version);
        }

        // Third try: match discoveredModel against the range name prefix
        // e.g., discoveredModel = "5520-24T" should match "5520 (Fabric Engine)"
        // We pick the best match by checking which range name starts with the model's base
        $candidates = [];
        foreach ($ranges as $range) {
            $rangeName = $range->getName();
            // Extract hardware part from range name: "5520 (Fabric Engine)" → "5520"
            $hwPart = preg_replace('/\s*\(.*$/', '', $rangeName);

            if ($hwPart !== '' && stripos($discoveredModel, $hwPart) !== false) {
                $candidates[] = $range;
            }
        }

        return $this->disambiguate($candidates, $version);
    }

    /**
     * Test a model string against one modelPattern. Patterns fed by plugins are
     * full delimited PCRE (e.g. "/ERS\s*4900/i"); patterns typed manually in the
     * UI are usually bare (e.g. "ERS 4900") — those get wrapped case-insensitively.
     * Invalid patterns never throw; they simply don't match.
     */
    private function modelMatchesPattern(mixed $pattern, string $subject): bool
    {
        if (!is_string($pattern)) {
            return false;
        }
        $pattern = trim($pattern);
        if ($pattern === '') {
            return false;
        }

        // Already delimited: first char is a non-alphanumeric delimiter with a
        // matching closing delimiter (optionally followed by flags).
        $delim = $pattern[0];
        $isDelimited = !ctype_alnum($delim) && $delim !== '\\'
            && preg_match('/' . preg_quote($delim, '/') . '[a-zA-Z]*$/', substr($pattern, 1)) === 1;

        $regex = $isDelimited ? $pattern : '~' . $pattern . '~i';

        return @preg_match($regex, $subject) === 1;
    }

    /**
     * Pick a single ProductRange from candidates that all matched a model, using
     * the discovered version to guess the right platform when several remain
     * (e.g., "5520 (Fabric Engine)" vs "5520 (Switch Engine)").
     *
     * @param ProductRange[] $candidates
     */
    private function disambiguate(array $candidates, ?string $version): ?ProductRange
    {
        if (count($candidates) === 1) {
            return $candidates[0];
        }

        if (count($candidates) > 1 && $version) {
            foreach ($candidates as $range) {
                $recommended = $range->getRecommendedVersion();
                if (!$recommended) continue;

                // Compare major version to guess the right platform
                $vMajor = (int) explode('.', $version)[0];
                $rMajor = (int) explode('.', $recommended)[0];

                // Fabric Engine uses 7.x-9.x, Switch Engine/EXOS uses 30.x+
                if (abs($vMajor - $rMajor) <= 5) {
                    return $range;
                }
            }

            // Fallback: return first candidate
            return $candidates[0];
        }

        return $candidates[0] ?? null;
    }
}
