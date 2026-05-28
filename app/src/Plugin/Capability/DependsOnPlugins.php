<?php

namespace App\Plugin\Capability;

/**
 * Déclare une dépendance d'activation envers d'autres plugins.
 *
 * Un plugin implémentant cette capability ne peut être activé dans un contexte
 * que si tous les plugins listés y sont eux-mêmes activés. Symétriquement, un
 * plugin requis ne peut être désactivé tant qu'un plugin dépendant reste actif.
 */
interface DependsOnPlugins
{
    /**
     * Identifiants des plugins devant être activés (dans le même contexte) pour
     * que ce plugin puisse l'être.
     *
     * @return string[]
     */
    public function getRequiredPlugins(): array;
}
