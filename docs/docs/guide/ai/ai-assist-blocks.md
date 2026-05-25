---
title: AI Assist in reports
sidebar_position: 5
---

# AI Assist in report blocks <AIBadge />

Every **paragraph block** in PDF and mail reports has an **AI Assist** action that drafts content based on:

- the block's current text (used as a starting brief),
- the surrounding blocks in the same report (compliance matrix, lifecycle table, charts…),
- your context's [default assistant](./assistants).

<Screenshot
  src="https://placehold.co/1200x680/eef2ff/4f46e5/png?text=Paragraph+Block+%E2%80%94+AI+Assist+modal&font=inter"
  alt="Paragraph block editor with the AI Assist modal open"
  title="Reports · Paragraph block · AI Assist"
/>

## How it works

1. Click the ✨ button on a paragraph block.
2. Type a short brief (or leave it empty to use the block's current content).
3. The model receives the brief plus a structured summary of the report so far.
4. You preview the suggestion and either **insert** or **discard** it.

> Tools are **never** used by AI Assist — the brief and the surrounding-blocks summary is all the context the model gets. This keeps drafting fast and cheap.

See the [AI-assisted recommendations use case](/usecase/ai-assisted-recommendations) for an end-to-end walkthrough.
