---
title: LLM providers
sidebar_position: 1
---

# LLM providers (admin) <AIBadge />

Global configuration screen for every LLM connection used by Auditix. Lives under **Admin → AI → LLM providers** and requires the `global_admin` role.

<Screenshot
  src="https://placehold.co/1280x600/f8fafc/4338ca/png?text=Admin+%E2%80%94+LLM+Providers+%E2%80%94+List&font=inter"
  alt="LLM providers list view"
  title="Admin · AI · LLM providers"
/>

## Provider types

| Type         | Default base URL                       | Auth     | Notes                                                   |
|--------------|----------------------------------------|----------|---------------------------------------------------------|
| OpenRouter   | `https://openrouter.ai/api/v1`         | API key  | Cheapest path to multiple model families.              |
| OpenAI       | `https://api.openai.com/v1`            | API key  | Use if your org already has OpenAI billing.            |
| Anthropic    | `https://api.anthropic.com/v1`         | API key  | Best for long-context analysis of large reports.       |
| Ollama       | `http://ollama:11434/v1`               | optional | Local; no data ever leaves your network.               |

API keys are encrypted at rest using the `APP_SECRET` envelope; rotating `APP_SECRET` requires re-saving every provider.

> **Stub** — full screenshots and a model-recommendation matrix will land here.
