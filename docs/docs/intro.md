---
sidebar_position: 1
title: Introduction
---

# Auditix 5.0

**Auditix** is a network compliance auditing platform: collect data from your equipment, evaluate it against your policies, visualise your topology, and ship results to ops and management. Version 5.0 introduces an [AI layer](./guide/ai/overview) sitting next to every part of the platform.

<FeatureGrid>
  <FeatureCard
    icon="🚀"
    title="Install in 10 minutes"
    description="One-line install or manual setup with Docker Compose."
    to="/getting-started/installation"
  />
  <FeatureCard
    icon="📘"
    title="Reference guide"
    description="Every feature, every screen, documented."
    to="/guide/dashboard"
  />
  <FeatureCard
    icon="🧪"
    title="Use cases"
    description="Step-by-step recipes from blank install to real result."
    to="/usecase/intro"
  />
  <FeatureCard
    icon="🧠"
    title="AI Edition"
    description="Chat assistants, AI Assist in reports, 4 provider types."
    to="/guide/ai/overview"
    ai
  />
</FeatureGrid>

## Key features

### Inventory & data
- **Node management** — register and organise routers, switches, firewalls; auto-detect manufacturer/model.
- **Automated collection** — schedule SSH/SNMP collections with reusable rules; ZIP and CSV bulk imports.
- **Inventory categories** — typed datasets (`interfaces`, `lldp_neighbors`, `installed_software`, …) with per-context columns and sort.
- **Lifecycle tracking** — EoS / EoSM / EoL timelines and a configurable freshness score, refreshed by [vendor plugins](./guide/inventory/lifecycle).

### Topology
- **Interactive map** — Cytoscape view with protocol filters (LLDP, OSPF, ISIS, BGP, STP), [link rules](./guide/topology/link-rules), MSTI overlays and [custom schemas](./guide/topology/schemas).

### Compliance
- **Rules and policies** — visual editor, multi-source joins, debug introspection on nested blocks.
- **Auto-assignment** — policies attach themselves to matching nodes as new devices land.

### Reports & notifications
- **PDF reports** — block-based editor with chart, lifecycle, compliance matrix, status, recommendation, topology and schema blocks. AI Assist drafting on paragraph blocks.
- **Mail reports** — same editor, HTML output, TO / BCC / mail-merge modes.
- **SMTP servers** — configure multiple outbound servers with TLS/SSL and a test button.
- **Schedules** — split collect/extract phases, shared node selection, tabbed UI.

### AI <AIBadge />
- **Side-panel assistant** — ask your network in plain English.
- **Optional tool use** — read-only data access through an anonymisation pipeline.
- **Four provider types** — OpenRouter, OpenAI, Anthropic and local Ollama.
- **AI Assist in reports** — one-click paragraph drafting in PDF and mail reports.

### Authentication & security
- **Multi-provider OIDC** — bind any number of IdPs (Azure AD, Keycloak, Google, …) with context mappings.
- **Internal IdP** — configurable password policy and GUI idle timeout.
- **TOTP 2FA** — RFC 6238 with backup codes.
- **Public REST API v1** — token auth, Swagger UI at `/api/doc`, all tokens [scoped to a context](./api/authentication).
- **Audit log** — every security event recorded, browsable, exportable.
- **Syslog forwarding** — push audit entries to one or more SIEM collectors over UDP/TCP/TLS.

### Operations
- **NGINX management** — switch HTTP/HTTPS, install SSL certificates from the GUI.
- **Worker pool admin** — scale collector / monitoring / generator pools live.
- **Context export/import** — package an entire context (rules, policies, profiles, schedules, reports) as a ZIP.
- **`make status`** — CLI synthetic table summarising container health and resource usage.

### Multi-language
- Interface available in English, French, German, Spanish, Italian and Japanese, with nested keys and English fallback.

## Architecture

- **Backend** — Symfony 7 (PHP 8.3) with PostgreSQL.
- **Frontend** — Next.js 15 with React and Tailwind CSS.
- **Message queue** — RabbitMQ (collection, compliance, monitoring, report generation).
- **Real-time** — Mercure for live updates.
- **Reverse proxy** — NGINX.
- **AI** *(optional)* — OpenRouter / OpenAI / Anthropic / Ollama.

All services run as Docker containers orchestrated via Docker Compose.

See the [Architecture page](./getting-started/architecture) for a service map.

## Next steps

- [Requirements](./getting-started/requirements)
- [Installation](./getting-started/installation)
- [First steps](./getting-started/first-steps)
- [What's new in 5.0](./whats-new-5.0)
