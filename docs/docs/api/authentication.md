---
sidebar_position: 2
---

# API authentication

All API calls require a bearer token. There are two flavours:

| Token type | Issued by | Lifetime | Use case |
|---|---|---|---|
| **API token** | GUI under **Account → API tokens** | configurable, default 365 d, can be revoked | Long-lived, machine-to-machine. |
| **Session token** | `POST /api/v1/auth/token` | 1 hour | Short-lived, user-driven (CI runs, scripts). |

Both are sent in the `Authorization` header:

```
Authorization: Bearer <token>
```

## Issue an API token from the GUI

1. **Account → API tokens → New**.
2. Pick a name, a context (mandatory — see below), an expiration.
3. Auditix shows the token **once**. Copy it immediately.

:::info Screenshot expected
**File**: `static/img/screenshots/api/api-tokens.png`
**Description**: User account → API tokens page with a list of existing tokens (Name / Context / Expires / Last used / Revoke) and the **New token** modal open showing fields Name, Context dropdown, Expires (preset chips: 30d / 90d / 1y / never), and a **Create** button.
:::

:::info Screenshot expected
**File**: `static/img/screenshots/api/api-token-revealed.png`
**Description**: Modal shown immediately after token creation with the token in a monospace block, a **Copy** button, a red banner "This token is shown only once" and an acknowledgement checkbox before being able to close.
:::

## Get a session token from the API

```http
POST /api/v1/auth/token
Content-Type: application/json

{
  "username": "alice",
  "password": "secret",
  "contextId": 2
}
```

Response:

```json
{
  "accessToken": "eyJ...<jwt>...",
  "expiresIn": 3600,
  "contextId": 2
}
```

For accounts with TOTP enabled, supply the current code:

```json
{
  "username": "alice",
  "password": "secret",
  "contextId": 2,
  "totpCode": "123456"
}
```

## Context scoping

Every token is bound to **exactly one context**. Calls to a resource that belongs to a different context return `403 Forbidden`. This is enforced server-side; you cannot escape it client-side. To operate against multiple contexts, mint one token per context.

Internal admin users ignore this rule (they can call any context). Mark a user as admin in the user form.

## Revoke a token

From the GUI: **Account → API tokens → Revoke**. From the API:

```http
DELETE /api/v1/auth/tokens/{id}
Authorization: Bearer <admin-or-owner-token>
```

Revoked tokens are rejected immediately — no propagation delay.

## Curl example

```bash
TOKEN=$(curl -s -X POST https://auditix.example.com/api/v1/auth/token \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice","password":"secret","contextId":2}' \
  | jq -r .accessToken)

curl -H "Authorization: Bearer $TOKEN" \
  https://auditix.example.com/api/v1/nodes?limit=10
```
