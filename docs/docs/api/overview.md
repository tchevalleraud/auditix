---
sidebar_position: 1
---

# API overview

Auditix exposes a public, versioned REST API documented with OpenAPI 3. The interactive Swagger UI is bundled with every install at:

```
https://<your-host>/api/doc
```

The current version is **v1**. All endpoints live under `/api/v1/`. Breaking changes will be released as `v2` — `v1` will keep working until at least one full major version after the new version ships.

## Capabilities

| Resource | Read | Write |
|---|---|---|
| Auth (token issuance) | — | `POST /api/v1/auth/token` |
| Nodes | yes | yes |
| Tags | yes | yes |
| Profiles | yes | yes |
| Credentials | yes | yes |
| Manufacturers / Models | yes | yes |
| Collection rules | yes | yes |
| Collection imports (ZIP) | — | yes |
| Schedules | yes | yes |
| Compliance policies | yes | yes |
| Reports | yes | trigger only |
| Inventory categories & rows | yes | — |

Anything that the GUI can do, the API can do — except a few admin-only operations (NGINX/SSL config, worker pool scaling) which remain on the internal `/api/admin/*` namespace.

## Conventions

- All requests and responses use JSON.
- Timestamps are ISO 8601 UTC with millisecond precision.
- Paginated lists use `?page=` / `?limit=` and return `X-Total-Count` and `Link` headers.
- Errors use [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807) (`application/problem+json`).

```http
HTTP/1.1 422 Unprocessable Entity
Content-Type: application/problem+json

{
  "type": "https://auditix.example.com/errors/validation",
  "title": "Validation failed",
  "status": 422,
  "detail": "name: must not be blank",
  "errors": [
    { "field": "name", "code": "NotBlank" }
  ]
}
```

## Rate limits

By default each API token is allowed 600 requests/minute. Excess is replied with `429 Too Many Requests` and a `Retry-After` header. Adjust per token via the GUI (**Account → API tokens**) or through env:

```yaml
API_RATE_LIMIT_PER_MINUTE: 600
```

:::info Screenshot expected
**File**: `static/img/screenshots/api/swagger-ui.png`
**Description**: Swagger UI loaded at `/api/doc` showing the left navigation collapsed by tags (Auth, Nodes, Tags, …), one endpoint expanded ("GET /api/v1/nodes") with parameters, response schemas and **Try it out** controls.
:::
