---
sidebar_position: 3
---

# Password policy & idle timeout

Defines the rules applied to all internal accounts (`internal` IdP) and the GUI inactivity timeout. OIDC accounts are governed by their upstream provider — the password policy does not apply to them.

Open **Administration → Authentication → Settings**.

## Password rules

| Setting | Default | Notes |
|---|---|---|
| Minimum length | 8 | Hard floor: 4. Recommended: 12+. |
| Maximum length | 128 | Bcrypt cuts off at 72 bytes — values above are accepted but only the first 72 bytes are hashed. |
| Require uppercase | true | At least one A–Z character. |
| Require lowercase | true | At least one a–z character. |
| Require digit | true | At least one 0–9 character. |
| Require symbol | false | Any non-alphanumeric character. |
| Reject common passwords | true | Checks against a built-in deny list (top 10 000). |

The policy is enforced on:
- new account creation,
- password change from **Account → Security**,
- admin password reset.

It is **not** retroactively applied — existing weak passwords keep working until the next change. Force a rotation by ticking *Require password change at next login* on the user.

## Idle timeout

| Setting | Default | Notes |
|---|---|---|
| Idle timeout (seconds) | 300 | 0 disables the timer entirely. |
| Warn before lock (seconds) | 30 | Toast warning shown N seconds before the session is killed. |

The timer is reset on any user interaction (mouse, keyboard, scrolling, API calls). Background tabs without activity are logged out at the deadline.

:::info Screenshot expected
**File**: `static/img/screenshots/auth/auth-settings.png`
**Description**: Admin → Authentication → Settings page with two grouped cards: **Password policy** (toggles + numeric inputs) and **Session** (idle timeout slider with seconds/minutes label, warn-before slider). Save button sticky at top right.
:::

## Configuration example

```json
PUT /api/admin/auth/settings
{
  "passwordMinLength": 12,
  "passwordMaxLength": 128,
  "passwordRequireUppercase": true,
  "passwordRequireLowercase": true,
  "passwordRequireDigit": true,
  "passwordRequireSymbol": true,
  "passwordRejectCommon": true,
  "idleTimeoutSeconds": 900,
  "idleWarnSeconds": 60
}
```
