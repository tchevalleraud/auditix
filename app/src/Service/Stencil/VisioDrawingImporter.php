<?php

namespace App\Service\Stencil;

use Psr\Log\LoggerInterface;

/**
 * Imports a full Visio drawing (.vsdx / .vsdt) as a set of ReportSchema elements.
 *
 * Where {@see VisioStencilImporter} turns each *master* into a reusable shape,
 * this importer reads the *page* (visio/pages/pageN.xml): every master instance
 * becomes an `image` element placed at its converted position, every connector
 * becomes a `line` element glued (sourceId/targetId + nearest anchor) to the
 * shapes its <Connects> entries reference. Shape text becomes a `text` element;
 * connector text becomes a line label.
 *
 * Coordinate model: Visio uses inches with a bottom-left origin (Y up); the
 * schema canvas uses pixels with a top-left origin (Y down). Conversion applies
 * INCH_PX and flips Y against the page height.
 *
 * Best-effort, page 1 only: connector routing is reduced to a straight segment
 * between anchors, and character-level text styling is not preserved.
 */
class VisioDrawingImporter
{
    private const INCH_PX = 96.0;

    /** Anchor name → unit offset of the point within a (0..1)×(0..1) box. */
    private const ANCHORS = [
        'n'  => [0.5, 0.0], 'ne' => [1.0, 0.0], 'e' => [1.0, 0.5], 'se' => [1.0, 1.0],
        's'  => [0.5, 1.0], 'sw' => [0.0, 1.0], 'w' => [0.0, 0.5], 'nw' => [0.0, 0.0],
    ];

    public function __construct(
        private readonly VisioStencilImporter $stencils,
        private readonly LoggerInterface $logger,
    ) {}

    /**
     * @return array{name: string, canvasSize: array{width: float, height: float}, elements: array<int, array<string, mixed>>}
     */
    public function import(string $path, string $originalName): array
    {
        $zip = new \ZipArchive();
        if ($zip->open($path) !== true) {
            throw new \RuntimeException('Archive Visio illisible (.vsdx attendu).');
        }

        try {
            $masterSpecs = $this->stencils->buildMasterSpecs($zip);

            $pagePath = $this->firstPagePath($zip);
            $pageXml = $pagePath !== null ? $zip->getFromName($pagePath) : false;
            if ($pageXml === false) {
                throw new \RuntimeException('Aucune page exploitable dans le dessin Visio.');
            }
            [$pageW, $pageH] = $this->pageSize($zip);

            $elements = $this->buildElements($pageXml, $masterSpecs, $pageH);
            if ($elements === []) {
                throw new \RuntimeException('Aucune forme exploitable dans ce dessin Visio.');
            }

            return [
                'name' => pathinfo($originalName, PATHINFO_FILENAME) ?: 'Schéma Visio',
                'canvasSize' => [
                    'width' => max(1.0, $pageW * self::INCH_PX),
                    'height' => max(1.0, $pageH * self::INCH_PX),
                ],
                'elements' => $elements,
            ];
        } finally {
            $zip->close();
        }
    }

    /**
     * @param array<string, StencilItemSpec> $masterSpecs
     * @return array<int, array<string, mixed>>
     */
    private function buildElements(string $pageXml, array $masterSpecs, float $pageH): array
    {
        $dom = new \DOMDocument();
        if (!@$dom->loadXML($pageXml)) {
            return [];
        }
        $xp = new \DOMXPath($dom);

        $topShapes = $xp->query("/*/*[local-name()='Shapes']/*[local-name()='Shape']");
        if ($topShapes === false || $topShapes->length === 0) {
            return [];
        }

        // Pass 1 — split shapes into nodes (master instances) and connectors.
        $nodes = [];       // visioId => DOMElement
        $connectors = [];  // visioId => DOMElement
        foreach ($topShapes as $shape) {
            if (!$shape instanceof \DOMElement) {
                continue;
            }
            $vid = $shape->getAttribute('ID');
            if ($vid === '') {
                continue;
            }
            if ($this->cell($xp, $shape, 'BeginX') !== null && $this->cell($xp, $shape, 'EndX') !== null) {
                $connectors[$vid] = $shape;
            } else {
                $nodes[$vid] = $shape;
            }
        }

        // Pass 2 — place each node as an image (or a fallback rectangle).
        $elements = [];
        $bboxes = [];      // visioId => [x, y, w, h] (pixels)
        $elementId = [];   // visioId => schema element id
        $z = 1000;         // nodes sit above connectors
        foreach ($nodes as $vid => $shape) {
            $masterId = $shape->getAttribute('Master');
            $spec = $masterId !== '' ? ($masterSpecs[$masterId] ?? null) : null;

            $wInch = $this->numCell($xp, $shape, 'Width') ?? ($spec ? $spec->width / self::INCH_PX : 0.5);
            $hInch = $this->numCell($xp, $shape, 'Height') ?? ($spec ? $spec->height / self::INCH_PX : 0.5);
            $pinX = $this->numCell($xp, $shape, 'PinX') ?? 0.0;
            $pinY = $this->numCell($xp, $shape, 'PinY') ?? 0.0;
            $locX = $this->numCell($xp, $shape, 'LocPinX') ?? $wInch / 2;
            $locY = $this->numCell($xp, $shape, 'LocPinY') ?? $hInch / 2;

            $x = ($pinX - $locX) * self::INCH_PX;
            $y = ($pageH - ($pinY - $locY + $hInch)) * self::INCH_PX;
            $w = max(1.0, $wInch * self::INCH_PX);
            $h = max(1.0, $hInch * self::INCH_PX);
            $rotation = $this->rotationDeg($this->numCell($xp, $shape, 'Angle') ?? 0.0);

            $id = $this->id('img');
            if ($spec !== null) {
                $elements[] = [
                    'id' => $id, 'kind' => 'image',
                    'x' => $this->r($x), 'y' => $this->r($y), 'width' => $this->r($w), 'height' => $this->r($h),
                    'rotation' => $rotation, 'zIndex' => $z++,
                    'url' => $spec->dataUrl, 'opacity' => 1,
                ];
            } else {
                $this->logger->warning('Visio drawing: master not found for shape', ['shape' => $vid, 'master' => $masterId]);
                $elements[] = [
                    'id' => $id, 'kind' => 'shape', 'shape' => 'rectangle',
                    'x' => $this->r($x), 'y' => $this->r($y), 'width' => $this->r($w), 'height' => $this->r($h),
                    'rotation' => $rotation, 'zIndex' => $z++,
                    'style' => ['fill' => '#f1f5f9', 'stroke' => '#94a3b8', 'strokeWidth' => 1, 'dash' => 'solid', 'opacity' => 1, 'fillOpacity' => 1, 'borderRadius' => 4],
                ];
            }
            $bboxes[$vid] = [$x, $y, $w, $h];
            $elementId[$vid] = $id;

            $text = $this->shapeText($xp, $shape);
            if ($text !== '') {
                $elements[] = $this->textElement($text, $x, $y, $w, $h, $z++);
            }
        }

        // Pass 3 — connector endpoints + glue from the <Connects> table.
        $connects = $this->parseConnects($xp);
        $z = 0;
        foreach ($connectors as $vid => $shape) {
            $bx = $this->numCell($xp, $shape, 'BeginX') ?? 0.0;
            $by = $this->numCell($xp, $shape, 'BeginY') ?? 0.0;
            $ex = $this->numCell($xp, $shape, 'EndX') ?? 0.0;
            $ey = $this->numCell($xp, $shape, 'EndY') ?? 0.0;
            $x1 = $bx * self::INCH_PX; $y1 = ($pageH - $by) * self::INCH_PX;
            $x2 = $ex * self::INCH_PX; $y2 = ($pageH - $ey) * self::INCH_PX;

            $line = [
                'id' => $this->id('line'), 'kind' => 'line',
                'x1' => $this->r($x1), 'y1' => $this->r($y1), 'x2' => $this->r($x2), 'y2' => $this->r($y2),
                'zIndex' => $z++,
                'style' => ['stroke' => '#334155', 'strokeWidth' => 1.5, 'dash' => 'solid', 'opacity' => 1],
                'arrowStart' => false, 'arrowEnd' => false,
            ];

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

            $elements[] = $line;
        }

        return $elements;
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
     * @return array{0: float, 1: float} page width, height (inches)
     */
    private function pageSize(\ZipArchive $zip): array
    {
        $xml = $zip->getFromName('visio/pages/pages.xml');
        $w = 8.26771653543307; // A4 portrait, the Visio default
        $h = 11.69291338582677;
        if ($xml === false) {
            return [$w, $h];
        }
        $dom = new \DOMDocument();
        if (!@$dom->loadXML($xml)) {
            return [$w, $h];
        }
        $xp = new \DOMXPath($dom);
        $sheet = $xp->query("//*[local-name()='Page'][1]/*[local-name()='PageSheet']")->item(0);
        if ($sheet instanceof \DOMElement) {
            $w = $this->numCell($xp, $sheet, 'PageWidth') ?? $w;
            $h = $this->numCell($xp, $sheet, 'PageHeight') ?? $h;
        }
        return [$w, $h];
    }

    private function firstPagePath(\ZipArchive $zip): ?string
    {
        $pagesXml = $zip->getFromName('visio/pages/pages.xml');
        $relsXml = $zip->getFromName('visio/pages/_rels/pages.xml.rels');
        if ($pagesXml !== false && $relsXml !== false) {
            $dom = new \DOMDocument();
            if (@$dom->loadXML($pagesXml)) {
                $xp = new \DOMXPath($dom);
                $rel = $xp->query("//*[local-name()='Page'][1]/*[local-name()='Rel']")->item(0);
                if ($rel instanceof \DOMElement) {
                    $relId = '';
                    foreach ($rel->attributes as $a) {
                        if ($a->localName === 'id') {
                            $relId = $a->value;
                        }
                    }
                    $target = $this->relTarget($relsXml, $relId);
                    if ($target !== null) {
                        return 'visio/pages/' . ltrim($target, '/');
                    }
                }
            }
        }
        // Fallback to the conventional path.
        return $zip->getFromName('visio/pages/page1.xml') !== false ? 'visio/pages/page1.xml' : null;
    }

    private function relTarget(string $relsXml, string $relId): ?string
    {
        if ($relId === '') {
            return null;
        }
        $dom = new \DOMDocument();
        if (!@$dom->loadXML($relsXml)) {
            return null;
        }
        $xp = new \DOMXPath($dom);
        foreach ($xp->query("//*[local-name()='Relationship']") as $r) {
            if ($r instanceof \DOMElement && $r->getAttribute('Id') === $relId) {
                return $r->getAttribute('Target');
            }
        }
        return null;
    }

    /**
     * @param array{0: float, 1: float, 2: float, 3: float}|null $unused kept for clarity
     */
    private function textElement(string $text, float $x, float $y, float $w, float $h, int $z): array
    {
        $fontSize = 13.0;
        return [
            'id' => $this->id('txt'), 'kind' => 'text',
            'x' => $this->r($x), 'y' => $this->r($y + $h / 2 - $fontSize / 2),
            'width' => $this->r(max(24.0, $w)), 'height' => $this->r($fontSize + 6),
            'rotation' => 0, 'zIndex' => $z,
            'text' => $text, 'fontSize' => $fontSize, 'color' => '#0f172a',
            'fontFamily' => 'Inter, system-ui, sans-serif', 'fontWeight' => 400, 'fontStyle' => 'normal',
            'textAlign' => 'center', 'bgColor' => null, 'padding' => 2,
        ];
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

    /** Visio Angle (radians, CCW, Y-up) → schema rotation (degrees, CW, Y-down). */
    private function rotationDeg(float $rad): float
    {
        if (abs($rad) < 1e-9) {
            return 0.0;
        }
        return $this->r(-$rad * 180.0 / M_PI);
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
