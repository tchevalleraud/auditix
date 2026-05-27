<?php

namespace App\Plugin\Capability;

interface ProvidesCommands
{
    /**
     * Templates de commandes que ce plugin propose d'installer dans un contexte.
     * Appelé à l'activation du plugin. Idempotent : aucun effet de bord attendu.
     *
     * @return CommandTemplate[]
     */
    public function provideCommands(): array;
}
