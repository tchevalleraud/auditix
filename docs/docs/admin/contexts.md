---
sidebar_position: 1
---

# Contexts

Contexts are organizational units that provide full isolation between different environments, teams, or infrastructure segments.

## Accessing Context Management

1. Click the **gear icon** in the top bar (admin users only)
2. Navigate to **Contexts**

<!-- ![Context list](../../static/img/screenshots/admin-contexts.png) -->

## Creating a Context

1. Click **New context**
2. Fill in:
   - **Name** (required)
   - **Description** (optional)
3. Save

## Context Settings

Each context has its own configuration:

### General
- **Name** and **Description**

### Monitoring
- **Enable/Disable** SNMP and ICMP monitoring
- **SNMP poll interval** — Frequency of SNMP metric collection (default: 60s)
- **ICMP poll interval** — Frequency of reachability checks (default: 60s)
- **SNMP retention** — Data retention period (default: 120 minutes)

### Members
- Assign users to the context
- Users only see contexts they are members of (admins see all)

<!-- ![Context settings](../../static/img/screenshots/admin-context-settings.png) -->

## Multi-Context Architecture

Contexts provide full isolation:

```
Auditix Instance
├── Context: Production
│   ├── Nodes: routers, switches, firewalls
│   ├── Policies: PCI-DSS, ISO 27001
│   └── Reports: monthly compliance reports
├── Context: Staging
│   ├── Nodes: test equipment
│   └── Policies: internal baseline
└── Context: Lab
    ├── Nodes: lab equipment
    └── Policies: experimental rules
```

:::tip
Use contexts to mirror your organizational structure — one per site, team, or compliance scope.
:::

## Export & import

A context can be packaged as a self-contained ZIP archive that includes its inventory categories, collection rules, compliance policies, profiles, credentials, schedules and reports. Use this for backups, environment promotion (Lab → Prod), or to clone a known-good baseline.

### Export

From the context list, **⋯ → Export**:

| Action | Result |
|---|---|
| **Export this context** | Downloads `auditix-context-<name>-YYYYMMDD-HHMMSS.zip`. |
| **Export all contexts** | Downloads `auditix-contexts-YYYYMMDD-HHMMSS.zip` (one folder per context inside). |

Exports do **not** include collected raw data nor inventory rows — only the schema and configuration. Credentials are exported as encrypted blobs and can only be read back on an instance that shares the same `APP_SECRET`.

### Import

**Contexts → Import**, drop the ZIP, then click **Preview**. The preview screen lists everything the import would create or overwrite, item by item, before any change is committed:

- new contexts that will be created,
- existing contexts that will be updated,
- collection rules / policies / schedules per context,
- credentials that cannot be decrypted (different `APP_SECRET`).

Choose an import mode:

| Mode | Behaviour |
|---|---|
| `create-or-skip` | Create what doesn't exist, leave existing items alone. |
| `create-or-update` | Create what doesn't exist, overwrite items with the same name. |
| `replace` | Delete the target context entirely and recreate it from the archive. Asks for typed confirmation. |

:::info Screenshot expected
**File**: `static/img/screenshots/contexts/export-menu.png`
**Description**: Context list with the **⋯** action menu open on a row, showing **Export**, **Export all**, **Import…** options.
:::

:::info Screenshot expected
**File**: `static/img/screenshots/contexts/import-preview.png`
**Description**: Import preview screen with a tree of items grouped by context, each item annotated with a coloured pill (NEW / UPDATE / SKIP / CONFLICT), and a mode selector at the top (radio buttons). **Cancel** and **Apply import** buttons at the bottom right.
:::

### Configuration example via API

```bash
# Export
curl -O -J -H "Authorization: Bearer $TOKEN" \
  https://auditix.example.com/api/contexts/2/export

# Preview an import
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -F "file=@auditix-context-prod-20260504-081234.zip" \
  https://auditix.example.com/api/contexts/import/preview

# Apply
curl -X POST -H "Authorization: Bearer $TOKEN" \
  -F "file=@auditix-context-prod-20260504-081234.zip" \
  -F "mode=create-or-update" \
  https://auditix.example.com/api/contexts/import
```
