---
sidebar_position: 3
---

# Endpoints reference

This page is a quick map of the public API. Full request/response schemas live in the auto-generated [Swagger UI](./overview).

## Auth

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/v1/auth/token` | Exchange credentials for a session token. |
| `DELETE` | `/api/v1/auth/tokens/{id}` | Revoke an API token. |

## Nodes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/nodes` | List nodes (paginated). |
| `POST` | `/api/v1/nodes` | Create a node. |
| `GET` | `/api/v1/nodes/{id}` | Fetch a node. |
| `PUT` | `/api/v1/nodes/{id}` | Update a node. |
| `DELETE` | `/api/v1/nodes/{id}` | Delete a node. |
| `POST` | `/api/v1/nodes/bulk-import` | Bulk import (CSV body). |
| `POST` | `/api/v1/nodes/bulk-actions` | Run actions on a selection (ping, collect, extract, tag). |

## Tags / Profiles / Credentials

Each resource has the standard CRUD set:

```
GET    /api/v1/{resource}
POST   /api/v1/{resource}
GET    /api/v1/{resource}/{id}
PUT    /api/v1/{resource}/{id}
DELETE /api/v1/{resource}/{id}
```

with `{resource}` ∈ `tags`, `profiles`, `credentials`, `manufacturers`, `models`.

Profile-only extra: `POST /api/v1/profiles/{id}/test` — try a live SSH/SNMP connection and return the outcome (latency, errors).

## Collections

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/collection-rules` | List collection rules. |
| `POST` | `/api/v1/collection-rules` | Create a rule. |
| `POST` | `/api/v1/collections/import` | Upload a ZIP archive of raw outputs to ingest. |

ZIP layout:

```
my-import.zip
├── routerA/
│   ├── show-version.txt
│   └── show-running-config.txt
└── routerB/
    └── show-version.txt
```

Folder names must match node names. File names match collection rule outputs. The optional `promptPattern` form field overrides the default prompt regex used when stripping CLI prompts:

```bash
curl -X POST https://auditix.example.com/api/v1/collections/import \
  -H "Authorization: Bearer $TOKEN" \
  -F "file=@my-import.zip" \
  -F 'promptPattern=^[a-zA-Z0-9._-]+#\s*$'
```

## Compliance

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/compliance/policies` | List policies. |
| `POST` | `/api/v1/compliance/policies` | Create policy. |
| `POST` | `/api/v1/compliance/policies/{id}/evaluate` | Trigger evaluation against current inventory. |
| `GET` | `/api/v1/compliance/results?nodeId=…` | Per-node evaluation results. |

## Schedules & reports

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/schedules` | List schedules. |
| `POST` | `/api/v1/schedules/{id}/run` | Trigger an immediate run (out-of-band). |
| `GET` | `/api/v1/reports` | List reports. |
| `POST` | `/api/v1/reports/{id}/generate` | Generate a PDF (returns job id). |
| `GET` | `/api/v1/reports/jobs/{id}` | Poll job status; on success contains a download URL. |

## Inventory

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/v1/inventory/categories` | List categories. |
| `GET` | `/api/v1/inventory/categories/{id}/rows` | Read rows of a category (paginated, sortable). |

## Pagination & sorting

```
GET /api/v1/nodes?page=2&limit=50&sort=name:asc,createdAt:desc&filter=tag:edge
```

Response headers:

```
X-Total-Count: 1234
Link: <…?page=1&limit=50>; rel="prev",
      <…?page=3&limit=50>; rel="next",
      <…?page=25&limit=50>; rel="last"
```

## Errors

All errors follow [RFC 7807](https://www.rfc-editor.org/rfc/rfc7807). Common ones:

| Status | When |
|---|---|
| `400` | Bad JSON / wrong shape. |
| `401` | Missing or invalid token. |
| `403` | Token valid but cannot access this context. |
| `404` | Resource not found in this context. |
| `409` | Uniqueness conflict. |
| `422` | Validation failed. |
| `429` | Rate limit exceeded. |
| `5xx` | Server error — recorded in audit log. |
