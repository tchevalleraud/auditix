---
sidebar_position: 1
---

# Collection Commands

Collection commands define what data to collect from your network equipment. Each command is associated with a model and contains one or more CLI commands to execute on the device.

## Creating a Command

1. Navigate to **Collection Commands** in the sidebar
2. Click **New command**
3. Fill in:
   - **Name** — A descriptive name (e.g., "Show running config", "Interface status")
   - **Model** — The device model this command applies to
   - **Commands** — The CLI commands to execute on the device, one per line

<!-- ![Create command](../../../static/img/screenshots/command-create.png) -->

## Example Commands

### Cisco IOS

```
show running-config
```

```
show interfaces status
```

```
show version
```

### FortiGate

```
get system status
```

```
get router info routing-table all
```

## How It Works

When a collection is triggered on a node:

1. Auditix connects to the device using the node's **profile** (SSH credentials)
2. Executes the **connection script** defined in the model
3. Runs each **collection command** associated with the model
4. Stores the output for analysis by collection rules and compliance evaluation
