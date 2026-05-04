---
sidebar_position: 2
---

# SSL certificates

Manage the certificate served by NGINX in HTTPS mode from **Administration → Server → SSL**.

## Upload a certificate

You provide three pieces of PEM-encoded content:

| Field | Required | Description |
|---|---|---|
| Certificate | yes | The leaf certificate (`-----BEGIN CERTIFICATE-----`). |
| Private key | yes | The matching unencrypted private key (`-----BEGIN PRIVATE KEY-----` or `RSA PRIVATE KEY`). Encrypted keys are rejected. |
| Chain | optional | Intermediates between the leaf and the root, root-last order. |

Auditix verifies that:
- the key matches the certificate,
- the chain (if provided) terminates above the leaf,
- expiry is in the future.

A green **valid** badge with expiry date appears once accepted. The cert is installed under `/etc/nginx/ssl/` and NGINX is reloaded.

:::info Screenshot expected
**File**: `static/img/screenshots/server/ssl-upload.png`
**Description**: SSL panel with three textareas (Certificate, Private key, Chain) stacked vertically, drag-and-drop hint at the top of each, an **Install** button at the bottom right, and a side card "Current certificate" showing CN, issuer and expiry.
:::

:::info Screenshot expected
**File**: `static/img/screenshots/server/ssl-current.png`
**Description**: Detail card showing the currently installed certificate (CN, SANs as chips, issuer, valid-from and valid-until dates with a colour pill: green > 30 days, amber 30-7, red < 7) and a **Replace** button.
:::

## Configuration example

```json
PUT /api/admin/server/nginx/certificate
{
  "certificate": "-----BEGIN CERTIFICATE-----\nMIIDazCC...\n-----END CERTIFICATE-----",
  "privateKey":  "-----BEGIN PRIVATE KEY-----\nMIIEvgIB...\n-----END PRIVATE KEY-----",
  "chain":       "-----BEGIN CERTIFICATE-----\nMIIFazCC...\n-----END CERTIFICATE-----"
}
```

## Renewal

There is no automatic ACME client built in. Either:
- upload a renewed cert manually before expiry,
- run `certbot` on the host and point Auditix at the resulting files via a host volume mount, or
- terminate TLS upstream (set NGINX mode to `http`).

A warning banner appears in the dashboard once the certificate has fewer than 30 days of validity.
