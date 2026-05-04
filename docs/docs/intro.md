---
sidebar_position: 1
slug: /
---

# Introduction

**Auditix** is a network compliance auditing platform that helps you collect data from your equipment, evaluate it against custom or industry-standard policies, visualise your topology and ship the results to operations and management teams.

## Key features

### Inventory & data
- **Node management** — register and organise routers, switches, firewalls; auto-detect manufacturer/model.
- **Automated collection** — schedule SSH/SNMP collections with reusable rules; ZIP and CSV imports for bulk onboarding.
- **Inventory categories** — typed datasets (`interfaces`, `lldp_neighbors`, `installed_software`, …) with per-context customisable columns and per-column sort.
- **Lifecycle tracking** — EoS / EoSM / EoL timelines plus a configurable system-updates score, refreshed by [vendor plugins](./guide/inventory/lifecycle).

### Topology
- **Interactive map** — Cytoscape-based view with protocol filters (LLDP, OSPF, ISIS, BGP, STP), [link generation rules](./guide/topology/link-rules), manual links, draggable area labels and ISIS multi-area zebra edges.

### Compliance
- **Rules and policies** — visual match-rule editor, multi-source joins, debug introspection on nested blocks.
- **Auto-assignment** — policies attach themselves to matching nodes as new devices are added.

### Reports & notifications
- **PDF reports** — block-based editor with chart, lifecycle timeline, compliance matrix, status table, recommendation and topology blocks. Per-column sort on inventory tables, block duplication.
- **Mail reports** — same editor, HTML output, with TO / BCC / merge addressing modes.
- **SMTP servers admin** — configure multiple outbound servers with TLS/SSL and a test button.
- **Schedules** — split collect/extract phases, shared node selection, tabbed UI.

### Authentication & security
- **Multi-provider OIDC** — bind any number of IdPs (Azure AD, Keycloak, Google, …) with context mappings.
- **Internal IdP** — configurable password policy and GUI idle timeout.
- **TOTP 2FA** — RFC 6238 with backup codes.
- **Public REST API v1** — token authentication, Swagger UI at `/api/doc`, all tokens [scoped to a single context](./api/authentication).
- **Audit log** — every security-relevant event recorded, browsable, exportable.
- **Syslog forwarding** — push audit entries to one or more SIEM collectors over UDP/TCP/TLS.

### Operations
- **NGINX management** — switch HTTP/HTTPS, install SSL certificates from the GUI.
- **Worker pool admin** — scale collector / monitoring / generator pools live (replicas × processes).
- **Context export/import** — package an entire context (rules, policies, profiles, schedules, reports) as a ZIP archive.
- **`make status`** — quick CLI synthetic table summarising container health and resource usage.

### Multi-language
- Interface available in English, French, German, Spanish, Italian and Japanese, with nested translation keys and English fallback.

## Architecture

- **Backend** — Symfony 7 (PHP 8.3) with PostgreSQL.
- **Frontend** — Next.js 15 with React and Tailwind CSS.
- **Message queue** — RabbitMQ (collection, compliance, monitoring, report generation).
- **Real-time** — Mercure for live updates.
- **Reverse proxy** — NGINX.

All services run as Docker containers orchestrated via Docker Compose.

## Next steps

- [Requirements](./getting-started/requirements)
- [Installation](./getting-started/installation)
- [First steps](./getting-started/first-steps)
