---
sidebar_position: 1
---

# Compliance Rules

Compliance rules define individual checks that evaluate whether a node meets a specific requirement.

## Creating a Rule

1. Navigate to **Compliance > Rules** in the sidebar
2. Click **New rule**
3. Configure:
   - **Name** — A descriptive name (e.g., "SSH version 2 enabled")
   - **Identifier** — An optional reference code (e.g., "SEC-001")
   - **Description** — What this rule checks and why
   - **Severity** — The impact level: Critical, High, Medium, Low, Info

<!-- ![Create compliance rule](../../../static/img/screenshots/compliance-rule-create.png) -->

## Data Sources

Each rule needs one or more data sources to evaluate. Auditix supports three types:

### Collection Source

Uses data from automated collections. Select:
- **Command** — Which collection command output to analyze
- **Tag** — Filter by collection tag
- **Regex** — Pattern to extract the specific value
- **Result mode** — How to interpret the regex result

### SSH Source

Connects directly to the device and runs a command in real-time.

### Inventory Source

Uses data from the node's hardware/software inventory.

## Condition Tree

The condition tree defines the logic that determines if a rule passes or fails. You can build complex conditions using:

- **AND / OR** logical operators
- **Comparison operators**: equals, not equals, contains, matches regex, greater than, less than, etc.
- **Nested blocks** for complex logic

<!-- ![Condition tree](../../../static/img/screenshots/compliance-rule-conditions.png) -->

### Example

To check that SSH version 2 is enabled on a Cisco device:

1. **Data source**: Collection command `show running-config`
2. **Regex**: `ip ssh version (?P<version>\d+)`
3. **Condition**: `version` equals `2`

## Testing a Rule

You can test a rule against a specific node before adding it to a policy:

1. Click the **Test** button on the rule editor
2. Select a target node
3. View the result: pass, fail, or error with details

<!-- ![Rule test](../../../static/img/screenshots/compliance-rule-test.png) -->
