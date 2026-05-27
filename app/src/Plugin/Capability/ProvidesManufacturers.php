<?php

namespace App\Plugin\Capability;

interface ProvidesManufacturers
{
    /**
     * Templates de manufacturers (Editor) à créer dans le contexte à l'activation.
     * Si un Editor du même nom (managed_by_plugin = identifier) existe déjà,
     * il est réutilisé. Idempotent.
     *
     * @return ManufacturerTemplate[]
     */
    public function provideManufacturers(): array;
}
