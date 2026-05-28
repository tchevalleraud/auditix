<?php

namespace Auditix\Plugin\ExtremeNetworksLifecycle;

use App\Entity\Context;
use App\Plugin\Capability\ProvidesConfigurationSchema;
use App\Plugin\Capability\ProvidesLifecycleData;
use App\Plugin\VendorPluginInterface;
use Symfony\Component\HttpClient\HttpClient;

/**
 * Plugin lifecycle Extreme Networks : scrape les pages de compatibilité et les
 * bulletins PDF pour alimenter les ProductRange avec les dates EoS / EoSupport / EoL.
 *
 * Plugin séparé (catalogue ⇄ lifecycle) — le user peut installer l'un sans l'autre.
 */
final class ExtremeNetworksLifecyclePlugin implements
    VendorPluginInterface,
    ProvidesLifecycleData,
    ProvidesConfigurationSchema
{
    /** Gammes scrapables — clé technique ⇄ libellé affiché. */
    private const RANGE_OPTIONS = [
        'switch_engine' => 'Switch Engine / EXOS',
        'fabric_engine' => 'Fabric Engine / VOSS',
        'ers'           => 'ERS',
    ];

    private readonly Scraper $scraper;

    public function __construct()
    {
        $this->scraper = new Scraper(HttpClient::create());
    }

    public function getIdentifier(): string { return 'extreme-networks-lifecycle'; }
    public function getVersion(): string    { return '1.0.0'; }
    public function getDisplayName(): string { return 'Extreme Networks — Lifecycle'; }
    public function getDescription(): string { return 'Scrape les dates EoS / EoSupport / EoL pour les équipements Extreme Networks.'; }
    public function getSupportedManufacturers(): array { return ['Extreme Networks', 'Extreme']; }

    public function getConfigurationSchema(): array
    {
        return [
            'fields' => [
                [
                    'name' => 'sync_interval',
                    'type' => 'select',
                    'label' => 'Intervalle de synchronisation',
                    'help' => 'Fréquence de récupération automatique des dates de cycle de vie.',
                    'default' => 604800,
                    'options' => [
                        ['value' => 0,       'label' => 'Manuel uniquement'],
                        ['value' => 86400,   'label' => 'Quotidien'],
                        ['value' => 604800,  'label' => 'Hebdomadaire'],
                        ['value' => 2592000, 'label' => 'Mensuel'],
                    ],
                ],
                [
                    'name' => 'ranges',
                    'type' => 'multiselect',
                    'label' => 'Gammes à synchroniser',
                    'help' => 'Limite le scraping aux gammes sélectionnées.',
                    'default' => array_keys(self::RANGE_OPTIONS),
                    'options' => array_map(
                        fn(string $value, string $label) => ['value' => $value, 'label' => $label],
                        array_keys(self::RANGE_OPTIONS),
                        array_values(self::RANGE_OPTIONS),
                    ),
                ],
            ],
        ];
    }

    public function fetchLifecycleData(Context $context, array $config = []): array
    {
        $ranges = $config['ranges'] ?? array_keys(self::RANGE_OPTIONS);
        if (!is_array($ranges) || $ranges === []) {
            $ranges = array_keys(self::RANGE_OPTIONS);
        }

        return $this->scraper->scrapeLifecycleData($ranges);
    }
}
