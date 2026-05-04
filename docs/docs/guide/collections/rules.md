---
sidebar_position: 2
---

# Collection Rules

Collection rules define how raw collection data is parsed and structured. They extract specific information from command outputs into organized, queryable fields.

## Creating a Rule

1. Navigate to **Collection Rules** in the sidebar
2. Click **New rule**
3. Configure:
   - **Name** — A descriptive name (e.g., "Parse interface status")
   - **Model** — The device model this rule applies to
   - **Command** — The collection command whose output to parse
   - **Regex** — The regular expression pattern to extract data

<!-- ![Create rule](../../../static/img/screenshots/rule-create.png) -->

## Regex Patterns

Rules use regular expressions with named capture groups to extract structured data from command output.

### Example

For a Cisco `show interfaces status` output:

```
Port      Name               Status       Vlan       Duplex  Speed Type
Gi1/0/1   Server-01          connected    10         a-full  a-1000 10/100/1000BaseTX
Gi1/0/2   Server-02          notconnect   10         auto    auto  10/100/1000BaseTX
```

A regex pattern like:

```regex
(?P<port>\S+)\s+(?P<name>\S+)\s+(?P<status>\S+)\s+(?P<vlan>\S+)\s+(?P<duplex>\S+)\s+(?P<speed>\S+)\s+(?P<type>.+)
```

This extracts each interface's details into named fields that can be used in compliance rules.

## Folder tree & duplication

Collection rules are organised in a foldable **tree** (folders and rules), drag-and-drop to reorder. Right-click a rule for **Duplicate** — the copy lands in the same folder with `(copy)` suffixed, ready to tweak. Folders themselves can be duplicated recursively.

:::info Screenshot expected
**File**: `static/img/screenshots/collections/rules-tree.png`
**Description**: Collection rules tree on the left (collapsible folders, rule rows with vendor pill on the right), main panel showing the selected rule editor with tabs **Definition**, **Conditions**, **Translations**, **Test**.
:::

## Conditions tab

A rule can be made conditional on dynamic tags or inventory data. Open the **Conditions** tab to add an AND/OR tree of conditions evaluated before the rule runs:

- node has tag `core`,
- inventory `interfaces` has any row with `oper_state = up`,
- model name matches `^ASR.*`.

Failing rules are skipped silently — useful when you maintain a single rule library across many vendors.

## Export & import

A rule (or a whole folder) can be exported to a YAML file:

```bash
GET /api/collection-rules/{id}/export   →  rule-{name}.yaml
GET /api/collection-rules/folders/{id}/export   →  folder-{name}.zip
```

Import the result back via **Rules → Import**. Imports are idempotent on the rule UUID embedded in the export.

## ZIP import for raw collections

If you already have command outputs collected outside Auditix (eg. with a script run during a maintenance window), upload them as a ZIP archive — see the [API endpoint](../../api/endpoints#collections). The optional `promptPattern` regex tells Auditix how to recognise CLI prompts so they can be stripped from the output before parsing:

```
^[a-zA-Z0-9._-]+#\s*$
```

The configurable prompt pattern lets you handle non-standard hostnames or vendor-specific prompts (`>`, `$`, `#`, multiline banners…).
