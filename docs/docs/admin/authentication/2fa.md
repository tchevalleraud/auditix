---
sidebar_position: 2
---

# Two-factor authentication (TOTP)

Auditix supports time-based one-time passwords (TOTP, RFC 6238) for internal accounts. 2FA enrollment is per-user; admins cannot force-enable it for someone else but can require it via the password policy.

## Enable 2FA on your account

1. Open the user menu (top right) → **Account → Security**.
2. Click **Enable 2FA**.
3. Scan the QR code with an authenticator (Google Authenticator, 1Password, Authy, Bitwarden, …).
4. Enter the 6-digit code shown by the app to confirm.
5. Save the **backup codes** somewhere safe — each code can be used once if you lose access to the authenticator.

:::info Screenshot expected
**File**: `static/img/screenshots/auth/2fa-enroll.png`
**Description**: Account → Security panel showing the QR code, the manual "secret key" (formatted in groups of 4 chars), and the input for the 6-digit confirmation code.
:::

:::info Screenshot expected
**File**: `static/img/screenshots/auth/2fa-backup-codes.png`
**Description**: Modal displayed right after enrollment, showing 8-10 single-use backup codes in a monospace grid with a **Download .txt** and **Copy** button.
:::

## Login flow with 2FA

1. Submit username + password on `/login`.
2. Auditix replies with `{"requires2fa": true}`.
3. The 6-digit input screen is displayed.
4. Enter the current code or one backup code.

:::info Screenshot expected
**File**: `static/img/screenshots/auth/2fa-login-prompt.png`
**Description**: Two-step login screen at the second step: a single 6-digit input (auto-focused, large font) plus a small "use a backup code instead" link below.
:::

## Disable 2FA

From **Account → Security**, click **Disable 2FA**. You will be asked for the current password and one valid TOTP code before the secret is deleted.

## API tokens and 2FA

API tokens issued via `POST /api/v1/auth/token` bypass 2FA — they are second-factor in their own right (a long-lived secret). Generate them only with explicit context scope, never `*`.
