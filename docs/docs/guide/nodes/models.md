---
sidebar_position: 2
---

# Models

Models define the specific types of equipment within a manufacturer (e.g., "Catalyst 9300" for Cisco, "FortiGate 60F" for Fortinet).

## Creating a Model

1. Navigate to **Models** in the sidebar
2. Click **New model**
3. Fill in the details:
   - **Name** — The model name
   - **Manufacturer** — Select the parent manufacturer
   - **Connection Script** — The SSH connection commands to access the device

<!-- ![Create model](../../../static/img/screenshots/model-create.png) -->

## Connection Script

The connection script defines how Auditix connects to devices of this model. This is typically an SSH command with specific options.

Example for a Cisco IOS device:

```bash
ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null {username}@{host}
```

Available variables:
- `{host}` — The node's IP address
- `{username}` — The SSH username from the profile
- `{password}` — The SSH password from the profile
- `{port}` — The SSH port from the profile

## Collection Commands

Each model can have collection commands that define what data to gather. These are configured in the [Collection Commands](../collections/commands) section.
