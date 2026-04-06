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
