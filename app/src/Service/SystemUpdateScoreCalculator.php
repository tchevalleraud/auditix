<?php

namespace App\Service;

use App\Entity\Node;
use App\Entity\ProductRange;
use Doctrine\ORM\EntityManagerInterface;

class SystemUpdateScoreCalculator
{
    public function __construct(
        private readonly EntityManagerInterface $em,
    ) {}

    /**
     * Calculate the system-update sub-score for a node based on its
     * product range lifecycle data (version currency + lifecycle dates).
     *
     * @return array{grade: string, score: float, details: array}
     */
    public function calculateForNode(Node $node): array
    {
        $productRange = $this->findProductRange($node);

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
            $node->getDiscoveredVersion(),
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
        $details['discoveredVersion'] = $node->getDiscoveredVersion();

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
     * Find the matching ProductRange for a node using its productModel field.
     * Matches against ProductRange name prefix or disambiguates by version.
     * Public so controllers can also resolve the product range for display.
     */
    public function findProductRange(Node $node): ?ProductRange
    {
        $productModel = $node->getProductModel();
        if (!$productModel) return null;

        $context = $node->getContext();
        $ranges = $this->em->getRepository(ProductRange::class)->findBy(['context' => $context]);

        // First try: exact name match (e.g., productModel = "5520 (Fabric Engine)")
        foreach ($ranges as $range) {
            if (strcasecmp($range->getName(), $productModel) === 0) {
                return $range;
            }
        }

        // Second try: match productModel against the range name prefix
        // e.g., productModel = "5520-24T" should match "5520 (Fabric Engine)"
        // We pick the best match by checking which range name starts with the product model's base
        $candidates = [];
        foreach ($ranges as $range) {
            $rangeName = $range->getName();
            // Extract hardware part from range name: "5520 (Fabric Engine)" → "5520"
            $hwPart = preg_replace('/\s*\(.*$/', '', $rangeName);

            if (stripos($productModel, $hwPart) !== false) {
                $candidates[] = $range;
            }
        }

        if (count($candidates) === 1) {
            return $candidates[0];
        }

        // Multiple candidates (e.g., "5520 (Fabric Engine)" and "5520 (Switch Engine)")
        // Try to disambiguate using the discovered version
        if (count($candidates) > 1 && $node->getDiscoveredVersion()) {
            $version = $node->getDiscoveredVersion();
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
