<?php

namespace Auditix\Plugin\ExtremeNetworksLifecycle;

use App\Entity\Context;
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
    ProvidesLifecycleData
{
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

    public function fetchLifecycleData(Context $context, array $config = []): array
    {
        return $this->scraper->scrapeLifecycleData();
    }
}
