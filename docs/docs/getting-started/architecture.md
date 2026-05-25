---
title: Architecture
sidebar_position: 4
---

# Architecture

A 10 000-ft view of how Auditix is wired up.

<Screenshot
  src="https://placehold.co/1280x720/eef2ff/4338ca/png?text=Auditix+5.0+%E2%80%94+Service+map&font=inter"
  alt="Service map diagram"
  title="Service map"
  caption="Reverse proxy → frontend / backend → queue → workers; AI providers sit outside the trust boundary"
/>

| Service       | Role                                                |
|---------------|-----------------------------------------------------|
| NGINX         | Reverse proxy, SSL termination.                     |
| Frontend      | Next.js 15 SPA.                                     |
| Backend       | Symfony 7 + PHP 8.3 + Doctrine.                     |
| PostgreSQL    | Primary store.                                      |
| RabbitMQ      | Collection / monitoring / report queues.            |
| Mercure       | Real-time updates.                                  |
| Workers       | Collectors, monitoring probes, report generators.   |
| AI providers  | External or local LLM endpoints (5.0+).             |

> **Stub** — a fuller diagram and a deployment-topology cheat-sheet will land here.
