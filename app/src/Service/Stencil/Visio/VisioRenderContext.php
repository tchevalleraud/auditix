<?php

namespace App\Service\Stencil\Visio;

use App\Service\Stencil\StencilItemSpec;

/**
 * Immutable bundle of everything {@see VisioShapeRenderer} needs to resolve the
 * external references of a shape subtree: the open archive, the base folder used
 * to resolve relationship targets, the relId→target map of the owning part, the
 * pre-rendered masters (for instances that inherit their art) and the batch of
 * EMF/WMF media already converted to SVG.
 */
final class VisioRenderContext
{
    /**
     * @param array<string, string>         $rels        relId => relationship Target
     * @param array<string, StencilItemSpec> $masterSvgs masterId => rendered master (inheritance)
     * @param array<string, string|null>    $convertedEmf mediaPath => SVG markup
     */
    public function __construct(
        public readonly \ZipArchive $zip,
        public readonly string $mediaBase,
        public readonly array $rels = [],
        public readonly array $masterSvgs = [],
        public readonly array $convertedEmf = [],
        public readonly bool $withText = false,
    ) {}
}
