---
title: Tools & anonymisation
sidebar_position: 4
---

# Tools & anonymisation <AIBadge />

When an assistant has **tool use** enabled, the LLM can call a small set of read-only tools to ground its answer in your data.

## What tools can do

- List nodes (with filters).
- Query compliance results for a policy / node.
- Look up inventory categories.
- Read lifecycle state (EoS / EoSM / EoL).

## What tools cannot do

- Write anything. No tool mutates state.
- Read credentials or API keys.
- Bypass context scoping — an assistant only sees the context it lives in.

## Anonymisation pipeline

Every tool result passes through an anonymiser before it's appended to the LLM request:

| Field type        | Becomes        |
|-------------------|----------------|
| Hostname          | `node-{id}`    |
| IPv4 / IPv6       | `ip-{id}`      |
| Serial number     | `serial-{id}`  |
| MAC address       | `mac-{id}`     |
| OIDC subject      | `user-{id}`    |

The mapping is **per-conversation** and discarded at the end. The assistant's answer is then de-anonymised before reaching your screen, so you see real values.

> This is a stub. A full reference of every tool name, its parameters and its output schema will land here.
