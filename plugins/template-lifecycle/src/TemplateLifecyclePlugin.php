<?php

namespace Auditix\Plugin\TemplateLifecycle;

use App\Entity\Context;
use App\Plugin\Capability\ProvidesConfigurationSchema;
use App\Plugin\Capability\ProvidesLifecycleData;
use App\Plugin\LifecycleData;
use App\Plugin\VendorPluginInterface;

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PLUGIN TEMPLATE #2 — LIFECYCLE                                           ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * LEARNING GOAL
 * -------------
 * Show how a plugin provides LIFECYCLE data for product ranges: recommended
 * version, current version, and the key dates (release / End of Sale /
 * End of Support / End of Life).
 *
 * This data feeds the context's ProductRange entities and powers Auditix's
 * "System Updates" score (an EoL/EoSupport device lowers the grade). Range ⇄
 * device matching is done via `modelPatterns`: regular expressions tested
 * against the discovered model on each node.
 *
 * DIFFERENCE WITH THE OTHER CAPABILITIES
 * --------------------------------------
 * Unlike ProvidesManufacturers/Commands/Rules (imported once on activation by
 * PluginAssetsImporter), the lifecycle capability is SYNCHRONIZED periodically:
 * Auditix calls fetchLifecycleData() again at the chosen interval. That is why a
 * real plugin often makes a network call here (scraping/API). Here everything is
 * static to stay deterministic and educational.
 *
 * GOLDEN RULE: fetchLifecycleData() must NEVER write to the database. It only
 * returns LifecycleData objects; Auditix persists them.
 */
final class TemplateLifecyclePlugin implements
    VendorPluginInterface,
    ProvidesLifecycleData,
    ProvidesConfigurationSchema
{
    /**
     * "Scrapable" ranges exposed in the config: technical key ⇄ UI label.
     * A real plugin would map these keys to URLs/endpoints to query.
     */
    private const RANGE_OPTIONS = [
        'demo_core'   => 'DemoOS — Core range',
        'demo_access' => 'DemoOS — Access range',
    ];

    // ── Plugin identity ──────────────────────────────────────────────────────

    public function getIdentifier(): string  { return 'template-lifecycle'; }
    public function getVersion(): string      { return '1.0.0'; }
    public function getDisplayName(): string  { return 'Template — Lifecycle'; }
    public function getDescription(): string  { return 'Educational example: static EoS / EoSupport / EoL dates.'; }
    public function getSupportedManufacturers(): array { return ['DemoVendor']; }

    // ── Capability: configuration page ────────────────────────────────────────
    // The special `sync_interval` field (in seconds) controls how often Auditix
    // calls fetchLifecycleData() again. 0 = manual only.

    public function getConfigurationSchema(): array
    {
        return [
            'fields' => [
                [
                    'name'    => 'sync_interval',
                    'type'    => 'select',
                    'label'   => 'Synchronization interval',
                    'help'    => 'How often lifecycle dates are fetched automatically.',
                    'default' => 604800, // 7 days
                    'options' => [
                        ['value' => 0,       'label' => 'Manual only'],
                        ['value' => 86400,   'label' => 'Daily'],
                        ['value' => 604800,  'label' => 'Weekly'],
                        ['value' => 2592000, 'label' => 'Monthly'],
                    ],
                ],
                [
                    'name'    => 'ranges',
                    'type'    => 'multiselect',
                    'label'   => 'Ranges to synchronize',
                    'help'    => 'Limit fetching to the selected ranges.',
                    'default' => array_keys(self::RANGE_OPTIONS),
                    'options' => array_map(
                        fn (string $value, string $label) => ['value' => $value, 'label' => $label],
                        array_keys(self::RANGE_OPTIONS),
                        array_values(self::RANGE_OPTIONS),
                    ),
                ],
            ],
        ];
    }

    // ── Capability: lifecycle data ─────────────────────────────────────────────

    /**
     * @param array<string,mixed> $config Values entered in the config page.
     * @return LifecycleData[]
     */
    public function fetchLifecycleData(Context $context, array $config = []): array
    {
        // Honor the range selection made by the user.
        $ranges = $config['ranges'] ?? array_keys(self::RANGE_OPTIONS);
        if (!is_array($ranges) || $ranges === []) {
            $ranges = array_keys(self::RANGE_OPTIONS);
        }

        // Static lifecycle catalog, indexed by range key.
        // A real plugin would build this array from a scraping/API call.
        $catalog = [
            'demo_core' => new LifecycleData(
                productRangeName: 'DemoOS Core',
                recommendedVersion: '12.4.2',
                currentVersion: '12.4.2',
                // A \DateTimeImmutable is expected for each date (or null if unknown).
                releaseDate:      new \DateTimeImmutable('2023-01-15'),
                endOfSaleDate:    new \DateTimeImmutable('2026-01-15'),
                endOfSupportDate: new \DateTimeImmutable('2028-01-15'),
                endOfLifeDate:    new \DateTimeImmutable('2029-01-15'),
                // Regex tested against the discovered model on nodes to attach
                // the device to this range.
                modelPatterns: ['/^DemoOS\b/i', '/Core/i'],
            ),
            'demo_access' => new LifecycleData(
                productRangeName: 'DemoOS Access',
                recommendedVersion: '8.1.0',
                currentVersion: '8.1.0',
                releaseDate:      new \DateTimeImmutable('2021-06-01'),
                endOfSaleDate:    new \DateTimeImmutable('2024-06-01'),
                endOfSupportDate: new \DateTimeImmutable('2025-06-01'), // already past → impacts the score
                endOfLifeDate:    new \DateTimeImmutable('2026-06-01'),
                modelPatterns: ['/^DemoOS Lite\b/i', '/Access/i'],
            ),
        ];

        // Return only the requested ranges.
        $result = [];
        foreach ($ranges as $key) {
            if (isset($catalog[$key])) {
                $result[] = $catalog[$key];
            }
        }

        return $result;
    }
}
