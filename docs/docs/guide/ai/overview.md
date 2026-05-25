---
title: AI overview
sidebar_position: 1
---

# AI overview <AIBadge />

Auditix 5.0 introduces an **AI layer** that sits next to every part of the platform: a side-panel chat, AI-assisted writing in reports, and (optionally) read-only tool use so the assistant can answer questions grounded in *your* network — not its training data.

<Screenshot
  src="https://placehold.co/1280x680/0f172a/c4b5fd/png?text=Auditix+AI+%E2%80%94+Architecture+overview&font=inter"
  alt="Auditix AI architecture: providers, assistants, tools, anonymization"
  title="Architecture"
  caption="LLM providers feed assistants, which optionally call read-only tools through an anonymisation layer"
/>

## How it works

Auditix has three independent building blocks. You configure them once, then point assistants at them.

<FeatureGrid>
  <FeatureCard
    icon="🔌"
    title="LLM providers"
    description="Global connections to OpenRouter, OpenAI, Anthropic or a local Ollama instance. API keys are encrypted at rest."
    to="/admin/ai/llm-providers"
  />
  <FeatureCard
    icon="🤖"
    title="Assistants"
    description="Context-scoped personalities: name, system prompt, model and tool-use flag. Many assistants can share one provider."
    to="/guide/ai/assistants"
  />
  <FeatureCard
    icon="🛠"
    title="Tools"
    description="Optional read-only data accessors (list nodes, query compliance, etc.). Results are anonymised before reaching cloud LLMs."
    to="/guide/ai/tools"
  />
</FeatureGrid>

## Where you'll meet the AI

### In the side panel

Every authenticated page has an AI side panel. Pick an assistant, ask a question — the assistant answers using its system prompt and, if tools are enabled, by calling them in turn.

<Screenshot
  src="https://placehold.co/1100x620/1e1b4b/c7d2fe/png?text=AI+Side+Panel+%E2%80%94+Chat+with+tool+calls&font=inter"
  alt="Side panel showing a chat with a tool-call trace"
  title="AI side panel"
/>

### In reports

PDF and mail report blocks have an **AI Assist** action that drafts paragraphs in your house style based on the surrounding blocks (compliance matrix, lifecycle table, etc.). See the [AI Assist in reports](./ai-assist-blocks) page.

### Behind the scenes

Each AI call is logged to the audit log: who asked, which assistant, which provider, token usage. No prompts or completions are persisted unless you opt in.

## Privacy & anonymisation

When **tool use** is enabled, results from read-only tools are passed through an anonymisation pipeline before being sent to the LLM. Hostnames, IPs, serial numbers and OIDC subjects are replaced with stable opaque tokens (`node-1`, `ip-2`, …) inside the request. The assistant sees the *shape* of your data, not the data itself.

> :::info Local-first option
> If you must keep everything on-prem, configure an **Ollama** provider pointing at a self-hosted model — the anonymisation layer still runs, and no request ever leaves your network.
> :::

## Quick-start

<Steps>
  <Step title="Register a provider">
    Go to **Admin → AI → LLM providers** and add at least one provider. Most users start with OpenRouter for breadth of models, or Anthropic for Claude. Paste your API key — it is encrypted before being stored.
  </Step>
  <Step title="Create an assistant">
    In your context, go to **Settings → AI → Assistants** and create one. Pick the provider, override the model if needed, and write a short system prompt. Toggle **tool use** if you want grounded answers.
  </Step>
  <Step title="Ask your first question">
    Open the AI side panel from the top bar. Select your assistant and try: *"How many switches are non-compliant with policy 'Cisco IOS baseline'?"*
  </Step>
</Steps>

## Recommended use cases

- [AI-assisted recommendations in a report](/usecase/ai-assisted-recommendations) — let the AI draft remediation paragraphs.
- [Chat with your network](/usecase/ai-network-chat) — natural-language inventory queries.

## Next pages

- [LLM providers](/admin/ai/llm-providers) — configure the global pool.
- [Assistants](./assistants) — per-context personalities.
- [Tools](./tools) — what the assistant can read, and what it cannot.
- [AI Assist in reports](./ai-assist-blocks) — paragraph drafting in PDF / mail blocks.
