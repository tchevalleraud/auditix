"use client";

import { useEffect, useState } from "react";
import { Loader2, Sparkles, X, RotateCcw, Check } from "lucide-react";

export interface AiAssistantOption {
  id: number;
  name: string;
  providerName?: string;
  effectiveModel?: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  assistants: AiAssistantOption[];
  onInsert: (html: string) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

export default function AiAssistParagraphModal({ open, onClose, assistants, onInsert, t }: Props) {
  const [assistantId, setAssistantId] = useState<number | null>(null);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAssistantId((prev) => {
      if (prev !== null && assistants.some((a) => a.id === prev)) return prev;
      return assistants[0]?.id ?? null;
    });
  }, [open, assistants]);

  useEffect(() => {
    if (!open) {
      setPrompt("");
      setResult(null);
      setError(null);
      setGenerating(false);
    }
  }, [open]);

  if (!open) return null;

  const generate = async () => {
    if (!assistantId || !prompt.trim() || generating) return;
    setGenerating(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/ai/generate-paragraph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId, prompt: prompt.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setResult(String(data.content ?? ""));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGenerating(false);
    }
  };

  const insert = () => {
    if (!result) return;
    onInsert(result);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] flex flex-col rounded-xl bg-white dark:bg-slate-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("structure.aiAssistTitle")}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {assistants.length > 1 && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t("structure.aiAssistant")}
              </label>
              <select
                value={assistantId ?? ""}
                onChange={(e) => setAssistantId(Number(e.target.value))}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                {assistants.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                    {a.effectiveModel ? ` — ${a.effectiveModel}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
              {t("structure.aiPromptLabel")}
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t("structure.aiPromptPlaceholder")}
              rows={5}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-500"
              autoFocus
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  generate();
                }
              }}
            />
            <p className="text-[11px] text-slate-400">{t("structure.aiPromptHint")}</p>
          </div>

          {error && (
            <div className="rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-xs text-red-700 dark:text-red-300">
              {error}
            </div>
          )}

          {result && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-300">
                {t("structure.aiPreview")}
              </label>
              <div
                className="prose prose-sm dark:prose-invert max-w-none rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3.5 py-2.5 text-sm overflow-y-auto max-h-64"
                dangerouslySetInnerHTML={{ __html: result }}
              />
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 rounded-b-xl">
          <button
            onClick={onClose}
            className="rounded-md px-3 py-1.5 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700"
          >
            {t("structure.cancel")}
          </button>
          <div className="flex items-center gap-2">
            {result && !generating && (
              <button
                onClick={generate}
                disabled={!prompt.trim() || !assistantId}
                className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-50"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                {t("structure.aiRegenerate")}
              </button>
            )}
            {!result && (
              <button
                onClick={generate}
                disabled={!prompt.trim() || !assistantId || generating}
                className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    {t("structure.aiGenerating")}
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    {t("structure.aiGenerate")}
                  </>
                )}
              </button>
            )}
            {result && (
              <button
                onClick={insert}
                className="inline-flex items-center gap-1.5 rounded-md bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700"
              >
                <Check className="h-3.5 w-3.5" />
                {t("structure.aiInsert")}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
