---
sidebar_position: 2
---

# Users

User management allows administrators to create accounts and control access to the platform.

## Accessing User Management

1. Click the **gear icon** in the top bar
2. Navigate to **Users**

<!-- ![User list](../../static/img/screenshots/admin-users.png) -->

## Creating a User

1. Click **New user**
2. Fill in:
   - **Username** (required, unique)
   - **First name** and **Last name** (optional)
   - **Password**
   - **Roles** — User or Admin

## Roles

| Role        | Description                                     |
|-------------|-------------------------------------------------|
| **User**    | Can access assigned contexts and all features within them |
| **Admin**   | Full access: user management, context management, server monitoring |

## Context Assignment

Users must be assigned to contexts to access them:

1. Open a context's settings (from the Admin panel > Contexts)
2. Go to the **Members** section
3. Add or remove users

A user who is not assigned to any context will see an empty dashboard.

:::info
Admin users automatically have access to all contexts regardless of assignment.
:::

## Identity providers

Each user has an `idp` field describing where they authenticate from:

| IdP | Notes |
|---|---|
| `internal` | Local password stored as a bcrypt hash. Subject to the [password policy](./authentication/password-policy). Eligible for [2FA](./authentication/2fa). |
| `oidc:<slug>` | Created on first successful login through the [OIDC provider](./authentication/oidc) `<slug>`. Password and 2FA fields are inert — the IdP handles them. |

Internal and OIDC accounts can coexist in the same instance; the username is unique across both kinds.

## Account security panel

Each user can manage their own security settings under **Account → Security** (top-right menu):

- change password (subject to the policy),
- enable / disable [TOTP 2FA](./authentication/2fa),
- list and revoke their own [API tokens](../api/authentication).

Admins can reset another user's password from the user list, but cannot enable 2FA on their behalf.

## Idle timeout

Inactive sessions are killed after the configured idle timeout — see [Password policy & idle timeout](./authentication/password-policy).
