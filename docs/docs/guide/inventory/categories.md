---
sidebar_position: 1
---

# Inventory categories

Each device exposes typed data sets called **categories** — `interfaces`, `lldp_neighbors`, `bgp_peers`, `installed_software`, etc. Categories are populated by the **extract** phase (parsing the raw collected output through extraction rules).

Manage them under **Inventory → Categories**.

## Customisable columns per context

Each context decides which columns of which categories are visible, in what order, and which are sortable. This lets a network team and a compliance auditor look at the same inventory but with different layouts.

In **Context → Inventory** open the **Columns** tab:

- toggle column visibility,
- drag to reorder,
- choose default sort.

The configuration is saved per (context × category) pair.

:::info Screenshot expected
**File**: `static/img/screenshots/inventory/columns-config.png`
**Description**: Two-pane layout — left list of inventory categories, right pane showing the currently selected category's columns as draggable rows with visibility toggles and a per-row "default sort" selector (none / asc / desc).
:::

## Per-column sort

Inside a category view, click any header to sort. Shift-click to add a secondary sort. The sort is sticky for your session and used by the `inventory_table` report block when `sort` is omitted.

## Bulk delete

Delete a whole category (with its data) from **Categories → ⋯ → Delete category**. To wipe rows but keep the schema, use **Truncate**. Both actions ask for typed confirmation.

:::info Screenshot expected
**File**: `static/img/screenshots/inventory/category-delete.png`
**Description**: Modal "Delete category 'lldp_neighbors'?" with a red banner explaining 1 234 rows will be deleted, a typed-confirmation input "type the category name to confirm", and **Cancel / Delete** buttons.
:::

## Count columns

Some category views show **count columns** — virtual columns that aggregate child rows (e.g. on `nodes`, the number of `lldp_neighbors` rows for that device). They're available in:
- the inventory table view,
- the `inventory_table` report block,
- the topology side panel.

Toggle them like any other column from the **Columns** tab.

## Configuration example

```json
PUT /api/node-columns?context=2
{
  "category": "interfaces",
  "columns": [
    { "key": "name",        "visible": true,  "sort": "asc"  },
    { "key": "description", "visible": true,  "sort": null   },
    { "key": "admin_state", "visible": true,  "sort": null   },
    { "key": "oper_state",  "visible": true,  "sort": null   },
    { "key": "speed",       "visible": false, "sort": null   }
  ]
}
```
