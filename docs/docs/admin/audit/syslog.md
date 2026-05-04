---
sidebar_position: 2
---

# Syslog forwarding

Forward audit log entries (and optionally application logs) to one or more external syslog collectors — useful for SIEM ingestion, long-term archiving and centralised dashboards.

Configure under **Administration → Audit → Syslog**.

## Add a syslog server

| Field | Description |
|---|---|
| Name | Display name. |
| Host | FQDN or IP of the collector. |
| Port | Default 514 (UDP) or 6514 (TLS over TCP). |
| Protocol | `udp`, `tcp` or `tls`. |
| Facility | Syslog facility number (0–23). Default `16` (`local0`). |
| Format | `rfc3164` (BSD) or `rfc5424` (modern, recommended). |
| Categories | Multi-select: which audit categories to forward. Empty = all. |
| Min level | `info`, `warning`, `error`. Records below this level are dropped. |

Use the **Test** button to send a synthetic entry. Auditix surfaces TCP connect errors and TLS handshake failures inline.

:::info Screenshot expected
**File**: `static/img/screenshots/audit/syslog-list.png`
**Description**: Audit → Syslog list with one or two configured collectors, columns Name / Host:Port / Protocol / Format / Status (green/red dot for last forward), action menu (Edit, Test, Disable, Delete).
:::

:::info Screenshot expected
**File**: `static/img/screenshots/audit/syslog-form.png`
**Description**: Syslog server form with the protocol dropdown expanded showing UDP/TCP/TLS options, and the **Categories** multi-select with a few categories ticked. **Test** button at bottom right with a sample probe result below.
:::

## Configuration example

```json
POST /api/admin/syslog/servers
{
  "name": "Central SIEM",
  "host": "siem.example.com",
  "port": 6514,
  "protocol": "tls",
  "facility": 16,
  "format": "rfc5424",
  "categories": ["auth", "api", "system"],
  "minLevel": "info",
  "enabled": true
}
```

## Format examples

`rfc5424` over TLS:

```
<134>1 2026-05-04T08:12:34.123Z auditix.example.com auditix 1234 AUDIT-AUTH [auditix@99999 user="alice" context="prod"] Login success
```

`rfc3164` over UDP:

```
<134>May  4 08:12:34 auditix.example.com auditix[1234]: AUDIT-AUTH user=alice context=prod Login success
```

## Failure handling

If the collector is unreachable Auditix retries with exponential backoff up to 5 minutes, then drops the message and increments the *forwarding errors* counter shown on the dashboard. Audit data is **never** lost — it remains in the local DB regardless of forwarding status.
