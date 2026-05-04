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

## CLI status — `make status`

From the Auditix install directory on the host, run:

```bash
make status
```

A synthetic table is printed with one row per service, combining the output of `docker compose ps` and `docker stats`:

```
SERVICE             STATE     HEALTH     UPTIME       CPU%   MEM            MEM%
nginx               running   healthy    Up 2h 30m    0.5%   45.2 MiB       2.3%
php                 running   healthy    Up 2h 30m    2.1%   320.5 MiB     16.5%
postgres            running   healthy    Up 2h 30m    0.8%   180.0 MiB      9.2%
rabbitmq            running   healthy    Up 2h 30m    1.2%   210.4 MiB     10.7%
worker-collector    running   healthy    Up 2h 30m    5.2%   512.0 MiB     26.3%
worker-monitoring   running   healthy    Up 2h 30m    3.4%   180.7 MiB      9.3%
worker-generator    running   healthy    Up 2h 30m    0.7%   140.2 MiB      7.2%
```

Use this for quick health checks over SSH, in CI smoke tests, or as a starting point for monitoring scripts. For machine-readable output use `docker compose ps --format json`.

:::info Screenshot expected
**File**: `static/img/screenshots/server/make-status.png`
**Description**: Terminal screenshot of `make status` output rendered with the synthetic table — colours preserved (running rows green, unhealthy rows red).
:::
