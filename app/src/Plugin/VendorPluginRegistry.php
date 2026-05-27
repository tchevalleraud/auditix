<?php

namespace App\Plugin;

use Symfony\Component\DependencyInjection\Attribute\TaggedIterator;

/**
 * Registre central des Vendor Plugins.
 *
 * Deux sources alimentent ce registre :
 *  1. Plugins statiques : services Symfony taggés `app.vendor_plugin` (TaggedIterator).
 *  2. Plugins dynamiques : enregistrés au runtime par DynamicPluginLoader
 *     (chargés depuis data/plugins/ au boot du kernel).
 *
 * Les plugins dynamiques peuvent écraser un plugin statique du même identifiant
 * (permet de surcharger ExtremeNetworksPlugin par une version uploadée).
 */
class VendorPluginRegistry
{
    /** @var array<string, VendorPluginInterface> */
    private array $plugins = [];

    public function __construct(
        #[TaggedIterator('app.vendor_plugin')]
        iterable $staticPlugins,
    ) {
        foreach ($staticPlugins as $plugin) {
            $this->plugins[$plugin->getIdentifier()] = $plugin;
        }
    }

    /**
     * Enregistre un plugin chargé dynamiquement. Écrase un éventuel plugin
     * statique du même identifiant.
     */
    public function register(VendorPluginInterface $plugin): void
    {
        $this->plugins[$plugin->getIdentifier()] = $plugin;
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
     * Retourne les plugins implémentant une capability donnée.
     *
     * @template T of object
     * @param class-string<T> $capabilityClass
     * @return array<string, VendorPluginInterface&T>
     */
    public function getByCapability(string $capabilityClass): array
    {
        $result = [];
        foreach ($this->plugins as $id => $plugin) {
            if ($plugin instanceof $capabilityClass) {
                $result[$id] = $plugin;
            }
        }
        /** @var array<string, VendorPluginInterface&T> $result */
        return $result;
    }

    /**
     * Plugins supportant un fabricant (matching insensible à la casse sur Editor.name).
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
