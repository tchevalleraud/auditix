---
sidebar_position: 3
---

# First Steps

After installing Auditix, follow these steps to set up your environment.

## 1. Log In

Navigate to your Auditix instance and log in with the default credentials:

- **Username**: `admin`
- **Password**: `password`

<!-- ![Login page](./img/login.png) -->

## 2. Change Your Password

Go to your **Profile** (click your avatar in the top-right corner) and change the default password.

## 3. Configure Your Context

A default context named "Default" is created automatically. You can customize it:

1. Click the **context switcher** in the top bar
2. Go to the context **Settings** tab
3. Update the name and description
4. Enable **Monitoring** if you want SNMP/ICMP monitoring

<!-- ![Context settings](./img/context-settings.png) -->

## 4. Add Manufacturers and Models

Before adding nodes, set up your equipment library:

1. Go to **Manufacturers** in the sidebar
2. Create manufacturers (e.g., Cisco, Juniper, Fortinet)
3. For each manufacturer, add **Models** with their connection scripts and collection commands

## 5. Add Your First Node

1. Go to **Nodes** in the sidebar
2. Click **New node**
3. Fill in the node details:
   - **IP Address** (required)
   - **Name** / **Hostname** (optional)
   - **Manufacturer** and **Model**
   - **Profile** (SSH credentials)

<!-- ![Add node](./img/add-node.png) -->

## 6. Run a Collection

Once your node is configured with a model and profile:

1. Open the node detail page
2. Click the **Actions** dropdown
3. Select **Collect**
4. Optionally add tags to organize the collection
5. Click **Start**

The collection will run in the background. You can track its progress in the **Collections** tab.

## 7. Evaluate Compliance

After setting up compliance policies and rules:

1. Open a node detail page
2. Click the **Actions** dropdown
3. Select **Evaluate compliance**

The compliance score will appear once evaluation is complete.

## Next Steps

- [User Guide](../guide/dashboard) — Explore all application features
- [Environment Variables](../admin/environment-variables) — Fine-tune your deployment
