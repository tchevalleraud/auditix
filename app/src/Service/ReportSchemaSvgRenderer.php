<?php

namespace App\Service;

use App\Entity\Node;
use App\Entity\NodeInventoryEntry;
use App\Entity\ReportSchema;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Renders a ReportSchema (Excalidraw-style canvas) to a standalone SVG string
 * suitable for embedding in a PDF or shown as a preview.
 *
 * Supported options:
 *   - canvasWidth:    int    (default: 1200) — px of the output SVG (height auto)
 *   - viewportFrame:  ?array — { x, y, width, height } world-coordinates viewBox
 *                              (when omitted, auto-fit on element bounding box)
 *
 * Element shapes (kind):
 *   - shape       — rectangle | ellipse | diamond | triangle | hexagon
 *   - text        — free-form text box
 *   - image       — embedded image by URL
 *   - line        — straight line/arrow (optional arrowStart/arrowEnd)
 *   - freedraw    — polyline drawn with the pencil tool
 *   - bezier      — cubic Bézier path
 *   - node_card_styled — re-uses the topology2 NodeDesign (shape + labelElements)
 *   - node_card_table  — rectangle with a header + tabular rows of node fields
 *   - data_label       — single text label whose value is resolved from a node field
 *                        (builtin like hostname/ipAddress/... or inventory:cat:key:col),
 *                        optionally wrapped by a prefix/suffix
 */
class ReportSchemaSvgRenderer
{
    public function __construct(private readonly EntityManagerInterface $em) {}

    public function render(ReportSchema $schema, array $options = []): string
    {
        $canvasWidth = (int) ($options['canvasWidth'] ?? 1200);
        $viewportFrame = $options['viewportFrame'] ?? null;

        $elements = $schema->getElements();
        if (empty($elements)) {
            return $this->emptySvg('Empty schema');
        }

        // Resolve node + inventory data for any element that references a node.
        // Also collect node IDs referenced by line labels (either explicit or via
        // their anchored node-card endpoint).
        $nodeIds = [];
        $nodeCardByElementId = [];
        foreach ($elements as $el) {
            $kind = $el['kind'] ?? null;
            if (in_array($kind, ['node_card_styled', 'node_card_table', 'data_label'], true)) {
                $nid = (int) ($el['nodeId'] ?? 0);
                if ($nid > 0) $nodeIds[$nid] = true;
                if ($nid > 0 && in_array($kind, ['node_card_styled', 'node_card_table'], true) && isset($el['id'])) {
                    $nodeCardByElementId[(string)$el['id']] = $nid;
                }
            }
        }
        // Second pass: line labels may reference nodes via:
        //  - explicit dataBinding (new)
        //  - pillColorRules.source.nodeId (new — for conditional pill colors)
        //  - legacy explicit nodeId
        //  - or implicit anchor binding (legacy template mode)
        foreach ($elements as $el) {
            if (($el['kind'] ?? '') !== 'line') continue;
            foreach (($el['labels'] ?? []) as $lab) {
                if (!is_array($lab)) continue;
                $binding = $lab['dataBinding'] ?? null;
                if (is_array($binding) && isset($binding['nodeId']) && $binding['nodeId'] !== null) {
                    $nodeIds[(int)$binding['nodeId']] = true;
                }
                foreach (($lab['pillColorRules'] ?? []) as $rule) {
                    if (!is_array($rule)) continue;
                    $src = $rule['source'] ?? null;
                    if (is_array($src) && isset($src['nodeId']) && $src['nodeId'] !== null) {
                        $nodeIds[(int)$src['nodeId']] = true;
                    }
                }
                if (isset($lab['nodeId']) && $lab['nodeId'] !== null) {
                    $nodeIds[(int)$lab['nodeId']] = true;
                } else {
                    // Follow anchor binding based on the label's position along the line
                    $t = 0.5;
                    if (isset($lab['t'])) {
                        $t = max(0.0, min(1.0, (float)$lab['t']));
                    } elseif (isset($lab['position'])) {
                        $pos = (string)$lab['position'];
                        $t = $pos === 'source' ? 0.15 : ($pos === 'target' ? 0.85 : 0.5);
                    }
                    $bindingId = $t < 0.5
                        ? ($el['sourceId'] ?? ($el['targetId'] ?? null))
                        : ($el['targetId'] ?? ($el['sourceId'] ?? null));
                    if ($bindingId && isset($nodeCardByElementId[(string)$bindingId])) {
                        $nodeIds[$nodeCardByElementId[(string)$bindingId]] = true;
                    }
                }
            }
        }
        $nodeIds = array_keys($nodeIds);

        /** @var array<int, Node> */
        $nodesById = [];
        $inventoryByNode = [];
        if (!empty($nodeIds)) {
            $nodes = $this->em->getRepository(Node::class)->findBy(['id' => $nodeIds]);
            foreach ($nodes as $n) {
                $nodesById[$n->getId()] = $n;
            }
            $rows = $this->em->createQuery(
                'SELECT IDENTITY(e.node) AS nodeId, e.categoryName, e.entryKey, e.colLabel, e.value
                 FROM App\Entity\NodeInventoryEntry e
                 WHERE e.node IN (:nodes)'
            )->setParameter('nodes', $nodeIds)->getArrayResult();
            foreach ($rows as $row) {
                $inventoryByNode[(int)$row['nodeId']][$row['categoryName']][$row['entryKey']][$row['colLabel']] = $row['value'];
            }
        }

        // Sort elements by zIndex ASC, then by their original position (stable).
        $indexed = [];
        foreach ($elements as $i => $el) {
            $indexed[] = ['i' => $i, 'el' => $el];
        }
        usort($indexed, function ($a, $b) {
            $za = (float)($a['el']['zIndex'] ?? 0);
            $zb = (float)($b['el']['zIndex'] ?? 0);
            if ($za === $zb) return $a['i'] <=> $b['i'];
            return $za <=> $zb;
        });

        // Compute auto-fit bounding box.
        if ($viewportFrame !== null) {
            $minX = (float)$viewportFrame['x'];
            $minY = (float)$viewportFrame['y'];
            $vw = max(1.0, (float)$viewportFrame['width']);
            $vh = max(1.0, (float)$viewportFrame['height']);
        } else {
            $canvasSize = $schema->getCanvasSize();
            if (is_array($canvasSize) && isset($canvasSize['width'], $canvasSize['height'])) {
                $minX = 0.0;
                $minY = 0.0;
                $vw = max(1.0, (float)$canvasSize['width']);
                $vh = max(1.0, (float)$canvasSize['height']);
            } else {
                [$minX, $minY, $vw, $vh] = $this->computeBoundingBox($elements);
            }
        }
        $svgH = (int) round($canvasWidth * ($vh / $vw));

        $out = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' . $canvasWidth . '" height="' . $svgH . '" viewBox="' . $this->fmt($minX) . ' ' . $this->fmt($minY) . ' ' . $this->fmt($vw) . ' ' . $this->fmt($vh) . '">';
        $out .= '<rect x="' . $this->fmt($minX) . '" y="' . $this->fmt($minY) . '" width="' . $this->fmt($vw) . '" height="' . $this->fmt($vh) . '" fill="#ffffff"/>';

        // Collect fill patterns (hachure / cross-hatch) by unique color × kind.
        // Shapes carry it under style.fillStyle; node_card_styled under design.fillStyle.
        $fillPatterns = [];
        foreach ($elements as $el) {
            $kind = $el['kind'] ?? '';
            if ($kind === 'shape') {
                $fs = $el['style']['fillStyle'] ?? 'solid';
                if ($fs === 'solid') continue;
                $color = (string)($el['style']['fill'] ?? '#3b82f6');
            } elseif ($kind === 'node_card_styled') {
                $fs = $el['design']['fillStyle'] ?? 'solid';
                if ($fs === 'solid') continue;
                $color = (string)($el['design']['bgColor'] ?? '#ffffff');
            } else {
                continue;
            }
            $key = $fs . '-' . preg_replace('/[^a-z0-9]/i', '', $color);
            $fillPatterns[$key] = ['color' => $color, 'kind' => $fs];
        }

        // Arrow markers, sloppy filters, and hachure patterns.
        $out .= '<defs>'
            . '<marker id="rs-arrow-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker>'
            . '<marker id="rs-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 10 0 L 0 5 L 10 10 z" fill="currentColor"/></marker>'
            . '<filter id="rs-sloppy-artist" x="-10%" y="-10%" width="120%" height="120%"><feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3"/><feDisplacementMap in="SourceGraphic" scale="1.4"/></filter>'
            . '<filter id="rs-sloppy-cartoonist" x="-15%" y="-15%" width="130%" height="130%"><feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="7"/><feDisplacementMap in="SourceGraphic" scale="3"/></filter>';
        foreach ($fillPatterns as $key => $p) {
            $color = htmlspecialchars($p['color'], ENT_QUOTES | ENT_XML1);
            if ($p['kind'] === 'hachure') {
                $out .= '<pattern id="rs-fp-' . $key . '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="6" stroke="' . $color . '" stroke-width="1.2"/></pattern>';
            } else {
                $out .= '<pattern id="rs-fp-' . $key . '" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)"><line x1="0" y1="0" x2="0" y2="6" stroke="' . $color . '" stroke-width="1.2"/><line x1="0" y1="0" x2="6" y2="0" stroke="' . $color . '" stroke-width="1.2"/></pattern>';
            }
        }
        $out .= '</defs>';

        // Index elements by id and pre-compute line endpoint slots (for parallel
        // offset centering at shared anchors). Mirrors the frontend useMemo logic.
        $elementsById = [];
        foreach ($elements as $e) {
            if (isset($e['id'])) $elementsById[(string)$e['id']] = $e;
        }
        $lineOffsets = $this->computeLineOffsets($elements);

        foreach ($indexed as $entry) {
            $el = $entry['el'];
            $kind = (string)($el['kind'] ?? '');
            $out .= match ($kind) {
                'shape'             => $this->renderShape($el),
                'text'              => $this->renderText($el),
                'image'             => $this->renderImage($el),
                'line'              => $this->renderLine($el, $elementsById, $lineOffsets, $nodesById, $inventoryByNode),
                'freedraw'          => $this->renderFreedraw($el),
                'bezier'            => $this->renderBezier($el),
                'node_card_styled'  => $this->renderNodeCardStyled($el, $nodesById, $inventoryByNode),
                'node_card_table'   => $this->renderNodeCardTable($el, $nodesById, $inventoryByNode),
                'data_label'        => $this->renderDataLabel($el, $nodesById, $inventoryByNode),
                default             => '',
            };
        }

        $out .= '</svg>';
        return $out;
    }

    /**
     * @return array{0:float,1:float,2:float,3:float} [minX, minY, width, height]
     */
    private function computeBoundingBox(array $elements): array
    {
        $minX = PHP_FLOAT_MAX; $minY = PHP_FLOAT_MAX;
        $maxX = -PHP_FLOAT_MAX; $maxY = -PHP_FLOAT_MAX;
        $count = 0;

        foreach ($elements as $el) {
            $bb = $this->boundsOf($el);
            if ($bb === null) continue;
            [$x1, $y1, $x2, $y2] = $bb;
            $minX = min($minX, $x1);
            $minY = min($minY, $y1);
            $maxX = max($maxX, $x2);
            $maxY = max($maxY, $y2);
            $count++;
        }

        if ($count === 0) {
            return [0.0, 0.0, 800.0, 600.0];
        }
        $pad = 40.0;
        $minX -= $pad; $minY -= $pad; $maxX += $pad; $maxY += $pad;
        return [$minX, $minY, max(1.0, $maxX - $minX), max(1.0, $maxY - $minY)];
    }

    /**
     * @return array{0:float,1:float,2:float,3:float}|null [x1,y1,x2,y2]
     */
    private function boundsOf(array $el): ?array
    {
        $kind = $el['kind'] ?? '';
        switch ($kind) {
            case 'shape':
            case 'text':
            case 'image':
            case 'node_card_table':
            case 'data_label': {
                $x = (float)($el['x'] ?? 0);
                $y = (float)($el['y'] ?? 0);
                $w = (float)($el['width'] ?? 0);
                $h = (float)($el['height'] ?? 0);
                return [$x, $y, $x + $w, $y + $h];
            }
            case 'node_card_styled': {
                $x = (float)($el['x'] ?? 0);
                $y = (float)($el['y'] ?? 0);
                $w = (float)($el['design']['width'] ?? 100);
                $h = (float)($el['design']['height'] ?? 40);
                return [$x - $w / 2, $y - $h / 2, $x + $w / 2, $y + $h / 2];
            }
            case 'line': {
                $x1 = (float)($el['x1'] ?? 0);
                $y1 = (float)($el['y1'] ?? 0);
                $x2 = (float)($el['x2'] ?? 0);
                $y2 = (float)($el['y2'] ?? 0);
                return [min($x1, $x2), min($y1, $y2), max($x1, $x2), max($y1, $y2)];
            }
            case 'freedraw':
            case 'bezier': {
                $pts = $el['points'] ?? [];
                if (empty($pts)) return null;
                $xs = []; $ys = [];
                foreach ($pts as $p) {
                    if (isset($p['x'], $p['y'])) {
                        $xs[] = (float)$p['x'];
                        $ys[] = (float)$p['y'];
                    }
                }
                if (empty($xs)) return null;
                return [min($xs), min($ys), max($xs), max($ys)];
            }
        }
        return null;
    }

    private function renderShape(array $el): string
    {
        $shape = (string)($el['shape'] ?? 'rectangle');
        $x = (float)($el['x'] ?? 0);
        $y = (float)($el['y'] ?? 0);
        $w = (float)($el['width'] ?? 100);
        $h = (float)($el['height'] ?? 60);
        $rot = (float)($el['rotation'] ?? 0);
        $style = $el['style'] ?? [];
        $fillRaw = (string)($style['fill'] ?? '#3b82f6');
        $stroke = $style['stroke'] ?? '#1e40af';
        $sw = (float)($style['strokeWidth'] ?? 1);
        $op = (float)($style['opacity'] ?? 1);
        $fop = (float)($style['fillOpacity'] ?? 0.2);
        $br = (float)($style['borderRadius'] ?? 4);
        $dashS = $this->dashFor((string)($style['dash'] ?? 'solid'), $sw);
        $dashAttr = $dashS ? ' stroke-dasharray="' . $dashS . '"' : '';

        $fillStyle = (string)($style['fillStyle'] ?? 'solid');
        $sloppiness = (string)($style['sloppiness'] ?? 'architect');
        if ($fillStyle !== 'solid') {
            $key = $fillStyle . '-' . preg_replace('/[^a-z0-9]/i', '', $fillRaw);
            $fill = 'url(#rs-fp-' . $key . ')';
            $fop = 1.0;
        } else {
            $fill = $fillRaw;
        }
        $filterAttr = $sloppiness === 'artist' ? ' filter="url(#rs-sloppy-artist)"' : ($sloppiness === 'cartoonist' ? ' filter="url(#rs-sloppy-cartoonist)"' : '');

        $svg = '<g transform="translate(' . $this->fmt($x) . ' ' . $this->fmt($y) . ')'
            . ($rot !== 0.0 ? ' rotate(' . $this->fmt($rot) . ' ' . $this->fmt($w / 2) . ' ' . $this->fmt($h / 2) . ')' : '')
            . '" opacity="' . $this->fmt($op) . '"' . $filterAttr . '>';

        switch ($shape) {
            case 'ellipse':
                $svg .= '<ellipse cx="' . $this->fmt($w / 2) . '" cy="' . $this->fmt($h / 2) . '" rx="' . $this->fmt($w / 2) . '" ry="' . $this->fmt($h / 2) . '" fill="' . $fill . '" fill-opacity="' . $this->fmt($fop) . '" stroke="' . $stroke . '" stroke-width="' . $this->fmt($sw) . '"' . $dashAttr . '/>';
                break;
            case 'diamond':
                $svg .= '<polygon points="' . $this->fmt($w / 2) . ',0 ' . $this->fmt($w) . ',' . $this->fmt($h / 2) . ' ' . $this->fmt($w / 2) . ',' . $this->fmt($h) . ' 0,' . $this->fmt($h / 2) . '" fill="' . $fill . '" fill-opacity="' . $this->fmt($fop) . '" stroke="' . $stroke . '" stroke-width="' . $this->fmt($sw) . '"' . $dashAttr . '/>';
                break;
            case 'triangle':
                $svg .= '<polygon points="' . $this->fmt($w / 2) . ',0 ' . $this->fmt($w) . ',' . $this->fmt($h) . ' 0,' . $this->fmt($h) . '" fill="' . $fill . '" fill-opacity="' . $this->fmt($fop) . '" stroke="' . $stroke . '" stroke-width="' . $this->fmt($sw) . '"' . $dashAttr . '/>';
                break;
            case 'hexagon': {
                $r = $w / 2;
                $pts = [];
                for ($i = 0; $i < 6; $i++) {
                    $a = (M_PI / 3) * $i - M_PI / 6;
                    $pts[] = $this->fmt($r + $r * cos($a)) . ',' . $this->fmt($h / 2 + $r * sin($a));
                }
                $svg .= '<polygon points="' . implode(' ', $pts) . '" fill="' . $fill . '" fill-opacity="' . $this->fmt($fop) . '" stroke="' . $stroke . '" stroke-width="' . $this->fmt($sw) . '"' . $dashAttr . '/>';
                break;
            }
            case 'rectangle':
            default:
                $svg .= '<rect width="' . $this->fmt($w) . '" height="' . $this->fmt($h) . '" rx="' . $this->fmt($br) . '" ry="' . $this->fmt($br) . '" fill="' . $fill . '" fill-opacity="' . $this->fmt($fop) . '" stroke="' . $stroke . '" stroke-width="' . $this->fmt($sw) . '"' . $dashAttr . '/>';
        }

        $svg .= '</g>';
        return $svg;
    }

    private function renderText(array $el): string
    {
        $x = (float)($el['x'] ?? 0);
        $y = (float)($el['y'] ?? 0);
        $w = (float)($el['width'] ?? 100);
        $h = (float)($el['height'] ?? 24);
        $rot = (float)($el['rotation'] ?? 0);
        $text = (string)($el['text'] ?? '');
        $fs = (float)($el['fontSize'] ?? 14);
        $col = $el['color'] ?? '#1e293b';
        $fw = (int)($el['fontWeight'] ?? 400);
        $ff = $el['fontFamily'] ?? 'sans-serif';
        $fst = $el['fontStyle'] ?? 'normal';
        $align = $el['textAlign'] ?? 'left';
        $anchor = $align === 'left' ? 'start' : ($align === 'right' ? 'end' : 'middle');
        $bgColor = $el['bgColor'] ?? null;
        $pad = (float)($el['padding'] ?? 4);
        $tx = $align === 'left' ? $pad : ($align === 'right' ? $w - $pad : $w / 2);

        $svg = '<g transform="translate(' . $this->fmt($x) . ' ' . $this->fmt($y) . ')'
            . ($rot !== 0.0 ? ' rotate(' . $this->fmt($rot) . ' ' . $this->fmt($w / 2) . ' ' . $this->fmt($h / 2) . ')' : '')
            . '">';
        if ($bgColor) {
            $svg .= '<rect x="0" y="0" width="' . $this->fmt($w) . '" height="' . $this->fmt($h) . '" fill="' . htmlspecialchars($bgColor, ENT_QUOTES | ENT_XML1) . '" rx="2"/>';
        }
        $lines = preg_split('/\r?\n/', $text) ?: [$text];
        $lineH = $fs * 1.25;
        $totalH = count($lines) * $lineH;
        $startY = ($h - $totalH) / 2 + $fs * 0.85;
        foreach ($lines as $i => $line) {
            $ly = $startY + $i * $lineH;
            $svg .= '<text x="' . $this->fmt($tx) . '" y="' . $this->fmt($ly) . '" text-anchor="' . $anchor . '" fill="' . $col . '" font-size="' . $this->fmt($fs) . '" font-weight="' . $fw . '" font-family="' . htmlspecialchars($ff, ENT_QUOTES | ENT_XML1) . '" font-style="' . htmlspecialchars($fst, ENT_QUOTES | ENT_XML1) . '">' . htmlspecialchars($line) . '</text>';
        }
        $svg .= '</g>';
        return $svg;
    }

    private function renderImage(array $el): string
    {
        $url = (string)($el['url'] ?? '');
        if ($url === '') return '';
        $x = (float)($el['x'] ?? 0);
        $y = (float)($el['y'] ?? 0);
        $w = (float)($el['width'] ?? 100);
        $h = (float)($el['height'] ?? 100);
        $rot = (float)($el['rotation'] ?? 0);
        $op = (float)($el['opacity'] ?? 1);

        $svg = '<g transform="translate(' . $this->fmt($x) . ' ' . $this->fmt($y) . ')'
            . ($rot !== 0.0 ? ' rotate(' . $this->fmt($rot) . ' ' . $this->fmt($w / 2) . ' ' . $this->fmt($h / 2) . ')' : '')
            . '">';
        $svg .= '<image xlink:href="' . htmlspecialchars($url, ENT_QUOTES | ENT_XML1) . '" width="' . $this->fmt($w) . '" height="' . $this->fmt($h) . '" opacity="' . $this->fmt($op) . '" preserveAspectRatio="xMidYMid meet"/>';
        $svg .= '</g>';
        return $svg;
    }

    /**
     * @param array<string, array> $elementsById Map of every element keyed by id (for anchor resolution).
     * @param array<string, array{offsetIndex: float, count: int}> $lineOffsets Map of "${lineId}|src|tgt" → offset slot.
     * @param array<int, Node> $nodesById
     */
    private function renderLine(array $el, array $elementsById, array $lineOffsets, array $nodesById = [], array $inventoryByNode = []): string
    {
        // Resolve actual endpoint geometry — anchored lines follow their bound elements.
        [$x1, $y1, $x2, $y2] = $this->resolveLineGeometry($el, $elementsById, $lineOffsets);

        $style = $el['style'] ?? [];
        $stroke = $style['stroke'] ?? '#1e293b';
        $sw = (float)($style['strokeWidth'] ?? 2);
        $op = (float)($style['opacity'] ?? 1);
        $dashS = $this->dashFor((string)($style['dash'] ?? 'solid'), $sw);
        $dashAttr = $dashS ? ' stroke-dasharray="' . $dashS . '"' : '';
        $arrowStart = !empty($el['arrowStart']);
        $arrowEnd = !empty($el['arrowEnd']);
        $markerStart = $arrowStart ? ' marker-start="url(#rs-arrow-start)"' : '';
        $markerEnd = $arrowEnd ? ' marker-end="url(#rs-arrow-end)"' : '';
        $sloppiness = (string)($style['sloppiness'] ?? 'architect');
        $filterAttr = $sloppiness === 'artist' ? ' filter="url(#rs-sloppy-artist)"' : ($sloppiness === 'cartoonist' ? ' filter="url(#rs-sloppy-cartoonist)"' : '');

        $line = '<line x1="' . $this->fmt($x1) . '" y1="' . $this->fmt($y1) . '" x2="' . $this->fmt($x2) . '" y2="' . $this->fmt($y2)
            . '" stroke="' . $stroke . '" stroke-width="' . $this->fmt($sw) . '" opacity="' . $this->fmt($op) . '"'
            . ' style="color:' . $stroke . '"'
            . $dashAttr . $markerStart . $markerEnd . '/>';
        $lineSvg = $filterAttr ? '<g' . $filterAttr . '>' . $line . '</g>' : $line;

        // Labels along the line
        $labels = $el['labels'] ?? [];
        if (!empty($labels) && is_array($labels)) {
            $len = sqrt(($x2 - $x1) ** 2 + ($y2 - $y1) ** 2);
            if ($len < 1) $len = 1;
            $tx = ($x2 - $x1) / $len;
            $ty = ($y2 - $y1) / $len;
            $nx = -$ty;
            $ny = $tx;
            // Angle (degrees) of the line — used to rotate text labels along it.
            // We "flip" by 180° if the line points right-to-left so text stays readable.
            $angleDeg = atan2($y2 - $y1, $x2 - $x1) * 180 / M_PI;
            $readableAngle = ($angleDeg > 90 || $angleDeg < -90) ? $angleDeg + 180 : $angleDeg;
            foreach ($labels as $lab) {
                if (!is_array($lab)) continue;
                // Position along the line — supports the new `t` field plus the legacy `position` enum.
                $t = 0.5;
                if (isset($lab['t'])) {
                    $t = max(0.0, min(1.0, (float)$lab['t']));
                } elseif (isset($lab['position'])) {
                    $pos = (string)$lab['position'];
                    $t = $pos === 'source' ? 0.15 : ($pos === 'target' ? 0.85 : 0.5);
                }
                $off = isset($lab['offset']) ? (float)$lab['offset'] : 0.0;
                $cx = $x1 + $tx * $len * $t + $nx * $off;
                $cy = $y1 + $ty * $len * $t + $ny * $off;

                // Resolve label text — explicit dataBinding wins, else fall back to template behaviour.
                $text = $this->resolveLabelText($lab, $el, $elementsById, $nodesById, $inventoryByNode);
                $kind = (string)($lab['kind'] ?? 'text');
                // For text labels we skip empty content; pills keep rendering their circle even with no caption.
                if ($kind !== 'pill' && $text === '') continue;
                $color = (string)($lab['color'] ?? '#1e293b');
                $borderColor = $lab['borderColor'] ?? null;

                if ($kind === 'pill') {
                    $size = (float)($lab['pillSize'] ?? max(((float)($lab['fontSize'] ?? 9)) * 1.4, 14.0));
                    $pillColor = $this->resolvePillColor($lab, $nodesById, $inventoryByNode);
                    $borderStroke = (string)($borderColor ?? '#ffffff');
                    $lineSvg .= '<circle cx="' . $this->fmt($cx) . '" cy="' . $this->fmt($cy) . '" r="' . $this->fmt($size / 2) . '" fill="' . htmlspecialchars($pillColor, ENT_QUOTES | ENT_XML1) . '" stroke="' . htmlspecialchars($borderStroke, ENT_QUOTES | ENT_XML1) . '" stroke-width="1.5"/>';
                    $lineSvg .= '<text x="' . $this->fmt($cx) . '" y="' . $this->fmt($cy + $size * 0.32) . '" text-anchor="middle" fill="' . $color . '" font-size="' . $this->fmt($size * 0.6) . '" font-weight="700">' . htmlspecialchars($text) . '</text>';
                    continue;
                }

                // Text mode (with optional badge background)
                $fontSize = (float)($lab['fontSize'] ?? 11);
                $fontWeight = (int)($lab['fontWeight'] ?? 500);
                $fontStyle = ($lab['fontStyle'] ?? 'normal') === 'italic' ? 'italic' : 'normal';
                $bgColor = $lab['bgColor'] ?? null;
                $padding = (float)($lab['padding'] ?? 3);
                $charW = $fontSize * 0.58;
                $textW = strlen($text) * $charW;
                $borderRadius = isset($lab['borderRadius']) ? (float)$lab['borderRadius'] : ($bgColor ? $fontSize * 0.6 : 3);
                $isBadge = !empty($bgColor);

                // Open rotation group so the text (and its optional badge) follows the line's angle.
                $lineSvg .= '<g transform="rotate(' . $this->fmt($readableAngle) . ' ' . $this->fmt($cx) . ' ' . $this->fmt($cy) . ')">';
                if ($isBadge) {
                    $bx = $cx - $textW / 2 - $padding;
                    $by = $cy - $fontSize / 2 - $padding;
                    $bw = $textW + $padding * 2;
                    $bh = $fontSize + $padding * 2;
                    $strokeAttr = $borderColor ? ' stroke="' . htmlspecialchars((string)$borderColor, ENT_QUOTES | ENT_XML1) . '" stroke-width="0.8"' : '';
                    $lineSvg .= '<rect x="' . $this->fmt($bx) . '" y="' . $this->fmt($by) . '" width="' . $this->fmt($bw) . '" height="' . $this->fmt($bh) . '" rx="' . $this->fmt($borderRadius) . '" ry="' . $this->fmt($borderRadius) . '" fill="' . htmlspecialchars((string)$bgColor, ENT_QUOTES | ENT_XML1) . '"' . $strokeAttr . '/>';
                }
                $lineSvg .= '<text x="' . $this->fmt($cx) . '" y="' . $this->fmt($cy + $fontSize * 0.35) . '" text-anchor="middle" fill="' . $color . '" font-size="' . $this->fmt($fontSize) . '" font-weight="' . $fontWeight . '" font-style="' . $fontStyle . '">' . htmlspecialchars($text) . '</text>';
                $lineSvg .= '</g>';
            }
        }

        return $lineSvg;
    }

    /**
     * Resolve the text rendered for a label.
     *  - When `dataBinding` is set: read the value directly from the bound node+field.
     *  - Otherwise: legacy %placeholder% template behaviour against the inferred node.
     */
    private function resolveLabelText(array $label, array $line, array $elementsById, array $nodesById, array $inventoryByNode): string
    {
        $binding = $label['dataBinding'] ?? null;
        if (is_array($binding) && isset($binding['nodeId']) && $binding['nodeId'] !== null) {
            $nid = (int)$binding['nodeId'];
            $field = (string)($binding['field'] ?? '');
            if (isset($nodesById[$nid])) {
                $nodeInfo = ['node' => $nodesById[$nid], 'inventory' => $inventoryByNode[$nid] ?? []];
                return (string)($this->resolveFieldValue($field, $nodeInfo) ?? '');
            }
            return '';
        }
        // Template fallback
        $nodeId = $this->resolveLineLabelNodeId($label, $line, $elementsById);
        $rawText = (string)($label['text'] ?? '');
        if ($nodeId !== null && isset($nodesById[$nodeId])) {
            $nodeInfo = ['node' => $nodesById[$nodeId], 'inventory' => $inventoryByNode[$nodeId] ?? []];
            $resolved = $this->resolveTemplate($rawText, $nodeInfo);
            if ($resolved !== '') return $resolved;
        }
        return $rawText;
    }

    /**
     * Evaluate the pill's conditional color rules. First matching rule wins;
     * otherwise the static `pillColor` is used (default green).
     */
    private function resolvePillColor(array $label, array $nodesById, array $inventoryByNode): string
    {
        $rules = $label['pillColorRules'] ?? [];
        if (is_array($rules)) {
            foreach ($rules as $rule) {
                if (!is_array($rule)) continue;
                $source = $rule['source'] ?? null;
                if (!is_array($source)) continue;
                $nid = $source['nodeId'] ?? null;
                if ($nid === null) continue;
                $nid = (int)$nid;
                if (!isset($nodesById[$nid])) continue;
                $field = (string)($source['field'] ?? '');
                $nodeInfo = ['node' => $nodesById[$nid], 'inventory' => $inventoryByNode[$nid] ?? []];
                $raw = $this->resolveFieldValue($field, $nodeInfo);
                $fv = $raw === '' ? null : $raw;
                $op = (string)($rule['operator'] ?? 'equals');
                $cmp = $rule['value'] ?? null;
                if ($this->compareLabelValue($fv, $op, $cmp)) {
                    return (string)($rule['color'] ?? '#22c55e');
                }
            }
        }
        return (string)($label['pillColor'] ?? '#22c55e');
    }

    /**
     * Mirrors compareLabelValue() in SchemaEditor.tsx (which itself mirrors the
     * compareValue() semantics of the global ConditionTreeEvaluator).
     */
    private function compareLabelValue(?string $fieldValue, string $operator, mixed $compareValue): bool
    {
        return match ($operator) {
            'equals'       => (string)$fieldValue === (string)($compareValue ?? ''),
            'not_equals'   => (string)$fieldValue !== (string)($compareValue ?? ''),
            'exists'       => $fieldValue !== null,
            'not_exists'   => $fieldValue === null,
            'contains'     => is_string($fieldValue) && str_contains($fieldValue, (string)($compareValue ?? '')),
            'not_contains' => !is_string($fieldValue) || !str_contains($fieldValue, (string)($compareValue ?? '')),
            'matches'      => is_string($fieldValue) && (bool)@preg_match('~' . str_replace('~', '\\~', (string)($compareValue ?? '')) . '~', $fieldValue),
            'greater_than' => is_numeric($fieldValue) && is_numeric($compareValue) && (float)$fieldValue > (float)$compareValue,
            'less_than'    => is_numeric($fieldValue) && is_numeric($compareValue) && (float)$fieldValue < (float)$compareValue,
            'is_empty'     => $fieldValue === null || $fieldValue === '',
            'is_not_empty' => $fieldValue !== null && $fieldValue !== '',
            default        => false,
        };
    }

    /**
     * For a line label, resolve which node should provide field values.
     * Mirrors resolveLineLabelNodeId() in SchemaEditor.tsx.
     */
    private function resolveLineLabelNodeId(array $label, array $line, array $elementsById): ?int
    {
        if (isset($label['nodeId']) && $label['nodeId'] !== null) {
            return (int)$label['nodeId'];
        }
        // Determine which endpoint this label is "closer to" based on its position.
        $t = 0.5;
        if (isset($label['t'])) {
            $t = max(0.0, min(1.0, (float)$label['t']));
        } elseif (isset($label['position'])) {
            $pos = (string)$label['position'];
            $t = $pos === 'source' ? 0.15 : ($pos === 'target' ? 0.85 : 0.5);
        }
        $bindingId = $t < 0.5
            ? ($line['sourceId'] ?? ($line['targetId'] ?? null))
            : ($line['targetId'] ?? ($line['sourceId'] ?? null));
        if (!$bindingId) return null;
        $el = $elementsById[(string)$bindingId] ?? null;
        if (!$el) return null;
        $kind = $el['kind'] ?? '';
        if ($kind === 'node_card_styled' || $kind === 'node_card_table') {
            return isset($el['nodeId']) ? (int)$el['nodeId'] : null;
        }
        return null;
    }

    /**
     * Bounding box (x, y, w, h) of any anchorable element in world coordinates.
     * Returns null for non-anchorable kinds (line, freedraw, bezier, data_label).
     * Mirrors anchorableBounds() in SchemaEditor.tsx.
     *
     * @return array{0: float, 1: float, 2: float, 3: float}|null
     */
    private function anchorableBounds(array $el): ?array
    {
        $kind = $el['kind'] ?? '';
        switch ($kind) {
            case 'shape':
            case 'image':
            case 'node_card_table':
            case 'text':
                return [
                    (float)($el['x'] ?? 0),
                    (float)($el['y'] ?? 0),
                    (float)($el['width'] ?? 0),
                    (float)($el['height'] ?? 0),
                ];
            case 'node_card_styled': {
                $w = (float)($el['design']['width'] ?? 100);
                $h = (float)($el['design']['height'] ?? 40);
                return [
                    (float)($el['x'] ?? 0) - $w / 2,
                    (float)($el['y'] ?? 0) - $h / 2,
                    $w,
                    $h,
                ];
            }
        }
        return null;
    }

    /**
     * World coordinates for an anchor position on an element.
     * @return array{0: float, 1: float}|null
     */
    private function anchorablePoint(array $el, string $anchor): ?array
    {
        $b = $this->anchorableBounds($el);
        if ($b === null) return null;
        [$x, $y, $w, $h] = $b;
        return match ($anchor) {
            'n'  => [$x + $w / 2, $y],
            'ne' => [$x + $w,     $y],
            'e'  => [$x + $w,     $y + $h / 2],
            'se' => [$x + $w,     $y + $h],
            's'  => [$x + $w / 2, $y + $h],
            'sw' => [$x,          $y + $h],
            'w'  => [$x,          $y + $h / 2],
            'nw' => [$x,          $y],
            default => null,
        };
    }

    /**
     * Tangent vector (dx, dy) along which to spread parallel lines anchored at a same point.
     * @return array{0: float, 1: float}
     */
    private function anchorTangent(string $anchor): array
    {
        return match ($anchor) {
            'n', 's' => [1.0, 0.0],
            'e', 'w' => [0.0, 1.0],
            'ne'     => [-0.707, 0.707],
            'nw'     => [0.707,  0.707],
            'se'     => [-0.707, -0.707],
            'sw'     => [0.707,  -0.707],
            default  => [1.0, 0.0],
        };
    }

    /**
     * For each line endpoint binding (lineId|src|tgt), compute its index within
     * the set of lines sharing the same (elementId, anchor). Used to spread
     * parallel lines symmetrically. Mirrors the frontend useMemo logic.
     *
     * @return array<string, array{offsetIndex: float, count: int}>
     */
    private function computeLineOffsets(array $elements): array
    {
        $slots = [];   // key "${id}|${anchor}" → list of {lineId, end}
        foreach ($elements as $el) {
            if (($el['kind'] ?? '') !== 'line') continue;
            if (!empty($el['sourceId']) && !empty($el['sourceAnchor'])) {
                $k = $el['sourceId'] . '|' . $el['sourceAnchor'];
                $slots[$k][] = ['line' => (string)$el['id'], 'end' => 'src'];
            }
            if (!empty($el['targetId']) && !empty($el['targetAnchor'])) {
                $k = $el['targetId'] . '|' . $el['targetAnchor'];
                $slots[$k][] = ['line' => (string)$el['id'], 'end' => 'tgt'];
            }
        }
        $result = [];
        foreach ($slots as $arr) {
            // Stable sort by line id (matches frontend localeCompare)
            usort($arr, fn($a, $b) => strcmp($a['line'], $b['line']));
            $n = count($arr);
            foreach ($arr as $i => $s) {
                $result[$s['line'] . '|' . $s['end']] = [
                    'offsetIndex' => $i - ($n - 1) / 2.0,
                    'count'       => $n,
                ];
            }
        }
        return $result;
    }

    /**
     * Resolve the geometric endpoints of a line, applying anchor lookup and the
     * parallel-line offset along the anchor's tangent.
     *
     * @return array{0: float, 1: float, 2: float, 3: float} [x1, y1, x2, y2]
     */
    private function resolveLineGeometry(array $line, array $elementsById, array $lineOffsets): array
    {
        $gap = 8.0; // mirrors PARALLEL_LINE_GAP in SchemaEditor.tsx
        $resolveEnd = function (?string $id, ?string $anchor, string $end, float $fbX, float $fbY) use ($line, $elementsById, $lineOffsets, $gap): array {
            if (!$id || !$anchor) return [$fbX, $fbY];
            $el = $elementsById[$id] ?? null;
            if (!$el) return [$fbX, $fbY];
            $p = $this->anchorablePoint($el, $anchor);
            if ($p === null) return [$fbX, $fbY];
            [$x, $y] = $p;
            $slot = $lineOffsets[$line['id'] . '|' . $end] ?? null;
            if (!$slot || $slot['count'] <= 1) return [$x, $y];
            [$tx, $ty] = $this->anchorTangent($anchor);
            return [$x + $tx * $slot['offsetIndex'] * $gap, $y + $ty * $slot['offsetIndex'] * $gap];
        };
        [$x1, $y1] = $resolveEnd(
            isset($line['sourceId']) ? (string)$line['sourceId'] : null,
            isset($line['sourceAnchor']) ? (string)$line['sourceAnchor'] : null,
            'src',
            (float)($line['x1'] ?? 0),
            (float)($line['y1'] ?? 0),
        );
        [$x2, $y2] = $resolveEnd(
            isset($line['targetId']) ? (string)$line['targetId'] : null,
            isset($line['targetAnchor']) ? (string)$line['targetAnchor'] : null,
            'tgt',
            (float)($line['x2'] ?? 0),
            (float)($line['y2'] ?? 0),
        );
        return [$x1, $y1, $x2, $y2];
    }

    private function renderFreedraw(array $el): string
    {
        $points = $el['points'] ?? [];
        if (count($points) < 2) return '';
        $style = $el['style'] ?? [];
        $stroke = $style['stroke'] ?? '#1e293b';
        $sw = (float)($style['strokeWidth'] ?? 2);
        $op = (float)($style['opacity'] ?? 1);
        $sloppiness = (string)($style['sloppiness'] ?? 'architect');
        $filterAttr = $sloppiness === 'artist' ? ' filter="url(#rs-sloppy-artist)"' : ($sloppiness === 'cartoonist' ? ' filter="url(#rs-sloppy-cartoonist)"' : '');

        $d = '';
        foreach ($points as $i => $p) {
            $x = $this->fmt((float)($p['x'] ?? 0));
            $y = $this->fmt((float)($p['y'] ?? 0));
            $d .= ($i === 0 ? 'M ' : ' L ') . $x . ' ' . $y;
        }
        $path = '<path d="' . $d . '" fill="none" stroke="' . $stroke . '" stroke-width="' . $this->fmt($sw) . '" opacity="' . $this->fmt($op) . '" stroke-linecap="round" stroke-linejoin="round"/>';
        return $filterAttr ? '<g' . $filterAttr . '>' . $path . '</g>' : $path;
    }

    private function renderBezier(array $el): string
    {
        $points = $el['points'] ?? [];
        if (count($points) < 2) return '';
        $style = $el['style'] ?? [];
        $stroke = $style['stroke'] ?? '#1e293b';
        $sw = (float)($style['strokeWidth'] ?? 2);
        $op = (float)($style['opacity'] ?? 1);
        $dashS = $this->dashFor((string)($style['dash'] ?? 'solid'), $sw);
        $dashAttr = $dashS ? ' stroke-dasharray="' . $dashS . '"' : '';
        $sloppiness = (string)($style['sloppiness'] ?? 'architect');
        $filterAttr = $sloppiness === 'artist' ? ' filter="url(#rs-sloppy-artist)"' : ($sloppiness === 'cartoonist' ? ' filter="url(#rs-sloppy-cartoonist)"' : '');

        $d = 'M ' . $this->fmt((float)($points[0]['x'] ?? 0)) . ' ' . $this->fmt((float)($points[0]['y'] ?? 0));
        for ($i = 1; $i < count($points); $i++) {
            $p = $points[$i];
            $cx1 = (float)($p['cx1'] ?? $p['x'] ?? 0);
            $cy1 = (float)($p['cy1'] ?? $p['y'] ?? 0);
            $cx2 = (float)($p['cx2'] ?? $p['x'] ?? 0);
            $cy2 = (float)($p['cy2'] ?? $p['y'] ?? 0);
            $x = (float)($p['x'] ?? 0);
            $y = (float)($p['y'] ?? 0);
            $d .= ' C ' . $this->fmt($cx1) . ' ' . $this->fmt($cy1) . ' ' . $this->fmt($cx2) . ' ' . $this->fmt($cy2) . ' ' . $this->fmt($x) . ' ' . $this->fmt($y);
        }
        $path = '<path d="' . $d . '" fill="none" stroke="' . $stroke . '" stroke-width="' . $this->fmt($sw) . '" opacity="' . $this->fmt($op) . '"' . $dashAttr . ' stroke-linecap="round"/>';
        return $filterAttr ? '<g' . $filterAttr . '>' . $path . '</g>' : $path;
    }

    /**
     * @param array<int, Node> $nodesById
     */
    private function renderDataLabel(array $el, array $nodesById, array $inventoryByNode): string
    {
        $nid = (int)($el['nodeId'] ?? 0);
        $node = $nodesById[$nid] ?? null;
        $field = (string)($el['field'] ?? '');

        $x = (float)($el['x'] ?? 0);
        $y = (float)($el['y'] ?? 0);
        $w = (float)($el['width'] ?? 200);
        $h = (float)($el['height'] ?? 48);
        $rot = (float)($el['rotation'] ?? 0);
        $fs = (float)($el['fontSize'] ?? 28);
        $col = $el['color'] ?? '#1e293b';
        $fw = (int)($el['fontWeight'] ?? 700);
        $ff = $el['fontFamily'] ?? 'sans-serif';
        $fst = $el['fontStyle'] ?? 'normal';
        $align = $el['textAlign'] ?? 'center';
        $bgColor = $el['bgColor'] ?? null;
        $pad = (float)($el['padding'] ?? 4);
        $prefix = (string)($el['prefix'] ?? '');
        $suffix = (string)($el['suffix'] ?? '');

        $value = '';
        if ($node) {
            $nodeInfo = ['node' => $node, 'inventory' => $inventoryByNode[$nid] ?? []];
            $value = (string)($this->resolveFieldValue($field, $nodeInfo) ?? '');
        }
        $text = $prefix . $value . $suffix;
        if ($text === '') $text = $field !== '' ? '— ' . $field . ' —' : '—';

        $anchor = $align === 'left' ? 'start' : ($align === 'right' ? 'end' : 'middle');
        $tx = $align === 'left' ? $pad : ($align === 'right' ? $w - $pad : $w / 2);
        $ty = $h / 2 + $fs * 0.35;

        $svg = '<g transform="translate(' . $this->fmt($x) . ' ' . $this->fmt($y) . ')'
            . ($rot !== 0.0 ? ' rotate(' . $this->fmt($rot) . ' ' . $this->fmt($w / 2) . ' ' . $this->fmt($h / 2) . ')' : '')
            . '">';
        if ($bgColor) {
            $svg .= '<rect x="0" y="0" width="' . $this->fmt($w) . '" height="' . $this->fmt($h) . '" fill="' . htmlspecialchars($bgColor, ENT_QUOTES | ENT_XML1) . '" rx="3"/>';
        }
        $svg .= '<text x="' . $this->fmt($tx) . '" y="' . $this->fmt($ty) . '" text-anchor="' . $anchor . '" fill="' . $col . '" font-size="' . $this->fmt($fs) . '" font-weight="' . $fw . '" font-family="' . htmlspecialchars($ff, ENT_QUOTES | ENT_XML1) . '" font-style="' . htmlspecialchars($fst, ENT_QUOTES | ENT_XML1) . '">' . htmlspecialchars($text) . '</text>';
        $svg .= '</g>';
        return $svg;
    }

    /**
     * @param array<int, Node> $nodesById
     */
    private function renderNodeCardStyled(array $el, array $nodesById, array $inventoryByNode): string
    {
        $nid = (int)($el['nodeId'] ?? 0);
        $node = $nodesById[$nid] ?? null;
        if (!$node) return '';

        $design = $el['design'] ?? [];
        $w = (float)($design['width'] ?? 100);
        $h = (float)($design['height'] ?? 40);
        $shape = $design['shape'] ?? 'round-rectangle';
        $bg = (string)($design['bgColor'] ?? '#ffffff');
        $border = (string)($design['borderColor'] ?? '#94a3b8');
        $bw = (float)($design['borderWidth'] ?? 0.5);
        $x = (float)($el['x'] ?? 0);
        $y = (float)($el['y'] ?? 0);
        $fillStyle = (string)($design['fillStyle'] ?? 'solid');
        $sloppiness = (string)($design['sloppiness'] ?? 'architect');
        $dash = (string)($design['dash'] ?? 'solid');
        $fillOpacity = (float)($design['fillOpacity'] ?? 1);
        $opacity = (float)($design['opacity'] ?? 1);

        if ($fillStyle !== 'solid') {
            $key = $fillStyle . '-' . preg_replace('/[^a-z0-9]/i', '', $bg);
            $fillAttr = 'url(#rs-fp-' . $key . ')';
            $fillOpacity = 1.0;
        } else {
            $fillAttr = $bg;
        }
        $dashS = $this->dashFor($dash, $bw);
        $dashAttr = $dashS ? ' stroke-dasharray="' . $dashS . '"' : '';
        $filterAttr = $sloppiness === 'artist' ? ' filter="url(#rs-sloppy-artist)"' : ($sloppiness === 'cartoonist' ? ' filter="url(#rs-sloppy-cartoonist)"' : '');
        $commonAttrs = 'fill="' . $fillAttr . '" fill-opacity="' . $this->fmt($fillOpacity) . '" stroke="' . $border . '" stroke-width="' . $this->fmt($bw) . '"' . $dashAttr;

        $svg = '<g transform="translate(' . $this->fmt($x) . ' ' . $this->fmt($y) . ')" opacity="' . $this->fmt($opacity) . '">';
        $svg .= '<g' . $filterAttr . '>';
        switch ($shape) {
            case 'rectangle':
                $svg .= '<rect x="' . $this->fmt(-$w / 2) . '" y="' . $this->fmt(-$h / 2) . '" width="' . $this->fmt($w) . '" height="' . $this->fmt($h) . '" ' . $commonAttrs . '/>';
                break;
            case 'diamond':
                $svg .= '<polygon points="0,' . $this->fmt(-$h / 2) . ' ' . $this->fmt($w / 2) . ',0 0,' . $this->fmt($h / 2) . ' ' . $this->fmt(-$w / 2) . ',0" ' . $commonAttrs . '/>';
                break;
            case 'ellipse':
                $svg .= '<ellipse cx="0" cy="0" rx="' . $this->fmt($w / 2) . '" ry="' . $this->fmt($h / 2) . '" ' . $commonAttrs . '/>';
                break;
            case 'hexagon': {
                $r = $w / 2;
                $pts = [];
                for ($i = 0; $i < 6; $i++) {
                    $a = (M_PI / 3) * $i - M_PI / 6;
                    $pts[] = $this->fmt($r * cos($a)) . ',' . $this->fmt($r * sin($a));
                }
                $svg .= '<polygon points="' . implode(' ', $pts) . '" ' . $commonAttrs . '/>';
                break;
            }
            case 'triangle':
                $svg .= '<polygon points="0,' . $this->fmt(-$h / 2) . ' ' . $this->fmt($w / 2) . ',' . $this->fmt($h / 2) . ' ' . $this->fmt(-$w / 2) . ',' . $this->fmt($h / 2) . '" ' . $commonAttrs . '/>';
                break;
            case 'round-rectangle':
            default:
                $svg .= '<rect x="' . $this->fmt(-$w / 2) . '" y="' . $this->fmt(-$h / 2) . '" width="' . $this->fmt($w) . '" height="' . $this->fmt($h) . '" rx="8" ry="8" ' . $commonAttrs . '/>';
        }
        $svg .= '</g>';

        $nodeInfo = ['node' => $node, 'inventory' => $inventoryByNode[$nid] ?? []];
        foreach (($design['labelElements'] ?? []) as $lab) {
            $field = (string)($lab['field'] ?? '');
            // Badges (compliance/monitoring/stp_root) keep their topology semantics
            if (str_starts_with($field, 'badge:')) {
                $svg .= $this->renderBadgeForSchema($lab, $node, $field);
                continue;
            }
            $text = $this->resolveFieldValue($field, $nodeInfo);
            if ($text === '' || $text === null) continue;
            $tx = (float)($lab['x'] ?? 0);
            $ty = (float)($lab['y'] ?? 0);
            $fs = (float)($lab['fontSize'] ?? 11);
            $col = $lab['color'] ?? '#1e293b';
            $fwL = (int)($lab['fontWeight'] ?? 600);
            $align = $lab['textAlign'] ?? 'center';
            $anchor = $align === 'left' ? 'start' : ($align === 'right' ? 'end' : 'middle');
            $svg .= '<text x="' . $this->fmt($tx) . '" y="' . $this->fmt($ty) . '" text-anchor="' . $anchor . '" dy="' . $this->fmt($fs * 0.35) . '" fill="' . $col . '" font-size="' . $this->fmt($fs) . '" font-weight="' . $fwL . '">' . htmlspecialchars($text) . '</text>';
        }

        $svg .= '</g>';
        return $svg;
    }

    private function renderBadgeForSchema(array $el, Node $node, string $field): string
    {
        $diameter = (float)($el['badgeSize'] ?? $el['fontSize'] ?? 12);
        $r = $diameter / 2;
        $autoColor = '#94a3b8';
        $letter = '';
        if ($field === 'badge:compliance') {
            $score = $node->getComplianceScore();
            $palette = ['A' => '#22c55e', 'B' => '#84cc16', 'C' => '#eab308', 'D' => '#f97316', 'E' => '#ef4444', 'F' => '#7f1d1d'];
            if ($score && isset($palette[$score])) $autoColor = $palette[$score];
            if (($el['badgeShowLabel'] ?? true) !== false && $score) $letter = $score;
        } elseif ($field === 'badge:monitoring') {
            $reach = $node->getIsReachable();
            if ($reach === true) $autoColor = '#22c55e';
            elseif ($reach === false) $autoColor = '#ef4444';
        } elseif ($field === 'badge:stp_root') {
            $autoColor = '#dc2626';
            if (($el['badgeShowLabel'] ?? true) !== false) $letter = 'R';
        }
        $fill = $el['badgeBgColor'] ?? $autoColor;
        $borderCol = $el['badgeBorderColor'] ?? '#ffffff';
        $borderW = (float)($el['badgeBorderWidth'] ?? 2);
        $cx = (float)($el['x'] ?? 0);
        $cy = (float)($el['y'] ?? 0);
        $svg = '<circle cx="' . $this->fmt($cx) . '" cy="' . $this->fmt($cy) . '" r="' . $this->fmt($r) . '" fill="' . $fill . '" stroke="' . $borderCol . '" stroke-width="' . $this->fmt($borderW) . '"/>';
        if ($letter !== '') {
            $textCol = $el['color'] ?? '#ffffff';
            $svg .= '<text x="' . $this->fmt($cx) . '" y="' . $this->fmt($cy) . '" text-anchor="middle" dy="' . $this->fmt($r * 1.2 * 0.35) . '" fill="' . $textCol . '" font-size="' . $this->fmt($r * 1.2) . '" font-weight="700">' . htmlspecialchars($letter) . '</text>';
        }
        return $svg;
    }

    /**
     * @param array<int, Node> $nodesById
     */
    private function renderNodeCardTable(array $el, array $nodesById, array $inventoryByNode): string
    {
        $nid = (int)($el['nodeId'] ?? 0);
        $node = $nodesById[$nid] ?? null;
        if (!$node) return '';

        $x = (float)($el['x'] ?? 0);
        $y = (float)($el['y'] ?? 0);
        $w = (float)($el['width'] ?? 200);
        $h = (float)($el['height'] ?? 120);
        $rows = $el['rows'] ?? [];
        $style = $el['style'] ?? [];
        $fill = $style['fill'] ?? '#ffffff';
        $stroke = $style['stroke'] ?? '#94a3b8';
        $headerColor = $style['headerColor'] ?? '#1e293b';
        $rowFs = (float)($style['rowFontSize'] ?? 11);

        $title = $el['title'] ?? [];
        $titleVisible = ($title['visible'] ?? true) !== false;
        $titleBg = (string)($title['bgColor'] ?? $headerColor);
        $titleColor = (string)($title['color'] ?? '#ffffff');
        $titleFs = (float)($title['fontSize'] ?? $rowFs * 1.05);
        $titleFw = (int)($title['fontWeight'] ?? 600);
        $titleAlign = (string)($title['align'] ?? 'center');
        $titleTpl = (string)($title['template'] ?? '');
        if ($titleTpl === '') $titleTpl = '%hostname%';

        $headerH = $titleVisible ? max(18.0, $titleFs * 1.6) : 0.0;
        $rowH = $rowFs * 1.6;
        $nodeInfo = ['node' => $node, 'inventory' => $inventoryByNode[$nid] ?? []];

        $svg = '<g transform="translate(' . $this->fmt($x) . ' ' . $this->fmt($y) . ')">';
        $svg .= '<rect width="' . $this->fmt($w) . '" height="' . $this->fmt($h) . '" fill="' . $fill . '" stroke="' . $stroke . '" stroke-width="0.8" rx="4" ry="4"/>';

        if ($titleVisible) {
            $svg .= '<rect width="' . $this->fmt($w) . '" height="' . $this->fmt($headerH) . '" fill="' . $titleBg . '" rx="4" ry="4"/>';
            $svg .= '<rect y="' . $this->fmt($headerH - 4) . '" width="' . $this->fmt($w) . '" height="4" fill="' . $titleBg . '"/>';
            $titleText = $this->resolveTemplate($titleTpl, $nodeInfo);
            if ($titleText === '') {
                $titleText = $node->getHostname() ?: $node->getName() ?: $node->getIpAddress();
            }
            $anchor = $titleAlign === 'left' ? 'start' : ($titleAlign === 'right' ? 'end' : 'middle');
            $tx = $titleAlign === 'left' ? 8.0 : ($titleAlign === 'right' ? $w - 8 : $w / 2);
            $svg .= '<text x="' . $this->fmt($tx) . '" y="' . $this->fmt($headerH * 0.7) . '" text-anchor="' . $anchor . '" fill="' . $titleColor . '" font-size="' . $this->fmt($titleFs) . '" font-weight="' . $titleFw . '">' . htmlspecialchars((string)$titleText) . '</text>';
        }

        $ty = $headerH + $rowH * 0.7;
        foreach ($rows as $row) {
            if (!is_array($row)) continue;
            $field = (string)($row['field'] ?? '');
            $value = $this->resolveFieldValue($field, $nodeInfo) ?? '';
            $label = (string)($row['label'] ?? $this->defaultLabelFor($field));
            $rowStyle = $row['style'] ?? [];
            $valFs = (float)($rowStyle['fontSize'] ?? $rowFs);
            $valColor = (string)($rowStyle['color'] ?? '#1e293b');
            $labelColor = (string)($rowStyle['labelColor'] ?? '#64748b');
            $labelFw = (int)($rowStyle['fontWeight'] ?? 600);
            $monospaced = ($rowStyle['monospaced'] ?? true) !== false;
            $svg .= '<text x="8" y="' . $this->fmt($ty) . '" fill="' . $labelColor . '" font-size="' . $this->fmt($rowFs) . '" font-weight="' . $labelFw . '">' . htmlspecialchars($label) . '</text>';
            $svg .= '<text x="' . $this->fmt($w - 8) . '" y="' . $this->fmt($ty) . '" text-anchor="end" fill="' . $valColor . '" font-size="' . $this->fmt($valFs) . '"' . ($monospaced ? ' font-family="monospace"' : '') . '>' . htmlspecialchars((string)$value) . '</text>';
            $ty += $rowH;
        }

        $svg .= '</g>';
        return $svg;
    }

    /**
     * Resolve %field% placeholders inside a template string. Accepts any field
     * supported by resolveFieldValue (builtin or inventory:cat:key:col).
     */
    private function resolveTemplate(string $tpl, array $nodeInfo): string
    {
        if ($tpl === '') return '';
        return preg_replace_callback('/%([^%\s][^%]*)%/', function ($m) use ($nodeInfo) {
            return (string)($this->resolveFieldValue($m[1], $nodeInfo) ?? '');
        }, $tpl) ?? '';
    }

    private function defaultLabelFor(string $field): string
    {
        if (str_starts_with($field, 'inventory:')) {
            $parts = explode(':', substr($field, strlen('inventory:')), 3);
            return $parts[1] ?? $field;
        }
        return match ($field) {
            'hostname' => 'Hostname',
            'ipAddress' => 'IP',
            'manufacturer' => 'Manufacturer',
            'model' => 'Model',
            'name' => 'Name',
            default => $field,
        };
    }

    private function resolveFieldValue(string $field, array $nodeInfo): ?string
    {
        if (str_starts_with($field, 'inventory:')) {
            $rest = substr($field, strlen('inventory:'));
            $parts = explode(':', $rest, 3);
            if (count($parts) === 3) {
                // Special sentinel: "__key__" returns the key itself.
                if ($parts[2] === '__key__') {
                    return $parts[1] !== '' ? $parts[1] : null;
                }
                return $nodeInfo['inventory'][$parts[0]][$parts[1]][$parts[2]] ?? null;
            }
            return null;
        }
        /** @var Node $node */
        $node = $nodeInfo['node'];
        return match ($field) {
            'name' => $node->getName(),
            'hostname' => $node->getHostname(),
            'ipAddress' => $node->getIpAddress(),
            'manufacturer' => $node->getManufacturer()?->getName(),
            'model' => $node->getModel()?->getName(),
            default => null,
        };
    }

    private function dashFor(string $dash, float $w): ?string
    {
        return match ($dash) {
            'dashed' => ($w * 4) . ',' . ($w * 3),
            'dotted' => $w . ',' . ($w * 2),
            default => null,
        };
    }

    private function emptySvg(string $msg): string
    {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#f8fafc"/><text x="200" y="55" text-anchor="middle" fill="#94a3b8" font-size="14">' . htmlspecialchars($msg) . '</text></svg>';
    }

    private function fmt(float $v): string
    {
        return rtrim(rtrim(sprintf('%.2f', $v), '0'), '.');
    }
}
