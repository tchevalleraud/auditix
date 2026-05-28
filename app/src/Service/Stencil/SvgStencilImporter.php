<?php

namespace App\Service\Stencil;

/**
 * Imports a single SVG file as one stencil item. The SVG is embedded as a data
 * URL (matching how user-uploaded images are stored) and used as-is for the
 * palette thumbnail.
 */
class SvgStencilImporter
{
    /**
     * @return StencilItemSpec[]
     */
    public function import(string $path, string $originalName): array
    {
        $svg = @file_get_contents($path);
        if ($svg === false || trim($svg) === '') {
            throw new \RuntimeException('Fichier SVG vide ou illisible.');
        }
        [$w, $h] = $this->dimensions($svg);
        $name = pathinfo($originalName, PATHINFO_FILENAME) ?: 'Forme';
        $dataUrl = 'data:image/svg+xml;base64,' . base64_encode($svg);

        return [new StencilItemSpec($name, null, $dataUrl, $svg, $w, $h)];
    }

    /**
     * @return array{0: float, 1: float}
     */
    private function dimensions(string $svg): array
    {
        if (preg_match('/viewBox\s*=\s*"[\d.\-]+\s+[\d.\-]+\s+([\d.]+)\s+([\d.]+)"/i', $svg, $m)) {
            return [max(1.0, (float)$m[1]), max(1.0, (float)$m[2])];
        }
        $w = preg_match('/\bwidth\s*=\s*"([\d.]+)/i', $svg, $mw) ? (float)$mw[1] : 0.0;
        $h = preg_match('/\bheight\s*=\s*"([\d.]+)/i', $svg, $mh) ? (float)$mh[1] : 0.0;
        if ($w > 0 && $h > 0) {
            return [$w, $h];
        }
        return [120.0, 120.0];
    }
}
