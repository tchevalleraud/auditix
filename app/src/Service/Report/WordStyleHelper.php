<?php

namespace App\Service\Report;

/**
 * Pure helpers translating the ReportTheme JSON styles into PhpWord-friendly
 * primitives (fonts, colors, units). Mirrors the mapFont()/hexToRgb() helpers
 * used by the PDF generator so both outputs stay visually consistent.
 */
final class WordStyleHelper
{
    private const FONT_MAP = [
        'calibri' => 'Calibri', 'arial' => 'Arial', 'times new roman' => 'Times New Roman',
        'georgia' => 'Georgia', 'verdana' => 'Verdana', 'cambria' => 'Cambria',
        'garamond' => 'Garamond', 'trebuchet ms' => 'Trebuchet MS', 'tahoma' => 'Tahoma',
        'century gothic' => 'Century Gothic', 'palatino linotype' => 'Palatino Linotype',
        'book antiqua' => 'Book Antiqua', 'roboto' => 'Roboto', 'open sans' => 'Open Sans',
        'lato' => 'Lato', 'source sans pro' => 'Source Sans Pro',
        'consolas' => 'Consolas', 'courier new' => 'Courier New', 'courier' => 'Courier New',
        'monospace' => 'Consolas', 'serif' => 'Times New Roman', 'sans-serif' => 'Calibri',
    ];

    /**
     * Unlike TCPDF (limited to 3 core fonts), Word embeds the real font name and
     * falls back gracefully, so we keep the original family when we know it.
     */
    public static function mapFont(string $font): string
    {
        $key = strtolower(trim($font));

        return self::FONT_MAP[$key] ?? ($font !== '' ? $font : 'Calibri');
    }

    /**
     * Normalize a hex color to the 6-digit form without leading '#', as PhpWord
     * expects (e.g. "#1e293b" => "1E293B", "#abc" => "AABBCC"). Empty/invalid
     * input returns null so callers can skip the property.
     */
    public static function color(?string $hex): ?string
    {
        if ($hex === null) {
            return null;
        }
        $hex = ltrim(trim($hex), '#');
        if ($hex === '') {
            return null;
        }
        if (strlen($hex) === 3) {
            $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
        }
        if (!preg_match('/^[0-9a-fA-F]{6}$/', $hex)) {
            return null;
        }

        return strtoupper($hex);
    }

    /**
     * Strip characters that are illegal in XML 1.0 (control chars except tab,
     * LF and CR). Word rejects the whole document if any survive, so every piece
     * of externally-sourced text (CLI output, inventory values, messages) must
     * pass through this before reaching PhpWord.
     */
    public static function xmlSafe(?string $s): string
    {
        if ($s === null || $s === '') {
            return '';
        }

        return (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $s)
            ?: (string) preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/', '', $s);
    }

    public static function mmToTwip(float $mm): int
    {
        return (int) round($mm * 56.692913);
    }

    public static function mmToPixel(float $mm): int
    {
        // 96 dpi reference used by PhpWord for image sizing
        return (int) round($mm / 25.4 * 96);
    }

    /**
     * Build a PhpWord font style array from a theme style block
     * ({font, size, bold, italic, color}).
     *
     * @param array<string,mixed> $style
     * @return array<string,mixed>
     */
    public static function fontStyle(array $style, array $defaults = []): array
    {
        $style = array_merge($defaults, $style);
        $out = [];
        if (!empty($style['font'])) {
            $out['name'] = self::mapFont((string) $style['font']);
        }
        if (isset($style['size']) && (float) $style['size'] > 0) {
            $out['size'] = (float) $style['size'];
        }
        if (!empty($style['bold'])) {
            $out['bold'] = true;
        }
        if (!empty($style['italic'])) {
            $out['italic'] = true;
        }
        if (!empty($style['underline'])) {
            $out['underline'] = 'single';
        }
        $color = self::color($style['color'] ?? null);
        if ($color !== null) {
            $out['color'] = $color;
        }

        return $out;
    }

    /**
     * Map theme alignment strings to PhpWord Jc constants.
     */
    public static function alignment(?string $align): string
    {
        return match ($align) {
            'center' => 'center',
            'right' => 'right',
            'justify' => 'both',
            default => 'left',
        };
    }
}
