<?php

namespace App\Service;

use App\Entity\NodeInventoryEntry;
use App\Entity\Topology;
use App\Entity\TopologyAnnotation;
use App\Entity\TopologyCluster;
use App\Entity\TopologyClusterMember;
use App\Entity\TopologyEdge;
use App\Entity\TopologyNode;
use Doctrine\ORM\EntityManagerInterface;

/**
 * Renders a Topology (v2) to a standalone SVG string suitable for embedding in
 * a PDF or shown as a preview. Mirrors the React TopologyMap render rules.
 *
 * Supported options:
 *   - protocolFilter:  "manual" | int(protocolId)   (default: "manual")
 *   - showClusters:    bool   (default: true)
 *   - showAnnotations: bool   (default: true)
 *   - canvasWidth:     int    (default: 1200)  — px of the output SVG (height is auto)
 */
class TopologyV2SvgRenderer
{
    public function __construct(private readonly EntityManagerInterface $em) {}

    /**
     * @param array{x:float,y:float,width:float,height:float}|null $viewportFrame
     *        When provided, use this rectangle (in WORLD coordinates, can be negative)
     *        as the SVG viewBox instead of the auto-fit bounding box.
     */
    public function render(Topology $topology, array $options = []): string
    {
        $protocolFilter = $options['protocolFilter'] ?? 'manual';
        $showClusters = $options['showClusters'] ?? true;
        $showAnnotations = $options['showAnnotations'] ?? true;
        $canvasWidth = (int) ($options['canvasWidth'] ?? 1200);
        $viewportFrame = $options['viewportFrame'] ?? null;

        $members = $this->em->getRepository(TopologyNode::class)->findBy(['topology' => $topology]);
        $nodeIds = array_map(fn(TopologyNode $m) => $m->getNode()->getId(), $members);
        if (empty($members)) {
            return $this->emptySvg('No members');
        }

        // Resolve inventory map for label rendering
        $inventoryByNode = [];
        $rows = $this->em->createQuery(
            'SELECT IDENTITY(e.node) AS nodeId, e.categoryName, e.entryKey, e.colLabel, e.value
             FROM App\Entity\NodeInventoryEntry e
             WHERE e.node IN (:nodes)'
        )->setParameter('nodes', $nodeIds)->getArrayResult();
        foreach ($rows as $row) {
            $inventoryByNode[(int)$row['nodeId']][$row['categoryName']][$row['entryKey']][$row['colLabel']] = $row['value'];
        }

        $layout = $topology->getLayout() ?? [];
        $design = $topology->getNodeDesign();
        if (empty($design)) {
            $design = Topology::defaultNodeDesign();
        }

        // Build per-node info with effective design (override or topology default)
        $nodeInfo = [];
        foreach ($members as $m) {
            $n = $m->getNode();
            $nid = $n->getId();
            $pos = $layout[(string)$nid] ?? null;
            if (!$pos) {
                continue; // skip nodes without a position
            }
            $effective = $m->getStyleOverride() ?: $design;
            $nodeInfo[$nid] = [
                'id' => $nid,
                'pos' => ['x' => (float)$pos['x'], 'y' => (float)$pos['y']],
                'design' => $effective,
                'node' => $n,
                'inventory' => $inventoryByNode[$nid] ?? [],
            ];
        }

        if (empty($nodeInfo)) {
            return $this->emptySvg('No positioned nodes');
        }

        // Edges (filtered)
        $allEdges = $this->em->getRepository(TopologyEdge::class)->findBy(['topology' => $topology]);
        $visibleEdges = [];
        foreach ($allEdges as $e) {
            $pid = $e->getProtocol()?->getId();
            if ($protocolFilter === 'manual') {
                if ($pid === null) $visibleEdges[] = $e;
            } else if ((int)$protocolFilter === $pid) {
                $visibleEdges[] = $e;
            }
        }

        // Clusters: manuals + those matching the current filter
        $clusters = [];
        if ($showClusters) {
            foreach ($this->em->getRepository(TopologyCluster::class)->findBy(['topology' => $topology]) as $c) {
                $cpid = $c->getProtocol()?->getId();
                if ($cpid === null || ($protocolFilter !== 'manual' && (int)$protocolFilter === $cpid)) {
                    $clusters[] = $c;
                }
            }
        }

        // ViewBox: either provided (user-picked zone) or auto-fit
        if ($viewportFrame !== null) {
            $minX = (float)$viewportFrame['x'];
            $minY = (float)$viewportFrame['y'];
            $vw = max(1.0, (float)$viewportFrame['width']);
            $vh = max(1.0, (float)$viewportFrame['height']);
        } else {
            $minX = PHP_INT_MAX; $minY = PHP_INT_MAX; $maxX = PHP_INT_MIN; $maxY = PHP_INT_MIN;
            foreach ($nodeInfo as $ni) {
                $w = (float)($ni['design']['width'] ?? 100);
                $h = (float)($ni['design']['height'] ?? 40);
                $minX = min($minX, $ni['pos']['x'] - $w);
                $minY = min($minY, $ni['pos']['y'] - $h);
                $maxX = max($maxX, $ni['pos']['x'] + $w);
                $maxY = max($maxY, $ni['pos']['y'] + $h);
            }
            $pad = 80;
            $minX -= $pad; $minY -= $pad; $maxX += $pad; $maxY += $pad;
            $vw = max(1.0, (float)($maxX - $minX));
            $vh = max(1.0, (float)($maxY - $minY));
        }
        $svgH = (int) round($canvasWidth * ($vh / $vw));

        // World coordinates are kept as-is (no offset). ViewBox handles any negative origin.
        $ox = 0.0;
        $oy = 0.0;

        $out = '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="' . $canvasWidth . '" height="' . $svgH . '" viewBox="' . $this->fmt($minX) . ' ' . $this->fmt($minY) . ' ' . $this->fmt($vw) . ' ' . $this->fmt($vh) . '">';
        $out .= '<rect x="' . $this->fmt($minX) . '" y="' . $this->fmt($minY) . '" width="' . $this->fmt($vw) . '" height="' . $this->fmt($vh) . '" fill="#ffffff"/>';

        // Annotations with zIndex < 0 (background)
        if ($showAnnotations) {
            $annotations = $this->em->getRepository(TopologyAnnotation::class)->findBy(
                ['topology' => $topology],
                ['zIndex' => 'ASC', 'id' => 'ASC']
            );
            foreach ($annotations as $a) {
                if ($a->getZIndex() < 0) {
                    $out .= $this->renderAnnotation($a, $ox, $oy);
                }
            }
        }

        // Clusters
        foreach ($clusters as $c) {
            $out .= $this->renderCluster($c, $nodeInfo, $clusters, $ox, $oy);
        }

        // Edges
        $edgeOffsets = $this->computeEdgeOffsets($visibleEdges);
        foreach ($visibleEdges as $e) {
            $out .= $this->renderEdge($e, $nodeInfo, $edgeOffsets[$e->getId()] ?? 0, $ox, $oy);
        }

        // Nodes
        foreach ($nodeInfo as $ni) {
            $out .= $this->renderNode($ni, $ox, $oy);
        }

        // Annotations with zIndex >= 0 (foreground)
        if (isset($annotations)) {
            foreach ($annotations as $a) {
                if ($a->getZIndex() >= 0) {
                    $out .= $this->renderAnnotation($a, $ox, $oy);
                }
            }
        }

        $out .= '</svg>';
        return $out;
    }

    private function emptySvg(string $msg): string
    {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#f8fafc"/><text x="200" y="55" text-anchor="middle" fill="#94a3b8" font-size="14">' . htmlspecialchars($msg) . '</text></svg>';
    }

    private function renderNode(array $ni, float $ox, float $oy): string
    {
        $d = $ni['design'];
        $w = (float)($d['width'] ?? 100);
        $h = (float)($d['height'] ?? 40);
        $shape = $d['shape'] ?? 'round-rectangle';
        $bg = $d['bgColor'] ?? '#ffffff';
        $border = $d['borderColor'] ?? '#94a3b8';
        $bw = (float)($d['borderWidth'] ?? 0.5);
        $x = $ni['pos']['x'] + $ox;
        $y = $ni['pos']['y'] + $oy;

        $svg = '<g transform="translate(' . $this->fmt($x) . ' ' . $this->fmt($y) . ')">';
        switch ($shape) {
            case 'rectangle':
                $svg .= '<rect x="' . $this->fmt(-$w / 2) . '" y="' . $this->fmt(-$h / 2) . '" width="' . $this->fmt($w) . '" height="' . $this->fmt($h) . '" fill="' . $bg . '" stroke="' . $border . '" stroke-width="' . $bw . '"/>';
                break;
            case 'diamond':
                $svg .= '<polygon points="0,' . $this->fmt(-$h / 2) . ' ' . $this->fmt($w / 2) . ',0 0,' . $this->fmt($h / 2) . ' ' . $this->fmt(-$w / 2) . ',0" fill="' . $bg . '" stroke="' . $border . '" stroke-width="' . $bw . '"/>';
                break;
            case 'ellipse':
                $svg .= '<ellipse cx="0" cy="0" rx="' . $this->fmt($w / 2) . '" ry="' . $this->fmt($h / 2) . '" fill="' . $bg . '" stroke="' . $border . '" stroke-width="' . $bw . '"/>';
                break;
            case 'round-rectangle':
            default:
                $svg .= '<rect x="' . $this->fmt(-$w / 2) . '" y="' . $this->fmt(-$h / 2) . '" width="' . $this->fmt($w) . '" height="' . $this->fmt($h) . '" rx="8" ry="8" fill="' . $bg . '" stroke="' . $border . '" stroke-width="' . $bw . '"/>';
        }

        // Labels
        foreach ($d['labelElements'] ?? [] as $el) {
            $text = $this->resolveFieldValue($el['field'] ?? '', $ni);
            if ($text === '' || $text === null) continue;
            $tx = (float)($el['x'] ?? 0);
            $ty = (float)($el['y'] ?? 0);
            $fs = (float)($el['fontSize'] ?? 11);
            $col = $el['color'] ?? '#1e293b';
            $fw = (int)($el['fontWeight'] ?? 600);
            $align = $el['textAlign'] ?? 'center';
            $anchor = $align === 'left' ? 'start' : ($align === 'right' ? 'end' : 'middle');
            $svg .= '<text x="' . $this->fmt($tx) . '" y="' . $this->fmt($ty) . '" text-anchor="' . $anchor . '" dominant-baseline="central" fill="' . $col . '" font-size="' . $fs . '" font-weight="' . $fw . '">' . htmlspecialchars($text) . '</text>';
        }

        $svg .= '</g>';
        return $svg;
    }

    private function resolveFieldValue(string $field, array $nodeInfo): ?string
    {
        if (strpos($field, 'inventory:') === 0) {
            $rest = substr($field, strlen('inventory:'));
            $parts = explode(':', $rest, 3);
            if (count($parts) === 3) {
                return $nodeInfo['inventory'][$parts[0]][$parts[1]][$parts[2]] ?? null;
            }
            return null;
        }
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

    /**
     * Compute the perpendicular spacing index for parallel edges (mirror of TopologyMap.tsx).
     * @return array<int,float> edgeId => offsetIndex
     */
    private function computeEdgeOffsets(array $edges): array
    {
        $byPair = [];
        foreach ($edges as $e) {
            $s = $e->getSourceNode()->getId();
            $t = $e->getTargetNode()->getId();
            $key = ($s < $t) ? "$s|$t" : "$t|$s";
            $byPair[$key][] = $e;
        }
        $offsets = [];
        foreach ($byPair as $group) {
            usort($group, fn(TopologyEdge $a, TopologyEdge $b) => $a->getId() <=> $b->getId());
            $n = count($group);
            foreach ($group as $i => $e) {
                $offsets[$e->getId()] = $i - ($n - 1) / 2;
            }
        }
        return $offsets;
    }

    private function renderEdge(TopologyEdge $e, array $nodeInfo, float $offsetIndex, float $ox, float $oy): string
    {
        $s = $nodeInfo[$e->getSourceNode()->getId()] ?? null;
        $t = $nodeInfo[$e->getTargetNode()->getId()] ?? null;
        if (!$s || !$t) return '';

        $style = array_merge(
            ['type' => 'straight', 'color' => '#94a3b8', 'width' => 1.5, 'dash' => 'solid', 'curveTension' => 0.3, 'labels' => []],
            $e->getStyle() ?? []
        );
        $sx = $s['pos']['x'] + $ox;
        $sy = $s['pos']['y'] + $oy;
        $tx = $t['pos']['x'] + $ox;
        $ty = $t['pos']['y'] + $oy;

        $path = $this->buildPath($style, $sx, $sy, $tx, $ty, $offsetIndex);
        $dash = $this->dashFor($style['dash'], (float)$style['width']);

        $svg = '<path d="' . $path . '" fill="none" stroke="' . $style['color'] . '" stroke-width="' . $style['width'] . '"';
        if ($dash) $svg .= ' stroke-dasharray="' . $dash . '"';
        $svg .= ' stroke-linecap="round" stroke-linejoin="round"/>';

        // Labels (port, cost)
        foreach ($style['labels'] ?? [] as $label) {
            $text = (string)($label['text'] ?? '');
            if ($text === '') continue;
            $pos = $label['position'] ?? 'middle';
            $ratio = $pos === 'source' ? 0.15 : ($pos === 'target' ? 0.85 : 0.5);
            $pt = $this->pointAt($style, $sx, $sy, $tx, $ty, $ratio, $offsetIndex);
            $fs = (float)($label['fontSize'] ?? 6);
            $col = $label['color'] ?? '#475569';
            $fw = (int)($label['fontWeight'] ?? 400);
            $offset = (float)($label['offset'] ?? 0);
            // Tangent for label rotation
            $pA = $this->pointAt($style, $sx, $sy, $tx, $ty, max(0, $ratio - 0.01), $offsetIndex);
            $pB = $this->pointAt($style, $sx, $sy, $tx, $ty, min(1, $ratio + 0.01), $offsetIndex);
            $angle = rad2deg(atan2($pB['y'] - $pA['y'], $pB['x'] - $pA['x']));
            if ($angle > 90) $angle -= 180; elseif ($angle < -90) $angle += 180;
            $svg .= '<g transform="translate(' . $this->fmt($pt['x']) . ' ' . $this->fmt($pt['y']) . ') rotate(' . $this->fmt($angle) . ') translate(0 ' . $this->fmt($offset) . ')">';
            $w = strlen($text) * $fs * 0.58;
            $h = $fs * 1.3;
            $svg .= '<rect x="' . $this->fmt(-$w / 2 - 3) . '" y="' . $this->fmt(-$h / 2) . '" width="' . $this->fmt($w + 6) . '" height="' . $this->fmt($h) . '" fill="white" fill-opacity="0.9" rx="2"/>';
            $svg .= '<text text-anchor="middle" dominant-baseline="central" fill="' . $col . '" font-size="' . $fs . '" font-weight="' . $fw . '">' . htmlspecialchars($text) . '</text>';
            $svg .= '</g>';
        }
        return $svg;
    }

    private function dashFor(string $dash, float $w): ?string
    {
        return match ($dash) {
            'dashed' => ($w * 4) . ',' . ($w * 3),
            'dotted' => $w . ',' . ($w * 2),
            default => null,
        };
    }

    private function buildPath(array $style, float $sx, float $sy, float $tx, float $ty, float $offsetIndex): string
    {
        $spacing = 18;
        if (($style['type'] ?? 'straight') === 'orthogonal') {
            $mx = ($sx + $tx) / 2 + $offsetIndex * $spacing;
            return 'M ' . $this->fmt($sx) . ' ' . $this->fmt($sy) . ' L ' . $this->fmt($mx) . ' ' . $this->fmt($sy) . ' L ' . $this->fmt($mx) . ' ' . $this->fmt($ty) . ' L ' . $this->fmt($tx) . ' ' . $this->fmt($ty);
        }
        if (($style['type'] ?? 'straight') === 'curved' || $offsetIndex != 0) {
            $tension = ($style['type'] ?? 'straight') === 'curved' ? (float)($style['curveTension'] ?? 0.3) : 0;
            $dx = $tx - $sx;
            $dy = $ty - $sy;
            $len = sqrt($dx * $dx + $dy * $dy) ?: 1;
            $px = -$dy / $len;
            $py = $dx / $len;
            $totalOff = $len * $tension + $offsetIndex * $spacing;
            $cx = ($sx + $tx) / 2 + $px * $totalOff;
            $cy = ($sy + $ty) / 2 + $py * $totalOff;
            return 'M ' . $this->fmt($sx) . ' ' . $this->fmt($sy) . ' Q ' . $this->fmt($cx) . ' ' . $this->fmt($cy) . ' ' . $this->fmt($tx) . ' ' . $this->fmt($ty);
        }
        return 'M ' . $this->fmt($sx) . ' ' . $this->fmt($sy) . ' L ' . $this->fmt($tx) . ' ' . $this->fmt($ty);
    }

    private function pointAt(array $style, float $sx, float $sy, float $tx, float $ty, float $ratio, float $offsetIndex): array
    {
        $spacing = 18;
        $type = $style['type'] ?? 'straight';
        if ($type === 'orthogonal') {
            $mx = ($sx + $tx) / 2 + $offsetIndex * $spacing;
            $seg1 = abs($mx - $sx);
            $seg2 = abs($ty - $sy);
            $seg3 = abs($tx - $mx);
            $total = ($seg1 + $seg2 + $seg3) ?: 1;
            $target = $ratio * $total;
            if ($target <= $seg1) {
                $r = $seg1 === 0.0 ? 0 : $target / $seg1;
                return ['x' => $sx + ($mx - $sx) * $r, 'y' => $sy];
            }
            if ($target <= $seg1 + $seg2) {
                $r = $seg2 === 0.0 ? 0 : ($target - $seg1) / $seg2;
                return ['x' => $mx, 'y' => $sy + ($ty - $sy) * $r];
            }
            $r = $seg3 === 0.0 ? 0 : ($target - $seg1 - $seg2) / $seg3;
            return ['x' => $mx + ($tx - $mx) * $r, 'y' => $ty];
        }
        if ($type === 'curved' || $offsetIndex != 0) {
            $tension = $type === 'curved' ? (float)($style['curveTension'] ?? 0.3) : 0;
            $dx = $tx - $sx;
            $dy = $ty - $sy;
            $len = sqrt($dx * $dx + $dy * $dy) ?: 1;
            $px = -$dy / $len;
            $py = $dx / $len;
            $totalOff = $len * $tension + $offsetIndex * $spacing;
            $cx = ($sx + $tx) / 2 + $px * $totalOff;
            $cy = ($sy + $ty) / 2 + $py * $totalOff;
            $u = 1 - $ratio;
            return [
                'x' => $u * $u * $sx + 2 * $u * $ratio * $cx + $ratio * $ratio * $tx,
                'y' => $u * $u * $sy + 2 * $u * $ratio * $cy + $ratio * $ratio * $ty,
            ];
        }
        return ['x' => $sx + ($tx - $sx) * $ratio, 'y' => $sy + ($ty - $sy) * $ratio];
    }

    private function renderCluster(TopologyCluster $c, array $nodeInfo, array $allClusters, float $ox, float $oy): string
    {
        $members = [];
        $memberIds = [];
        foreach ($this->em->getRepository(TopologyClusterMember::class)->findBy(['cluster' => $c]) as $m) {
            $nid = $m->getNode()->getId();
            $memberIds[] = $nid;
            if (isset($nodeInfo[$nid])) {
                $members[] = $nodeInfo[$nid];
            }
        }
        if (empty($members)) return '';

        $style = array_merge([
            'shape' => 'rectangle', 'borderColor' => '#94a3b8', 'borderWidth' => 1,
            'dash' => 'dashed', 'fillColor' => '#ef4444', 'transparent' => false,
            'padding' => 20, 'borderRadius' => 12,
            'labelPosition' => 'top', 'labelFontSize' => 11, 'labelColor' => '#94a3b8',
        ], $c->getStyle() ?? []);

        $shape = $style['shape'];
        $pad = (float)$style['padding'];
        $dash = $this->dashFor($style['dash'], (float)$style['borderWidth']);
        $fillProps = $style['transparent']
            ? 'fill="none" fill-opacity="0"'
            : 'fill="' . $style['fillColor'] . '" fill-opacity="0.18"';
        $fontSize = (float)$style['labelFontSize'];
        $labelText = $style['labelPosition'] !== 'none' ? $c->getName() : '';
        $labelOffset = (is_array($style['labelOffset'] ?? null))
            ? ['dx' => (float)($style['labelOffset']['dx'] ?? 0), 'dy' => (float)($style['labelOffset']['dy'] ?? 0)]
            : ['dx' => 0.0, 'dy' => 0.0];

        if ($shape === 'hull') {
            $anchors = $this->computeClusterAnchors($c, $memberIds, $nodeInfo, $allClusters, $pad);
            if (count($anchors) === 0) return '';
            $body = '';
            $labelCx = 0; $labelCy = 0;
            if (count($anchors) === 1) {
                $a = $anchors[0];
                $r = $pad;
                $body = '<circle cx="' . $this->fmt($a['x'] + $ox) . '" cy="' . $this->fmt($a['y'] + $oy) . '" r="' . $this->fmt($r) . '" ' . $fillProps . ' stroke="' . $style['borderColor'] . '" stroke-width="' . $style['borderWidth'] . '"' . ($dash ? ' stroke-dasharray="' . $dash . '"' : '') . '/>';
                $labelCx = $a['x'] + $ox;
                $labelCy = $a['y'] + $oy - $r - $fontSize;
            } elseif (count($anchors) === 2) {
                $a = $anchors[0]; $b = $anchors[1];
                $cx = ($a['x'] + $b['x']) / 2;
                $cy = ($a['y'] + $b['y']) / 2;
                $dx = $b['x'] - $a['x']; $dy = $b['y'] - $a['y'];
                $half = sqrt($dx * $dx + $dy * $dy) / 2;
                $rx = $half + $pad * 0.5;
                $ry = $pad;
                $angle = rad2deg(atan2($dy, $dx));
                $body = '<ellipse cx="' . $this->fmt($cx + $ox) . '" cy="' . $this->fmt($cy + $oy) . '" rx="' . $this->fmt($rx) . '" ry="' . $this->fmt($ry) . '" transform="rotate(' . $this->fmt($angle) . ' ' . $this->fmt($cx + $ox) . ' ' . $this->fmt($cy + $oy) . ')" ' . $fillProps . ' stroke="' . $style['borderColor'] . '" stroke-width="' . $style['borderWidth'] . '"' . ($dash ? ' stroke-dasharray="' . $dash . '"' : '') . '/>';
                $labelCx = $cx + $ox;
                $labelCy = $cy + $oy;
            } else {
                $hull = $this->convexHull($anchors);
                $expanded = $this->expandHull($hull, $pad * 0.4);
                $d = $this->roundedHullPath($expanded, (float)($style['borderRadius'] ?? 18), $ox, $oy);
                $body = '<path d="' . $d . '" ' . $fillProps . ' stroke="' . $style['borderColor'] . '" stroke-width="' . $style['borderWidth'] . '"' . ($dash ? ' stroke-dasharray="' . $dash . '"' : '') . ' stroke-linejoin="round"/>';
                $sumX = 0; $sumY = 0;
                foreach ($expanded as $p) { $sumX += $p['x']; $sumY += $p['y']; }
                $labelCx = $sumX / count($expanded) + $ox;
                $labelCy = $sumY / count($expanded) + $oy;
            }
            $label = $labelText !== '' ? $this->renderClusterLabel($labelText, $labelCx + $labelOffset['dx'], $labelCy + $labelOffset['dy'], $fontSize, $style) : '';
            return $body . $label;
        }

        // Rectangle (legacy)
        $minX = PHP_INT_MAX; $minY = PHP_INT_MAX; $maxX = PHP_INT_MIN; $maxY = PHP_INT_MIN;
        foreach ($members as $m) {
            $w = (float)($m['design']['width'] ?? 100);
            $h = (float)($m['design']['height'] ?? 40);
            $minX = min($minX, $m['pos']['x'] - $w / 2);
            $minY = min($minY, $m['pos']['y'] - $h / 2);
            $maxX = max($maxX, $m['pos']['x'] + $w / 2);
            $maxY = max($maxY, $m['pos']['y'] + $h / 2);
        }
        $rx = ($minX - $pad) + $ox;
        $ry = ($minY - $pad) + $oy;
        $rw = ($maxX - $minX) + $pad * 2;
        $rh = ($maxY - $minY) + $pad * 2;
        $r = (float)($style['borderRadius'] ?? 12);
        $body = '<rect x="' . $this->fmt($rx) . '" y="' . $this->fmt($ry) . '" width="' . $this->fmt($rw) . '" height="' . $this->fmt($rh) . '" rx="' . $r . '" ry="' . $r . '" ' . $fillProps . ' stroke="' . $style['borderColor'] . '" stroke-width="' . $style['borderWidth'] . '"' . ($dash ? ' stroke-dasharray="' . $dash . '"' : '') . '/>';
        $labelCx = $rx + 12;
        $labelCy = $style['labelPosition'] === 'top' ? $ry - $fontSize * 0.4 - 2 : $ry + $rh + $fontSize + 2;
        $label = $labelText !== '' ? $this->renderClusterLabel($labelText, $labelCx + $labelOffset['dx'], $labelCy + $labelOffset['dy'], $fontSize, $style, false) : '';
        return $body . $label;
    }

    private function renderClusterLabel(string $text, float $cx, float $cy, float $fontSize, array $style, bool $centered = true): string
    {
        $charW = $fontSize * 0.55;
        $textW = strlen($text) * $charW;
        $padX = $fontSize * 0.7;
        $padY = $fontSize * 0.35;
        $pillW = $textW + $padX * 2;
        $pillH = $fontSize + $padY * 2;
        $pillX = $centered ? $cx - $pillW / 2 : $cx;
        $pillY = $cy - $pillH / 2;
        $svg = '<rect x="' . $this->fmt($pillX) . '" y="' . $this->fmt($pillY) . '" width="' . $this->fmt($pillW) . '" height="' . $this->fmt($pillH) . '" rx="' . $this->fmt($pillH / 2) . '" ry="' . $this->fmt($pillH / 2) . '" fill="' . ($style['fillColor'] ?? '#94a3b8') . '" fill-opacity="0.95" stroke="' . ($style['borderColor'] ?? '#94a3b8') . '" stroke-width="' . max(0.5, ((float)($style['borderWidth'] ?? 1)) * 0.6) . '"/>';
        $svg .= '<text x="' . $this->fmt($pillX + $pillW / 2) . '" y="' . $this->fmt($pillY + $pillH / 2) . '" text-anchor="middle" dominant-baseline="central" fill="#ffffff" font-size="' . $fontSize . '" font-weight="600">' . htmlspecialchars($text) . '</text>';
        return $svg;
    }

    private function computeClusterAnchors(TopologyCluster $cluster, array $memberIds, array $nodeInfo, array $allClusters, float $push): array
    {
        $memberSet = array_flip($memberIds);
        $anchors = [];
        foreach ($memberIds as $nid) {
            if (!isset($nodeInfo[$nid])) continue;
            $pos = $nodeInfo[$nid]['pos'];
            $otherClusters = [];
            foreach ($allClusters as $c2) {
                if ($c2->getId() === $cluster->getId()) continue;
                $found = false;
                foreach ($this->em->getRepository(TopologyClusterMember::class)->findBy(['cluster' => $c2]) as $m) {
                    if ($m->getNode()->getId() === $nid) { $found = true; break; }
                }
                if ($found) $otherClusters[] = $c2;
            }
            if (empty($otherClusters)) {
                $anchors[] = ['x' => $pos['x'], 'y' => $pos['y']];
                continue;
            }
            $sx = 0; $sy = 0; $n = 0;
            foreach ($otherClusters as $oc) {
                foreach ($this->em->getRepository(TopologyClusterMember::class)->findBy(['cluster' => $oc]) as $m) {
                    $oid = $m->getNode()->getId();
                    if ($oid === $nid || isset($memberSet[$oid])) continue;
                    if (!isset($nodeInfo[$oid])) continue;
                    $sx += $nodeInfo[$oid]['pos']['x']; $sy += $nodeInfo[$oid]['pos']['y']; $n++;
                }
            }
            if ($n === 0) {
                $anchors[] = ['x' => $pos['x'], 'y' => $pos['y']];
                continue;
            }
            $ocx = $sx / $n; $ocy = $sy / $n;
            $dx = $pos['x'] - $ocx; $dy = $pos['y'] - $ocy;
            $dist = sqrt($dx * $dx + $dy * $dy);
            if ($dist < 1) {
                $anchors[] = ['x' => $pos['x'], 'y' => $pos['y']];
            } else {
                $anchors[] = ['x' => $pos['x'] + $dx / $dist * $push, 'y' => $pos['y'] + $dy / $dist * $push];
            }
        }
        return $anchors;
    }

    private function convexHull(array $pts): array
    {
        if (count($pts) <= 1) return $pts;
        $sorted = $pts;
        usort($sorted, fn($a, $b) => $a['x'] <=> $b['x'] ?: $a['y'] <=> $b['y']);
        $cross = fn($o, $a, $b) => ($a['x'] - $o['x']) * ($b['y'] - $o['y']) - ($a['y'] - $o['y']) * ($b['x'] - $o['x']);
        $lower = [];
        foreach ($sorted as $p) {
            while (count($lower) >= 2 && $cross($lower[count($lower) - 2], $lower[count($lower) - 1], $p) <= 0) array_pop($lower);
            $lower[] = $p;
        }
        $upper = [];
        for ($i = count($sorted) - 1; $i >= 0; $i--) {
            $p = $sorted[$i];
            while (count($upper) >= 2 && $cross($upper[count($upper) - 2], $upper[count($upper) - 1], $p) <= 0) array_pop($upper);
            $upper[] = $p;
        }
        array_pop($lower); array_pop($upper);
        return array_merge($lower, $upper);
    }

    private function expandHull(array $hull, float $padding): array
    {
        if (empty($hull)) return $hull;
        $cx = 0; $cy = 0;
        foreach ($hull as $p) { $cx += $p['x']; $cy += $p['y']; }
        $cx /= count($hull); $cy /= count($hull);
        return array_map(function ($p) use ($cx, $cy, $padding) {
            $dx = $p['x'] - $cx; $dy = $p['y'] - $cy;
            $d = sqrt($dx * $dx + $dy * $dy) ?: 1;
            return ['x' => $p['x'] + $dx / $d * $padding, 'y' => $p['y'] + $dy / $d * $padding];
        }, $hull);
    }

    private function roundedHullPath(array $pts, float $radius, float $ox, float $oy): string
    {
        if (count($pts) < 2) return '';
        $n = count($pts);
        $unit = function ($a, $b) {
            $dx = $b['x'] - $a['x']; $dy = $b['y'] - $a['y'];
            $d = sqrt($dx * $dx + $dy * $dy) ?: 1;
            return ['x' => $dx / $d, 'y' => $dy / $d, 'len' => $d];
        };
        $d = '';
        for ($i = 0; $i < $n; $i++) {
            $prev = $pts[($i - 1 + $n) % $n];
            $cur = $pts[$i];
            $next = $pts[($i + 1) % $n];
            $u1 = $unit($cur, $prev);
            $u2 = $unit($cur, $next);
            $r = min($radius, $u1['len'] / 2, $u2['len'] / 2);
            $p1 = ['x' => $cur['x'] + $u1['x'] * $r, 'y' => $cur['y'] + $u1['y'] * $r];
            $p2 = ['x' => $cur['x'] + $u2['x'] * $r, 'y' => $cur['y'] + $u2['y'] * $r];
            if ($i === 0) $d .= 'M ' . $this->fmt($p1['x'] + $ox) . ' ' . $this->fmt($p1['y'] + $oy);
            else $d .= ' L ' . $this->fmt($p1['x'] + $ox) . ' ' . $this->fmt($p1['y'] + $oy);
            $d .= ' Q ' . $this->fmt($cur['x'] + $ox) . ' ' . $this->fmt($cur['y'] + $oy) . ' ' . $this->fmt($p2['x'] + $ox) . ' ' . $this->fmt($p2['y'] + $oy);
        }
        return $d . ' Z';
    }

    private function renderAnnotation(TopologyAnnotation $a, float $ox, float $oy): string
    {
        $x = $a->getX() + $ox;
        $y = $a->getY() + $oy;
        $w = $a->getWidth();
        $h = $a->getHeight();
        $rot = $a->getRotation();
        $d = $a->getData();
        $svg = '<g transform="translate(' . $this->fmt($x) . ' ' . $this->fmt($y) . ') rotate(' . $this->fmt($rot) . ' ' . $this->fmt($w / 2) . ' ' . $this->fmt($h / 2) . ')">';
        switch ($a->getType()) {
            case TopologyAnnotation::TYPE_TEXT:
                $text = (string)($d['text'] ?? '');
                $fs = (float)($d['fontSize'] ?? 14);
                $col = $d['color'] ?? '#1e293b';
                $fw = (int)($d['fontWeight'] ?? 400);
                $align = $d['textAlign'] ?? 'center';
                $anchor = $align === 'left' ? 'start' : ($align === 'right' ? 'end' : 'middle');
                $tx = $align === 'left' ? (float)($d['padding'] ?? 4) : ($align === 'right' ? $w - (float)($d['padding'] ?? 4) : $w / 2);
                if (!empty($d['bgColor'])) {
                    $svg .= '<rect x="0" y="0" width="' . $this->fmt($w) . '" height="' . $this->fmt($h) . '" fill="' . $d['bgColor'] . '" rx="2"/>';
                }
                $svg .= '<text x="' . $this->fmt($tx) . '" y="' . $this->fmt($h / 2) . '" text-anchor="' . $anchor . '" dominant-baseline="central" fill="' . $col . '" font-size="' . $fs . '" font-weight="' . $fw . '">' . htmlspecialchars($text) . '</text>';
                break;
            case TopologyAnnotation::TYPE_IMAGE:
                $url = $d['url'] ?? '';
                if ($url !== '') {
                    $opacity = (float)($d['opacity'] ?? 1);
                    $svg .= '<image xlink:href="' . htmlspecialchars($url) . '" width="' . $this->fmt($w) . '" height="' . $this->fmt($h) . '" opacity="' . $opacity . '" preserveAspectRatio="xMidYMid meet"/>';
                }
                break;
            case TopologyAnnotation::TYPE_SHAPE:
                $kind = $d['kind'] ?? 'rectangle';
                $fill = $d['fill'] ?? '#3b82f6';
                $stroke = $d['stroke'] ?? '#1e40af';
                $sw = (float)($d['strokeWidth'] ?? 1);
                $op = (float)($d['opacity'] ?? 1);
                $fop = (float)($d['fillOpacity'] ?? 0.2);
                $dashS = $this->dashFor($d['dash'] ?? 'solid', $sw);
                if ($kind === 'ellipse') {
                    $svg .= '<ellipse cx="' . $this->fmt($w / 2) . '" cy="' . $this->fmt($h / 2) . '" rx="' . $this->fmt($w / 2) . '" ry="' . $this->fmt($h / 2) . '" fill="' . $fill . '" fill-opacity="' . $fop . '" stroke="' . $stroke . '" stroke-width="' . $sw . '"' . ($dashS ? ' stroke-dasharray="' . $dashS . '"' : '') . ' opacity="' . $op . '"/>';
                } else {
                    $br = (float)($d['borderRadius'] ?? 4);
                    $svg .= '<rect width="' . $this->fmt($w) . '" height="' . $this->fmt($h) . '" rx="' . $br . '" ry="' . $br . '" fill="' . $fill . '" fill-opacity="' . $fop . '" stroke="' . $stroke . '" stroke-width="' . $sw . '"' . ($dashS ? ' stroke-dasharray="' . $dashS . '"' : '') . ' opacity="' . $op . '"/>';
                }
                break;
        }
        $svg .= '</g>';
        return $svg;
    }

    private function fmt(float $v): string
    {
        return rtrim(rtrim(sprintf('%.2f', $v), '0'), '.');
    }
}
