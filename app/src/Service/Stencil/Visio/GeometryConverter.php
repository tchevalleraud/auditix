<?php

namespace App\Service\Stencil\Visio;

use Psr\Log\LoggerInterface;

/**
 * Converts a Visio Geometry <Section> into SVG drawing primitives, expressed in
 * the shape's local inch coordinates (Y-up). Arcs are approximated with quadratic
 * Béziers through three points — robust under the importer's Y-flip matrix and
 * free of the sweep-flag ambiguity that exact SVG arcs would introduce.
 *
 * Returned primitives:
 *   ['path', string $d, bool $closed]
 *   ['ellipse', float $cx, float $cy, float $rx, float $ry, float $angleDeg]
 */
final class GeometryConverter
{
    private bool $warnedSpline = false;

    public function __construct(private readonly LoggerInterface $logger) {}

    /**
     * @return array<int, array<int, mixed>>
     */
    public function convert(\DOMXPath $xp, \DOMElement $section, float $w, float $h): array
    {
        $prims = [];
        $d = '';
        $curX = 0.0; $curY = 0.0;
        $firstX = null; $firstY = null;
        $hasPath = false;

        foreach ($xp->query("./*[local-name()='Row']", $section) as $row) {
            if (!$row instanceof \DOMElement) {
                continue;
            }
            $t = $row->getAttribute('T');
            $x = $this->cell($xp, $row, 'X');
            $y = $this->cell($xp, $row, 'Y');
            $a = $this->cell($xp, $row, 'A');
            $b = $this->cell($xp, $row, 'B');
            $c = $this->cell($xp, $row, 'C');
            $dd = $this->cell($xp, $row, 'D');

            switch ($t) {
                case 'MoveTo':
                    $curX = $x ?? 0; $curY = $y ?? 0;
                    $firstX ??= $curX; $firstY ??= $curY;
                    $d .= 'M ' . $this->n($curX) . ' ' . $this->n($curY) . ' ';
                    $hasPath = true;
                    break;
                case 'RelMoveTo':
                    $curX = ($x ?? 0) * $w; $curY = ($y ?? 0) * $h;
                    $firstX ??= $curX; $firstY ??= $curY;
                    $d .= 'M ' . $this->n($curX) . ' ' . $this->n($curY) . ' ';
                    $hasPath = true;
                    break;
                case 'LineTo':
                    $curX = $x ?? $curX; $curY = $y ?? $curY;
                    $d .= 'L ' . $this->n($curX) . ' ' . $this->n($curY) . ' ';
                    $hasPath = true;
                    break;
                case 'RelLineTo':
                    $curX = ($x ?? 0) * $w; $curY = ($y ?? 0) * $h;
                    $d .= 'L ' . $this->n($curX) . ' ' . $this->n($curY) . ' ';
                    $hasPath = true;
                    break;
                case 'ArcTo':
                    $d .= $this->arcTo($curX, $curY, $x ?? $curX, $y ?? $curY, $a ?? 0);
                    $curX = $x ?? $curX; $curY = $y ?? $curY;
                    $hasPath = true;
                    break;
                case 'EllipticalArcTo':
                    // (A,B) is an on-curve point ~midway → quadratic Bézier through it.
                    $ex = $x ?? $curX; $ey = $y ?? $curY;
                    $cx = 2 * ($a ?? (($curX + $ex) / 2)) - 0.5 * ($curX + $ex);
                    $cy = 2 * ($b ?? (($curY + $ey) / 2)) - 0.5 * ($curY + $ey);
                    $d .= 'Q ' . $this->n($cx) . ' ' . $this->n($cy) . ' ' . $this->n($ex) . ' ' . $this->n($ey) . ' ';
                    $curX = $ex; $curY = $ey;
                    $hasPath = true;
                    break;
                case 'CubBezTo':
                    $d .= 'C ' . $this->n($a ?? 0) . ' ' . $this->n($b ?? 0) . ' ' . $this->n($c ?? 0) . ' ' . $this->n($dd ?? 0) . ' ' . $this->n($x ?? 0) . ' ' . $this->n($y ?? 0) . ' ';
                    $curX = $x ?? $curX; $curY = $y ?? $curY;
                    $hasPath = true;
                    break;
                case 'RelCubBezTo':
                    $d .= 'C ' . $this->n(($a ?? 0) * $w) . ' ' . $this->n(($b ?? 0) * $h) . ' ' . $this->n(($c ?? 0) * $w) . ' ' . $this->n(($dd ?? 0) * $h) . ' ' . $this->n(($x ?? 0) * $w) . ' ' . $this->n(($y ?? 0) * $h) . ' ';
                    $curX = ($x ?? 0) * $w; $curY = ($y ?? 0) * $h;
                    $hasPath = true;
                    break;
                case 'QuadBezTo':
                    $d .= 'Q ' . $this->n($a ?? 0) . ' ' . $this->n($b ?? 0) . ' ' . $this->n($x ?? 0) . ' ' . $this->n($y ?? 0) . ' ';
                    $curX = $x ?? $curX; $curY = $y ?? $curY;
                    $hasPath = true;
                    break;
                case 'Ellipse':
                    $ecx = $x ?? 0; $ecy = $y ?? 0;
                    $rx = hypot(($a ?? $ecx) - $ecx, ($b ?? $ecy) - $ecy);
                    $ry = hypot(($c ?? $ecx) - $ecx, ($dd ?? $ecy) - $ecy);
                    $ang = rad2deg(atan2(($b ?? $ecy) - $ecy, ($a ?? $ecx) - $ecx));
                    if ($rx > 1e-9 && $ry > 1e-9) {
                        $prims[] = ['ellipse', $ecx, $ecy, $rx, $ry, $ang];
                    }
                    break;
                case 'PolylineTo':
                case 'NURBSTo':
                case 'SplineStart':
                case 'SplineKnot':
                    if ($x !== null && $y !== null) {
                        $curX = $x; $curY = $y;
                        $d .= 'L ' . $this->n($curX) . ' ' . $this->n($curY) . ' ';
                        $hasPath = true;
                    }
                    if (!$this->warnedSpline) {
                        $this->logger->info('Visio spline/NURBS approximated as straight segment', ['type' => $t]);
                        $this->warnedSpline = true;
                    }
                    break;
            }
        }

        if ($hasPath) {
            $closed = $firstX !== null && abs($curX - $firstX) < 1e-6 && abs($curY - $firstY) < 1e-6;
            if ($closed) {
                $d .= 'Z';
            }
            $prims[] = ['path', trim($d), $closed];
        }
        return $prims;
    }

    /**
     * Visio ArcTo: circular arc from (x0,y0) to (x1,y1), bow A = perpendicular
     * distance from arc midpoint to the chord. Approximated by a quadratic Bézier
     * passing through the apex (mid + perpendicular·A).
     */
    private function arcTo(float $x0, float $y0, float $x1, float $y1, float $a): string
    {
        $chord = hypot($x1 - $x0, $y1 - $y0);
        if ($chord < 1e-9 || abs($a) < 1e-9) {
            return 'L ' . $this->n($x1) . ' ' . $this->n($y1) . ' ';
        }
        $mx = ($x0 + $x1) / 2; $my = ($y0 + $y1) / 2;
        $ux = ($x1 - $x0) / $chord; $uy = ($y1 - $y0) / $chord;
        // perpendicular to the chord
        $px = -$uy; $py = $ux;
        $apexX = $mx + $px * $a; $apexY = $my + $py * $a;
        $cx = 2 * $apexX - 0.5 * ($x0 + $x1);
        $cy = 2 * $apexY - 0.5 * ($y0 + $y1);
        return 'Q ' . $this->n($cx) . ' ' . $this->n($cy) . ' ' . $this->n($x1) . ' ' . $this->n($y1) . ' ';
    }

    private function cell(\DOMXPath $xp, \DOMElement $row, string $name): ?float
    {
        $nodes = $xp->query("./*[local-name()='Cell'][@N='" . $name . "']", $row);
        if ($nodes && $nodes->length > 0 && $nodes->item(0) instanceof \DOMElement) {
            $v = $nodes->item(0)->getAttribute('V');
            return is_numeric($v) ? (float) $v : null;
        }
        return null;
    }

    private function n(float $v): string
    {
        return rtrim(rtrim(number_format($v, 4, '.', ''), '0'), '.');
    }
}
