<?php

namespace App\Plugin\Capability;

final class ShapeLibraryItemTemplate
{
    /**
     * A shape provided by a plugin. Supply EITHER a ready-made element bundle
     * (`payload`) OR an `svgPath` relative to the plugin archive — the importer
     * reads the SVG, embeds it as an image element and uses it as the thumbnail.
     *
     * @param array<int, array<string, mixed>> $payload element bundle (origin 0,0)
     * @param string|null $svgPath relative path to an SVG inside the plugin archive
     */
    public function __construct(
        public readonly string $name,
        public readonly ?string $keywords = null,
        public readonly array $payload = [],
        public readonly ?string $svgPath = null,
        public readonly float $width = 0,
        public readonly float $height = 0,
    ) {}
}
