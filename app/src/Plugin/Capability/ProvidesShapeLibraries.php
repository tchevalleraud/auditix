<?php

namespace App\Plugin\Capability;

interface ProvidesShapeLibraries
{
    /**
     * Read-only shape libraries (stencils) created in the context at activation.
     * Each library is tagged managed_by_plugin = identifier and is purged when
     * the plugin is disabled. Idempotent.
     *
     * @return ShapeLibraryTemplate[]
     */
    public function provideShapeLibraries(): array;
}
