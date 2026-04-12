<?php

namespace App\Plugin;

use Symfony\Component\DependencyInjection\Attribute\TaggedIterator;

class VendorPluginRegistry
{
    /** @var array<string, VendorPluginInterface> */
    private array $plugins = [];

    public function __construct(
        #[TaggedIterator('app.vendor_plugin')]
        iterable $plugins,
    ) {
        foreach ($plugins as $plugin) {
            $this->plugins[$plugin->getIdentifier()] = $plugin;
        }
    }

    public function get(string $identifier): ?VendorPluginInterface
    {
        return $this->plugins[$identifier] ?? null;
    }

    /**
     * @return array<string, VendorPluginInterface>
     */
    public function all(): array
    {
        return $this->plugins;
    }

    /**
     * Find plugins that support a given manufacturer name.
     *
     * @return VendorPluginInterface[]
     */
    public function getForManufacturer(string $name): array
    {
        $result = [];
        foreach ($this->plugins as $plugin) {
            foreach ($plugin->getSupportedManufacturers() as $supported) {
                if (strcasecmp($supported, $name) === 0) {
                    $result[] = $plugin;
                    break;
                }
            }
        }
        return $result;
    }
}
