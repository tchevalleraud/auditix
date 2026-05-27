<?php

namespace App\Plugin\Capability;

interface ProvidesConfigurationSchema
{
    /**
     * Schéma simplifié décrivant les champs de configuration du plugin.
     * Rendu dynamiquement par le frontend (form generator).
     *
     * Format attendu :
     *   ['fields' => [
     *       ['name' => 'api_key', 'type' => 'password', 'label' => '...', 'required' => true, 'default' => null],
     *       ['name' => 'region', 'type' => 'select', 'options' => [['value' => 'eu', 'label' => 'Europe']], 'default' => 'eu'],
     *   ]]
     *
     * Types supportés : text, password, number, boolean, select, textarea.
     */
    public function getConfigurationSchema(): array;
}
