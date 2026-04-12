<?php

namespace App\Plugin\Vendor;

use App\Entity\Context;
use App\Plugin\LifecycleData;
use App\Plugin\VendorPluginInterface;

class ExtremeNetworksPlugin implements VendorPluginInterface
{
    public function __construct(
        private readonly ExtremeNetworksScraper $scraper,
    ) {}

    public function getIdentifier(): string
    {
        return 'extreme_networks';
    }

    public function getDisplayName(): string
    {
        return 'Extreme Networks';
    }

    public function getSupportedManufacturers(): array
    {
        return ['Extreme Networks', 'Extreme'];
    }

    public function fetchLifecycleData(Context $context, array $config = []): array
    {
        return $this->scraper->scrapeLifecycleData();
    }

    public function getConfigurationSchema(): array
    {
        return [];
    }
}
