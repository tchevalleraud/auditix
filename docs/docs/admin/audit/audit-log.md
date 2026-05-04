---
sidebar_position: 1
---

# Audit log

Every security-relevant event in Auditix is recorded in the audit log. View, filter and export entries from **Administration → Audit → Logs**.

## What gets logged

| Category | Events |
|---|---|
| `auth` | Login success/failure, logout, OIDC callback, 2FA enable/disable, password change, account lockout. |
| `api` | Token creation/revocation, calls to mutating REST endpoints, context switch. |
| `worker` | Job started, job failed, worker pool scaled. |
| `system` | Configuration changed (NGINX, mail, syslog, auth settings, worker pool). |
| `error` | Uncaught exceptions, message handler failures. |

Each record stores: timestamp (UTC), category, level (`info`, `warning`, `error`), user (or `system`), context, message, and a JSON payload with the structured details.

## Filters

The viewer supports filtering by:
- date range (relative — last 1h, 24h, 7d — or absolute),
- category and level (multi-select),
- user (search-as-you-type),
- free-text search inside the message and payload.

Each filter combination has a stable URL — share or bookmark it.

:::info Screenshot expected
**File**: `static/img/screenshots/audit/audit-log-list.png`
**Description**: Audit → Logs page with a left sidebar of filters (date range, category checkboxes, level pills, user picker, search bar), and the main table on the right with columns Timestamp / Category / Level (coloured pill) / User / Message. One row is expanded showing the JSON payload pretty-printed.
:::

## Retention

By default, audit log entries are retained for 365 days. Adjust with the env var:

```yaml
AUDIT_LOG_RETENTION_DAYS: 365
```

A nightly job deletes anything older. Set to `0` to keep entries indefinitely (not recommended without external archiving — see [syslog](./syslog)).

## Export

Use the **Export** button to download the current filtered view as CSV or NDJSON. Streaming is supported up to 1 million rows.
