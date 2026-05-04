---
sidebar_position: 3
---

# Profiles

Profiles store SSH connection credentials used to access your network equipment. A profile can be shared across multiple nodes.

## Creating a Profile

1. Navigate to **Profiles** in the sidebar
2. Click **New profile**
3. Fill in the connection details:
   - **Name** — A descriptive name (e.g., "Cisco Admin", "Read-Only Access")
   - **Username** — SSH username
   - **Password** — SSH password
   - **Port** — SSH port (default: 22)

<!-- ![Create profile](../../../static/img/screenshots/profile-create.png) -->

## Profile List

<!-- ![Profile list](../../../static/img/screenshots/profile-list.png) -->

:::warning
Profile credentials are stored in the database. Make sure your PostgreSQL instance is properly secured, especially in production environments.
:::

:::tip
Create separate profiles for different access levels (admin, read-only) and different equipment types if they use different credentials.
:::

## Connection test

You don't have to wait for the next collection to verify a profile works. Each profile (and the underlying SNMP / CLI credentials) exposes a **Test** button.

The test attempts a live connection from the worker network and reports:

- success/failure,
- end-to-end latency,
- the exact error message returned by the device or the SSH/SNMP stack (auth failure, timeout, unreachable, wrong port, refused algorithms…).

Use this whenever you create a profile, change credentials, or troubleshoot collection errors.

:::info Screenshot expected
**File**: `static/img/screenshots/nodes/profile-test.png`
**Description**: Profile detail page with the **Test** button at the top right and an inline result card below showing a green check, "Connected in 412 ms", and the SSH banner returned by the device.
:::

```http
POST /api/profiles/{id}/test
```

Returns:

```json
{
  "success": true,
  "latencyMs": 412,
  "details": "SSH-2.0-Cisco-1.25"
}
```
