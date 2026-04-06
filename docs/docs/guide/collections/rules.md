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
