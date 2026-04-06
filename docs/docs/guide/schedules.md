---
sidebar_position: 7
---

# Schedules

Schedules allow you to automate recurring tasks like data collection and compliance evaluation.

## Creating a Schedule

1. Navigate to **Schedules** in the sidebar
2. Click **New schedule**
3. Configure:
   - **Name** — A descriptive name (e.g., "Daily collection", "Weekly compliance check")
   - **CRON expression** — When the schedule runs (e.g., `0 2 * * *` for daily at 2 AM)
   - **Phases** — What actions to perform

<!-- ![Create schedule](../../../static/img/screenshots/schedule-create.png) -->

## Schedule Phases

A schedule can include multiple phases that run in sequence:

1. **Collection** — Collect data from all nodes (or a filtered set)
2. **Compliance** — Evaluate compliance on all nodes
3. **Cleanup** — Remove old collection data

## CRON Expression Reference

| Expression      | Description              |
|-----------------|--------------------------|
| `0 * * * *`     | Every hour               |
| `0 2 * * *`     | Daily at 2:00 AM         |
| `0 2 * * 1`     | Every Monday at 2:00 AM  |
| `0 2 1 * *`     | First day of month at 2:00 AM |
| `*/30 * * * *`  | Every 30 minutes         |

## Monitoring Schedules

The schedule list shows:
- **Status** — Active or inactive
- **Last run** — When it last executed
- **Next run** — When it will run next

<!-- ![Schedule list](../../../static/img/screenshots/schedule-list.png) -->

:::tip
Combine collection and compliance phases in a single schedule to ensure your compliance scores are always based on the latest data.
:::
