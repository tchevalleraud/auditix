<?php

namespace App\Plugin\Capability;

final class ReportThemeTemplate
{
    /**
     * @param string $name        Nom du thème affiché dans l'UI.
     * @param string $description  Description courte (optionnelle).
     * @param array  $styles       Bloc de styles complet (cf. ReportTheme::DEFAULT_STYLES).
     *                             Laisser vide ([]) pour repartir des styles par défaut.
     * @param bool   $isDefault    true => proposé comme thème par défaut du contexte.
     */
    public function __construct(
        public readonly string $name,
        public readonly string $description = '',
        public readonly array $styles = [],
        public readonly bool $isDefault = false,
    ) {}
}
