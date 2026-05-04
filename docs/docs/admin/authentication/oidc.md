---
sidebar_position: 1
---

# OIDC Providers

Auditix supports multiple OpenID Connect (OIDC) providers simultaneously. Each provider is configured independently and can be mapped to one or more contexts. Internal accounts and OIDC accounts can coexist.

## Add a provider

Open **Administration → Authentication → Providers** and click **Add provider**.

Required fields:

| Field | Description |
|---|---|
| Slug | URL-safe identifier used in the callback URL (`/api/auth/oidc/{slug}/callback`). |
| Name | Display name shown on the login screen button. |
| Discovery URL | OIDC discovery endpoint (`.well-known/openid-configuration`). |
| Client ID | Application identifier issued by the IdP. |
| Client Secret | Application secret. Stored encrypted. |
| Scopes | Space-separated list. Minimum: `openid profile email`. |

Auto-discovery fetches the authorization, token, userinfo and JWKS endpoints from the discovery URL. To override, use the **Advanced** tab.

:::info Screenshot expected
**File**: `static/img/screenshots/auth/oidc-providers-list.png`
**Description**: Admin → Authentication → Providers list view, showing 2-3 configured providers (Google, Azure AD, Keycloak) with status badge (enabled/disabled), the **Edit / Test / Delete** action menu, and the **+ Add provider** button at top right.
:::

:::info Screenshot expected
**File**: `static/img/screenshots/auth/oidc-provider-form.png`
**Description**: Provider creation/edit form showing all fields (Slug, Name, Discovery URL, Client ID, Secret, Scopes) and the **Advanced** tab collapsed beneath.
:::

## Context mapping

A provider returns claims (groups, roles, email domain). Auditix maps these to one or more **contexts** so a single OIDC user can be granted access to multiple tenants.

In the provider edit screen open the **Context mappings** tab and add rules:

```yaml
# Example mapping rule (rendered in the UI as a form)
claim: groups
operator: contains
value: auditix-prod
context_id: 2
role: admin
```

Each mapping is evaluated on every login. A user without any matching rule is denied.

:::info Screenshot expected
**File**: `static/img/screenshots/auth/oidc-context-mappings.png`
**Description**: Context mappings tab inside a provider edit screen, with 2-3 rules listed (claim/operator/value/context/role) and an **Add mapping** form expanded at the bottom.
:::

## Configuration example — Microsoft Entra ID (Azure AD)

```text
Slug:           azure-ad
Name:           Microsoft Azure AD
Discovery URL:  https://login.microsoftonline.com/<tenant-id>/v2.0/.well-known/openid-configuration
Client ID:      <application-id>
Client Secret:  <client-secret>
Scopes:         openid profile email
```

Redirect URI to register on the Azure side:

```
https://<your-auditix-host>/api/auth/oidc/azure-ad/callback
```

## Configuration example — Keycloak

```text
Slug:           keycloak
Name:           Keycloak SSO
Discovery URL:  https://idp.example.com/realms/auditix/.well-known/openid-configuration
Client ID:      auditix
Client Secret:  <secret>
Scopes:         openid profile email roles
```

## Login flow

1. User clicks the provider button on `/login`.
2. Redirected to the IdP authorization endpoint.
3. IdP returns to `/api/auth/oidc/{slug}/callback`.
4. Auditix validates the ID token, applies context mappings, issues a session.
5. If TOTP is enabled on the local user, the 2FA challenge is shown next.

:::info Screenshot expected
**File**: `static/img/screenshots/auth/login-with-providers.png`
**Description**: `/login` screen showing the username/password form on the left and a column of OIDC provider buttons (with their custom names and logos) on the right. Theme toggle and language switcher visible in the corner, version footer at the bottom.
:::
