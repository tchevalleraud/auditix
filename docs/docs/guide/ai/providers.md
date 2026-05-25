---
title: LLM providers (concepts)
sidebar_position: 2
---

# LLM providers <AIBadge />

> Concepts page — for the actual configuration UI see [Admin → LLM providers](/admin/ai/llm-providers).

Auditix talks to LLMs through pluggable **providers**. Four types are supported in 5.0.

| Type         | Hosted? | When to pick it                                                    |
|--------------|---------|---------------------------------------------------------------------|
| OpenRouter   | Cloud   | Widest model catalogue, one key for everything.                    |
| OpenAI       | Cloud   | If your org already has OpenAI billing.                            |
| Anthropic    | Cloud   | Best for long-context analysis of large reports.                   |
| Ollama       | Local   | Air-gapped or strict no-cloud policies.                            |

<Screenshot
  src="https://placehold.co/1100x520/eef2ff/4338ca/png?text=LLM+Providers+%E2%80%94+Configuration+screen&font=inter"
  alt="LLM providers admin screen"
  title="Admin · LLM providers"
/>

This page documents what each provider type *is*. The how-to lives in [Admin → LLM providers](/admin/ai/llm-providers).
