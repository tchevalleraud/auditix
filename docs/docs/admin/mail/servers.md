---
sidebar_position: 1
---

# SMTP mail servers

Auditix can send mail reports, alerts and password reset emails. You declare one or more SMTP servers in **Administration → Mail → Servers** and pick which one a schedule or report should use.

## Add a server

| Field | Description |
|---|---|
| Name | Display name (free text). |
| Host | SMTP host (FQDN or IP). |
| Port | 25 / 465 / 587 / custom. |
| Encryption | `none`, `tls` (STARTTLS) or `ssl` (implicit TLS). |
| Username | SMTP login (optional for unauthenticated relays). |
| Password | Stored encrypted. Shown as `••••••••` after save. |
| From email | Default `From:` header. |
| From name | Optional display name. |

Click **Test** to send a probe message to your account. The result (SMTP code + raw response) is shown inline.

:::info Screenshot expected
**File**: `static/img/screenshots/mail/servers-list.png`
**Description**: Admin → Mail → Servers list with 2 rows (e.g. "Internal Postfix", "SendGrid"), columns Name / Host / Port / Encryption / Default badge / Actions (Test, Edit, Delete).
:::

:::info Screenshot expected
**File**: `static/img/screenshots/mail/server-form.png`
**Description**: Mail server creation form with all fields visible and the **Test** button at the bottom showing a green "Connection OK — sent in 412 ms" callout below the form.
:::

## Configuration example

```json
POST /api/admin/mail/servers
{
  "name": "Corporate SMTP",
  "host": "smtp.example.com",
  "port": 587,
  "encryption": "tls",
  "username": "noreply@example.com",
  "password": "********",
  "fromEmail": "noreply@example.com",
  "fromName": "Auditix Notifications",
  "isDefault": true
}
```

## Default server

Mark exactly one server as **default**. It is used by:
- password reset emails,
- system notifications (failed schedules, worker pool alerts),
- mail reports that don't explicitly pick one.

Setting a new default automatically clears the previous one.

## Addressing modes for mail reports

When a schedule sends a mail report, it uses one of three modes:

| Mode | Behaviour |
|---|---|
| `to` | Single email with all recipients in `To:`. |
| `bcc` | Single email with all recipients in `Bcc:` (everyone hidden from each other). |
| `merge` | One personalised email per recipient. Merge fields like `{{user.name}}` are expanded per send. |

Configure this on the **Schedule → Mail** tab — see the [Schedules guide](../../guide/schedules.md).
