---
title: AI-assisted recommendations
sidebar_position: 5
---

# AI-assisted recommendations in a compliance report <AIBadge />

Use **AI Assist** to draft remediation paragraphs in your PDF compliance reports. The model reads the surrounding blocks (compliance matrix, status table…) and produces a paragraph that matches your house style.

<UseCaseHero
  duration="15 minutes"
  difficulty="Beginner"
  prerequisites="An LLM provider configured (admin) + 1 evaluated compliance policy"
  outcome="A PDF report with auto-drafted remediation paragraphs, ready to mail"
/>

<Screenshot
  src="https://placehold.co/1280x680/1e1b4b/c7d2fe/png?text=PDF+Report+%E2%80%94+AI+drafted+remediation+paragraph&font=inter"
  alt="PDF report preview with the AI-drafted paragraph highlighted"
  title="Final result · PDF preview"
  caption="The shaded paragraph was drafted by the AI Assist action — you edited it down and signed off"
/>

## What you'll do

<Steps>
  <Step title="Register an LLM provider (admin)">
    Sign in as a global admin, go to **Admin → AI → LLM providers**, then **+ Add provider**.

    - **Name** — `OpenRouter (default)`
    - **Type** — `OpenRouter`
    - **Base URL** — `https://openrouter.ai/api/v1` (pre-filled)
    - **API key** — paste yours; it is encrypted at rest.
    - **Default model** — e.g. `anthropic/claude-sonnet-4.6`

    Save. The provider appears as **Enabled** in the table.

    <Screenshot
      src="https://placehold.co/1100x560/f8fafc/4338ca/png?text=Step+1+%E2%80%94+Add+OpenRouter+provider&font=inter"
      alt="Add OpenRouter provider form"
      title="Admin · LLM providers · New"
    />
  </Step>

  <Step title="Create the default assistant in your context">
    Switch to your context, then **Settings → AI → Assistants → + New assistant**.

    - **Name** — `Compliance writer`
    - **Provider** — `OpenRouter (default)`
    - **Model** — leave blank (uses provider default)
    - **Tool use** — **off** (drafting doesn't need data calls)
    - **System prompt** — paste:

      ```
      You are the compliance writer for our NOC. Draft concise, neutral
      remediation paragraphs in English. Reference findings by their rule
      name. No bullet points unless explicitly asked. Maximum 4 sentences.
      ```

    Save. Mark this assistant as **default** for the context — the AI Assist action will pick it up automatically.

    <Screenshot
      src="https://placehold.co/1100x600/eef2ff/6366f1/png?text=Step+2+%E2%80%94+Assistant+%22Compliance+writer%22&font=inter"
      alt="Assistant edit form, Compliance writer"
      title="Settings · AI · Assistants"
    />
  </Step>

  <Step title="Open the report and add a paragraph block">
    Go to **Reports → PDF reports**, open your monthly compliance report (or create one). Find the section where you want the recommendation. Click **+ Add block → Paragraph**.

    Type a one-line brief in the block, e.g.:

    > *Remediation guidance for IOS SSH baseline non-compliance.*

    This becomes the **prompt** the AI receives, on top of a summary of the previous blocks.

    <Screenshot
      src="https://placehold.co/1280x600/ffffff/4f46e5/png?text=Step+3+%E2%80%94+Paragraph+block+with+brief&font=inter"
      alt="Paragraph block with a one-line brief typed in"
      title="Reports · Paragraph block"
    />
  </Step>

  <Step title="Trigger AI Assist">
    Click the ✨ **AI Assist** button on the block. A modal opens.

    The modal shows you:
    - the selected assistant (your `Compliance writer`),
    - the *brief* (your one-liner),
    - the *context bundle* — a compact summary of the report so far.

    Hit **Generate**. Wait 2–3 seconds.

    <Screenshot
      src="https://placehold.co/1100x620/1e1b4b/c4b5fd/png?text=Step+4+%E2%80%94+AI+Assist+modal+generating&font=inter"
      alt="AI Assist modal, generating state"
      title="AI Assist · Generating"
    />
  </Step>

  <Step title="Review, tweak, insert">
    You get a draft. Read it. If it's off, click **Regenerate** — the model gets the same context but a fresh seed. If only one sentence is wrong, edit it in place. Hit **Insert** to replace the block's content.

    > :::tip
    > AI Assist is **non-destructive**. The original brief is preserved in the block's history (`...` menu → *Revert to original*) for as long as you don't save the report.
    > :::

    <Screenshot
      src="https://placehold.co/1100x620/eef2ff/4338ca/png?text=Step+5+%E2%80%94+Draft+ready%2C+insert+or+regenerate&font=inter"
      alt="AI Assist draft ready to insert"
      title="AI Assist · Draft"
    />
  </Step>

  <Step title="Repeat for every recommendation, then export">
    Do the same for each finding. When the report is ready, click **Generate PDF**. Auditix renders it server-side using your context's theme — including the AI-drafted paragraphs verbatim, no marker added.

    For a recurring run, schedule it from the report's **Schedule** tab and add mail recipients in **Mail reports**. The AI Assist drafts you inserted are **frozen at insert time** — they will not be regenerated when the schedule fires.
  </Step>
</Steps>

## ✅ What you achieved

- An OpenRouter (or other) provider registered globally and encrypted at rest.
- A reusable *Compliance writer* assistant scoped to your context.
- A compliance PDF with AI-drafted remediation paragraphs.
- A scheduled mail-out that uses the frozen text — predictable, reviewable, auditable.

## 🔗 Going further

- [Chat with your network](/usecase/ai-network-chat) — turn **tool use** on for a different assistant and ask live inventory questions.
- [Monthly PDF report](/usecase/monthly-pdf-report) — the broader walkthrough this use case plugs into.
- [LLM providers admin](/admin/ai/llm-providers) — full reference of provider types, env vars, model defaults.
- [Tools & anonymisation](/guide/ai/tools) — what the AI sees when tool use is enabled, and what it never sees.
