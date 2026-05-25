---
title: What's new in 5.0
sidebar_position: 2
---

# What's new in 5.0 — *AI Edition*

Auditix 5.0 is the first release with an AI layer baked in.

<FeatureGrid>
  <FeatureCard
    icon="🧠"
    title="AI side-panel assistant"
    description="Ask your network in plain English. Optional read-only tool use, anonymisation built in."
    to="/guide/ai/overview"
    ai
  />
  <FeatureCard
    icon="✍️"
    title="AI Assist in report paragraphs"
    description="One-click drafting of remediation, summary and intro paragraphs in PDF/mail reports."
    to="/guide/ai/ai-assist-blocks"
    ai
  />
  <FeatureCard
    icon="🔌"
    title="Four provider types"
    description="OpenRouter, OpenAI, Anthropic and Ollama (local). Encrypted at rest."
    to="/admin/ai/llm-providers"
    ai
  />
  <FeatureCard
    icon="🗺"
    title="Custom schemas in reports"
    description="Embeddable Excalidraw-style schemas you can draw and drop into any report."
    to="/guide/reports/blocks"
  />
  <FeatureCard
    icon="🛡"
    title="Improved collection rules"
    description="Always-blocking match, keyMode=all, named captures and block key templates."
    to="/guide/collections/rules"
  />
  <FeatureCard
    icon="🧹"
    title="Legacy topology v1 removed"
    description="The legacy stack is gone; v2 is the only path forward. Lighter, faster, cleaner."
    to="/guide/topology/overview"
  />
</FeatureGrid>

## Upgrade path

If you're on 4.3.x, `make upgrade` is enough. See the [upgrade guide](https://github.com/tchevalleraud/auditix/blob/main/docs/UPGRADE.md) for older versions.

> :::warning AI is opt-in
> Even with the upgrade, no AI feature is active until you register at least one [LLM provider](/admin/ai/llm-providers).
> :::
