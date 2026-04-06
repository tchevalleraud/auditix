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
