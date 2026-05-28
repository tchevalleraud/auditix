<?php

namespace Auditix\Plugin\TemplateReportTheme;

use App\Entity\ReportTheme;
use App\Plugin\Capability\ProvidesReportThemes;
use App\Plugin\Capability\ReportThemeTemplate;
use App\Plugin\VendorPluginInterface;

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PLUGIN TEMPLATE #4 — REPORT THEME                                        ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * LEARNING GOAL
 * -------------
 * Provide a THEME: a large style object (colors, fonts, headers, tables, table
 * of contents, cover page, email styles...) applied to reports. A report
 * references a theme by its name (see template-report).
 *
 * On activation, PluginAssetsImporter creates a ReportTheme entity
 * (managed_by_plugin = "template-report-theme"), purged on deactivation.
 *
 * TIP
 * ---
 * The style schema is large. Rather than rewriting all of it, we start from
 * ReportTheme::DEFAULT_STYLES (already complete and valid) and override only the
 * few keys we want. Leaving `styles: []` would reuse the default styles as-is.
 */
final class TemplateReportThemePlugin implements
    VendorPluginInterface,
    ProvidesReportThemes
{
    public function getIdentifier(): string  { return 'template-report-theme'; }
    public function getVersion(): string      { return '1.0.0'; }
    public function getDisplayName(): string  { return 'Template — Report theme'; }
    public function getDescription(): string  { return 'Educational example: a ready-to-use report theme.'; }
    public function getSupportedManufacturers(): array { return []; }

    /**
     * @return ReportThemeTemplate[]
     */
    public function provideReportThemes(): array
    {
        // Start from the default styles, then customize a few keys.
        $styles = ReportTheme::DEFAULT_STYLES;
        $styles['colors']['primary']   = '#0f766e'; // dark teal
        $styles['colors']['secondary'] = '#14b8a6'; // light teal
        $styles['table']['headerBg']   = '#0f766e';
        $styles['body']['font']        = 'Helvetica';

        return [
            new ReportThemeTemplate(
                name: 'Template — Teal',
                description: 'Demonstration theme in teal tones, derived from the default styles.',
                styles: $styles,
                // Do not force it as the context's default theme.
                isDefault: false,
            ),
        ];
    }
}
