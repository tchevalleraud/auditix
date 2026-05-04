---
sidebar_position: 4
---

# Nodes

Nodes are the core of Auditix — they represent your network equipment (routers, switches, firewalls, access points, etc.).

## Creating a Node

1. Navigate to **Nodes** in the sidebar
2. Click **New node**
3. Fill in the details:
   - **IP Address** (required) — The management IP of the device
   - **Name** — An optional friendly name
   - **Manufacturer** — Select the device manufacturer
   - **Model** — Select the device model (filtered by manufacturer)
   - **Profile** — Select the SSH connection profile
   - **Tags** — Add optional tags for organization

<!-- ![Create node](../../../static/img/screenshots/node-create.png) -->

## Node List

The node list displays all registered nodes with their compliance score, status, manufacturer, model, and tags.

<!-- ![Node list](../../../static/img/screenshots/node-list.png) -->

## Node Detail Page

Click on a node to access its detail page. The page is organized into several tabs:

<!-- ![Node detail](../../../static/img/screenshots/node-detail.png) -->

### Summary

Overview of the node with its compliance score, manufacturer, model, and general information.

### Monitoring

Real-time SNMP monitoring graphs showing CPU usage, memory, temperature, and other metrics. This tab is only visible when monitoring is enabled on the context.

### Compliance

Compliance evaluation results organized by policy. Shows each rule's status (pass, fail, error) and the overall score.

### Inventory

Hardware and software inventory data collected from the device, organized by categories.

### Collections

History of all data collections performed on this node. From this tab you can also use the **Import manual** button to manually import collection data.

### Settings

Edit the node's configuration: IP address, name, manufacturer, model, profile, and tags.

## Actions

The **Actions** dropdown button in the node header provides:

- **Evaluate compliance** — Run compliance evaluation against all assigned policies
- **Collect** — Start a new data collection from the device
- **Ping** — ICMP probe with latency report
- **Extract** — Re-run extraction rules against the latest collected output

Multiple actions can be **chained** — pick more than one from the dropdown and they run in order, each waiting for the previous to finish. Live status updates stream into the row via Mercure (no manual refresh needed).

## Bulk actions

From the node list, tick rows and click **Bulk actions**. Same set of actions as above (ping, collect, extract, tag), applied to the selection.

```http
POST /api/nodes/bulk-actions
{
  "nodeIds": [12, 14, 17, 18],
  "actions": ["ping", "collect", "extract"]
}
```

:::info Screenshot expected
**File**: `static/img/screenshots/nodes/bulk-actions.png`
**Description**: Node list with 4 rows ticked, the **Bulk actions** dropdown open showing checkboxes (Ping, Collect, Extract, Tag…), an "Apply" button at the bottom and a small live counter "0/4 done" appearing once the action starts.
:::

## CSV import

To onboard many nodes at once, use **Nodes → Import → CSV**. The expected layout:

```csv
name,ipAddress,hostname,manufacturer,model,profile,tags
core-rtr-01,10.0.0.1,core-rtr-01,Cisco,ASR1001-X,Cisco Admin,"core,prod"
core-rtr-02,10.0.0.2,core-rtr-02,Cisco,ASR1001-X,Cisco Admin,"core,prod"
edge-sw-01,10.0.1.1,edge-sw-01,Arista,DCS-7050SX,Arista RO,"edge,prod"
```

Headers can appear in any order; unknown columns are ignored. References to manufacturers, models, profiles and tags must already exist (or be created in the same context). Row-level errors are reported in the import preview before any commit.

:::info Screenshot expected
**File**: `static/img/screenshots/nodes/csv-import.png`
**Description**: CSV import wizard — left pane shows a drag-drop zone, right pane shows the parsed preview as a table with row-level status pills (NEW / DUPLICATE / ERROR) and a counter "98 ready · 2 errors · 0 duplicates".
:::

## Customisable columns

Columns of the node list (and of every inventory category opened from a node) are configurable per context — see [Inventory categories](../inventory/categories).
