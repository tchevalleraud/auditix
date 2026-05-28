<?php

namespace App\Service;

use App\Entity\ShapeLibraryItem;

/**
 * Builds ShapeLibraryItem records from element bundles. Centralises preview
 * (thumbnail) generation so libraries created from a canvas selection, from an
 * uploaded image and from a vendor plugin all render previews the same way —
 * through the shared SVG renderer.
 */
class ShapeLibraryItemFactory
{
    public function __construct(private readonly ReportSchemaSvgRenderer $renderer) {}

    /**
     * @param array<int, array<string, mixed>> $payload elements normalised to origin (0,0)
     */
    public function build(string $name, ?string $keywords, array $payload, float $width, float $height): ShapeLibraryItem
    {
        $item = new ShapeLibraryItem();
        $item->setName($name !== '' ? $name : 'Forme');
        $item->setKeywords($keywords !== '' ? $keywords : null);
        $item->setPayload($payload);
        $item->setWidth($width);
        $item->setHeight($height);
        $item->setPreviewSvg($this->renderPreview($payload, $width, $height));
        return $item;
    }

    /**
     * @param array<int, array<string, mixed>> $payload
     */
    public function renderPreview(array $payload, float $width, float $height): ?string
    {
        if (empty($payload)) {
            return null;
        }
        $w = max(1.0, $width);
        $h = max(1.0, $height);
        try {
            return $this->renderer->renderElements($payload, ['width' => $w, 'height' => $h], [
                'canvasWidth' => 256,
                'viewportFrame' => ['x' => 0, 'y' => 0, 'width' => $w, 'height' => $h],
            ]);
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * Wrap an image (data URL or served URL) into a single-element payload.
     *
     * @return array<int, array<string, mixed>>
     */
    public function imagePayload(string $url, float $width, float $height): array
    {
        return [[
            'id' => 'img-0',
            'kind' => 'image',
            'url' => $url,
            'x' => 0,
            'y' => 0,
            'width' => $width,
            'height' => $height,
            'rotation' => 0,
            'zIndex' => 1,
            'opacity' => 1,
        ]];
    }
}
