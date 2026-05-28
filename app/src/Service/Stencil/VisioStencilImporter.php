<?php

namespace App\Service\Stencil;

use App\Service\Stencil\Visio\ColorResolver;
use App\Service\Stencil\Visio\EmfConverter;
use App\Service\Stencil\Visio\GeometryConverter;
use App\Service\Stencil\Visio\Transform;
use Psr\Log\LoggerInterface;

/**
 * Importer for modern Visio stencils (.vssx / .vsdx / .vstx — Open-Packaging-
 * Convention ZIP archives). Each master becomes one standalone SVG.
 *
 * Two rendering paths per master:
 *  - Foreign masters (Type='Foreign', a ForeignData image): vendor icon packs
 *    store their art as an embedded image. Raster (PNG/JPEG/GIF) is embedded
 *    directly; EMF/WMF is converted to SVG with LibreOffice (EmfConverter).
 *  - Vector masters: the Geometry sections are converted to SVG paths.
 *
 * Coordinate model for the geometry path: Visio uses inches with a bottom-left
 * origin (Y up). The SVG root applies matrix(96 0 0 -96 …) once so the tree is
 * drawn in Visio inches (Y up); each shape is placed with a nested <g transform>
 * built from its Pin / LocPin / Angle / Flip cells, recursive to any depth.
 *
 * Best-effort limitations: full theme color resolution (neutral defaults),
 * NURBS/splines (approximated as segments), legacy binary .vss (unsupported).
 */
class VisioStencilImporter
{
    private const INCH_PX = 96.0;

    private readonly ColorResolver $colors;
    private readonly GeometryConverter $geometry;
    private readonly EmfConverter $emf;

    public function __construct(private readonly LoggerInterface $logger)
    {
        $this->colors = new ColorResolver();
        $this->geometry = new GeometryConverter($logger);
        $this->emf = new EmfConverter($logger);
    }

    /**
     * @return StencilItemSpec[]
     */
    public function import(string $path, string $originalName): array
    {
        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) {
            throw new \RuntimeException('Archive Visio illisible (.vssx attendu).');
        }

        try {
            if ($zip->getFromName('visio/masters/masters.xml') === false) {
                throw new \RuntimeException('Aucun master trouvé dans l\'archive Visio.');
            }
            $specs = array_values($this->buildMasterSpecs($zip));
            if ($specs === []) {
                throw new \RuntimeException('Aucune forme exploitable dans ce stencil Visio.');
            }
            return $specs;
        } finally {
            $zip->close();
        }
    }

    /**
     * Render every master of an open Visio archive to a StencilItemSpec, indexed
     * by the master's Visio `ID` attribute. Shared by the stencil import (which
     * discards the keys) and the drawing import (which resolves each page shape's
     * `Master='ID'` reference to its rendered art).
     *
     * @return array<string, StencilItemSpec>
     */
    public function buildMasterSpecs(\ZipArchive $zip): array
    {
        $mastersXml = $zip->getFromName('visio/masters/masters.xml');
        if ($mastersXml === false) {
            return [];
        }
        $relsXml = $zip->getFromName('visio/masters/_rels/masters.xml.rels');
        $relTargets = $relsXml !== false ? $this->parseRels($relsXml) : [];

        // Pass 1 — load each master and detect an embedded foreign image.
        $entries = [];
        $emfBlobs = [];
        foreach ($this->parseMasters($mastersXml) as $master) {
            $target = $relTargets[$master['relId']] ?? null;
            if ($target === null) {
                continue;
            }
            $masterFile = ltrim($target, '/');
            $masterXml = $zip->getFromName('visio/masters/' . $masterFile);
            if ($masterXml === false) {
                continue;
            }
            $masterRels = $this->masterRels($zip, $masterFile);
            $foreign = $this->detectForeign($masterXml, $masterRels);
            $entries[] = ['id' => $master['id'], 'name' => $master['name'], 'xml' => $masterXml, 'masterRels' => $masterRels, 'foreign' => $foreign];

            if ($foreign !== null && in_array($foreign['type'], ['enhmetafile', 'metafile'], true) && $foreign['mediaPath'] !== null) {
                if (!array_key_exists($foreign['mediaPath'], $emfBlobs)) {
                    $bytes = $zip->getFromName($foreign['mediaPath']);
                    if ($bytes !== false) {
                        $emfBlobs[$foreign['mediaPath']] = $bytes;
                    }
                }
            }
        }

        // Pass 2 — batch-convert EMF/WMF in a single LibreOffice invocation.
        $convertedSvg = $this->emf->convertMany($emfBlobs);

        // Pass 3 — build a spec per master, keyed by its Visio ID.
        $specs = [];
        foreach ($entries as $entry) {
            $spec = $this->buildSpec($entry, $convertedSvg, $zip);
            if ($spec !== null && $entry['id'] !== '') {
                $specs[$entry['id']] = $spec;
            }
        }
        return $specs;
    }

    /**
     * @param array{name: string, xml: string, masterRels: array<string,string>, foreign: array<string,mixed>|null} $entry
     * @param array<string, string|null> $convertedSvg
     */
    private function buildSpec(array $entry, array $convertedSvg, \ZipArchive $zip): ?StencilItemSpec
    {
        $name = $entry['name'];
        $foreign = $entry['foreign'];

        if ($foreign !== null) {
            $w = max(0.1, (float) $foreign['w']);
            $h = max(0.1, (float) $foreign['h']);
            $pxW = max(1.0, $w * self::INCH_PX);
            $pxH = max(1.0, $h * self::INCH_PX);
            $type = (string) $foreign['type'];
            $mediaPath = $foreign['mediaPath'];

            // EMF/WMF → converted by LibreOffice.
            if (in_array($type, ['enhmetafile', 'metafile'], true)) {
                $svg = $mediaPath !== null ? ($convertedSvg[$mediaPath] ?? null) : null;
                if ($svg !== null) {
                    $dataUrl = 'data:image/svg+xml;base64,' . base64_encode($svg);
                    return new StencilItemSpec($name, 'visio', $dataUrl, $svg, $pxW, $pxH);
                }
                $this->logger->warning('Visio EMF/WMF master not converted, falling back to geometry', ['name' => $name]);
                // fall through to geometry
            } elseif ($mediaPath !== null) {
                // Raster bitmap embedded directly.
                $bytes = $zip->getFromName($mediaPath);
                if ($bytes !== false) {
                    $mime = $this->imageMime($bytes);
                    if ($mime !== null) {
                        $dataUrl = 'data:' . $mime . ';base64,' . base64_encode($bytes);
                        $preview = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" '
                            . 'viewBox="0 0 ' . $this->n($pxW) . ' ' . $this->n($pxH) . '" width="' . $this->n($pxW) . '" height="' . $this->n($pxH) . '">'
                            . '<image x="0" y="0" width="' . $this->n($pxW) . '" height="' . $this->n($pxH) . '" preserveAspectRatio="xMidYMid meet" '
                            . 'xlink:href="' . $dataUrl . '" href="' . $dataUrl . '"/></svg>';
                        return new StencilItemSpec($name, 'visio', $dataUrl, $preview, $pxW, $pxH);
                    }
                }
                // fall through to geometry
            }
        }

        return $this->buildGeometrySpec($name, $entry['xml'], $entry['masterRels'], $zip);
    }

    /**
     * Detect the first embedded foreign image of a master.
     *
     * @param array<string, string> $masterRels
     * @return array{type: string, mediaPath: string|null, w: float, h: float}|null
     */
    private function detectForeign(string $masterXml, array $masterRels): ?array
    {
        $dom = new \DOMDocument();
        if (!@$dom->loadXML($masterXml)) {
            return null;
        }
        $xp = new \DOMXPath($dom);
        $fdList = $xp->query("(//*[local-name()='ForeignData'])[1]");
        if ($fdList === false || $fdList->length === 0) {
            return null;
        }
        $fd = $fdList->item(0);
        if (!$fd instanceof \DOMElement) {
            return null;
        }
        $type = strtolower($fd->getAttribute('ForeignType'));
        $relId = '';
        foreach ($xp->query("./*[local-name()='Rel']", $fd) as $rel) {
            if ($rel instanceof \DOMElement) {
                $relId = $this->relId($rel);
            }
        }
        $mediaPath = ($relId !== '' && isset($masterRels[$relId])) ? $this->resolveMediaPath($masterRels[$relId]) : null;

        $w = 0.0; $h = 0.0;
        $shape = $fd->parentNode;
        if ($shape instanceof \DOMElement) {
            $w = (float) ($this->cell($xp, $shape, 'Width') ?? 0);
            $h = (float) ($this->cell($xp, $shape, 'Height') ?? 0);
        }
        return ['type' => $type, 'mediaPath' => $mediaPath, 'w' => $w, 'h' => $h];
    }

    /**
     * @param array<string, string> $masterRels
     */
    private function buildGeometrySpec(string $name, string $masterXml, array $masterRels, \ZipArchive $zip): ?StencilItemSpec
    {
        $dom = new \DOMDocument();
        if (!@$dom->loadXML($masterXml)) {
            return null;
        }
        $xp = new \DOMXPath($dom);
        // Only the root <Shapes>'s direct <Shape> children are top-level; nested
        // sub-shapes are handled by renderShape() recursion. A descendant query
        // would render nested shapes twice.
        $topShapes = $xp->query("/*/*[local-name()='Shapes']/*[local-name()='Shape']");
        if ($topShapes === false || $topShapes->length === 0) {
            return null;
        }

        [$minX, $minY, $W, $H] = $this->extent($xp, $topShapes);

        $hasContent = false;
        $body = '';
        foreach ($topShapes as $shape) {
            if ($shape instanceof \DOMElement) {
                $body .= $this->renderShape($xp, $shape, $zip, $masterRels, $hasContent);
            }
        }

        if (!$hasContent || $body === '') {
            $this->logger->warning('Visio master without renderable content', ['name' => $name]);
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

        $dataUrl = 'data:image/svg+xml;base64,' . base64_encode($svg);
        return new StencilItemSpec($name, 'visio', $dataUrl, $svg, $pxW, $pxH);
    }

    /**
     * @return array<int, array{id: string, relId: string, name: string}>
     */
    private function parseMasters(string $xml): array
    {
        $dom = new \DOMDocument();
        if (!@$dom->loadXML($xml)) {
            return [];
        }
        $xp = new \DOMXPath($dom);
        $out = [];
        foreach ($xp->query("//*[local-name()='Master']") as $i => $node) {
            if (!$node instanceof \DOMElement) {
                continue;
            }
            $name = $node->getAttribute('NameU') ?: $node->getAttribute('Name') ?: ('Forme ' . ($i + 1));
            $relId = '';
            foreach ($xp->query("./*[local-name()='Rel']", $node) as $rel) {
                if ($rel instanceof \DOMElement) {
                    $relId = $this->relId($rel);
                }
            }
            if ($relId !== '') {
                $out[] = ['id' => $node->getAttribute('ID'), 'relId' => $relId, 'name' => $name];
            }
        }
        return $out;
    }

    /**
     * @return array<string, string>
     */
    private function parseRels(string $xml): array
    {
        $dom = new \DOMDocument();
        if (!@$dom->loadXML($xml)) {
            return [];
        }
        $xp = new \DOMXPath($dom);
        $out = [];
        foreach ($xp->query("//*[local-name()='Relationship']") as $node) {
            if ($node instanceof \DOMElement) {
                $out[$node->getAttribute('Id')] = $node->getAttribute('Target');
            }
        }
        return $out;
    }

    /**
     * @return array<string, string>
     */
    private function masterRels(\ZipArchive $zip, string $masterFile): array
    {
        $relsPath = 'visio/masters/_rels/' . basename($masterFile) . '.rels';
        $xml = $zip->getFromName($relsPath);
        return $xml !== false ? $this->parseRels($xml) : [];
    }

    /**
     * @param \DOMNodeList<\DOMNode> $topShapes
     * @return array{0: float, 1: float, 2: float, 3: float} minX, minY, width, height (inches)
     */
    private function extent(\DOMXPath $xp, \DOMNodeList $topShapes): array
    {
        $minX = INF; $minY = INF; $maxX = -INF; $maxY = -INF;
        foreach ($topShapes as $shape) {
            if (!$shape instanceof \DOMElement) {
                continue;
            }
            $w = (float) ($this->cell($xp, $shape, 'Width') ?? 0);
            $h = (float) ($this->cell($xp, $shape, 'Height') ?? 0);
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
     * @param array<string, string> $masterRels
     */
    private function renderShape(\DOMXPath $xp, \DOMElement $shape, \ZipArchive $zip, array $masterRels, bool &$hasContent): string
    {
        $w = (float) ($this->cell($xp, $shape, 'Width') ?? 0);
        $h = (float) ($this->cell($xp, $shape, 'Height') ?? 0);
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

        $inner = '';

        foreach ($xp->query("./*[local-name()='Section'][@N='Geometry']", $shape) as $section) {
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

        $inner .= $this->renderForeignData($xp, $shape, $w, $h, $zip, $masterRels, $hasContent);

        foreach ($xp->query("./*[local-name()='Shapes']/*[local-name()='Shape']", $shape) as $sub) {
            if ($sub instanceof \DOMElement) {
                $inner .= $this->renderShape($xp, $sub, $zip, $masterRels, $hasContent);
            }
        }

        if ($inner === '') {
            return '';
        }
        return $transform !== '' ? '<g transform="' . $transform . '">' . $inner . '</g>' : $inner;
    }

    /**
     * Embeds an inline raster ForeignData image (used on the geometry path; EMF/WMF
     * are handled earlier by buildSpec via LibreOffice).
     *
     * @param array<string, string> $masterRels
     */
    private function renderForeignData(\DOMXPath $xp, \DOMElement $shape, float $w, float $h, \ZipArchive $zip, array $masterRels, bool &$hasContent): string
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
        if ($type !== 'bitmap' && $type !== '') {
            return ''; // EMF/WMF/Ink handled elsewhere or unsupported
        }
        $relId = '';
        foreach ($xp->query("./*[local-name()='Rel']", $fd) as $rel) {
            if ($rel instanceof \DOMElement) {
                $relId = $this->relId($rel);
            }
        }
        if ($relId === '' || !isset($masterRels[$relId])) {
            return '';
        }
        $mediaPath = $this->resolveMediaPath($masterRels[$relId]);
        $bytes = $zip->getFromName($mediaPath);
        if ($bytes === false) {
            return '';
        }
        $mime = $this->imageMime($bytes);
        if ($mime === null) {
            return '';
        }
        $dataUrl = 'data:' . $mime . ';base64,' . base64_encode($bytes);
        $hasContent = true;
        return '<g transform="matrix(1 0 0 -1 0 ' . $this->n($h) . ')">'
            . '<image x="0" y="0" width="' . $this->n($w) . '" height="' . $this->n($h) . '" preserveAspectRatio="none" '
            . 'xlink:href="' . $dataUrl . '" href="' . $dataUrl . '"/></g>';
    }

    private function resolveMediaPath(string $target): string
    {
        $parts = [];
        foreach (explode('/', 'visio/masters/' . $target) as $p) {
            if ($p === '..') {
                array_pop($parts);
            } elseif ($p !== '.' && $p !== '') {
                $parts[] = $p;
            }
        }
        return implode('/', $parts);
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
        return null; // BMP / EMF / WMF / other → unsupported here
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
