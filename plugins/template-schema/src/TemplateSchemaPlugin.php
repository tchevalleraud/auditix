<?php

namespace Auditix\Plugin\TemplateSchema;

use App\Plugin\Capability\ProvidesReportSchemas;
use App\Plugin\Capability\ReportSchemaTemplate;
use App\Plugin\VendorPluginInterface;

/**
 * ╔══════════════════════════════════════════════════════════════════════════╗
 * ║  PLUGIN TEMPLATE #6 — SCHEMA                                              ║
 * ╚══════════════════════════════════════════════════════════════════════════╝
 *
 * LEARNING GOAL
 * -------------
 * Provide a SCHEMA: a free-form canvas (Excalidraw-style) made of elements.
 * On activation, PluginAssetsImporter creates a ReportSchema entity
 * (managed_by_plugin = "template-schema"), purged on deactivation.
 *
 * SCHEMA ≠ SHAPE LIBRARY
 * ----------------------
 *   - A SCHEMA (this capability) is ONE canvas with elements placed on it.
 *   - A SHAPE LIBRARY (ProvidesShapeLibraries capability) is a COLLECTION of
 *     reusable stencils, dragged and dropped onto any canvas.
 *
 * ELEMENT STRUCTURE
 * -----------------
 * Each element is an array discriminated by `kind`:
 *   shape | text | image | line | freedraw | bezier | group |
 *   node_card_styled | node_card_table | data_label
 * Fields depend on the kind (see the examples below). Positions (x, y) and sizes
 * are in world units.
 */
final class TemplateSchemaPlugin implements
    VendorPluginInterface,
    ProvidesReportSchemas
{
    public function getIdentifier(): string  { return 'template-schema'; }
    public function getVersion(): string      { return '1.0.0'; }
    public function getDisplayName(): string  { return 'Template — Schema'; }
    public function getDescription(): string  { return 'Educational example: a canvas with two connected shapes.'; }
    public function getSupportedManufacturers(): array { return []; }

    /**
     * @return ReportSchemaTemplate[]
     */
    public function provideReportSchemas(): array
    {
        // Shape and line styles taken from the editor's default values.
        $shapeStyle = [
            'fill' => '#3b82f6', 'stroke' => '#1e40af', 'strokeWidth' => 1.5,
            'dash' => 'solid', 'opacity' => 1, 'fillOpacity' => 0.18,
            'borderRadius' => 6, 'fillStyle' => 'solid', 'sloppiness' => 'architect',
        ];
        $lineStyle = [
            'stroke' => '#1e293b', 'strokeWidth' => 2, 'dash' => 'solid',
            'opacity' => 1, 'sloppiness' => 'architect',
        ];

        $elements = [
            // Title (text element).
            [
                'id' => 'tpl-title', 'kind' => 'text',
                'x' => 80, 'y' => 40, 'width' => 360, 'height' => 40,
                'rotation' => 0, 'zIndex' => 3,
                'text' => 'Demonstration schema', 'fontSize' => 22,
                'color' => '#0f172a', 'fontFamily' => 'Helvetica', 'fontWeight' => 700,
                'fontStyle' => 'normal', 'textAlign' => 'left', 'bgColor' => null, 'padding' => 4,
            ],
            // Shape A (rectangle).
            [
                'id' => 'tpl-shape-a', 'kind' => 'shape', 'shape' => 'rectangle',
                'x' => 80, 'y' => 140, 'width' => 160, 'height' => 80,
                'rotation' => 0, 'zIndex' => 1, 'style' => $shapeStyle,
            ],
            // Shape B (ellipse).
            [
                'id' => 'tpl-shape-b', 'kind' => 'shape', 'shape' => 'ellipse',
                'x' => 360, 'y' => 140, 'width' => 160, 'height' => 80,
                'rotation' => 0, 'zIndex' => 1, 'style' => $shapeStyle,
            ],
            // Link connecting A → B (anchored to both shapes).
            [
                'id' => 'tpl-link', 'kind' => 'line',
                'x1' => 240, 'y1' => 180, 'x2' => 360, 'y2' => 180,
                'zIndex' => 2, 'style' => $lineStyle,
                'arrowStart' => false, 'arrowEnd' => true,
                'sourceId' => 'tpl-shape-a', 'sourceAnchor' => 'right',
                'targetId' => 'tpl-shape-b', 'targetAnchor' => 'left',
                'labels' => [
                    ['id' => 'tpl-link-label', 'kind' => 'text', 't' => 0.5, 'text' => 'connects',
                     'fontSize' => 12, 'color' => '#475569', 'fontWeight' => 400, 'offset' => -8],
                ],
            ],
        ];

        return [
            new ReportSchemaTemplate(
                name: 'Template — Demonstration schema',
                elements: $elements,
                description: 'Two shapes connected by an arrow link, with a title.',
                // Canvas dimensions (null = auto-fit to content).
                canvasSize: ['width' => 800, 'height' => 400],
                gridSize: 20,
                snapToGrid: true,
            ),
        ];
    }
}
