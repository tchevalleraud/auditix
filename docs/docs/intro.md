---
sidebar_position: 1
slug: /
---

# Introduction

**Auditix** is a network compliance auditing platform that helps you monitor, collect data from, and evaluate the compliance of your network equipment.

## Key Features

- **Node Management** — Register and organize your network equipment (routers, switches, firewalls, etc.) with manufacturer and model detection.
- **Automated Collection** — Schedule and execute data collection from your nodes via SSH/SNMP with customizable commands.
- **Compliance Evaluation** — Define compliance rules and policies, then evaluate your nodes against them with automated scoring.
- **SNMP Monitoring** — Monitor your equipment health with SNMP polling for CPU, memory, temperature, and more.
- **Report Generation** — Generate professional DOCX compliance reports with customizable themes and templates.
- **Multi-context** — Organize your infrastructure into separate contexts for different teams or environments.
- **Multi-language** — Full interface available in English, French, German, Spanish, Italian, and Japanese.

## Architecture

Auditix is built with:

- **Backend**: Symfony 7 (PHP 8.3) with PostgreSQL
- **Frontend**: Next.js 15 with React and Tailwind CSS
- **Message Queue**: RabbitMQ for async task processing (collection, compliance, monitoring, report generation)
- **Real-time**: Mercure for live updates
- **Reverse Proxy**: Nginx

All services run as Docker containers orchestrated via Docker Compose.

## Next Steps

- [Requirements](./getting-started/requirements) — Check what you need before installing
- [Installation](./getting-started/installation) — Deploy Auditix with Docker Compose
- [First Steps](./getting-started/first-steps) — Configure your first context and add nodes
