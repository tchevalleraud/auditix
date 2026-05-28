<?php

namespace App\Service\Stencil;

/**
 * Normalised result of parsing one shape out of a stencil file. The controller
 * turns each spec into a ShapeLibraryItem: `dataUrl` becomes a single image
 * element payload, `previewSvg` is shown as the palette thumbnail.
 */
final class StencilItemSpec
{
    public function __construct(
        public readonly string $name,
        public readonly ?string $keywords,
        public readonly string $dataUrl,
        public readonly ?string $previewSvg,
        public readonly float $width,
        public readonly float $height,
    ) {}
}
