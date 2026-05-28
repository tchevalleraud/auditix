<?php

namespace App\Service\Stencil\Visio;

/**
 * Resolves Visio fill / line styling to SVG values. Visio stores colors as plain
 * #rrggbb, as RGB(r,g,b), as an index into the standard 24-color palette, or as a
 * theme formula. Theme-indexed colors cannot be resolved without the document
 * theme, so they fall back to a neutral default (best-effort).
 */
final class ColorResolver
{
    /** Visio standard 24-color palette (indices 0-23). */
    private const PALETTE = [
        '#000000', '#FFFFFF', '#FF0000', '#00FF00', '#0000FF', '#FFFF00',
        '#FF00FF', '#00FFFF', '#800000', '#008000', '#000080', '#808000',
        '#800080', '#008080', '#C0C0C0', '#808080', '#9999FF', '#993366',
        '#FFFFCC', '#CCFFFF', '#660066', '#FF8080', '#0066CC', '#CCCCFF',
    ];

    public function fill(?string $fillForegnd, ?string $fillPattern, string $default = '#E2E8F0'): string
    {
        if ($fillPattern !== null && trim($fillPattern) === '0') {
            return 'none';
        }
        return $this->resolve($fillForegnd) ?? $default;
    }

    public function stroke(?string $lineColor, ?string $linePattern, string $default = '#1E293B'): string
    {
        if ($linePattern !== null && trim($linePattern) === '0') {
            return 'none';
        }
        return $this->resolve($lineColor) ?? $default;
    }

    public function dashArray(?string $linePattern): ?string
    {
        if ($linePattern === null || !is_numeric($linePattern)) {
            return null;
        }
        return match ((int) $linePattern) {
            0, 1 => null,
            2 => '12,6',
            3 => '3,3',
            4 => '12,6,3,6',
            9 => '2,4',
            default => '8,5',
        };
    }

    private function resolve(?string $v): ?string
    {
        if ($v === null) {
            return null;
        }
        $v = trim($v);
        if ($v === '') {
            return null;
        }
        if (preg_match('/^#[0-9a-fA-F]{6}$/', $v)) {
            return strtoupper($v);
        }
        if (preg_match('/^RGB\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i', $v, $m)) {
            return sprintf('#%02X%02X%02X', min(255, (int)$m[1]), min(255, (int)$m[2]), min(255, (int)$m[3]));
        }
        if (ctype_digit($v)) {
            return self::PALETTE[(int) $v] ?? null;
        }
        return null; // THEME…/formula → caller default
    }
}
