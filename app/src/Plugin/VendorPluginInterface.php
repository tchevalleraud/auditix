<?php

namespace App\Plugin;

/**
 * Interface de base d'un Vendor Plugin.
 *
 * Toutes les fonctionnalités étendues (lifecycle, commandes, règles, page de config)
 * sont exposées via des interfaces séparées dans App\Plugin\Capability\.
 * Un plugin n'implémente que les capabilities qu'il fournit.
 */
interface VendorPluginInterface
{
    /**
     * Identifiant unique du plugin (kebab-case, [a-z0-9-]+).
     */
    public function getIdentifier(): string;

    /**
     * Version sémantique du plugin (semver).
     */
    public function getVersion(): string;

    /**
     * Nom lisible affiché dans l'UI.
     */
    public function getDisplayName(): string;

    /**
     * Description courte affichée dans l'UI.
     */
    public function getDescription(): string;

    /**
     * Noms d'éditeurs (manufacturer) couverts par ce plugin (matching auto avec Editor.name).
     *
     * @return string[]
     */
    public function getSupportedManufacturers(): array;
}
