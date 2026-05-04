---
sidebar_position: 1
---

# Topology overview

The topology view is an interactive map of your network built from collected inventory data (LLDP/CDP neighbours, OSPF/ISIS adjacencies, BGP peers, STP). Open it from the left navigation under **Topology**.

## What you see

- **Devices** as nodes, with shapes/colours per type (router, switch, firewall) and badges per role (core, edge, access).
- **Links** as edges, styled per protocol (LLDP, OSPF, ISIS, BGP, STP). For multi-area ISIS, edges use a zebra pattern.
- **Areas** as soft hulls around device groups (OSPF/ISIS areas, sites). Labels are draggable.

Click a device to open the side panel (compliance score, latest collection, quick actions). Right-click for the context menu (collect now, open node detail, hide on map, isolate).

:::info Screenshot expected
**File**: `static/img/screenshots/topology/overview.png`
**Description**: Full topology map — 30-50 devices grouped in 3 zones (e.g. "Core", "DC-A", "DC-B"), coloured edges per protocol, side legend on the right, zoom controls bottom-left, layout switcher (cose, dagre, concentric) top-right.
:::

:::info Screenshot expected
**File**: `static/img/screenshots/topology/context-menu.png`
**Description**: Right-click context menu open on a router, showing options: Open node, Collect now, Pin, Hide, Isolate (show only neighbours), Add manual link.
:::

## Manual links

Sometimes neighbours aren't discovered — e.g. across a third-party transit. Add a manual link with **Right-click → Add manual link**, pick the remote device and a label. Manual links survive recollection.

To delete one, right-click the edge and choose **Remove manual link**.

## Layouts

| Layout | Best for |
|---|---|
| `cose` | Generic mesh, finds clusters automatically. |
| `dagre` | Hierarchical (core → distribution → access). |
| `concentric` | Star topologies. |
| `manual` | Hand-positioned — drag and **Save layout** to persist. |

Saved layouts are per-context.

:::info Screenshot expected
**File**: `static/img/screenshots/topology/saved-layout.png`
**Description**: A manually arranged map with a banner "Layout saved 2 minutes ago" at the top and a **Reset to auto-layout** button next to it.
:::
