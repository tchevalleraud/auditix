---
sidebar_position: 2
---

# Compliance Policies

Policies group multiple compliance rules into a named audit standard. A node's compliance score is calculated from the policies assigned to it.

## Creating a Policy

1. Navigate to **Compliance > Policies** in the sidebar
2. Click **New policy**
3. Configure:
   - **Name** — The policy name (e.g., "Security Baseline", "PCI-DSS Network")
   - **Description** — What this policy covers

<!-- ![Create policy](../../../static/img/screenshots/compliance-policy-create.png) -->

## Adding Rules to a Policy

After creating a policy, add rules to it:

1. Open the policy detail page
2. Click **Add rule**
3. Select rules from the available list
4. Rules are evaluated in order when compliance is assessed

<!-- ![Policy rules](../../../static/img/screenshots/compliance-policy-rules.png) -->

## Assigning Policies to Nodes

Policies are assigned to nodes based on the node's configuration. When you trigger a compliance evaluation on a node, all applicable policies are evaluated.

## Import / Export

Policies can be exported and imported as JSON files, making it easy to share compliance standards across different Auditix instances:

- **Export** — Download a policy with all its rules as a JSON file
- **Import** — Upload a previously exported policy file

<!-- ![Policy import/export](../../../static/img/screenshots/compliance-policy-export.png) -->
