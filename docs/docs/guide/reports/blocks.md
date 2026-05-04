---
sidebar_position: 4
---

# Report blocks reference

Both PDF and mail reports are built from blocks. This page lists every block type and its main properties. Blocks can be duplicated (right-click → **Duplicate**) and reordered by drag-and-drop.

## Text blocks

### `heading`
Title with selectable level (H1–H4).

### `paragraph`
Rich-text paragraph (bold/italic/links).

### `recommendation`
Highlighted callout used for remediation advice. Can include rich text.

## Data blocks

### `inventory_table`
Snapshot of an inventory category, optionally filtered.

| Property | Description |
|---|---|
| `categoryId` | Inventory category to render. |
| `columns` | Ordered list of column keys to show. |
| `sort` | `[{ "column": "name", "direction": "asc" }, …]` — multi-column. |
| `filter` | Optional WHERE-like expression. |
| `limit` | Max rows. |

### `compliance_matrix`
Devices × policies grid, cells coloured by status.

| Property | Description |
|---|---|
| `policyTagId` | Restrict to policies with this tag. |
| `groupBy` | `device` (default) or `policy`. |

### `non_compliant_devices`
List of devices currently failing one or more policies.

| Property | Description |
|---|---|
| `limit` | Cap to top N. |
| `severity` | `all`, `critical`, `warning`. |

### `status_table`
Aggregated counts per compliance status (compliant / non-compliant / unknown). Compact summary, perfect for executive headers.

### `chart`
Bar / line / pie chart from inventory aggregates.

| Property | Description |
|---|---|
| `chartType` | `bar`, `line`, `pie`. |
| `categoryId` | Inventory category. |
| `groupBy` | Column to bucket on. |
| `aggregation` | `count`, `sum:<col>`, `avg:<col>`. |

### `lifecycle_timeline`
Visual timeline of EoL / EoS milestones for the selected devices.

| Property | Description |
|---|---|
| `nodeIds` | Devices to plot. |
| `range` | `past`, `future`, `all`. |
| `show` | Multi-select among `eol`, `eos`, `last_update`. |

## Topology blocks

### `topology_image`
Renders a topology map snapshot.

| Property | Description |
|---|---|
| `mapId` | Topology map to embed. |
| `layout` | Layout to apply at render time. |
| `width` / `height` | Pixel dimensions. |

## Configuration example

```json
{
  "blocks": [
    { "type": "heading", "props": { "text": "Quarterly compliance review", "level": 1 } },
    { "type": "status_table" },
    { "type": "chart", "props": {
        "chartType": "pie",
        "categoryId": 12,
        "groupBy": "vendor",
        "aggregation": "count"
    }},
    { "type": "compliance_matrix", "props": { "policyTagId": 5 } },
    { "type": "non_compliant_devices", "props": { "limit": 25, "severity": "critical" } },
    { "type": "lifecycle_timeline", "props": { "range": "future", "show": ["eol", "eos"] } },
    { "type": "recommendation", "props": { "text": "Plan replacement of devices with EoS in the next 6 months." } }
  ]
}
```

:::info Screenshot expected
**File**: `static/img/screenshots/reports/block-palette.png`
**Description**: Block palette inside the report editor — grouped by category (Text, Data, Topology), each block represented by a small icon + label, drag-handle on hover.
:::
