<?php

namespace App\Service\Stencil\Visio;

use Psr\Log\LoggerInterface;

/**
 * Renders a Visio shape subtree (a master's shapes, or a single drawing shape
 * with all of its descendants) to a standalone SVG. Shared by the stencil
 * import (one SVG per master) and the drawing import (one SVG per top-level
 * page shape).
 *
 * Coordinate model: Visio uses inches with a bottom-left origin (Y up). The SVG
 * root applies matrix(96 0 0 -96 …) once so the tree is drawn in Visio inches
 * (Y up); each shape is placed with a nested <g transform> built from its
 * Pin / LocPin / Angle / Flip cells, recursive to any depth.
 *
 * Per shape, in priority order: own Geometry sections → own ForeignData image →
 * (for a pure master instance with none of its own content) the inherited master
 * art → child shapes. Text blocks are rendered last when the context asks for it.
 */
final class VisioShapeRenderer
{
    private const INCH_PX = 96.0;

    private readonly ColorResolver $colors;
    private readonly GeometryConverter $geometry;

    public function __construct(private readonly LoggerInterface $logger)
    {
        $this->colors = new ColorResolver();
        $this->geometry = new GeometryConverter($logger);
    }

    /**
     * Render the given top-level shapes into one standalone SVG sized to their
     * combined bounding box.
     *
     * @param \DOMElement[] $shapes
     * @return array{svg: string, dataUrl: string, width: float, height: float, minX: float, minY: float}|null
     */
    public function renderShapesToSvg(\DOMXPath $xp, array $shapes, VisioRenderContext $ctx): ?array
    {
        if ($shapes === []) {
            return null;
        }

        [$minX, $minY, $W, $H] = $this->extent($xp, $shapes, $ctx);

        $hasContent = false;
        $body = '';
        foreach ($shapes as $shape) {
            $body .= $this->renderShape($xp, $shape, $ctx, $hasContent);
        }
        if (!$hasContent || $body === '') {
            return null;
        }

        $pxW = max(1.0, $W * self::INCH_PX);
        $pxH = max(1.0, $H * self::INCH_PX);
        $e = -self::INCH_PX * $minX;
        $f = self::INCH_PX * ($minY + $H);
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
            . 'viewBox="0 0 ' . $this->n($pxW) . ' ' . $this->n($pxH) . '" '
            . 'width="' . $this->n($pxW) . '" height="' . $this->n($pxH) . '">'
            . '<g transform="matrix(' . self::INCH_PX . ' 0 0 ' . (-self::INCH_PX) . ' ' . $this->n($e) . ' ' . $this->n($f) . ')">'
            . $body
            . '</g></svg>';

        return [
            'svg' => $svg,
            'dataUrl' => 'data:image/svg+xml;base64,' . base64_encode($svg),
            'width' => $pxW,
            'height' => $pxH,
            'minX' => $minX,
            'minY' => $minY,
        ];
    }

    /**
     * @param \DOMElement[] $shapes
     * @return array{0: float, 1: float, 2: float, 3: float} minX, minY, width, height (inches)
     */
    private function extent(\DOMXPath $xp, array $shapes, VisioRenderContext $ctx): array
    {
        $minX = INF; $minY = INF; $maxX = -INF; $maxY = -INF;
        foreach ($shapes as $shape) {
            [$w, $h] = $this->shapeSize($xp, $shape, $ctx);
            $pinX = (float) ($this->cell($xp, $shape, 'PinX') ?? 0);
            $pinY = (float) ($this->cell($xp, $shape, 'PinY') ?? 0);
            $locX = (float) ($this->cell($xp, $shape, 'LocPinX') ?? $w / 2);
            $locY = (float) ($this->cell($xp, $shape, 'LocPinY') ?? $h / 2);
            $x0 = $pinX - $locX; $y0 = $pinY - $locY;
            $minX = min($minX, $x0); $minY = min($minY, $y0);
            $maxX = max($maxX, $x0 + $w); $maxY = max($maxY, $y0 + $h);
        }
        if (!is_finite($minX) || $maxX <= $minX || $maxY <= $minY) {
            return [0.0, 0.0, 1.0, 1.0];
        }
        return [$minX, $minY, $maxX - $minX, $maxY - $minY];
    }

    /**
     * Width/Height in inches, falling back to the referenced master's intrinsic
     * size when the instance inherits its dimensions (no inline Width/Height).
     *
     * @return array{0: float, 1: float}
     */
    private function shapeSize(\DOMXPath $xp, \DOMElement $shape, VisioRenderContext $ctx): array
    {
        $w = (float) ($this->cell($xp, $shape, 'Width') ?? 0);
        $h = (float) ($this->cell($xp, $shape, 'Height') ?? 0);
        if ($w <= 0 || $h <= 0) {
            $masterId = $shape->getAttribute('Master');
            $spec = $masterId !== '' ? ($ctx->masterSvgs[$masterId] ?? null) : null;
            if ($spec !== null) {
                if ($w <= 0) { $w = $spec->width / self::INCH_PX; }
                if ($h <= 0) { $h = $spec->height / self::INCH_PX; }
            }
        }
        return [$w, $h];
    }

    private function renderShape(\DOMXPath $xp, \DOMElement $shape, VisioRenderContext $ctx, bool &$hasContent): string
    {
        [$w, $h] = $this->shapeSize($xp, $shape, $ctx);
        $pinX = (float) ($this->cell($xp, $shape, 'PinX') ?? 0);
        $pinY = (float) ($this->cell($xp, $shape, 'PinY') ?? 0);
        $locX = (float) ($this->cell($xp, $shape, 'LocPinX') ?? $w / 2);
        $locY = (float) ($this->cell($xp, $shape, 'LocPinY') ?? $h / 2);
        $angle = (float) ($this->cell($xp, $shape, 'Angle') ?? 0);
        $flipX = trim((string) ($this->cell($xp, $shape, 'FlipX') ?? '0')) === '1';
        $flipY = trim((string) ($this->cell($xp, $shape, 'FlipY') ?? '0')) === '1';

        $transform = Transform::forShape($pinX, $pinY, $locX, $locY, $angle, $flipX, $flipY);

        $fill = $this->colors->fill($this->cell($xp, $shape, 'FillForegnd'), $this->cell($xp, $shape, 'FillPattern'));
        $stroke = $this->colors->stroke($this->cell($xp, $shape, 'LineColor'), $this->cell($xp, $shape, 'LinePattern'));
        $dash = $this->colors->dashArray($this->cell($xp, $shape, 'LinePattern'));
        $lw = $this->cell($xp, $shape, 'LineWeight');
        $sw = is_numeric($lw) ? max(0.004, (float) $lw) : 0.01;

        $geometrySections = $xp->query("./*[local-name()='Section'][@N='Geometry']", $shape);
        $hasOwnGeom = $geometrySections !== false && $geometrySections->length > 0;
        $hasForeign = ($fd = $xp->query("./*[local-name()='ForeignData']", $shape)) !== false && $fd->length > 0;
        $subShapes = $xp->query("./*[local-name()='Shapes']/*[local-name()='Shape']", $shape);
        $hasSubs = $subShapes !== false && $subShapes->length > 0;

        $inner = '';

        if ($hasOwnGeom) {
            foreach ($geometrySections as $section) {
                if (!$section instanceof \DOMElement) {
                    continue;
                }
                if (trim((string) $this->sectionCell($xp, $section, 'NoShow')) === '1') {
                    continue;
                }
                $noFill = trim((string) $this->sectionCell($xp, $section, 'NoFill')) === '1';
                $noLine = trim((string) $this->sectionCell($xp, $section, 'NoLine')) === '1';
                $f = $noFill ? 'none' : $fill;
                $s = $noLine ? 'none' : $stroke;

                foreach ($this->geometry->convert($xp, $section, $w, $h) as $prim) {
                    if ($prim[0] === 'path') {
                        [, $d, $closed] = $prim;
                        $fillAttr = ($closed && $f !== 'none') ? $f : 'none';
                        $inner .= '<path d="' . $d . '" fill="' . $fillAttr . '" stroke="' . $s . '" stroke-width="' . $this->n($sw) . '"'
                            . ($dash ? ' stroke-dasharray="' . $dash . '"' : '')
                            . ' stroke-linejoin="round" stroke-linecap="round"/>';
                        $hasContent = true;
                    } elseif ($prim[0] === 'ellipse') {
                        [, $cx, $cy, $rx, $ry, $ang] = $prim;
                        $open = abs($ang) > 1e-6 ? '<g transform="rotate(' . $this->n($ang) . ' ' . $this->n($cx) . ' ' . $this->n($cy) . ')">' : '';
                        $close = $open !== '' ? '</g>' : '';
                        $inner .= $open . '<ellipse cx="' . $this->n($cx) . '" cy="' . $this->n($cy) . '" rx="' . $this->n($rx) . '" ry="' . $this->n($ry) . '" fill="' . $f . '" stroke="' . $s . '" stroke-width="' . $this->n($sw) . '"/>' . $close;
                        $hasContent = true;
                    }
                }
            }
        }

        if ($hasForeign) {
            $inner .= $this->renderForeignData($xp, $shape, $w, $h, $ctx, $hasContent);
        }

        // Pure master instance (no own geometry / image / children): inherit the
        // master's already-rendered art, scaled to this instance's box.
        if (!$hasOwnGeom && !$hasForeign && !$hasSubs) {
            $masterId = $shape->getAttribute('Master');
            $spec = $masterId !== '' ? ($ctx->masterSvgs[$masterId] ?? null) : null;
            if ($spec !== null) {
                $inner .= '<g transform="matrix(1 0 0 -1 0 ' . $this->n($h) . ')">'
                    . '<image x="0" y="0" width="' . $this->n($w) . '" height="' . $this->n($h) . '" preserveAspectRatio="none" '
                    . 'xlink:href="' . $spec->dataUrl . '" href="' . $spec->dataUrl . '"/></g>';
                $hasContent = true;
            }
        }

        if ($hasSubs) {
            foreach ($subShapes as $sub) {
                if ($sub instanceof \DOMElement) {
                    $inner .= $this->renderShape($xp, $sub, $ctx, $hasContent);
                }
            }
        }

        if ($ctx->withText) {
            $inner .= $this->renderText($xp, $shape, $w, $h, $hasContent);
        }

        if ($inner === '') {
            return '';
        }
        return $transform !== '' ? '<g transform="' . $transform . '">' . $inner . '</g>' : $inner;
    }

    /**
     * Inline a ForeignData image. Raster (PNG/JPEG/GIF/BMP) is embedded directly;
     * EMF/WMF is embedded from the context's pre-converted SVG batch when present.
     */
    private function renderForeignData(\DOMXPath $xp, \DOMElement $shape, float $w, float $h, VisioRenderContext $ctx, bool &$hasContent): string
    {
        $fdList = $xp->query("./*[local-name()='ForeignData']", $shape);
        if ($fdList === false || $fdList->length === 0) {
            return '';
        }
        $fd = $fdList->item(0);
        if (!$fd instanceof \DOMElement) {
            return '';
        }
        $type = strtolower($fd->getAttribute('ForeignType'));

        $relId = '';
        foreach ($xp->query("./*[local-name()='Rel']", $fd) as $rel) {
            if ($rel instanceof \DOMElement) {
                $relId = $this->relId($rel);
            }
        }
        if ($relId === '' || !isset($ctx->rels[$relId])) {
            return '';
        }
        $mediaPath = $this->resolveMediaPath($ctx->rels[$relId], $ctx->mediaBase);

        if (in_array($type, ['enhmetafile', 'metafile'], true)) {
            $svg = $ctx->convertedEmf[$mediaPath] ?? null;
            if ($svg === null) {
                return '';
            }
            $dataUrl = 'data:image/svg+xml;base64,' . base64_encode($svg);
        } else {
            $bytes = $ctx->zip->getFromName($mediaPath);
            if ($bytes === false) {
                return '';
            }
            $mime = $this->imageMime($bytes);
            if ($mime === null) {
                return '';
            }
            // BMP is uncompressed (multi-MB) and large rasters bloat the schema;
            // transcode/downscale to a compact PNG sized for on-canvas display.
            if ($mime === 'image/bmp' || strlen($bytes) > 256 * 1024) {
                $png = $this->rasterToPng($bytes, $w, $h);
                if ($png !== null) {
                    $bytes = $png;
                    $mime = 'image/png';
                }
            }
            $dataUrl = 'data:' . $mime . ';base64,' . base64_encode($bytes);
        }

        $hasContent = true;
        return '<g transform="matrix(1 0 0 -1 0 ' . $this->n($h) . ')">'
            . '<image x="0" y="0" width="' . $this->n($w) . '" height="' . $this->n($h) . '" preserveAspectRatio="none" '
            . 'xlink:href="' . $dataUrl . '" href="' . $dataUrl . '"/></g>';
    }

    /** Render the shape's text block, centered on its text pin, upright. */
    private function renderText(\DOMXPath $xp, \DOMElement $shape, float $w, float $h, bool &$hasContent): string
    {
        $node = $xp->query("./*[local-name()='Text']", $shape)->item(0);
        if (!$node instanceof \DOMElement) {
            return '';
        }
        $raw = preg_replace('/\s+/u', ' ', $node->textContent ?? '');
        $text = trim((string) $raw);
        if ($text === '') {
            return '';
        }

        $tx = (float) ($this->cell($xp, $shape, 'TxtPinX') ?? $w / 2);
        $ty = (float) ($this->cell($xp, $shape, 'TxtPinY') ?? $h / 2);
        $sizeInch = $this->charSize($xp, $shape);
        $color = $this->charColor($xp, $shape);

        $hasContent = true;
        return '<g transform="translate(' . $this->n($tx) . ' ' . $this->n($ty) . ') scale(1 -1)">'
            . '<text x="0" y="0" font-family="Inter, Arial, sans-serif" font-size="' . $this->n($sizeInch) . '" '
            . 'fill="' . $color . '" text-anchor="middle" dominant-baseline="central">'
            . htmlspecialchars($text, ENT_QUOTES | ENT_XML1, 'UTF-8')
            . '</text></g>';
    }

    /** Character size in inches (Visio stores it in inches), default ≈ 8pt. */
    private function charSize(\DOMXPath $xp, \DOMElement $shape): float
    {
        $rows = $xp->query("./*[local-name()='Section'][@N='Character']/*[local-name()='Row']", $shape);
        if ($rows !== false) {
            foreach ($rows as $row) {
                if ($row instanceof \DOMElement) {
                    $v = $this->cell($xp, $row, 'Size');
                    if ($v !== null && is_numeric($v) && (float) $v > 0) {
                        return (float) $v;
                    }
                }
            }
        }
        return 0.1111; // ~8pt
    }

    private function charColor(\DOMXPath $xp, \DOMElement $shape): string
    {
        $rows = $xp->query("./*[local-name()='Section'][@N='Character']/*[local-name()='Row']", $shape);
        if ($rows !== false) {
            foreach ($rows as $row) {
                if ($row instanceof \DOMElement) {
                    $v = $this->cell($xp, $row, 'Color');
                    if (is_string($v) && preg_match('/^#[0-9A-Fa-f]{6}$/', $v)) {
                        return $v;
                    }
                }
            }
        }
        return '#1f2937';
    }

    private function resolveMediaPath(string $target, string $base): string
    {
        $parts = [];
        foreach (explode('/', rtrim($base, '/') . '/' . $target) as $p) {
            if ($p === '..') {
                array_pop($parts);
            } elseif ($p !== '.' && $p !== '') {
                $parts[] = $p;
            }
        }
        return implode('/', $parts);
    }

    /**
     * Decode a raster blob (incl. BMP) and re-encode it as a PNG no larger than
     * twice its on-canvas display size. Returns null when GD cannot decode it.
     */
    private function rasterToPng(string $bytes, float $wInch, float $hInch): ?string
    {
        if (!function_exists('imagecreatefromstring')) {
            return null;
        }
        $im = @imagecreatefromstring($bytes);
        if ($im === false) {
            return null;
        }
        try {
            $srcW = imagesx($im);
            $srcH = imagesy($im);
            $maxW = max(1, (int) ceil($wInch * self::INCH_PX * 2));
            $maxH = max(1, (int) ceil($hInch * self::INCH_PX * 2));
            if ($srcW > $maxW || $srcH > $maxH) {
                $scale = min($maxW / $srcW, $maxH / $srcH);
                $scaled = imagescale($im, max(1, (int) round($srcW * $scale)), max(1, (int) round($srcH * $scale)));
                if ($scaled !== false) {
                    imagedestroy($im);
                    $im = $scaled;
                }
            }
            ob_start();
            imagepng($im, null, 6);
            $png = ob_get_clean();
            return $png !== false && $png !== '' ? $png : null;
        } finally {
            imagedestroy($im);
        }
    }

    private function imageMime(string $bytes): ?string
    {
        if (str_starts_with($bytes, "\x89PNG")) {
            return 'image/png';
        }
        if (str_starts_with($bytes, "\xFF\xD8\xFF")) {
            return 'image/jpeg';
        }
        if (str_starts_with($bytes, 'GIF8')) {
            return 'image/gif';
        }
        if (str_starts_with($bytes, 'BM')) {
            return 'image/bmp';
        }
        return null; // EMF / WMF / other → handled elsewhere or unsupported
    }

    private function relId(\DOMElement $rel): string
    {
        foreach ($rel->attributes as $a) {
            if ($a->localName === 'id') {
                return $a->value;
            }
        }
        return '';
    }

    private function cell(\DOMXPath $xp, \DOMElement $shape, string $name): ?string
    {
        $nodes = $xp->query("./*[local-name()='Cell'][@N='" . $name . "']", $shape);
        if ($nodes && $nodes->length > 0 && $nodes->item(0) instanceof \DOMElement) {
            return $nodes->item(0)->getAttribute('V');
        }
        return null;
    }

    private function sectionCell(\DOMXPath $xp, \DOMElement $section, string $name): ?string
    {
        $nodes = $xp->query("./*[local-name()='Cell'][@N='" . $name . "']", $section);
        if ($nodes && $nodes->length > 0 && $nodes->item(0) instanceof \DOMElement) {
            return $nodes->item(0)->getAttribute('V');
        }
        return null;
    }

    private function n(float $v): string
    {
        return rtrim(rtrim(number_format($v, 4, '.', ''), '0'), '.');
    }
}
