---
sidebar_position: 3
---

# Running Collections

Collections gather data from your network equipment by executing configured commands via SSH.

## Starting a Collection

There are several ways to trigger a collection:

### From a Node

1. Open a node's detail page
2. Click the **Actions** dropdown
3. Select **Collect**
4. Optionally add **tags** to organize this collection
5. Click **Start**

<!-- ![Start collection](../../../static/img/screenshots/collection-start.png) -->

### Manual Import

If you cannot connect to a device directly, you can manually import collection data:

1. Open a node's detail page
2. Switch to the **Collections** tab
3. Click **Import manual**
4. Copy the commands shown, execute them on the device
5. Paste the raw output and click **Import**

<!-- ![Manual import](../../../static/img/screenshots/collection-import.png) -->

## Collection Status

Each collection goes through these stages:

| Status      | Description                                    |
|-------------|------------------------------------------------|
| **Pending** | Queued, waiting for an available worker        |
| **Running** | Currently executing commands on the device     |
| **Completed** | All commands executed successfully           |
| **Failed**  | An error occurred during collection            |

## Viewing Collection Results

Click on a collection in the **Collections** tab to see its details:

- Commands executed and their output
- Parsed data from collection rules
- Errors (if any)

<!-- ![Collection detail](../../../static/img/screenshots/collection-detail.png) -->

## Collections List

Navigate to **Collections** in the sidebar to see all collections across all nodes in the current context, with filtering and status tracking.

<!-- ![Collections list](../../../static/img/screenshots/collections-list.png) -->
