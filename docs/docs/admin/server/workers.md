---
sidebar_position: 3
---

# Worker pools

Background work in Auditix (collection, extraction, compliance evaluation, monitoring, mail and report generation) runs in dedicated worker containers. The worker pool admin gives you live control over how many of each are running.

Two layers exist:

1. **Container scaling** — number of replicas of a given worker container.
2. **Process supervision** — number of consumer processes inside one container.

The total number of concurrent jobs of a type equals `replicas × processes`.

## Pools

| Pool | Default replicas | Default processes | Purpose |
|---|---|---|---|
| `scheduler` | 1 | 1 | Triggers cron-based schedules; one is enough. |
| `collector` | 2 | 4 | SSH/SNMP polling. Scale this first when adding nodes. |
| `monitoring` | 1 | 4 | SNMP gauges (CPU, memory, temperature). |
| `generator` | 1 | 2 | Compliance evaluation, PDF/mail report rendering. |

## Live changes

Changes apply immediately — the supervisor either spawns or terminates processes after letting the in-flight job finish (max 60 s grace period).

:::info Screenshot expected
**File**: `static/img/screenshots/server/worker-pool.png`
**Description**: Admin → Server → Workers page with one card per pool. Each card shows the pool name, two number inputs (Replicas, Processes), the *current* count next to *target* count, and a small chart of jobs/min over the last 15 minutes.
:::

## Configuration via environment variables

The defaults at first boot come from the compose file:

```yaml
# docker-compose.yml — env vars on the supervisor container
WORKER_SCHEDULER_REPLICAS: 1
WORKER_COLLECTOR_REPLICAS: 2
WORKER_MONITORING_REPLICAS: 1
WORKER_GENERATOR_REPLICAS: 1

WORKER_SCHEDULER_PROCESSES: 1
WORKER_COLLECTOR_PROCESSES: 4
WORKER_MONITORING_PROCESSES: 4
WORKER_GENERATOR_PROCESSES: 2
```

Once Auditix is running, the GUI overrides these values. To revert to the env defaults, click **Reset to defaults** at the bottom of the page.

## Configuration example via API

```json
PUT /api/admin/worker-pool
{
  "pools": {
    "collector":  { "replicas": 4, "processes": 8 },
    "generator":  { "replicas": 2, "processes": 2 }
  }
}
```

## When to scale

| Symptom | Likely fix |
|---|---|
| Schedules start late | Bump `scheduler` processes (rare). |
| Collection lag (many nodes pending) | Bump `collector` replicas. |
| Live SNMP charts stutter | Bump `monitoring` processes. |
| Reports queue grows | Bump `generator` replicas. |

The dashboard shows a queue depth gauge per pool — use that as a feedback signal rather than guessing.
