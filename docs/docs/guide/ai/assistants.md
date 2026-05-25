---
title: Assistants
sidebar_position: 3
---

# Assistants <AIBadge />

An **assistant** is a context-scoped personality built on top of a [provider](./providers). Each assistant has:

- a name shown in the side panel,
- a system prompt (the "role" you give the LLM),
- an optional model override (otherwise the provider's default is used),
- a tool-use toggle.

<Screenshot
  src="https://placehold.co/1100x600/f8fafc/6366f1/png?text=Assistants+%E2%80%94+Edit+form&font=inter"
  alt="Assistant edit form"
  title="Context settings · Assistants"
/>

## When to create more than one

You can have as many assistants as you want per context. Common patterns:

- **General-purpose** — short system prompt, no tools, used in the side panel.
- **Compliance reviewer** — system prompt tuned for short remediation paragraphs in PDF reports, tools off.
- **Network analyst** — tools **on**, system prompt focused on inventory questions.

> This stub explains the concept. Full configuration walkthrough lives in the [AI-assisted recommendations use case](/usecase/ai-assisted-recommendations).
