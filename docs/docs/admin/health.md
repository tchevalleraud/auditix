---
sidebar_position: 3
---

# Health & Server

The administration panel provides server monitoring tools.

## Health

Navigate to **Admin > Health** to check the status of all services:

- **PostgreSQL** — Database connectivity
- **RabbitMQ** — Message queue status and queue lengths
- **Workers** — Status of all background workers
- **Docker** — Container health

<!-- ![Health dashboard](../../static/img/screenshots/admin-health.png) -->

## Logs

Navigate to **Admin > Logs** to view application and server logs:

- **Nginx access logs** — HTTP request logs
- **Nginx error logs** — Server error logs

<!-- ![Logs viewer](../../static/img/screenshots/admin-logs.png) -->

## Tasks

Navigate to **Admin > Tasks** to monitor background jobs:

- **Pending tasks** — Queued and waiting for a worker
- **Running tasks** — Currently being processed
- **Completed tasks** — Recently finished tasks
- **Failed tasks** — Tasks that encountered errors

<!-- ![Tasks monitor](../../static/img/screenshots/admin-tasks.png) -->
