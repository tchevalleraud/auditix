<?php

namespace App\Service\Stencil\Visio;

/**
 * Builds the SVG transform attribute that places a Visio shape inside its parent,
 * expressed in Visio inch coordinates (Y-up — the importer flips Y once at the
 * SVG root). Mirrors Visio's placement: the shape's LocPin is pinned to (PinX,PinY),
 * rotated by Angle (CCW) and flipped.
 */
final class Transform
{
    public static function forShape(
        float $pinX,
        float $pinY,
        float $locX,
        float $locY,
        float $angleRad,
        bool $flipX,
        bool $flipY,
    ): string {
        $parts = [];
        if (abs($pinX) > 1e-9 || abs($pinY) > 1e-9) {
            $parts[] = 'translate(' . self::n($pinX) . ' ' . self::n($pinY) . ')';
        }
        if (abs($angleRad) > 1e-9) {
            $parts[] = 'rotate(' . self::n(rad2deg($angleRad)) . ')';
        }
        if ($flipX || $flipY) {
            $parts[] = 'scale(' . ($flipX ? '-1' : '1') . ' ' . ($flipY ? '-1' : '1') . ')';
        }
        if (abs($locX) > 1e-9 || abs($locY) > 1e-9) {
            $parts[] = 'translate(' . self::n(-$locX) . ' ' . self::n(-$locY) . ')';
        }
        return implode(' ', $parts);
    }

    private static function n(float $v): string
    {
        return rtrim(rtrim(number_format($v, 4, '.', ''), '0'), '.');
    }
}
