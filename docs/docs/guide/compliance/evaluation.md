---
sidebar_position: 3
---

# Compliance Evaluation

Compliance evaluation runs all assigned policies against a node and calculates a compliance score.

## Running an Evaluation

1. Open a node's detail page
2. Click the **Actions** dropdown
3. Select **Evaluate compliance**

The evaluation runs asynchronously. The node's score badge will show a spinner while evaluation is in progress.

<!-- ![Evaluation running](../../../static/img/screenshots/compliance-eval-running.png) -->

## Viewing Results

Once the evaluation is complete, go to the **Compliance** tab of the node detail page:

<!-- ![Compliance results](../../../static/img/screenshots/compliance-results.png) -->

For each policy, you can see:
- **Overall score** — Percentage of rules that passed
- **Rule details** — Each rule with its status:
  - **Pass** — The rule condition was met
  - **Fail** — The rule condition was not met
  - **Error** — The rule could not be evaluated (e.g., data not available)
- **Severity breakdown** — Impact distribution of failed rules
- **Evaluation date** — When the evaluation was performed

## Score Calculation

The compliance score is displayed as a letter grade on the node:

| Score  | Grade | Color  |
|--------|-------|--------|
| 90-100 | A     | Green  |
| 80-89  | B     | Blue   |
| 70-79  | C     | Yellow |
| 60-69  | D     | Orange |
| 0-59   | F     | Red    |

:::tip
Schedule regular compliance evaluations using [Schedules](../schedules) to keep your scores up to date.
:::
