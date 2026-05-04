---
sidebar_position: 7
---

# Schedules

A schedule chains the operations needed to keep an inventory and its compliance results up to date — collect → extract → evaluate → report → email — and runs them on a cron expression.

## Anatomy

The schedule editor is split into tabs:

| Tab | Purpose |
|---|---|
| **General** | Name, cron expression, enabled flag. |
| **Phases** | Toggle the phases you want; they run in order. |
| **Node selection** | Pick which nodes the phases apply to. Shared across all phases of this schedule. |
| **Reports** | PDF reports to generate at the end. |
| **Mail** | [Mail reports](./reports/mail-reports) to send and addressing mode. |

:::info Screenshot expected
**File**: `static/img/screenshots/schedules/editor.png`
**Description**: Schedule editor with the **Phases** tab active. Five phase rows (Collect, Extract, Cleanup, Compliance, Report) each with a toggle and per-phase options. Tab list at the top, sticky **Save** button.
:::

## Phases

Each phase is independently toggleable. They run sequentially in the listed order — a failed phase stops the chain (and is reported in the audit log).

| Phase | Action |
|---|---|
| **Collect** | SSH/SNMP commands defined by the active collection rules. |
| **Extract** | Parse the freshly collected output into inventory categories. Decoupled from collect since 4.0 — you can re-extract without re-collecting. |
| **Cleanup** | Drop collection rows older than the retention setting. |
| **Compliance** | Re-evaluate the policies attached to the selected nodes. |
| **Report** | Generate the PDF reports listed in the **Reports** tab. |
| **Mail** | Send the mail reports listed in the **Mail** tab using the configured addressing mode. |

## Node selection

Pick **once** per schedule which nodes are processed by every phase. Three modes:

| Mode | Behaviour |
|---|---|
| `all` | Every node in the context. |
| `tag` | Every node bearing one of the selected tags. |
| `individual` | An explicit list. |

A node added to the matching tag in the future will be picked up automatically on the next run — no need to edit the schedule.

## Configuration example

```json
POST /api/schedules
{
  "name": "Daily core network collection",
  "cronExpression": "0 2 * * *",
  "enabled": true,
  "collectEnabled": true,
  "extractEnabled": true,
  "cleanupEnabled": false,
  "complianceEnabled": true,
  "reportEnabled": true,
  "mailEnabled": true,
  "nodeSelectionMode": "tag",
  "nodeTagIds": [3, 5],
  "reportIds": [1, 4],
  "mailReportIds": [2],
  "mailAddressingMode": "merge"
}
```

## CRON reference

| Expression | Description |
|---|---|
| `0 * * * *` | Every hour. |
| `0 2 * * *` | Daily at 02:00. |
| `0 2 * * 1` | Every Monday at 02:00. |
| `0 2 1 * *` | First day of the month at 02:00. |
| `*/30 * * * *` | Every 30 minutes. |

The cron is evaluated in the server's `TZ` (UTC by default — change via env).

## Monitoring runs

The schedule list shows status (enabled/disabled), last run, next run and the outcome of the last run. Click a row to see the timeline of phases for the most recent runs.

:::info Screenshot expected
**File**: `static/img/screenshots/schedules/run-detail.png`
**Description**: Detail of a recent schedule run — vertical timeline of phases (Collect ✓ 12 s, Extract ✓ 4 s, Compliance ✓ 7 s, Report ✓ 22 s, Mail ✓ 2 s), each phase expandable to show per-node logs.
:::

:::tip
Combine collect, extract and compliance in a single schedule so your scores are always based on the latest data, then attach the mail report so the result lands in inboxes within minutes.
:::
