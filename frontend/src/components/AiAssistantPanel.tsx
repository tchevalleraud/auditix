"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Bot,
  Check,
  Cpu,
  History,
  Loader2,
  MessageSquarePlus,
  Send,
  ShieldAlert,
  Sparkles,
  Trash2,
  Wrench,
  X,
  ChevronDown,
  AlertTriangle,
  ArrowLeft,
} from "lucide-react";

interface Assistant {
  id: number;
  name: string;
  contextId: number;
  contextName: string;
  providerId: number;
  providerName: string;
  providerType: string;
  model: string | null;
  effectiveModel: string | null;
  enabled: boolean;
}

interface Conversation {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  assistantId: number;
}

interface Message {
  id: number;
  role: "user" | "assistant" | "system" | "tool_call" | "tool";
  content: string;
  metadata?: {
    tool_calls?: { id: string; name: string; arguments: Record<string, unknown> }[];
    tool_call_id?: string;
    name?: string;
  } | null;
  createdAt: string;
}

interface PendingToolResult {
  toolCallId: string;
  name: string;
  arguments: Record<string, unknown>;
  /** JSON-encoded payload that *would* be sent to the LLM if approved. */
  content: string;
}

interface PendingApproval {
  messageId: number | null;
  /** Tool results staged locally, awaiting user approval to be sent. */
  results: PendingToolResult[];
}

interface FullConversation extends Conversation {
  messages: Message[];
  autoApproveTools: boolean;
  pending: PendingApproval | null;
}

/**
 * Right-side slide-over chat panel.
 *
 * Two views inhabit the same body area: the chat (default) and the
 * conversation history (toggled by the History button in the header).
 * Swapping in-place — rather than stacking the history above the chat —
 * keeps the layout calm and gives each view the full vertical real estate.
 */
export function AiAssistantPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useI18n();
  const { current } = useAppContext();

  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [activeAssistantId, setActiveAssistantId] = useState<number | null>(null);
  const [assistantPickerOpen, setAssistantPickerOpen] = useState(false);

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversation, setActiveConversation] = useState<FullConversation | null>(null);
  const [pendingMessage, setPendingMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [resuming, setResuming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingConv, setLoadingConv] = useState(false);
  const [view, setView] = useState<"chat" | "history">("chat");
  const messagesRef = useRef<HTMLDivElement>(null);

  const activeAssistant = useMemo(
    () => assistants.find((a) => a.id === activeAssistantId) ?? null,
    [assistants, activeAssistantId],
  );

  useEffect(() => {
    if (!open || !current) {
      setAssistants([]);
      setActiveAssistantId(null);
      return;
    }
    (async () => {
      const res = await fetch(`/api/ai/assistants?context=${current.id}`);
      if (res.ok) {
        const data: Assistant[] = await res.json();
        setAssistants(data);
        setActiveAssistantId((prev) => {
          if (prev !== null && data.some((a) => a.id === prev)) return prev;
          return data[0]?.id ?? null;
        });
      }
    })();
  }, [open, current]);

  const loadConversations = useCallback(async () => {
    if (!activeAssistantId) {
      setConversations([]);
      return;
    }
    const res = await fetch(`/api/ai/conversations?assistant=${activeAssistantId}`);
    if (res.ok) setConversations(await res.json());
    else setConversations([]);
  }, [activeAssistantId]);

  useEffect(() => {
    if (!open) return;
    loadConversations();
  }, [open, loadConversations]);

  useEffect(() => {
    setActiveConversation(null);
    setError(null);
    setView("chat");
  }, [activeAssistantId]);

  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [activeConversation?.messages.length, sending]);

  const openConversation = async (id: number) => {
    setLoadingConv(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/conversations/${id}`);
      if (res.ok) setActiveConversation(await res.json());
    } finally {
      setLoadingConv(false);
    }
  };

  const deleteConversation = async (id: number) => {
    if (!confirm(t("ai.confirmDeleteConversation"))) return;
    await fetch(`/api/ai/conversations/${id}`, { method: "DELETE" });
    if (activeConversation?.id === id) setActiveConversation(null);
    await loadConversations();
  };

  const resume = async (action: "approve" | "reject", autoApprove = false) => {
    if (!activeConversation?.id || resuming) return;
    setResuming(true);
    setError(null);
    try {
      const res = await fetch(`/api/ai/conversations/${activeConversation.id}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, autoApprove }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      await openConversation(activeConversation.id);
      await loadConversations();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setResuming(false);
    }
  };

  const send = async () => {
    if (!activeAssistantId || !pendingMessage.trim() || sending) return;
    const content = pendingMessage.trim();
    setSending(true);
    setError(null);

    const optimisticUserMsg: Message = {
      id: -Date.now(),
      role: "user",
      content,
      createdAt: new Date().toISOString(),
    };
    if (activeConversation) {
      setActiveConversation({ ...activeConversation, messages: [...activeConversation.messages, optimisticUserMsg] });
    } else {
      setActiveConversation({
        id: 0,
        title: content.slice(0, 60),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        assistantId: activeAssistantId,
        messages: [optimisticUserMsg],
        autoApproveTools: false,
        pending: null,
      });
    }
    setPendingMessage("");

    try {
      const res = await fetch(`/api/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assistantId: activeAssistantId,
          content,
          conversationId: activeConversation?.id && activeConversation.id > 0 ? activeConversation.id : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      await openConversation(data.conversationId);
      await loadConversations();
    } catch (e: any) {
      setError(e?.message ?? String(e));
      if (activeConversation) {
        setActiveConversation({
          ...activeConversation,
          messages: activeConversation.messages.filter((m) => m.id !== optimisticUserMsg.id),
        });
      } else {
        setActiveConversation(null);
      }
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view === "history") setView("chat");
        else onClose();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, view]);

  // See Topbar: backdrop-filter on the header creates a containing block,
  // so a portal is required for `position: fixed` to anchor on the viewport.
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex" aria-modal="true" role="dialog">
      <div className="flex-1 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative flex h-full w-[40%] min-w-[420px] max-w-[960px] flex-col overflow-hidden border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-2xl">
        {/* Subtle ambient gradient glow at the top — gives the panel a
            visual anchor to the AI brand color (same family as the topbar
            button) without overwhelming the content. */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 h-48 w-[120%] bg-gradient-to-b from-fuchsia-500/15 via-indigo-500/10 to-transparent blur-2xl"
        />

        {/* Header */}
        <header className="relative flex items-center justify-between gap-3 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-950/60 backdrop-blur px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="relative">
              <div className="rounded-xl bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-pink-500 p-1.5 shadow-lg shadow-fuchsia-500/30">
                <Sparkles className="h-4 w-4 text-white" />
              </div>
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">{t("ai.title")}</h2>
              {current && (
                <p className="text-[11px] text-slate-500 dark:text-slate-500 leading-tight truncate">{current.name}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setView((v) => (v === "history" ? "chat" : "history"))}
              title={t("ai.history")}
              aria-pressed={view === "history"}
              className={`relative flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                view === "history"
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                  : "text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200"
              }`}
            >
              <History className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t("ai.history")}</span>
              {conversations.length > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  view === "history"
                    ? "bg-white/20 text-white dark:bg-slate-900/20 dark:text-slate-900"
                    : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                }`}>
                  {conversations.length}
                </span>
              )}
            </button>
            <button
              onClick={onClose}
              title={t("common.close")}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        {view === "chat" ? (
          <>
            <AssistantPickerSection
              assistants={assistants}
              activeAssistant={activeAssistant}
              activeAssistantId={activeAssistantId}
              setActiveAssistantId={setActiveAssistantId}
              pickerOpen={assistantPickerOpen}
              setPickerOpen={setAssistantPickerOpen}
              onNewConversation={() => {
                setActiveConversation(null);
                setError(null);
              }}
              t={t}
            />

            {/* Messages */}
            <div ref={messagesRef} className="relative flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {!activeAssistantId ? (
                <EmptyState
                  icon={<Bot className="h-10 w-10" />}
                  label={t("ai.noAssistantsConfigured")}
                />
              ) : loadingConv ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : !activeConversation || activeConversation.messages.length === 0 ? (
                <SuggestStartCard assistant={activeAssistant} t={t} />
              ) : (
                activeConversation.messages.map((m) => <MessageBubble key={m.id} m={m} t={t} />)
              )}
              {sending && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800 px-3.5 py-2 text-sm text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span className="text-xs">{t("ai.thinking")}</span>
                  </div>
                </div>
              )}
              {activeConversation?.pending && !sending && (
                <ApprovalCard
                  pending={activeConversation.pending}
                  autoApprove={activeConversation.autoApproveTools}
                  resuming={resuming}
                  onApprove={(autoApprove) => resume("approve", autoApprove)}
                  onReject={() => resume("reject")}
                  t={t}
                />
              )}
              {error && (
                <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="break-words">{error}</span>
                </div>
              )}
            </div>

            <Composer
              value={pendingMessage}
              onChange={setPendingMessage}
              onSend={send}
              disabled={!activeAssistantId || sending || !!activeConversation?.pending}
              placeholder={activeConversation?.pending ? t("ai.awaitingApproval") : t("ai.composerPlaceholder")}
              t={t}
            />
          </>
        ) : (
          <HistoryView
            conversations={conversations}
            activeId={activeConversation?.id ?? null}
            onPick={async (id) => {
              await openConversation(id);
              setView("chat");
            }}
            onDelete={deleteConversation}
            onBack={() => setView("chat")}
            t={t}
          />
        )}
      </aside>
    </div>,
    document.body,
  );
}

/* ──────────────────────────────────────────────────────────────────────────
 * Sub-components
 * ────────────────────────────────────────────────────────────────────── */

/**
 * Top section of the chat view: assistant picker + a "new conversation"
 * shortcut. The picker is a dropdown that shows the current assistant with
 * a small provider chip, model badge, and "tools" indicator if applicable.
 */
function AssistantPickerSection({
  assistants,
  activeAssistant,
  activeAssistantId,
  setActiveAssistantId,
  pickerOpen,
  setPickerOpen,
  onNewConversation,
  t,
}: {
  assistants: Assistant[];
  activeAssistant: Assistant | null;
  activeAssistantId: number | null;
  setActiveAssistantId: (id: number) => void;
  pickerOpen: boolean;
  setPickerOpen: (fn: (v: boolean) => boolean) => void;
  onNewConversation: () => void;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  return (
    <div className="relative border-b border-slate-200/80 dark:border-slate-800/80 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          disabled={assistants.length === 0}
          className="group flex flex-1 items-center gap-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-2.5 py-2 text-left hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 disabled:cursor-not-allowed disabled:opacity-60 transition-colors"
        >
          <ProviderAvatar type={activeAssistant?.providerType} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                {activeAssistant?.name ?? t("ai.pickAssistant")}
              </span>
            </div>
            {activeAssistant && (
              <div className="mt-0.5 flex items-center gap-1 flex-wrap">
                <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-400">
                  {activeAssistant.effectiveModel ?? activeAssistant.providerName}
                </code>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 capitalize">
                  · {activeAssistant.providerType}
                </span>
              </div>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
        </button>
        <button
          onClick={onNewConversation}
          title={t("ai.newConversation")}
          className="flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-2.5 py-2 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-900 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <MessageSquarePlus className="h-4 w-4" />
        </button>
      </div>
      {pickerOpen && (
        <div className="absolute left-3 right-3 top-full mt-1 z-20 max-h-80 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
          {assistants.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-500 dark:text-slate-400">{t("ai.noAssistantsConfigured")}</div>
          ) : (
            assistants.map((a) => (
              <button
                key={a.id}
                onClick={() => {
                  setActiveAssistantId(a.id);
                  setPickerOpen(() => false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                  activeAssistantId === a.id ? "bg-slate-50 dark:bg-slate-800" : ""
                }`}
              >
                <ProviderAvatar type={a.providerType} />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm truncate ${activeAssistantId === a.id ? "font-semibold text-slate-900 dark:text-slate-100" : "font-medium text-slate-700 dark:text-slate-200"}`}>
                    {a.name}
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                    <code className="rounded bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-mono text-slate-600 dark:text-slate-400">
                      {a.effectiveModel ?? a.providerName}
                    </code>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 capitalize">{a.providerType}</span>
                  </div>
                </div>
                {activeAssistantId === a.id && (
                  <Check className="h-4 w-4 text-emerald-500 shrink-0" />
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Small square avatar identifying the LLM provider. The accent gradient
 * mirrors each vendor's identity (purple-pink Anthropic, green OpenAI,
 * indigo-blue OpenRouter as a router/aggregator, slate Ollama for
 * on-prem). Falls back to a generic Cpu icon if the type is unknown.
 */
function ProviderAvatar({ type }: { type: string | null | undefined }) {
  const tone = (() => {
    switch (type) {
      case "anthropic": return "from-orange-500 to-amber-400";
      case "openai": return "from-emerald-500 to-teal-400";
      case "openrouter": return "from-indigo-500 to-violet-500";
      case "ollama": return "from-slate-600 to-slate-500";
      default: return "from-slate-500 to-slate-400";
    }
  })();
  return (
    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br ${tone} text-white shadow-sm`}>
      <Cpu className="h-4 w-4" />
    </div>
  );
}

/**
 * Empty-state suggestion shown when the user starts a fresh conversation
 * with an assistant. Surfaces the assistant identity + a hint to type
 * something, rather than a bare canvas.
 */
function SuggestStartCard({ assistant, t }: { assistant: Assistant | null; t: (k: string, v?: Record<string, string>) => string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-pink-500 blur-xl opacity-40" />
        <div className="relative rounded-2xl bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-pink-500 p-3 shadow-lg">
          <Sparkles className="h-6 w-6 text-white" />
        </div>
      </div>
      <div>
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">{assistant?.name ?? t("ai.title")}</p>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 max-w-xs">{t("ai.startTyping")}</p>
      </div>
    </div>
  );
}

/**
 * Renders a single message bubble. Handles five roles:
 * - user / assistant: classic chat bubbles
 * - tool_call: a compact pill listing the requested tool(s)
 * - tool: a collapsed result block (kept tight to avoid burying the chat)
 * - system: dimmed metadata line (rare here)
 */
function MessageBubble({ m, t }: { m: Message; t: (k: string, v?: Record<string, string>) => string }) {
  if (m.role === "tool_call") {
    const calls = m.metadata?.tool_calls ?? [];
    return (
      <div className="flex justify-start">
        <div className="flex flex-wrap gap-1.5">
          {calls.map((c) => (
            <span
              key={c.id}
              title={JSON.stringify(c.arguments)}
              className="inline-flex items-center gap-1 rounded-full bg-indigo-50 dark:bg-indigo-500/10 px-2.5 py-1 text-[11px] font-medium text-indigo-700 dark:text-indigo-300 ring-1 ring-inset ring-indigo-500/20"
            >
              <Wrench className="h-3 w-3" />
              {c.name}
            </span>
          ))}
        </div>
      </div>
    );
  }
  if (m.role === "tool") {
    return (
      <div className="flex justify-start">
        <details className="max-w-[85%] rounded-lg bg-slate-50 dark:bg-slate-800/50 px-2.5 py-1 text-xs text-slate-500 dark:text-slate-400">
          <summary className="cursor-pointer select-none">
            {t("ai.toolResultFor", { name: m.metadata?.name ?? "tool" })}
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[11px] text-slate-600 dark:text-slate-300">
            {m.content}
          </pre>
        </details>
      </div>
    );
  }
  if (m.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl rounded-br-md bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-pink-500 px-3.5 py-2 text-sm text-white shadow-sm shadow-fuchsia-500/20 whitespace-pre-wrap break-words">
          {m.content}
        </div>
      </div>
    );
  }
  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-slate-100 dark:bg-slate-800/80 px-3.5 py-2 text-sm text-slate-900 dark:text-slate-100 shadow-sm break-words">
        <AssistantMarkdown content={m.content} />
      </div>
    </div>
  );
}

/**
 * Bottom composer. Auto-grows up to a max height, sends on Enter (not
 * Shift+Enter), and shows a gradient send button when there's content.
 */
function Composer({
  value,
  onChange,
  onSend,
  disabled,
  placeholder,
  t,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  placeholder: string;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  const trimmed = value.trim();
  return (
    <form
      className="border-t border-slate-200/80 dark:border-slate-800/80 px-3 py-3 bg-white/60 dark:bg-slate-950/60 backdrop-blur"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <div className="flex items-end gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus-within:border-slate-400 dark:focus-within:border-slate-500 focus-within:ring-2 focus-within:ring-slate-400/20 transition-colors px-2 py-1.5">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              onSend();
            }
          }}
          rows={1}
          placeholder={placeholder}
          disabled={disabled}
          className="flex-1 resize-none bg-transparent px-1.5 py-1 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none disabled:opacity-50"
          style={{ maxHeight: 200 }}
        />
        <button
          type="submit"
          disabled={disabled || !trimmed}
          aria-label={t("ai.send")}
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all ${
            trimmed && !disabled
              ? "bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-pink-500 text-white shadow-md shadow-fuchsia-500/30 hover:scale-105"
              : "bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
          }`}
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

/**
 * Full-height history view that replaces the chat body when the user
 * toggles the History button. Plain list with click-to-open and a delete
 * affordance per row.
 */
function HistoryView({
  conversations,
  activeId,
  onPick,
  onDelete,
  onBack,
  t,
}: {
  conversations: Conversation[];
  activeId: number | null;
  onPick: (id: number) => void;
  onDelete: (id: number) => void;
  onBack: () => void;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-slate-200/80 dark:border-slate-800/80 px-3 py-2">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t("common.back")}
        </button>
        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">{t("ai.history")}</span>
        {conversations.length > 0 && (
          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-400">
            {conversations.length}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto">
        {conversations.length === 0 ? (
          <EmptyState icon={<History className="h-8 w-8" />} label={t("ai.noConversations")} />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {conversations.map((c) => (
              <li
                key={c.id}
                className={`group flex items-center gap-2 px-3 py-2.5 transition-colors ${
                  activeId === c.id
                    ? "bg-slate-50 dark:bg-slate-800/50"
                    : "hover:bg-slate-50 dark:hover:bg-slate-800/30"
                }`}
              >
                <button onClick={() => onPick(c.id)} className="flex min-w-0 flex-1 flex-col items-start text-left">
                  <span className={`truncate text-sm w-full ${activeId === c.id ? "font-semibold text-slate-900 dark:text-slate-100" : "font-medium text-slate-700 dark:text-slate-200"}`}>
                    {c.title}
                  </span>
                  <span className="text-[11px] text-slate-400 dark:text-slate-500">
                    {new Date(c.updatedAt).toLocaleString()}
                  </span>
                </button>
                <button
                  onClick={() => onDelete(c.id)}
                  className="rounded-lg p-1.5 text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400 transition-opacity"
                  aria-label={t("ai.deleteConversation")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Approval card shown when tool results are staged: the tools have already
 * been executed locally, and we show the user the exact JSON payload that
 * *would* be sent to the LLM next. They explicitly approve or refuse
 * before the data leaves the server.
 */
function ApprovalCard({
  pending,
  autoApprove,
  resuming,
  onApprove,
  onReject,
  t,
}: {
  pending: PendingApproval;
  autoApprove: boolean;
  resuming: boolean;
  onApprove: (autoApprove: boolean) => void;
  onReject: () => void;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  const [stickyApprove, setStickyApprove] = useState(false);

  const prettyJson = (raw: string): string => {
    try {
      return JSON.stringify(JSON.parse(raw), null, 2);
    } catch {
      return raw;
    }
  };

  return (
    <div className="rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50/80 dark:bg-amber-500/10 p-3 space-y-2 shadow-sm">
      <div className="flex items-start gap-2">
        <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-amber-600 dark:text-amber-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-900 dark:text-amber-200">
            {t("ai.approvalTitle", { count: String(pending.results.length) })}
          </p>
          <p className="mt-0.5 text-xs text-amber-700 dark:text-amber-300">
            {t("ai.approvalSubtitle")}
          </p>
        </div>
      </div>
      <ul className="space-y-2">
        {pending.results.map((r) => (
          <li key={r.toolCallId} className="rounded-lg bg-white/70 dark:bg-slate-900/40 px-2.5 py-2 text-xs">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Wrench className="h-3 w-3 text-amber-600 dark:text-amber-400" />
              <code className="font-medium text-slate-800 dark:text-slate-100">{r.name}</code>
              {Object.keys(r.arguments ?? {}).length > 0 && (
                <code className="truncate text-[10px] text-slate-500 dark:text-slate-400" title={JSON.stringify(r.arguments)}>
                  {JSON.stringify(r.arguments)}
                </code>
              )}
            </div>
            <details className="mt-1.5" open>
              <summary className="cursor-pointer select-none text-[11px] font-medium text-amber-800 dark:text-amber-300">
                {t("ai.approvalPayloadLabel")}
              </summary>
              <pre className="mt-1 max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md bg-slate-900 text-slate-100 px-2.5 py-1.5 text-[10.5px] leading-relaxed">
                {prettyJson(r.content)}
              </pre>
            </details>
          </li>
        ))}
      </ul>
      {!autoApprove && (
        <label className="flex items-center gap-2 text-[11px] text-amber-700 dark:text-amber-300 cursor-pointer">
          <input
            type="checkbox"
            checked={stickyApprove}
            onChange={(e) => setStickyApprove(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          {t("ai.approvalSticky")}
        </label>
      )}
      <div className="flex items-center gap-2">
        <button
          onClick={() => onApprove(stickyApprove)}
          disabled={resuming}
          className="flex items-center gap-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 px-3 py-1.5 text-xs font-medium text-white shadow-sm shadow-emerald-500/20 disabled:opacity-50 transition-colors"
        >
          {resuming ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
          {t("ai.approveSend")}
        </button>
        <button
          onClick={onReject}
          disabled={resuming}
          className="flex items-center gap-1.5 rounded-lg border border-amber-300 dark:border-amber-500/40 px-3 py-1.5 text-xs font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-500/20 disabled:opacity-50 transition-colors"
        >
          <X className="h-3 w-3" />
          {t("ai.rejectSend")}
        </button>
      </div>
    </div>
  );
}

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-12 text-slate-400 dark:text-slate-500">
      {icon}
      <p className="text-sm text-center px-4 max-w-xs">{label}</p>
    </div>
  );
}

/**
 * Markdown renderer for assistant replies. `prose` from
 * @tailwindcss/typography gives a sensible default style; we trim spacing
 * to fit a chat bubble (no big h1 margins, no full-width tables breaking
 * the layout). GFM adds tables, strikethrough and task lists.
 */
function AssistantMarkdown({ content }: { content: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none
        prose-p:my-1.5 prose-p:leading-relaxed
        prose-headings:my-2 prose-headings:font-semibold
        prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5
        prose-pre:my-2 prose-pre:bg-slate-900 prose-pre:text-slate-100 prose-pre:rounded-lg prose-pre:px-3 prose-pre:py-2
        prose-code:before:content-[''] prose-code:after:content-['']
        prose-code:rounded prose-code:bg-slate-200/60 dark:prose-code:bg-slate-700/60 prose-code:px-1 prose-code:py-0.5 prose-code:text-[0.85em]
        prose-a:text-indigo-600 dark:prose-a:text-indigo-400
        prose-table:my-2 prose-table:text-xs
        prose-th:px-2 prose-th:py-1 prose-td:px-2 prose-td:py-1
        prose-hr:my-3
        prose-blockquote:my-2 prose-blockquote:not-italic">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ className, children, ...props }: any) {
            const inline = !className;
            if (inline) {
              return <code className={className} {...props}>{children}</code>;
            }
            return (
              <code className={`${className ?? ""} block whitespace-pre-wrap`} {...props}>
                {children}
              </code>
            );
          },
          a({ children, ...props }) {
            return <a {...props} target="_blank" rel="noopener noreferrer">{children}</a>;
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
