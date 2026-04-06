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
