<?php

namespace App\Plugin;

use App\Entity\Context;

interface VendorPluginInterface
{
    /**
     * Unique identifier, e.g. "extreme_networks".
     */
    public function getIdentifier(): string;

    /**
     * Human-readable name, e.g. "Extreme Networks".
     */
    public function getDisplayName(): string;

    /**
     * Manufacturer names this plugin can handle (used for auto-matching).
     *
     * @return string[]
     */
    public function getSupportedManufacturers(): array;

    /**
     * Fetch lifecycle data for product ranges from vendor sources.
     *
     * @return LifecycleData[]
     */
    public function fetchLifecycleData(Context $context, array $config = []): array;

    /**
     * JSON-schema-like array describing the configuration fields this plugin expects.
     */
    public function getConfigurationSchema(): array;
}
