<?php

namespace App\Plugin\Capability;

interface ProvidesExtractionRules
{
    /**
     * Templates de règles d'extraction que ce plugin propose d'installer dans un contexte.
     * Appelé à l'activation du plugin. Idempotent : aucun effet de bord attendu.
     *
     * @return RuleTemplate[]
     */
    public function provideRules(): array;
}
