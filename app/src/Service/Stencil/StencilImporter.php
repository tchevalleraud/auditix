<?php

namespace App\Service\Stencil;

/**
 * Dispatches a stencil file to the right importer based on its extension / mime.
 */
class StencilImporter
{
    public function __construct(
        private readonly SvgStencilImporter $svg,
        private readonly VisioStencilImporter $visio,
    ) {}

    /**
     * @return StencilItemSpec[]
     */
    public function import(string $path, string $originalName, string $mime): array
    {
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

        if ($ext === 'svg' || $mime === 'image/svg+xml') {
            return $this->svg->import($path, $originalName);
        }
        if (in_array($ext, ['vssx', 'vsdx', 'vstx'], true)) {
            return $this->visio->import($path, $originalName);
        }
        if ($ext === 'vss') {
            throw new \RuntimeException('Le format Visio .vss (binaire, ancienne génération) n\'est pas supporté. Ré-enregistrez-le en .vssx depuis Visio.');
        }
        throw new \RuntimeException('Format de stencil non supporté : ' . ($ext !== '' ? '.' . $ext : $mime));
    }

    public function libraryNameFor(string $originalName): string
    {
        return pathinfo($originalName, PATHINFO_FILENAME) ?: 'Stencil importé';
    }
}
