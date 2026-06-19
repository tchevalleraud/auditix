<?php

namespace App\Service;

use App\Entity\NodeInventoryEntry;
use App\Entity\Topology;
use App\Entity\TopologyAnnotation;
use App\Entity\TopologyCluster;
use App\Entity\TopologyClusterMember;
use App\Entity\TopologyEdge;
use App\Entity\TopologyNode;
use App\Entity\TopologyProtocol;
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
     * Mirror of stpStatePalette() in TopologyMap.tsx — derives a default
     * stroke colour + dash style from a normalised STP state.
     * @return array{color: string, dash: string}
     */
    private function stpStatePalette(string $state): array
    {
        return match ($state) {
            'forwarding' => ['color' => '#22c55e', 'dash' => 'solid'],
            'learning'   => ['color' => '#f59e0b', 'dash' => 'dashed'],
            'listening'  => ['color' => '#fbbf24', 'dash' => 'dashed'],
            'blocking', 'discarding' => ['color' => '#ef4444', 'dash' => 'dotted'],
            'disabled'   => ['color' => '#94a3b8', 'dash' => 'dotted'],
            'mixed'      => ['color' => '#f97316', 'dash' => 'dashed'],
            default      => ['color' => '#94a3b8', 'dash' => 'solid'],
        };
    }

    /**
     * Mirror of stpRoleBadge() in TopologyMap.tsx — abbreviates a port role
     * to its single-letter badge + colour.
     * @return array{letter:string,color:string,full:string}|null
     */
    private function stpRoleBadge(?string $role): ?array
    {
        if ($role === null || $role === '') return null;
        $r = strtolower($role);
        if (str_starts_with($r, 'root'))   return ['letter' => 'R', 'color' => '#22c55e', 'full' => 'Root'];
        if (str_starts_with($r, 'desig'))  return ['letter' => 'D', 'color' => '#3b82f6', 'full' => 'Designated'];
        if (str_starts_with($r, 'alt'))    return ['letter' => 'A', 'color' => '#f59e0b', 'full' => 'Alternate'];
        if (str_starts_with($r, 'back'))   return ['letter' => 'B', 'color' => '#eab308', 'full' => 'Backup'];
        if (str_starts_with($r, 'master')) return ['letter' => 'M', 'color' => '#a855f7', 'full' => 'Master'];
        if (str_starts_with($r, 'dis') || $r === '-') return ['letter' => '-', 'color' => '#94a3b8', 'full' => 'Disabled'];
        return ['letter' => strtoupper(substr($role, 0, 1)), 'color' => '#64748b', 'full' => $role];
    }

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
        // Optional: when the filtered protocol is MSTP, the report editor picks
        // one MSTI to render. Edges get recoloured to that instance's state and
        // the root badge points to the root of that instance only.
        $mstpInstance = $options['mstpInstance'] ?? null;
        if ($mstpInstance !== null) $mstpInstance = (string) $mstpInstance;
        // Legend overlay: off by default. Callers explicitly opt in (the report
        // block's "Show legend" toggle does it for the PDF; the editor preview
        // never asks for it so the user keeps a clean map while configuring).
        $showLegend = (bool) ($options['showLegend'] ?? false);

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

        // Index ISIS area colours from clusters: areaName => borderColor. A cluster
        // is treated as an ISIS area when it belongs to a protocol of type ISIS.
        // Mirrors the React `isisAreaColors` memo so the PDF render colours edges
        // the same way the map does.
        $isisAreaColors = [];
        $allClusters = $this->em->getRepository(TopologyCluster::class)->findBy(['topology' => $topology]);
        foreach ($allClusters as $c) {
            $proto = $c->getProtocol();
            if ($proto === null || $proto->getType() !== TopologyProtocol::TYPE_ISIS) continue;
            $col = $c->getStyle()['borderColor'] ?? null;
            if ($col) $isisAreaColors[$c->getName()] = $col;
        }
        $isisProtocolIds = [];
        $mstpProtocolIds = [];
        $stpProtocolIds = [];
        foreach ($this->em->getRepository(TopologyProtocol::class)->findBy(['topology' => $topology]) as $p) {
            if ($p->getType() === TopologyProtocol::TYPE_ISIS) $isisProtocolIds[$p->getId()] = true;
            if ($p->getType() === TopologyProtocol::TYPE_MSTP) $mstpProtocolIds[$p->getId()] = true;
            if ($p->getType() === TopologyProtocol::TYPE_STP)  $stpProtocolIds[$p->getId()]  = true;
        }
        $filterPid = (is_int($protocolFilter) || ctype_digit((string) $protocolFilter)) ? (int) $protocolFilter : null;
        $isStpFiltered  = $filterPid !== null && (isset($stpProtocolIds[$filterPid]) || isset($mstpProtocolIds[$filterPid]));
        $isMstpFiltered = $filterPid !== null && isset($mstpProtocolIds[$filterPid]);

        // Identify STP root node IDs for the current context. The clusters that
        // emitStpRootClusters() persists carry { stpRoot: true, stpInstance: <id> }
        // in their style. For MSTP we filter to the selected instance (when one
        // is picked) so the R badge points to that MSTI's root only.
        $stpRootNodeIds = [];
        if ($isStpFiltered) {
            foreach ($allClusters as $c) {
                if ($c->getProtocol()?->getId() !== $filterPid) continue;
                $cs = $c->getStyle();
                if (empty($cs['stpRoot'])) continue;
                if ($isMstpFiltered && $mstpInstance !== null
                    && (string)($cs['stpInstance'] ?? '') !== $mstpInstance) continue;
                $members = $this->em->getRepository(TopologyClusterMember::class)->findBy(['cluster' => $c]);
                foreach ($members as $m) {
                    $stpRootNodeIds[$m->getNode()->getId()] = true;
                }
            }
        }

        // Aggregation groups: edges sharing the same (pair, aggregationGroup) are
        // wrapped in an oblong capsule, exactly like the live map when
        // mapOptions.aggregateParallelLinks is on.
        $mapOptions = $topology->getMapOptions() ?? [];
        $aggregationGroups = ($mapOptions['aggregateParallelLinks'] ?? false)
            ? $this->computeAggregationGroups($visibleEdges)
            : [];

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

        // Clusters — STP/MSTP "root" clusters are markers, not visual zones;
        // they're surfaced as the R badge on the root node, not as a labelled
        // hull. Mirrors the React `.filter((c) => !c.style?.stpRoot)`.
        foreach ($clusters as $c) {
            if (!empty($c->getStyle()['stpRoot'])) continue;
            $out .= $this->renderCluster($c, $nodeInfo, $clusters, $ox, $oy);
        }

        // Aggregation capsules (under the edges, like in the React renderer)
        $edgeOffsets = $this->computeEdgeOffsets($visibleEdges);
        foreach ($aggregationGroups as $g) {
            $out .= $this->renderAggregationCapsule($g, $nodeInfo, $edgeOffsets, $mapOptions, $ox, $oy);
        }

        // Edges
        $showPortRoles  = $mapOptions['stpShowPortRoles'] ?? true;
        $portRoleFs     = (float) ($mapOptions['stpPortRoleFontSize'] ?? 7);
        $portRoleBw     = (float) ($mapOptions['stpPortRoleBorderWidth'] ?? 1);
        foreach ($visibleEdges as $e) {
            $eStyle = $e->getStyle() ?? [];
            $areaColors = [];
            $pid = $e->getProtocol()?->getId();
            if ($pid !== null && isset($isisProtocolIds[$pid]) && !empty($eStyle['isisAreas'])) {
                foreach ($eStyle['isisAreas'] as $area) {
                    if (isset($isisAreaColors[$area])) $areaColors[] = $isisAreaColors[$area];
                }
            }
            // MSTP recolouring + label enrichment when an instance is picked.
            // Skip the edge entirely if it has no data for that instance, so
            // the PDF shows only relevant adjacencies (mirrors the map).
            $styleOverride = null;
            if ($isMstpFiltered && $pid === $filterPid && $mstpInstance !== null) {
                $instances = $eStyle['stpInstances'] ?? [];
                $found = null;
                foreach ($instances as $i) {
                    if ((string) ($i['instance'] ?? '') === $mstpInstance) { $found = $i; break; }
                }
                if ($found === null) continue;
                $styleOverride = $this->mstpEdgeStyleForInstance(
                    $eStyle, $found, $showPortRoles, $portRoleFs, $portRoleBw,
                );
            }
            $out .= $this->renderEdge($e, $nodeInfo, $edgeOffsets[$e->getId()] ?? 0, $ox, $oy, $areaColors, $styleOverride);
        }

        // Nodes — pass the STP root info so badge:stp_root LabelElements can
        // be filtered to render only on the actual root node, and only when
        // the global stpShowRootBadge toggle is on.
        $showRootBadge = $mapOptions['stpShowRootBadge'] ?? true;
        foreach ($nodeInfo as $ni) {
            $out .= $this->renderNode(
                $ni,
                $ox,
                $oy,
                $showRootBadge && isset($stpRootNodeIds[$ni['id']]),
            );
        }

        // Annotations with zIndex >= 0 (foreground)
        if (isset($annotations)) {
            foreach ($annotations as $a) {
                if ($a->getZIndex() >= 0) {
                    $out .= $this->renderAnnotation($a, $ox, $oy);
                }
            }
        }

        // Legend overlay — only when the caller explicitly opts in (e.g. the
        // report block's "Show legend" toggle). The live preview in the
        // editor passes showLegend=false so it stays distraction-free.
        if ($showLegend) {
            $legendPos = (string) ($mapOptions['stpLegendPosition'] ?? 'br');
            $unitPerPx = $vw / max(1, $canvasWidth);
            if ($isStpFiltered) {
                $out .= $this->renderStpLegend($minX, $minY, $vw, $vh, $legendPos, $isMstpFiltered, $unitPerPx);
            } elseif ($filterPid !== null && isset($isisProtocolIds[$filterPid]) && !empty($isisAreaColors)) {
                $out .= $this->renderIsisLegend($minX, $minY, $vw, $vh, $legendPos, $isisAreaColors, $unitPerPx);
            }
        }

        $out .= '</svg>';
        return $out;
    }

    /**
     * STP/MSTP legend: link-state colours + port-role pills + the root badge.
     * Sized in WORLD units derived from a target pixel size, so the card
     * appears at a constant ~physical size in the output SVG no matter how
     * wide the viewBox is. `unitPerPx` = world units per output pixel.
     */
    private function renderStpLegend(float $minX, float $minY, float $vw, float $vh, string $pos, bool $isMstp, float $unitPerPx): string
    {
        $states = [
            ['forwarding', 'Forwarding'],
            ['blocking',   'Blocking'],
            ['discarding', 'Discarding'],
            ['learning',   'Learning'],
            ['listening',  'Listening'],
            ['disabled',   'Disabled'],
            ['mixed',      'Mixed'],
        ];
        $roles = ['Root', 'Designated', 'Alternate', 'Backup', 'Master', 'Disabled'];

        // Pixel-anchored sizing. Each constant below is the desired on-screen
        // px size, multiplied by unitPerPx to convert to world units. The card
        // ends up the same physical size whether the viewBox is 500 or 5000.
        $scale = $unitPerPx;
        $pad = 8 * $scale;
        $lh  = 11 * $scale;
        $fs  = 9 * $scale;
        $titleFs = 8 * $scale;
        $cardW = 180 * $scale;
        // Header (title) + states header + states + role header + roles + bridge header + bridge row
        $rows = 1 + 1 + count($states) + 1 + count($roles) + 1 + 1;
        $cardH = $rows * $lh + $pad * 2;

        [$x, $y] = $this->legendCornerXY($pos, $minX, $minY, $vw, $vh, $cardW, $cardH, $pad);

        $svg = '<g style="pointer-events:none">';
        $svg .= '<rect x="' . $this->fmt($x) . '" y="' . $this->fmt($y) . '" width="' . $this->fmt($cardW) . '" height="' . $this->fmt($cardH) . '" rx="' . $this->fmt(4 * $scale) . '" fill="#ffffff" fill-opacity="0.95" stroke="#cbd5e1" stroke-width="' . $this->fmt(0.5 * $scale) . '"/>';
        $cursorY = $y + $pad + $titleFs * 0.8;
        $svg .= '<text x="' . $this->fmt($x + $pad) . '" y="' . $this->fmt($cursorY) . '" font-size="' . $this->fmt($titleFs) . '" font-weight="700" fill="#475569">' . ($isMstp ? 'MSTP legend' : 'STP legend') . '</text>';
        $cursorY += $lh;

        // Section: link states (color line + label)
        $svg .= '<text x="' . $this->fmt($x + $pad) . '" y="' . $this->fmt($cursorY) . '" font-size="' . $this->fmt($titleFs * 0.85) . '" font-weight="600" fill="#94a3b8">LINK STATE</text>';
        $cursorY += $lh;
        foreach ($states as $s) {
            $p = $this->stpStatePalette($s[0]);
            $da = $this->dashFor($p['dash'], 1.0);
            $sw = 18 * $scale;
            $lineY = $cursorY - $lh * 0.25;
            $attr = 'stroke="' . $p['color'] . '" stroke-width="' . $this->fmt(2 * $scale) . '"';
            if ($da) $attr .= ' stroke-dasharray="' . $da . '"';
            $svg .= '<line x1="' . $this->fmt($x + $pad) . '" y1="' . $this->fmt($lineY) . '" x2="' . $this->fmt($x + $pad + $sw) . '" y2="' . $this->fmt($lineY) . '" ' . $attr . '/>';
            $svg .= '<text x="' . $this->fmt($x + $pad + $sw + 4 * $scale) . '" y="' . $this->fmt($cursorY) . '" font-size="' . $this->fmt($fs) . '" fill="#475569">' . htmlspecialchars($s[1]) . '</text>';
            $cursorY += $lh;
        }

        // Section: port roles (pill + label)
        $svg .= '<text x="' . $this->fmt($x + $pad) . '" y="' . $this->fmt($cursorY) . '" font-size="' . $this->fmt($titleFs * 0.85) . '" font-weight="600" fill="#94a3b8">PORT ROLE</text>';
        $cursorY += $lh;
        $pillSize = 12 * $scale;
        foreach ($roles as $r) {
            $b = $this->stpRoleBadge($r);
            if (!$b) continue;
            // Pill: rect top at `cursorY - 0.85*pillSize` so its visual centre
            // sits a hair above the label baseline. The letter inside is
            // anchored to the pill centre with an explicit dy (≈ 0.35 × font
            // size in absolute units) so TCPDF, which ignores em-based dy,
            // still vertically centres the glyph inside the pill.
            $pillCy = $cursorY - $pillSize * 0.35;
            $pillFs = $fs * 0.95;
            $svg .= '<rect x="' . $this->fmt($x + $pad) . '" y="' . $this->fmt($cursorY - $pillSize * 0.85) . '" width="' . $this->fmt($pillSize) . '" height="' . $this->fmt($pillSize) . '" rx="' . $this->fmt(2 * $scale) . '" fill="' . $b['color'] . '"/>';
            $svg .= '<text x="' . $this->fmt($x + $pad + $pillSize / 2) . '" y="' . $this->fmt($pillCy) . '" text-anchor="middle" dy="' . $this->fmt($pillFs * 0.35) . '" font-size="' . $this->fmt($pillFs) . '" font-weight="800" fill="#ffffff">' . $b['letter'] . '</text>';
            $svg .= '<text x="' . $this->fmt($x + $pad + $pillSize + 4 * $scale) . '" y="' . $this->fmt($cursorY) . '" font-size="' . $this->fmt($fs) . '" fill="#475569">' . htmlspecialchars($b['full']) . '</text>';
            $cursorY += $lh;
        }

        // Section: root bridge
        $svg .= '<text x="' . $this->fmt($x + $pad) . '" y="' . $this->fmt($cursorY) . '" font-size="' . $this->fmt($titleFs * 0.85) . '" font-weight="600" fill="#94a3b8">BRIDGE</text>';
        $cursorY += $lh;
        $rR = 7 * $scale;
        $bridgeFs = $fs * 0.95;
        $bridgeCy = $cursorY - $rR * 0.5;
        $svg .= '<circle cx="' . $this->fmt($x + $pad + $rR) . '" cy="' . $this->fmt($bridgeCy) . '" r="' . $this->fmt($rR) . '" fill="#dc2626"/>';
        $svg .= '<text x="' . $this->fmt($x + $pad + $rR) . '" y="' . $this->fmt($bridgeCy) . '" text-anchor="middle" dy="' . $this->fmt($bridgeFs * 0.35) . '" font-size="' . $this->fmt($bridgeFs) . '" font-weight="800" fill="#ffffff">R</text>';
        $svg .= '<text x="' . $this->fmt($x + $pad + $rR * 2 + 4 * $scale) . '" y="' . $this->fmt($cursorY) . '" font-size="' . $this->fmt($fs) . '" fill="#475569">Root bridge</text>';

        $svg .= '</g>';
        return $svg;
    }

    /**
     * ISIS legend: lists each area with its colour. Empty (returns "") when
     * no area cluster has been generated.
     * @param array<string,string> $areaColors  area name => stroke colour
     */
    private function renderIsisLegend(float $minX, float $minY, float $vw, float $vh, string $pos, array $areaColors, float $unitPerPx): string
    {
        $scale = $unitPerPx;
        $pad = 8 * $scale;
        $lh  = 11 * $scale;
        $fs  = 9 * $scale;
        $titleFs = 8 * $scale;
        $cardW = 180 * $scale;
        $cardH = (count($areaColors) + 1) * $lh + $pad * 2;
        [$x, $y] = $this->legendCornerXY($pos, $minX, $minY, $vw, $vh, $cardW, $cardH, $pad);

        $svg = '<g style="pointer-events:none">';
        $svg .= '<rect x="' . $this->fmt($x) . '" y="' . $this->fmt($y) . '" width="' . $this->fmt($cardW) . '" height="' . $this->fmt($cardH) . '" rx="' . $this->fmt(4 * $scale) . '" fill="#ffffff" fill-opacity="0.95" stroke="#cbd5e1" stroke-width="' . $this->fmt(0.5 * $scale) . '"/>';
        $cursorY = $y + $pad + $titleFs * 0.8;
        $svg .= '<text x="' . $this->fmt($x + $pad) . '" y="' . $this->fmt($cursorY) . '" font-size="' . $this->fmt($titleFs) . '" font-weight="700" fill="#475569">ISIS areas</text>';
        $cursorY += $lh;
        $sw = 18 * $scale;
        foreach ($areaColors as $area => $color) {
            $lineY = $cursorY - $lh * 0.25;
            $svg .= '<line x1="' . $this->fmt($x + $pad) . '" y1="' . $this->fmt($lineY) . '" x2="' . $this->fmt($x + $pad + $sw) . '" y2="' . $this->fmt($lineY) . '" stroke="' . $color . '" stroke-width="' . $this->fmt(2.5 * $scale) . '"/>';
            $svg .= '<text x="' . $this->fmt($x + $pad + $sw + 4 * $scale) . '" y="' . $this->fmt($cursorY) . '" font-size="' . $this->fmt($fs) . '" font-family="monospace" fill="#475569">' . htmlspecialchars((string) $area) . '</text>';
            $cursorY += $lh;
        }
        $svg .= '</g>';
        return $svg;
    }

    /**
     * Translate a corner code ("tl"/"tr"/"bl"/"br") into world-coordinate
     * (x, y) of the top-left corner of the legend card, with a small inner
     * padding so it doesn't kiss the viewport edge.
     */
    private function legendCornerXY(string $pos, float $minX, float $minY, float $vw, float $vh, float $cardW, float $cardH, float $pad): array
    {
        $x = match ($pos) {
            'tl', 'bl' => $minX + $pad,
            default    => $minX + $vw - $cardW - $pad,
        };
        $y = match ($pos) {
            'tl', 'tr' => $minY + $pad,
            default    => $minY + $vh - $cardH - $pad,
        };
        return [$x, $y];
    }

    private function emptySvg(string $msg): string
    {
        return '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="100"><rect width="400" height="100" fill="#f8fafc"/><text x="200" y="55" text-anchor="middle" fill="#94a3b8" font-size="14">' . htmlspecialchars($msg) . '</text></svg>';
    }

    /**
     * @param bool $showStpRoot When false, every badge:stp_root LabelElement
     *        on this node is skipped (node is not a root for the current STP
     *        protocol/instance context, or the toggle is off).
     */
    private function renderNode(array $ni, float $ox, float $oy, bool $showStpRoot = false): string
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
            case 'hexagon': {
                $r = $w / 2;
                $pts = [];
                for ($i = 0; $i < 6; $i++) {
                    $a = (M_PI / 3) * $i - M_PI / 6;
                    $pts[] = $this->fmt($r * cos($a)) . ',' . $this->fmt($r * sin($a));
                }
                $svg .= '<polygon points="' . implode(' ', $pts) . '" fill="' . $bg . '" stroke="' . $border . '" stroke-width="' . $bw . '"/>';
                break;
            }
            case 'triangle':
                $svg .= '<polygon points="0,' . $this->fmt(-$h / 2) . ' ' . $this->fmt($w / 2) . ',' . $this->fmt($h / 2) . ' ' . $this->fmt(-$w / 2) . ',' . $this->fmt($h / 2) . '" fill="' . $bg . '" stroke="' . $border . '" stroke-width="' . $bw . '"/>';
                break;
            case 'round-rectangle':
            default:
                $svg .= '<rect x="' . $this->fmt(-$w / 2) . '" y="' . $this->fmt(-$h / 2) . '" width="' . $this->fmt($w) . '" height="' . $this->fmt($h) . '" rx="8" ry="8" fill="' . $bg . '" stroke="' . $border . '" stroke-width="' . $bw . '"/>';
        }

        // Labels (plain fields + compliance/monitoring/stp_root badges)
        foreach ($d['labelElements'] ?? [] as $el) {
            $field = (string)($el['field'] ?? '');
            if ($field === 'badge:compliance' || $field === 'badge:monitoring') {
                $svg .= $this->renderBadge($el, $ni, $field === 'badge:compliance');
                continue;
            }
            if ($field === 'badge:stp_root') {
                if (!$showStpRoot) continue;
                $svg .= $this->renderStpRootBadge($el);
                continue;
            }
            $text = $this->resolveFieldValue($field, $ni);
            if ($text === '' || $text === null) continue;
            $tx = (float)($el['x'] ?? 0);
            $ty = (float)($el['y'] ?? 0);
            $fs = (float)($el['fontSize'] ?? 11);
            $col = $el['color'] ?? '#1e293b';
            $fw = (int)($el['fontWeight'] ?? 600);
            $align = $el['textAlign'] ?? 'center';
            $anchor = $align === 'left' ? 'start' : ($align === 'right' ? 'end' : 'middle');
            $svg .= '<text x="' . $this->fmt($tx) . '" y="' . $this->fmt($ty) . '" text-anchor="' . $anchor . '" dy="' . $this->fmt($fs * 0.35) . '" fill="' . $col . '" font-size="' . $fs . '" font-weight="' . $fw . '">' . htmlspecialchars($text) . '</text>';
        }

        $svg .= '</g>';
        return $svg;
    }

    /**
     * Render a compliance or monitoring badge: a coloured circle with an
     * optional letter (compliance grade) inside. Auto-colours follow the same
     * rules as the React `renderLabel` function.
     */
    private function renderBadge(array $el, array $ni, bool $isCompliance): string
    {
        $diameter = (float)($el['badgeSize'] ?? $el['fontSize'] ?? 12);
        $r = $diameter / 2;
        $node = $ni['node'];
        $autoColor = '#94a3b8';
        $letter = '';
        if ($isCompliance) {
            $score = $node->getComplianceScore();
            $palette = ['A' => '#22c55e', 'B' => '#84cc16', 'C' => '#eab308', 'D' => '#f97316', 'E' => '#ef4444', 'F' => '#7f1d1d'];
            if ($score && isset($palette[$score])) $autoColor = $palette[$score];
            if (($el['badgeShowLabel'] ?? true) !== false && $score) $letter = $score;
        } else {
            $reach = $node->getIsReachable();
            if ($reach === true) $autoColor = '#22c55e';
            elseif ($reach === false) $autoColor = '#ef4444';
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
     * Render the STP root badge: a red "R" pill. Mirror of the React render
     * for badge:stp_root — the caller has already decided whether to render
     * it at all (root + toggle).
     */
    private function renderStpRootBadge(array $el): string
    {
        $diameter = (float)($el['badgeSize'] ?? $el['fontSize'] ?? 14);
        $r = $diameter / 2;
        $fill = $el['badgeBgColor'] ?? '#dc2626';
        $borderCol = $el['badgeBorderColor'] ?? '#ffffff';
        $borderW = (float)($el['badgeBorderWidth'] ?? 1.5);
        $cx = (float)($el['x'] ?? 0);
        $cy = (float)($el['y'] ?? 0);
        $svg = '<circle cx="' . $this->fmt($cx) . '" cy="' . $this->fmt($cy) . '" r="' . $this->fmt($r) . '" fill="' . $fill . '" stroke="' . $borderCol . '" stroke-width="' . $this->fmt($borderW) . '"/>';
        if (($el['badgeShowLabel'] ?? true) !== false) {
            $textCol = $el['color'] ?? '#ffffff';
            $svg .= '<text x="' . $this->fmt($cx) . '" y="' . $this->fmt($cy) . '" text-anchor="middle" dy="' . $this->fmt($r * 1.2 * 0.35) . '" fill="' . $textCol . '" font-size="' . $this->fmt($r * 1.2) . '" font-weight="700">R</text>';
        }
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
            // Per-pair spacing: honour parallelSpacing set on any edge of the pair
            // (matches the frontend), otherwise use the default. Stored as a px
            // perpendicular offset so buildPath/pointAt use it directly.
            $spacing = 18.0;
            foreach ($group as $e) {
                $ps = $e->getStyle()['parallelSpacing'] ?? null;
                if (is_numeric($ps)) { $spacing = (float) $ps; break; }
            }
            foreach ($group as $i => $e) {
                $offsets[$e->getId()] = ($i - ($n - 1) / 2) * $spacing;
            }
        }
        return $offsets;
    }

    /**
     * Build the aggregation groups list (mirror of TopologyMap.tsx). Edges
     * sharing the same node pair AND the same `style.aggregationGroup` are
     * collected; the resulting capsule label uses the explicit
     * `style.aggregationLabel` of any member, or falls back to the group key.
     *
     * @param TopologyEdge[] $edges
     * @return list<array{key:string, sourceNodeId:int, targetNodeId:int, members: TopologyEdge[], label:string}>
     */
    private function computeAggregationGroups(array $edges): array
    {
        $byAgg = [];
        foreach ($edges as $e) {
            $g = trim((string)(($e->getStyle()['aggregationGroup'] ?? '')));
            if ($g === '') continue;
            $sId = $e->getSourceNode()->getId();
            $tId = $e->getTargetNode()->getId();
            $pair = ($sId < $tId) ? "$sId|$tId" : "$tId|$sId";
            $k = "$pair|$g";
            $byAgg[$k][] = $e;
        }
        $groups = [];
        foreach ($byAgg as $k => $members) {
            if (count($members) < 2) continue;
            usort($members, fn(TopologyEdge $a, TopologyEdge $b) => $a->getId() <=> $b->getId());
            $first = $members[0];
            $explicit = null;
            foreach ($members as $m) {
                $lbl = trim((string)(($m->getStyle()['aggregationLabel'] ?? '')));
                if ($lbl !== '') { $explicit = $lbl; break; }
            }
            $groups[] = [
                'key' => $k,
                'sourceNodeId' => $first->getSourceNode()->getId(),
                'targetNodeId' => $first->getTargetNode()->getId(),
                'members' => $members,
                'label' => $explicit ?? trim((string)($first->getStyle()['aggregationGroup'] ?? '')),
            ];
        }
        return $groups;
    }

    /**
     * Render the oblong capsule that wraps a parallel-link aggregation group.
     * Geometry and label placement mirror the React implementation.
     *
     * @param array{key:string, sourceNodeId:int, targetNodeId:int, members: TopologyEdge[], label:string} $g
     * @param array<int,float> $edgeOffsets
     * @param array<string,mixed> $mapOptions
     */
    private function renderAggregationCapsule(array $g, array $nodeInfo, array $edgeOffsets, array $mapOptions, float $ox, float $oy): string
    {
        $sni = $nodeInfo[$g['sourceNodeId']] ?? null;
        $tni = $nodeInfo[$g['targetNodeId']] ?? null;
        if (!$sni || !$tni) return '';
        $sx = $sni['pos']['x'] + $ox;
        $sy = $sni['pos']['y'] + $oy;
        $tx = $tni['pos']['x'] + $ox;
        $ty = $tni['pos']['y'] + $oy;
        $dx = $tx - $sx;
        $dy = $ty - $sy;
        $len = sqrt($dx * $dx + $dy * $dy) ?: 1;
        $px = -$dy / $len;
        $py = $dx / $len;

        // Midpoint of each member edge accounting for its parallel offset.
        $midpoints = [];
        foreach ($g['members'] as $edge) {
            $offset = $edgeOffsets[$edge->getId()] ?? 0;
            $style = array_merge(
                ['type' => 'straight', 'color' => '#94a3b8', 'width' => 1.5, 'dash' => 'solid', 'curveTension' => 0.3],
                $edge->getStyle() ?? []
            );
            $midpoints[] = $this->pointAt($style, $sx, $sy, $tx, $ty, 0.5, (float)$offset);
        }
        $cx = 0; $cy = 0;
        foreach ($midpoints as $p) { $cx += $p['x']; $cy += $p['y']; }
        $cx /= count($midpoints); $cy /= count($midpoints);

        $maxPerp = 0;
        foreach ($midpoints as $p) {
            $perp = abs(($p['x'] - $cx) * $px + ($p['y'] - $cy) * $py);
            if ($perp > $maxPerp) $maxPerp = $perp;
        }
        $halfMinor = max(10.0, $maxPerp + 6.0);

        $labelText = $g['label'];
        $labelPos = $mapOptions['aggregateLabelPosition'] ?? 'center';
        $labelInside = $labelPos === 'center';
        $labelFontSize = (float)($mapOptions['aggregateLabelFontSize'] ?? 6);
        $labelHalfWidth = $labelText !== '' ? strlen($labelText) * $labelFontSize * 0.32 + 3 : 0;
        $halfMajor = $labelInside ? max(5.0, $labelHalfWidth) : 5.0;
        $angle = rad2deg(atan2($dy, $dx));
        $transparent = (bool)($mapOptions['aggregateTransparent'] ?? false);
        $fill = $mapOptions['aggregateFillColor'] ?? '#ffffff';
        $stroke = $mapOptions['aggregateBorderColor'] ?? '#94a3b8';
        $strokeWidthVal = (float)($mapOptions['aggregateBorderWidth'] ?? 0.5);
        // Use null-coalescing first: `?:` alone would emit "Undefined array key"
        // when the option is unset, and PHP can leak that warning to the
        // response body, corrupting the SVG before it reaches the browser.
        $labelFill = ($mapOptions['aggregateLabelColor'] ?? '') ?: $stroke;

        $textX = $cx; $textY = $cy;
        if (!$labelInside && $labelText !== '') {
            $padding = $halfMinor + 8.0 + $labelFontSize * 0.7;
            $sign = $labelPos === 'above' ? -1 : 1;
            $textX = $cx + $sign * $px * $padding;
            $textY = $cy + $sign * $py * $padding;
        }

        $svg = '<g>';
        $fillAttr = $transparent
            ? 'fill="none" fill-opacity="0"'
            : 'fill="' . $fill . '" fill-opacity="0.95"';
        $svg .= '<ellipse cx="' . $this->fmt($cx) . '" cy="' . $this->fmt($cy) . '" rx="' . $this->fmt($halfMajor) . '" ry="' . $this->fmt($halfMinor) . '" ' . $fillAttr . ' stroke="' . $stroke . '" stroke-width="' . $this->fmt($strokeWidthVal) . '" transform="rotate(' . $this->fmt($angle) . ' ' . $this->fmt($cx) . ' ' . $this->fmt($cy) . ')"/>';
        if ($labelText !== '') {
            if (!$labelInside) {
                $svg .= '<rect x="' . $this->fmt($textX - $labelHalfWidth - 1) . '" y="' . $this->fmt($textY - $labelFontSize * 0.7) . '" width="' . $this->fmt($labelHalfWidth * 2 + 2) . '" height="' . $this->fmt($labelFontSize * 1.3) . '" fill="white" fill-opacity="0.95" rx="2"/>';
            }
            $svg .= '<text x="' . $this->fmt($textX) . '" y="' . $this->fmt($textY) . '" text-anchor="middle" dy="' . $this->fmt($labelFontSize * 0.35) . '" fill="' . $labelFill . '" font-size="' . $this->fmt($labelFontSize) . '" font-weight="600">' . htmlspecialchars($labelText) . '</text>';
        }
        $svg .= '</g>';
        return $svg;
    }

    /**
     * Approximate the total horizontal footprint of an edge label in world
     * units: pill width + gap + main text width. Mirrors the geometry of the
     * SVG renderer (charW ≈ 0.58 × fontSize) so the caller can compute the
     * gap needed between adjacent labels on the same tangent line.
     */
    private function labelBlockWidth(array $label): float
    {
        $fs = (float) ($label['fontSize'] ?? 6);
        $textW = strlen((string) ($label['text'] ?? '')) * 0.58 * $fs;
        if (!isset($label['pill'])) return $textW;
        $pillText = (string) ($label['pill']['text'] ?? '');
        $pillW = strlen($pillText) * 0.58 * $fs + 4;  // +4 = horizontal padding inside pill
        $pillGap = 3;
        return $pillW + $pillGap + $textW;
    }

    /**
     * Build a transformed style array for an MSTP edge restricted to one MSTI.
     * Mirrors the frontend annotated logic:
     *   - stroke colour & dash come from the instance state
     *   - port labels get the role pill (R/D/A/B/M/-) on the node side and
     *     the priority suffix in parentheses
     *   - cost asymmetry is surfaced via `tangentOffset` (positive at source,
     *     negative at target) so both cost labels sit on the SAME line
     *   - symmetric cost stays as a single centred label
     */
    private function mstpEdgeStyleForInstance(
        array $eStyle,
        array $instance,
        bool $showRoles,
        float $roleFs,
        float $roleBw,
    ): array {
        $state = (string) ($instance['state'] ?? 'unknown');
        $hint = $this->stpStatePalette($state);
        $style = $eStyle;
        $style['color'] = $hint['color'];
        $style['dash']  = $hint['dash'];

        $priorityLocal  = $instance['priorityLocal']  ?? null;
        $priorityRemote = $instance['priorityRemote'] ?? null;
        $costLocal      = $instance['costLocal']      ?? null;
        $costRemote     = $instance['costRemote']     ?? null;
        $roleLocal  = $showRoles ? $this->stpRoleBadge($instance['roleLocal']  ?? null) : null;
        $roleRemote = $showRoles ? $this->stpRoleBadge($instance['roleRemote'] ?? null) : null;

        // Track the width of each enriched port label so we can compute the
        // exact tangent offset needed to keep the asymmetric cost label clear
        // of the port label on the same line. Source and target labels can
        // have different lengths (different port names) so each side is
        // measured independently.
        $portWidth = ['source' => 0.0, 'target' => 0.0];
        $labels = [];
        foreach (($eStyle['labels'] ?? []) as $lbl) {
            $pos = $lbl['position'] ?? 'middle';
            if ($pos === 'source' || $pos === 'target') {
                $prio = $pos === 'source' ? $priorityLocal : $priorityRemote;
                $role = $pos === 'source' ? $roleLocal     : $roleRemote;
                if ($prio !== null) $lbl['text'] = ($lbl['text'] ?? '') . " ({$prio})";
                if ($role !== null) {
                    $lbl['pill'] = ['text' => $role['letter'], 'bgColor' => $role['color'], 'borderWidth' => $roleBw];
                    $lbl['fontSize'] = $roleFs;
                }
                $portWidth[$pos] = $this->labelBlockWidth($lbl);
            }
            $labels[] = $lbl;
        }
        if ($costLocal !== null && $costRemote !== null && $costLocal !== $costRemote) {
            // Asymmetric cost: surfaced on each side. Push the cost label far
            // enough along the tangent that it clears the port label (which
            // sits at pt + pillAutoShift). Both shifts share the same nodeMargin
            // so the cost label keeps a consistent gap from the port label
            // regardless of port name length.
            $costFs = 6;
            $costLW = strlen((string) $costLocal)  * 0.58 * $costFs;
            $costRW = strlen((string) $costRemote) * 0.58 * $costFs;
            $gap = 4;
            $nodeMargin = 2;
            // pillAutoShift on the port matches the rendering code: when a
            // pill is present, the port label centre is at pt + totalW/2 +
            // nodeMargin (i.e. fully outside the node). Cost label needs to
            // clear the port label on top of that, so its centre is one full
            // portWidth + nodeMargin + gap + costHalf away from pt.
            $hasPortPill = $roleLocal !== null || $roleRemote !== null;
            $tlSource = ($hasPortPill ? $portWidth['source'] + $nodeMargin : $portWidth['source'] / 2) + $gap + $costLW / 2;
            $tlTarget = ($hasPortPill ? $portWidth['target'] + $nodeMargin : $portWidth['target'] / 2) + $gap + $costRW / 2;
            $labels[] = ['text' => (string) $costLocal,  'position' => 'source', 'fontSize' => $costFs, 'color' => '#dc2626', 'fontWeight' => 700, 'tangentOffset' => $tlSource];
            $labels[] = ['text' => (string) $costRemote, 'position' => 'target', 'fontSize' => $costFs, 'color' => '#dc2626', 'fontWeight' => 700, 'tangentOffset' => -$tlTarget];
        } elseif ($costLocal !== null || $costRemote !== null) {
            $labels[] = ['text' => (string) ($costLocal ?? $costRemote), 'position' => 'middle', 'fontSize' => 6, 'color' => '#475569', 'fontWeight' => 600];
        }
        $style['labels'] = $labels;
        return $style;
    }

    /**
     * @param string[] $areaColors  ISIS area colours; 1 = paint stroke with that
     *                              colour, 2+ = render a zebra-dashed pattern.
     * @param array<string,mixed>|null $styleOverride Use this style instead of
     *        $e->getStyle() — used by MSTP rendering to recolour per instance.
     */
    private function renderEdge(TopologyEdge $e, array $nodeInfo, float $offsetIndex, float $ox, float $oy, array $areaColors = [], ?array $styleOverride = null): string
    {
        $s = $nodeInfo[$e->getSourceNode()->getId()] ?? null;
        $t = $nodeInfo[$e->getTargetNode()->getId()] ?? null;
        if (!$s || !$t) return '';

        $style = array_merge(
            ['type' => 'straight', 'color' => '#94a3b8', 'width' => 1.5, 'dash' => 'solid', 'curveTension' => 0.3, 'labels' => []],
            $styleOverride ?? $e->getStyle() ?? []
        );
        // Single area: override the stroke with the area's colour. Multi-area:
        // keep the base colour for fallbacks (e.g. when zebra fails) — the
        // overlapping dashed strokes below carry the per-area colours.
        if (count($areaColors) === 1) {
            $style['color'] = $areaColors[0];
        }
        $sx = $s['pos']['x'] + $ox;
        $sy = $s['pos']['y'] + $oy;
        $tx = $t['pos']['x'] + $ox;
        $ty = $t['pos']['y'] + $oy;

        $path = $this->buildPath($style, $sx, $sy, $tx, $ty, $offsetIndex);
        $dash = $this->dashFor($style['dash'], (float)$style['width']);

        if (count($areaColors) >= 2) {
            // Zebra: N overlapping dashed strokes share the same period
            // (n × dashLen) but each uses a different dashoffset, so every Nth
            // dash slot is occupied by exactly one colour — yielding an
            // interleaved hatched look. Mirror of the React renderEdge.
            $n = count($areaColors);
            $w = (float)$style['width'];
            $dashLen = max($w * 4, 6.0);
            $da = $this->fmt($dashLen) . ' ' . $this->fmt($dashLen * ($n - 1));
            $svg = '';
            foreach ($areaColors as $i => $col) {
                $offset = -$i * $dashLen;
                $svg .= '<path d="' . $path . '" fill="none" stroke="' . $col . '" stroke-width="' . $this->fmt($w) . '" stroke-dasharray="' . $da . '" stroke-dashoffset="' . $this->fmt($offset) . '" stroke-linecap="butt" stroke-linejoin="round"/>';
            }
        } else {
            $svg = '<path d="' . $path . '" fill="none" stroke="' . $style['color'] . '" stroke-width="' . $style['width'] . '"';
            if ($dash) $svg .= ' stroke-dasharray="' . $dash . '"';
            $svg .= ' stroke-linecap="round" stroke-linejoin="round"/>';
        }

        // Labels (port, cost, role pills) — mirrors the React renderEdge label
        // logic, including the inline pill (role badge) and tangent offset
        // (cost asymmetry). The `flipped` adjustment keeps pills on the node
        // side and shifts cost toward the centre regardless of edge direction.
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
            $pA = $this->pointAt($style, $sx, $sy, $tx, $ty, max(0, $ratio - 0.01), $offsetIndex);
            $pB = $this->pointAt($style, $sx, $sy, $tx, $ty, min(1, $ratio + 0.01), $offsetIndex);
            $angle = rad2deg(atan2($pB['y'] - $pA['y'], $pB['x'] - $pA['x']));
            $flipped = $angle > 90 || $angle < -90;
            if ($flipped) $angle += ($angle > 90 ? -180 : 180);

            // Optional pill (role badge)
            $pill = $label['pill'] ?? null;
            $pillText = $pill ? (string)($pill['text'] ?? '') : '';
            $pillW    = $pill ? strlen($pillText) * ($fs * 0.58) + 4 : 0;
            $pillGap  = $pill ? 3 : 0;
            $pillOnLeft = $flipped ? ($pos === 'target') : ($pos !== 'target');

            $textW = strlen($text) * $fs * 0.58;
            $h = $fs * 1.3;
            $totalW = $pillW + $pillGap + $textW;
            $blockHalf = $totalW / 2;
            $textShiftX = $pill ? ($pillOnLeft ? ($pillW + $pillGap) / 2 : -($pillW + $pillGap) / 2) : 0;
            $pillCenterX = $pill ? ($pillOnLeft ? -$blockHalf + $pillW / 2 : $blockHalf - $pillW / 2) : 0;

            // Auto-shift label away from the node when a pill is attached, plus
            // any explicit tangentOffset (cost asymmetry). All canonical, sign
            // flipped if the label was rotated 180° to stay readable.
            // Auto-shift the WHOLE block (pill + gap + text) entirely outside
            // the node's bounding box. findLabelRatio() places the label
            // centre right at the node edge, which puts ~50% of the block
            // inside the node — fine for plain text on a white background,
            // but the role pill (R/D/A/B/M) is invisible against the node.
            // Shifting by half the total width pushes the node-side edge of
            // the block flush with the node edge, plus a small margin so the
            // pill clearly stands out.
            $totalWForShift = $pillW + $pillGap + $textW;
            $nodeMargin = 2;
            $pillAutoShift = $pill ? ($totalWForShift / 2 + $nodeMargin) * ($pos === 'target' ? -1 : 1) : 0;
            $canonicalT = (float)($label['tangentOffset'] ?? 0) + $pillAutoShift;
            $tangentOffset = $canonicalT * ($flipped ? -1 : 1);

            $svg .= '<g transform="translate(' . $this->fmt($pt['x']) . ' ' . $this->fmt($pt['y']) . ') rotate(' . $this->fmt($angle) . ') translate(' . $this->fmt($tangentOffset) . ' ' . $this->fmt($offset) . ')">';
            $bgFill = $label['backgroundColor'] ?? 'white';
            $bgOpac = isset($label['backgroundColor']) ? '1' : '0.9';
            $svg .= '<rect x="' . $this->fmt(-$blockHalf - 3) . '" y="' . $this->fmt(-$h / 2) . '" width="' . $this->fmt($totalW + 6) . '" height="' . $this->fmt($h) . '" fill="' . $bgFill . '" fill-opacity="' . $bgOpac . '" rx="2"/>';
            if ($pill) {
                $bw = (float) ($pill['borderWidth'] ?? 1);
                $innerW = max(0.0, $pillW - 2 * $bw);
                $innerH = max(0.0, $h - 2 * $bw);
                $svg .= '<rect x="' . $this->fmt($pillCenterX - $innerW / 2) . '" y="' . $this->fmt(-$innerH / 2) . '" width="' . $this->fmt($innerW) . '" height="' . $this->fmt($innerH) . '" fill="' . htmlspecialchars((string) $pill['bgColor']) . '" rx="2"/>';
                $svg .= '<text x="' . $this->fmt($pillCenterX) . '" y="0" text-anchor="middle" dy="' . $this->fmt($fs * 0.95 * 0.35) . '" fill="' . htmlspecialchars((string) ($pill['textColor'] ?? '#ffffff')) . '" font-size="' . $this->fmt($fs * 0.95) . '" font-weight="800">' . htmlspecialchars($pillText) . '</text>';
            }
            $svg .= '<text x="' . $this->fmt($textShiftX) . '" text-anchor="middle" dy="' . $this->fmt($fs * 0.35) . '" fill="' . $col . '" font-size="' . $fs . '" font-weight="' . $fw . '">' . htmlspecialchars($text) . '</text>';
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

    private function buildPath(array $style, float $sx, float $sy, float $tx, float $ty, float $offset): string
    {
        if (($style['type'] ?? 'straight') === 'orthogonal') {
            $mx = ($sx + $tx) / 2 + $offset;
            return 'M ' . $this->fmt($sx) . ' ' . $this->fmt($sy) . ' L ' . $this->fmt($mx) . ' ' . $this->fmt($sy) . ' L ' . $this->fmt($mx) . ' ' . $this->fmt($ty) . ' L ' . $this->fmt($tx) . ' ' . $this->fmt($ty);
        }
        if (($style['type'] ?? 'straight') === 'curved' || $offset != 0) {
            $tension = ($style['type'] ?? 'straight') === 'curved' ? (float)($style['curveTension'] ?? 0.3) : 0;
            $dx = $tx - $sx;
            $dy = $ty - $sy;
            $len = sqrt($dx * $dx + $dy * $dy) ?: 1;
            $px = -$dy / $len;
            $py = $dx / $len;
            $totalOff = $len * $tension + $offset;
            $cx = ($sx + $tx) / 2 + $px * $totalOff;
            $cy = ($sy + $ty) / 2 + $py * $totalOff;
            return 'M ' . $this->fmt($sx) . ' ' . $this->fmt($sy) . ' Q ' . $this->fmt($cx) . ' ' . $this->fmt($cy) . ' ' . $this->fmt($tx) . ' ' . $this->fmt($ty);
        }
        return 'M ' . $this->fmt($sx) . ' ' . $this->fmt($sy) . ' L ' . $this->fmt($tx) . ' ' . $this->fmt($ty);
    }

    private function pointAt(array $style, float $sx, float $sy, float $tx, float $ty, float $ratio, float $offset): array
    {
        $type = $style['type'] ?? 'straight';
        if ($type === 'orthogonal') {
            $mx = ($sx + $tx) / 2 + $offset;
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
        if ($type === 'curved' || $offset != 0) {
            $tension = $type === 'curved' ? (float)($style['curveTension'] ?? 0.3) : 0;
            $dx = $tx - $sx;
            $dy = $ty - $sy;
            $len = sqrt($dx * $dx + $dy * $dy) ?: 1;
            $px = -$dy / $len;
            $py = $dx / $len;
            $totalOff = $len * $tension + $offset;
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

        if ($shape === 'polygon') {
            // Tight enclosing polygon: inflate every node's bbox by `pad` first,
            // then convex-hull the inflated corners. Inflating per-node keeps
            // padding uniform on all four sides even when nodes are spread far
            // apart on one axis — expanding from a centroid would collapse the
            // top/bottom padding for horizontally aligned clusters.
            $corners = [];
            foreach ($members as $m) {
                $w = (float)($m['design']['width'] ?? 100);
                $h = (float)($m['design']['height'] ?? 40);
                $hx = $w / 2 + $pad;
                $hy = $h / 2 + $pad;
                $cx0 = $m['pos']['x'];
                $cy0 = $m['pos']['y'];
                $corners[] = ['x' => $cx0 - $hx, 'y' => $cy0 - $hy];
                $corners[] = ['x' => $cx0 + $hx, 'y' => $cy0 - $hy];
                $corners[] = ['x' => $cx0 + $hx, 'y' => $cy0 + $hy];
                $corners[] = ['x' => $cx0 - $hx, 'y' => $cy0 + $hy];
            }
            $expanded = $this->convexHull($corners);
            $pts = [];
            $minX = PHP_INT_MAX; $minY = PHP_INT_MAX; $maxX = PHP_INT_MIN; $maxY = PHP_INT_MIN;
            foreach ($expanded as $p) {
                $px = $p['x'] + $ox;
                $py = $p['y'] + $oy;
                $pts[] = $this->fmt($px) . ',' . $this->fmt($py);
                if ($px < $minX) $minX = $px;
                if ($px > $maxX) $maxX = $px;
                if ($py < $minY) $minY = $py;
                if ($py > $maxY) $maxY = $py;
            }
            $body = '<polygon points="' . implode(' ', $pts) . '" ' . $fillProps . ' stroke="' . $style['borderColor'] . '" stroke-width="' . $style['borderWidth'] . '"' . ($dash ? ' stroke-dasharray="' . $dash . '"' : '') . ' stroke-linejoin="round"/>';
            $labelCx = $minX + 12;
            $labelCy = $style['labelPosition'] === 'top' ? $minY - $fontSize * 0.4 - 2 : $maxY + $fontSize + 2;
            $label = $labelText !== '' ? $this->renderClusterLabel($labelText, $labelCx + $labelOffset['dx'], $labelCy + $labelOffset['dy'], $fontSize, $style, false) : '';
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
        $svg .= '<text x="' . $this->fmt($pillX + $pillW / 2) . '" y="' . $this->fmt($pillY + $pillH / 2) . '" text-anchor="middle" dy="' . $this->fmt($fontSize * 0.35) . '" fill="#ffffff" font-size="' . $fontSize . '" font-weight="600">' . htmlspecialchars($text) . '</text>';
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
                $svg .= '<text x="' . $this->fmt($tx) . '" y="' . $this->fmt($h / 2) . '" text-anchor="' . $anchor . '" dy="' . $this->fmt($fs * 0.35) . '" fill="' . $col . '" font-size="' . $fs . '" font-weight="' . $fw . '">' . htmlspecialchars($text) . '</text>';
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
