<?php

namespace App\Service\Stencil;

use App\Service\Stencil\Visio\EmfConverter;
use App\Service\Stencil\Visio\VisioRenderContext;
use App\Service\Stencil\Visio\VisioShapeRenderer;
use Psr\Log\LoggerInterface;

/**
 * Imports a full Visio drawing (.vsdx / .vsdt) as a set of ReportSchema elements.
 *
 * Each top-level shape of the chosen page is rendered to a self-contained SVG
 * image element (faithfully reproducing groups, geometry, inherited master art
 * and text via {@see VisioShapeRenderer}); connectors become line elements glued
 * to their endpoints through the page's <Connects> table.
 *
 * Coordinate model: Visio uses inches with a bottom-left origin (Y up); the
 * schema canvas uses pixels with a top-left origin (Y down). Conversion applies
 * INCH_PX and flips Y against the page height.
 */
class VisioDrawingImporter
{
    private const INCH_PX = 96.0;

    /** Anchor name → unit offset within a (0..1)×(0..1) box. */
    private const ANCHORS = [
        'n'  => [0.5, 0.0], 'ne' => [1.0, 0.0], 'e' => [1.0, 0.5], 'se' => [1.0, 1.0],
        's'  => [0.5, 1.0], 'sw' => [0.0, 1.0], 'w' => [0.0, 0.5], 'nw' => [0.0, 0.0],
    ];

    private readonly EmfConverter $emf;

    public function __construct(
        private readonly VisioStencilImporter $stencils,
        private readonly VisioShapeRenderer $renderer,
        private readonly LoggerInterface $logger,
    ) {
        $this->emf = new EmfConverter($this->logger);
    }

    /**
     * List the drawing's pages (tabs) in tab order, without rendering them.
     *
     * @return array<int, array{index: int, name: string}>
     */
    public function listPages(string $path): array
    {
        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) {
            throw new \RuntimeException('Archive Visio illisible (.vsdx attendu).');
        }
        try {
            $pages = $this->resolvePages($zip);
            if ($pages === []) {
                throw new \RuntimeException('Aucune page trouvée dans le dessin Visio.');
            }
            $out = [];
            foreach ($pages as $i => $p) {
                $out[] = ['index' => $i, 'name' => $p['name']];
            }
            return $out;
        } finally {
            $zip->close();
        }
    }

    /**
     * @return array{name: string, canvasSize: array{width: float, height: float}, elements: array<int, array<string, mixed>>}
     */
    public function import(string $path, string $originalName, int $pageIndex = 0): array
    {
        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) {
            throw new \RuntimeException('Archive Visio illisible (.vsdx attendu).');
        }

        try {
            $pages = $this->resolvePages($zip);
            if ($pages === []) {
                throw new \RuntimeException('Aucune page exploitable dans le dessin Visio.');
            }
            $page = $pages[$pageIndex] ?? $pages[0];

            $pageXml = $zip->getFromName($page['file']);
            if ($pageXml === false) {
                throw new \RuntimeException('Page Visio illisible.');
            }
            $dom = new \DOMDocument();
            if (!@$dom->loadXML($pageXml)) {
                throw new \RuntimeException('Page Visio illisible.');
            }
            $xp = new \DOMXPath($dom);

            $masterSpecs = $this->rasterizeLargeMasters($this->stencils->buildMasterSpecs($zip));
            $pageRels = $this->partRels($zip, $page['file']);
            $convertedEmf = $this->convertPageEmf($zip, $xp, $pageRels);
            $ctx = new VisioRenderContext($zip, 'visio/pages/', $pageRels, $masterSpecs, $convertedEmf, true);

            $pageH = $page['height'];
            $elements = $this->buildElements($xp, $ctx, $pageH);
            if ($elements === []) {
                throw new \RuntimeException('Aucune forme exploitable sur cette page Visio.');
            }

            $canvas = $this->fitToContent($elements);

            $baseName = pathinfo($originalName, PATHINFO_FILENAME) ?: 'Schéma Visio';
            return [
                'name' => $page['name'] !== '' ? $page['name'] : $baseName,
                'canvasSize' => $canvas,
                'elements' => $elements,
            ];
        } finally {
            $zip->close();
        }
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function buildElements(\DOMXPath $xp, VisioRenderContext $ctx, float $pageH): array
    {
        $topShapes = $xp->query("/*/*[local-name()='Shapes']/*[local-name()='Shape']");
        if ($topShapes === false || $topShapes->length === 0) {
            return [];
        }

        $elements = [];
        $bboxes = [];        // visioId => [x, y, w, h] (pixels)
        $elementId = [];     // visioId => schema element id
        $deferredConnectors = []; // [shape, zIndex]
        $z = 0;

        foreach ($topShapes as $shape) {
            if (!$shape instanceof \DOMElement) {
                continue;
            }
            $vid = $shape->getAttribute('ID');
            $isConnector = $this->cell($xp, $shape, 'BeginX') !== null && $this->cell($xp, $shape, 'EndX') !== null;

            if ($isConnector) {
                $deferredConnectors[] = ['shape' => $shape, 'z' => $z++];
                continue;
            }

            $rendered = $this->renderer->renderShapesToSvg($xp, [$shape], $ctx);
            if ($rendered === null) {
                $z++;
                continue;
            }
            $x = $rendered['minX'] * self::INCH_PX;
            $y = $pageH * self::INCH_PX - $rendered['minY'] * self::INCH_PX - $rendered['height'];
            $id = $this->id('img');
            $elements[] = [
                'id' => $id, 'kind' => 'image',
                'x' => $this->r($x), 'y' => $this->r($y),
                'width' => $this->r($rendered['width']), 'height' => $this->r($rendered['height']),
                'rotation' => 0, 'zIndex' => $z++,
                'url' => $rendered['dataUrl'], 'opacity' => 1,
            ];
            if ($vid !== '') {
                $bboxes[$vid] = [$x, $y, $rendered['width'], $rendered['height']];
                $elementId[$vid] = $id;
            }
        }

        $connects = $this->parseConnects($xp);
        foreach ($deferredConnectors as $c) {
            $elements[] = $this->buildConnector($xp, $c['shape'], $c['z'], $connects, $bboxes, $elementId, $pageH);
        }

        return $elements;
    }

    /**
     * @param array<string, array{begin?: string, end?: string}> $connects
     * @param array<string, array{0: float, 1: float, 2: float, 3: float}> $bboxes
     * @param array<string, string> $elementId
     * @return array<string, mixed>
     */
    private function buildConnector(\DOMXPath $xp, \DOMElement $shape, int $z, array $connects, array $bboxes, array $elementId, float $pageH): array
    {
        $bx = $this->numCell($xp, $shape, 'BeginX') ?? 0.0;
        $by = $this->numCell($xp, $shape, 'BeginY') ?? 0.0;
        $ex = $this->numCell($xp, $shape, 'EndX') ?? 0.0;
        $ey = $this->numCell($xp, $shape, 'EndY') ?? 0.0;
        $x1 = $bx * self::INCH_PX; $y1 = ($pageH - $by) * self::INCH_PX;
        $x2 = $ex * self::INCH_PX; $y2 = ($pageH - $ey) * self::INCH_PX;

        $line = [
            'id' => $this->id('line'), 'kind' => 'line',
            'x1' => $this->r($x1), 'y1' => $this->r($y1), 'x2' => $this->r($x2), 'y2' => $this->r($y2),
            'zIndex' => $z,
            'style' => ['stroke' => '#334155', 'strokeWidth' => 1.5, 'dash' => 'solid', 'opacity' => 1],
            'arrowStart' => false, 'arrowEnd' => false,
        ];

        $vid = $shape->getAttribute('ID');
        $beginTo = $connects[$vid]['begin'] ?? null;
        if ($beginTo !== null && isset($bboxes[$beginTo], $elementId[$beginTo])) {
            $line['sourceId'] = $elementId[$beginTo];
            $line['sourceAnchor'] = $this->nearestAnchor($bboxes[$beginTo], $x1, $y1);
        }
        $endTo = $connects[$vid]['end'] ?? null;
        if ($endTo !== null && isset($bboxes[$endTo], $elementId[$endTo])) {
            $line['targetId'] = $elementId[$endTo];
            $line['targetAnchor'] = $this->nearestAnchor($bboxes[$endTo], $x2, $y2);
        }

        $text = $this->shapeText($xp, $shape);
        if ($text !== '') {
            $line['labels'] = [[
                'id' => $this->id('lbl'), 'kind' => 'text', 't' => 0.5, 'text' => $text,
                'offset' => 0, 'fontSize' => 12, 'color' => '#0f172a', 'fontWeight' => 400,
                'fontStyle' => 'normal', 'bgColor' => '#ffffff', 'borderRadius' => 3, 'padding' => 2,
            ]];
        }

        return $line;
    }

    /**
     * Trim the empty page margins: shift every element so the content starts at a
     * small margin and size the canvas to the content bounding box.
     *
     * @param array<int, array<string, mixed>> $elements (modified in place)
     * @return array{width: float, height: float}
     */
    private function fitToContent(array &$elements): array
    {
        $margin = 40.0;
        $minX = INF; $minY = INF; $maxX = -INF; $maxY = -INF;
        foreach ($elements as $el) {
            if ($el['kind'] === 'image') {
                $minX = min($minX, $el['x']); $minY = min($minY, $el['y']);
                $maxX = max($maxX, $el['x'] + $el['width']); $maxY = max($maxY, $el['y'] + $el['height']);
            } elseif ($el['kind'] === 'line') {
                $minX = min($minX, $el['x1'], $el['x2']); $minY = min($minY, $el['y1'], $el['y2']);
                $maxX = max($maxX, $el['x1'], $el['x2']); $maxY = max($maxY, $el['y1'], $el['y2']);
            }
        }
        if (!is_finite($minX) || $maxX <= $minX || $maxY <= $minY) {
            return ['width' => 1000.0, 'height' => 1000.0];
        }

        $dx = $margin - $minX;
        $dy = $margin - $minY;
        foreach ($elements as &$el) {
            if ($el['kind'] === 'image') {
                $el['x'] = $this->r($el['x'] + $dx);
                $el['y'] = $this->r($el['y'] + $dy);
            } elseif ($el['kind'] === 'line') {
                $el['x1'] = $this->r($el['x1'] + $dx); $el['y1'] = $this->r($el['y1'] + $dy);
                $el['x2'] = $this->r($el['x2'] + $dx); $el['y2'] = $this->r($el['y2'] + $dy);
            }
        }
        unset($el);

        return [
            'width' => $this->r($maxX - $minX + 2 * $margin),
            'height' => $this->r($maxY - $minY + 2 * $margin),
        ];
    }

    /**
     * @param array{0: float, 1: float, 2: float, 3: float} $bbox x, y, w, h (pixels)
     */
    private function nearestAnchor(array $bbox, float $px, float $py): string
    {
        [$x, $y, $w, $h] = $bbox;
        $best = 'n';
        $bestD = INF;
        foreach (self::ANCHORS as $name => [$ux, $uy]) {
            $ax = $x + $ux * $w;
            $ay = $y + $uy * $h;
            $d = ($ax - $px) ** 2 + ($ay - $py) ** 2;
            if ($d < $bestD) {
                $bestD = $d;
                $best = $name;
            }
        }
        return $best;
    }

    /**
     * @return array<string, array{begin?: string, end?: string}>
     */
    private function parseConnects(\DOMXPath $xp): array
    {
        $out = [];
        foreach ($xp->query("/*/*[local-name()='Connects']/*[local-name()='Connect']") as $c) {
            if (!$c instanceof \DOMElement) {
                continue;
            }
            $from = $c->getAttribute('FromSheet');
            $to = $c->getAttribute('ToSheet');
            $cell = $c->getAttribute('FromCell');
            if ($from === '' || $to === '') {
                continue;
            }
            if (str_starts_with($cell, 'Begin')) {
                $out[$from]['begin'] = $to;
            } elseif (str_starts_with($cell, 'End')) {
                $out[$from]['end'] = $to;
            }
        }
        return $out;
    }

    /**
     * Resolve every page to its name + part path + dimensions, in tab order.
     *
     * @return array<int, array{name: string, file: string, width: float, height: float}>
     */
    private function resolvePages(\ZipArchive $zip): array
    {
        $xml = $zip->getFromName('visio/pages/pages.xml');
        if ($xml === false) {
            return [];
        }
        $dom = new \DOMDocument();
        if (!@$dom->loadXML($xml)) {
            return [];
        }
        $xp = new \DOMXPath($dom);
        $rels = $this->partRels($zip, 'visio/pages/pages.xml');

        $pages = [];
        foreach ($xp->query("/*/*[local-name()='Page']") as $page) {
            if (!$page instanceof \DOMElement) {
                continue;
            }
            // The user-facing tab label is `Name`; `NameU` is the internal name.
            $name = $page->getAttribute('Name') ?: $page->getAttribute('NameU') ?: ('Page ' . (count($pages) + 1));
            $sheet = $xp->query("./*[local-name()='PageSheet']", $page)->item(0);
            $w = 11.69291338582677; $h = 8.26771653543307;
            if ($sheet instanceof \DOMElement) {
                $w = $this->numCell($xp, $sheet, 'PageWidth') ?? $w;
                $h = $this->numCell($xp, $sheet, 'PageHeight') ?? $h;
            }
            $relId = '';
            $rel = $xp->query("./*[local-name()='Rel']", $page)->item(0);
            if ($rel instanceof \DOMElement) {
                foreach ($rel->attributes as $a) {
                    if ($a->localName === 'id') {
                        $relId = $a->value;
                    }
                }
            }
            $target = $relId !== '' ? ($rels[$relId] ?? null) : null;
            if ($target === null) {
                continue;
            }
            $pages[] = ['name' => $name, 'file' => 'visio/pages/' . ltrim($target, '/'), 'width' => $w, 'height' => $h];
        }
        return $pages;
    }

    /**
     * Collect and batch-convert every EMF/WMF ForeignData image referenced on
     * the page into SVG, keyed by media path.
     *
     * @param array<string, string> $pageRels
     * @return array<string, string|null>
     */
    private function convertPageEmf(\ZipArchive $zip, \DOMXPath $xp, array $pageRels): array
    {
        $blobs = [];
        foreach ($xp->query("//*[local-name()='ForeignData']") as $fd) {
            if (!$fd instanceof \DOMElement) {
                continue;
            }
            $type = strtolower($fd->getAttribute('ForeignType'));
            if (!in_array($type, ['enhmetafile', 'metafile'], true)) {
                continue;
            }
            $relId = '';
            foreach ($xp->query("./*[local-name()='Rel']", $fd) as $rel) {
                if ($rel instanceof \DOMElement) {
                    foreach ($rel->attributes as $a) {
                        if ($a->localName === 'id') {
                            $relId = $a->value;
                        }
                    }
                }
            }
            if ($relId === '' || !isset($pageRels[$relId])) {
                continue;
            }
            $mediaPath = $this->resolveMediaPath($pageRels[$relId]);
            if (!array_key_exists($mediaPath, $blobs)) {
                $bytes = $zip->getFromName($mediaPath);
                if ($bytes !== false) {
                    $blobs[$mediaPath] = $bytes;
                }
            }
        }
        return $blobs === [] ? [] : $this->emf->convertMany($blobs);
    }

    /**
     * LibreOffice turns the device EMFs into very large SVGs (1–2 MB each). Since
     * each master is embedded into every instance, that explodes the schema size.
     * Rasterize any oversized SVG master to a compact PNG (vector geometry shapes,
     * which stay small, are left untouched).
     *
     * @param array<string, StencilItemSpec> $specs
     * @return array<string, StencilItemSpec>
     */
    private function rasterizeLargeMasters(array $specs): array
    {
        $threshold = 120 * 1024; // bytes of data URL
        $maxSide = 900.0;        // px cap on the longest rendered side
        $out = [];
        foreach ($specs as $id => $spec) {
            $prefix = 'data:image/svg+xml;base64,';
            if (strlen($spec->dataUrl) <= $threshold || !str_starts_with($spec->dataUrl, $prefix)) {
                $out[$id] = $spec;
                continue;
            }
            $svg = base64_decode(substr($spec->dataUrl, strlen($prefix)), true);
            if ($svg === false) {
                $out[$id] = $spec;
                continue;
            }
            $scale = min($maxSide / max(1.0, $spec->width), $maxSide / max(1.0, $spec->height), 1.0);
            $w = max(1, (int) round($spec->width * $scale));
            $h = max(1, (int) round($spec->height * $scale));
            $png = $this->rsvgToPng($svg, $w, $h);
            if ($png === null) {
                $out[$id] = $spec;
                continue;
            }
            $dataUrl = 'data:image/png;base64,' . base64_encode($png);
            $out[$id] = new StencilItemSpec($spec->name, $spec->keywords, $dataUrl, null, $spec->width, $spec->height);
        }
        return $out;
    }

    private function rsvgToPng(string $svg, int $w, int $h): ?string
    {
        $in = tempnam(sys_get_temp_dir(), 'vsvg');
        $out = tempnam(sys_get_temp_dir(), 'vpng');
        if ($in === false || $out === false) {
            return null;
        }
        try {
            file_put_contents($in, $svg);
            $cmd = sprintf('rsvg-convert -w %d -h %d -f png -o %s %s 2>/dev/null', $w, $h, escapeshellarg($out), escapeshellarg($in));
            exec($cmd, $_, $code);
            if ($code !== 0) {
                return null;
            }
            $png = file_get_contents($out);
            return $png !== false && $png !== '' ? $png : null;
        } finally {
            @unlink($in);
            @unlink($out);
        }
    }

    /**
     * @return array<string, string> relId => Target
     */
    private function partRels(\ZipArchive $zip, string $partPath): array
    {
        $dir = \dirname($partPath);
        $relsPath = $dir . '/_rels/' . basename($partPath) . '.rels';
        $xml = $zip->getFromName($relsPath);
        if ($xml === false) {
            return [];
        }
        $dom = new \DOMDocument();
        if (!@$dom->loadXML($xml)) {
            return [];
        }
        $xp = new \DOMXPath($dom);
        $out = [];
        foreach ($xp->query("//*[local-name()='Relationship']") as $r) {
            if ($r instanceof \DOMElement) {
                $out[$r->getAttribute('Id')] = $r->getAttribute('Target');
            }
        }
        return $out;
    }

    private function resolveMediaPath(string $target): string
    {
        $parts = [];
        foreach (explode('/', 'visio/pages/' . $target) as $p) {
            if ($p === '..') {
                array_pop($parts);
            } elseif ($p !== '.' && $p !== '') {
                $parts[] = $p;
            }
        }
        return implode('/', $parts);
    }

    /** Concatenated, whitespace-collapsed text content of a shape's <Text> node. */
    private function shapeText(\DOMXPath $xp, \DOMElement $shape): string
    {
        $node = $xp->query("./*[local-name()='Text']", $shape)->item(0);
        if (!$node instanceof \DOMElement) {
            return '';
        }
        $text = preg_replace('/\s+/u', ' ', $node->textContent ?? '');
        return trim((string) $text);
    }

    private function cell(\DOMXPath $xp, \DOMElement $shape, string $name): ?string
    {
        $nodes = $xp->query("./*[local-name()='Cell'][@N='" . $name . "']", $shape);
        if ($nodes && $nodes->length > 0 && $nodes->item(0) instanceof \DOMElement) {
            return $nodes->item(0)->getAttribute('V');
        }
        return null;
    }

    private function numCell(\DOMXPath $xp, \DOMElement $shape, string $name): ?float
    {
        $v = $this->cell($xp, $shape, $name);
        return ($v !== null && is_numeric($v)) ? (float) $v : null;
    }

    private function id(string $prefix): string
    {
        return $prefix . '-' . bin2hex(random_bytes(6));
    }

    private function r(float $v): float
    {
        return round($v, 2);
    }
}
