---
sidebar_position: 1
---

# NGINX server

The reverse proxy in front of Auditix is managed from **Administration → Server → NGINX**. You can switch between HTTP-only and HTTPS modes and change the public server name without touching the host.

## Modes

| Mode | What it does |
|---|---|
| `http` | Listens on port 80, no TLS. Suitable behind another TLS terminator (load balancer, ingress). |
| `https` | Listens on 443 with TLS. Port 80 redirects to 443 automatically. |

Switching modes regenerates `/etc/nginx/conf.d/auditix.conf` and triggers a `nginx -s reload`. The change is live in under a second; existing connections are not killed.

## Server name

`Server name` becomes the `server_name` directive in NGINX and the `Host:` value Auditix expects. Set it to the FQDN users will type in their browser (e.g. `auditix.example.com`).

If the value differs from the host header sent by the client, NGINX will still serve the request but will log a warning. Set up a wildcard or comma-separated list if you have multiple aliases.

:::info Screenshot expected
**File**: `static/img/screenshots/server/nginx-config.png`
**Description**: Admin → Server → NGINX panel with a mode toggle (HTTP / HTTPS), a `Server name` input, and a green "Configuration applied — NGINX reloaded" toast at the top.
:::

## Configuration example

```json
PUT /api/admin/server/nginx
{
  "mode": "https",
  "serverName": "auditix.example.com"
}
```

The PUT call returns the rendered nginx config alongside `{ "reloaded": true }`.
