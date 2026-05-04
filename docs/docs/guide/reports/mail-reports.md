---
sidebar_position: 3
---

# Mail reports

A mail report is a report whose final output is rendered as HTML email instead of (or alongside) PDF. Same block-based editor, same themes — different delivery.

Create one in **Reports → Mail reports → New**.

## Building blocks

The block palette is shared with PDF reports:

| Block | Use |
|---|---|
| Heading / Paragraph | Plain text. |
| Inventory table | Snapshot of an inventory category. Per-column sort and visibility. |
| Compliance matrix | Devices × policies grid, coloured by status. |
| Non-compliant devices | List of devices failing one or more policies. |
| Status table | Aggregated counts per status. |
| Recommendation | Free-text remediation guidance. |
| Chart | Bar / line / pie generated from inventory aggregates. |
| Lifecycle timeline | EoL / EoS milestones for selected devices. |

Each block can be duplicated (right-click → **Duplicate**) and reordered with drag-and-drop.

:::info Screenshot expected
**File**: `static/img/screenshots/reports/mail-builder.png`
**Description**: Mail report editor — left palette of blocks, central canvas showing 4-5 stacked blocks (heading, compliance matrix, status table, recommendation), right side panel with the selected block's properties. Live preview tab visible at the top.
:::

:::info Screenshot expected
**File**: `static/img/screenshots/reports/mail-preview.png`
**Description**: Preview tab of a mail report rendered as it would appear in a typical email client, with the report theme's colours and logo applied.
:::

## Recipients & addressing modes

Set the recipient list in the **Mail** tab. You can mix:

- **Internal users** — picked from the user list of the current context.
- **External addresses** — free-form emails for non-Auditix recipients.

Then choose the addressing mode:

| Mode | Behaviour |
|---|---|
| `to` | One mail, all addresses in `To:`. |
| `bcc` | One mail, all addresses in `Bcc:` (each recipient sees only themselves). |
| `merge` | One mail per recipient. Merge fields (`{{user.name}}`, `{{user.email}}`, `{{context.name}}`) are expanded individually. |

Use `merge` whenever the report contains personalised content or you don't want recipients to see each other.

## Configuration example

```json
POST /api/mail-reports
{
  "name": "Weekly compliance digest",
  "themeId": 3,
  "recipientUserIds": [12, 14, 17],
  "recipientExternalEmails": ["network-team@example.com"],
  "recipientMode": "merge",
  "mergeSubject": "Auditix — compliance digest for {{user.name}}",
  "mailServerId": 1,
  "blocks": [
    { "type": "heading", "props": { "text": "Weekly digest" } },
    { "type": "compliance-matrix", "props": { "policyTagId": 5 } },
    { "type": "non-compliant-devices", "props": { "limit": 20 } },
    { "type": "recommendation", "props": { "text": "Review the items above with your operator." } }
  ]
}
```

## Triggering

Mail reports do not run on their own. Attach them to a [schedule](../schedules) — they are triggered after the schedule's compliance phase completes. You can also click **Send now** from the editor toolbar for an ad-hoc dispatch.
