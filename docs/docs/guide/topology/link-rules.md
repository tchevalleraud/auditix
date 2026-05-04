---
sidebar_position: 2
---

# Link generation rules

Links between devices are not stored as raw edges — they're computed at render time from inventory rows. **Link rules** tell the renderer which inventory category and columns describe an adjacency.

Open **Topology → Settings → Link rules**.

## Rule anatomy

| Field | Description |
|---|---|
| Category | Inventory category that holds neighbour rows (e.g. `lldp_neighbors`, `ospf_neighbors`). |
| Remote name column | Column whose value matches the *name* of the remote device. |
| Local port column | Column with the local interface (used for the edge label). |
| Remote port column | Column with the remote interface (used for the edge label). |
| Protocol | Tag applied to the edge (`lldp`, `ospf`, `isis`, `bgp`, `stp`, custom). |
| Exclude external | When ticked, neighbours not present in the inventory (i.e. transit / third party) are skipped. |
| Bidirectional dedup | Collapse `A → B` and `B → A` into one edge. |

## Configuration example

```yaml
- category: lldp_neighbors
  remote_name_column: neighbor_sysname
  local_port_column: local_interface
  remote_port_column: neighbor_port_id
  protocol: lldp
  exclude_external: true
  bidirectional_dedup: true

- category: ospf_neighbors
  remote_name_column: neighbor_router_id
  local_port_column: interface
  remote_port_column: null
  protocol: ospf
  exclude_external: false
  bidirectional_dedup: true
```

:::info Screenshot expected
**File**: `static/img/screenshots/topology/link-rules.png`
**Description**: Link rules editor with a list of 3-4 rules (one card per rule, drag handle on the left), columns selected via dropdowns of inventory column names, protocol pill on the right. **+ Add rule** button at the top, **Preview** button rendering the resulting edges in a side mini-map.
:::

## ISIS multi-area styling

When two devices share an ISIS adjacency that crosses areas (L1L2, or two L2 in different areas), the edge gets a **zebra pattern** (alternating colours of both areas). This makes area boundaries visible at a glance without occluding the map.

Drag any area label to reposition it; the layout is saved automatically.

:::info Screenshot expected
**File**: `static/img/screenshots/topology/isis-zebra.png`
**Description**: Topology zoomed on an ISIS deployment, two area labels (Area 1, Area 2) coloured differently, and the L1L2 edges between them rendered in alternating colours of the two areas.
:::
