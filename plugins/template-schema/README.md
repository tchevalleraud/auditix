# Template — Schema

Educational **template plugin**. It provides a **schema**: a free-form canvas
(Excalidraw-style), pre-drawn.

| Resource | Auditix entity | Capability (interface) |
|----------|----------------|------------------------|
| Schema (canvas) | `ReportSchema` | `ProvidesReportSchemas` |

## Schema ≠ Shape Library

- A **schema** (this capability) is **one canvas** with elements placed on it.
- A **shape library** (`ProvidesShapeLibraries`) is a **collection of reusable
  stencils**, dragged and dropped onto any canvas.

## Element structure

Each element is discriminated by `kind`:
`shape | text | image | line | freedraw | bezier | group | node_card_styled |
node_card_table | data_label`. Fields depend on the `kind`.

The example provides a title (`text`), two shapes (`shape`: rectangle + ellipse)
and an arrow link (`line`) anchored to both shapes. Coordinates are in world
units.

```php
['id' => '...', 'kind' => 'shape', 'shape' => 'rectangle', 'x' => 80, 'y' => 140,
 'width' => 160, 'height' => 80, 'rotation' => 0, 'zIndex' => 1, 'style' => [...]]
```

## Install / activate (dev CLI)

```bash
php bin/console app:plugin:install /path/to/template-schema.zip
php bin/console app:plugin:activate template-schema <context_id>
```
