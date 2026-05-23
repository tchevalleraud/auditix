"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  Loader2,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  Bot,
  X,
  Check,
  PlugZap,
} from "lucide-react";

type ProviderType = "openrouter" | "ollama" | "openai" | "anthropic";

interface LlmProvider {
  id: number;
  name: string;
  type: ProviderType;
  baseUrl: string;
  apiKey: string | null;
  defaultModel: string | null;
  enabled: boolean;
  updatedAt: string;
}

const TYPE_DEFAULTS: Record<ProviderType, { baseUrl: string; needsKey: boolean }> = {
  openrouter: { baseUrl: "https://openrouter.ai/api", needsKey: true },
  ollama: { baseUrl: "http://localhost:11434", needsKey: false },
  openai: { baseUrl: "https://api.openai.com", needsKey: true },
  anthropic: { baseUrl: "https://api.anthropic.com", needsKey: true },
};

const inputClass =
  "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

export default function LlmProvidersPage() {
  const { t } = useI18n();
  const [providers, setProviders] = useState<LlmProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<LlmProvider | "new" | null>(null);
  const [testing, setTesting] = useState<number | null>(null);
  const [testResult, setTestResult] = useState<Record<number, { ok: boolean; msg: string }>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/llm/providers");
    setProviders(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (p: LlmProvider) => {
    if (!confirm(t("llm.confirmDelete", { name: p.name }))) return;
    await fetch(`/api/admin/llm/providers/${p.id}`, { method: "DELETE" });
    await load();
  };

  const test = async (p: LlmProvider) => {
    setTesting(p.id);
    setTestResult((r) => {
      const next = { ...r };
      delete next[p.id];
      return next;
    });
    try {
      const res = await fetch(`/api/admin/llm/providers/${p.id}/test`, { method: "POST" });
      const data = await res.json();
      setTestResult((r) => ({
        ...r,
        [p.id]: { ok: !!data.ok, msg: data.ok ? t("llm.testOk", { count: String(data.modelCount ?? 0) }) : data.error ?? t("llm.testFailed") },
      }));
    } catch (e) {
      setTestResult((r) => ({ ...r, [p.id]: { ok: false, msg: t("llm.testFailed") } }));
    } finally {
      setTesting(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("llm.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("llm.subtitle")}</p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("llm.addProvider")}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("llm.colName")}</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("llm.colType")}</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("llm.colBaseUrl")}</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("llm.colStatus")}</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("llm.colActions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {providers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-12 text-center">
                  <Bot className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">{t("llm.noProviders")}</p>
                </td>
              </tr>
            ) : (
              providers.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{p.name}</span>
                    {p.defaultModel && (
                      <p className="text-xs text-slate-400 dark:text-slate-500">{p.defaultModel}</p>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400 capitalize">
                      {p.type}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">{p.baseUrl}</code>
                  </td>
                  <td className="px-5 py-3.5">
                    {p.enabled ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3" />
                        {t("llm.statusEnabled")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-500/20">
                        <XCircle className="h-3 w-3" />
                        {t("llm.statusDisabled")}
                      </span>
                    )}
                    {testResult[p.id] && (
                      <p className={`mt-1 text-xs ${testResult[p.id].ok ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400"}`}>
                        {testResult[p.id].msg}
                      </p>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => test(p)}
                        disabled={testing === p.id}
                        className="rounded-lg p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                        title={t("llm.test")}
                      >
                        {testing === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />}
                      </button>
                      <button
                        onClick={() => setEditing(p)}
                        className="rounded-lg px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        {t("llm.edit")}
                      </button>
                      <button
                        onClick={() => remove(p)}
                        className="rounded-lg p-2 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {editing && (
        <ProviderModal
          provider={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await load();
          }}
          t={t}
          inputClass={inputClass}
          labelClass={labelClass}
        />
      )}
    </div>
  );
}

function ProviderModal({
  provider,
  onClose,
  onSaved,
  t,
  inputClass,
  labelClass,
}: {
  provider: LlmProvider | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
  t: (k: string, v?: Record<string, string>) => string;
  inputClass: string;
  labelClass: string;
}) {
  const isNew = provider === null;
  const [name, setName] = useState(provider?.name ?? "");
  const [type, setType] = useState<ProviderType>(provider?.type ?? "openrouter");
  const [baseUrl, setBaseUrl] = useState(provider?.baseUrl ?? TYPE_DEFAULTS.openrouter.baseUrl);
  const [apiKey, setApiKey] = useState("");
  const [hasExistingKey, setHasExistingKey] = useState(!!provider?.apiKey);
  const [defaultModel, setDefaultModel] = useState(provider?.defaultModel ?? "");
  const [enabled, setEnabled] = useState(provider?.enabled ?? true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onTypeChange = (next: ProviderType) => {
    setType(next);
    // Only auto-fill the baseUrl when creating or when the user hasn't customised it
    // away from a known default — avoids clobbering a hand-edited URL.
    const known = Object.values(TYPE_DEFAULTS).map((d) => d.baseUrl);
    if (isNew || known.includes(baseUrl)) {
      setBaseUrl(TYPE_DEFAULTS[next].baseUrl);
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const body: any = { name, type, baseUrl, defaultModel: defaultModel || null, enabled };
      if (apiKey) body.apiKey = apiKey;
      if (isNew) {
        const res = await fetch("/api/admin/llm/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
      } else {
        const res = await fetch(`/api/admin/llm/providers/${provider!.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? `HTTP ${res.status}`);
        }
      }
      await onSaved();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {isNew ? t("llm.addProvider") : t("llm.editProvider")}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={save} className="space-y-4 p-6">
          <div className="space-y-1.5">
            <label className={labelClass}>{t("llm.fieldName")}</label>
            <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>{t("llm.fieldType")}</label>
            <select className={inputClass} value={type} onChange={(e) => onTypeChange(e.target.value as ProviderType)}>
              <option value="openrouter">OpenRouter</option>
              <option value="ollama">Ollama</option>
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>{t("llm.fieldBaseUrl")}</label>
            <input className={inputClass} value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>
              {t("llm.fieldApiKey")} {TYPE_DEFAULTS[type].needsKey ? "" : t("llm.optional")}
            </label>
            <input
              type="password"
              className={inputClass}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={hasExistingKey ? "••••••••" : ""}
            />
            {hasExistingKey && (
              <button
                type="button"
                onClick={async () => {
                  setApiKey("");
                  const res = await fetch(`/api/admin/llm/providers/${provider!.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ apiKey: "" }),
                  });
                  if (res.ok) setHasExistingKey(false);
                }}
                className="text-xs text-red-600 dark:text-red-400 hover:underline"
              >
                {t("llm.clearApiKey")}
              </button>
            )}
          </div>
          <div className="space-y-1.5">
            <label className={labelClass}>{t("llm.fieldDefaultModel")}</label>
            <input className={inputClass} value={defaultModel} onChange={(e) => setDefaultModel(e.target.value)} placeholder={t("llm.defaultModelPlaceholder")} />
          </div>
          <div className="flex items-center justify-between gap-4 pt-2 border-t border-slate-100 dark:border-slate-800">
            <div>
              <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("llm.fieldEnabled")}</h3>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t("llm.fieldEnabledHelp")}</p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((v) => !v)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                enabled ? "bg-slate-900 dark:bg-white" : "bg-slate-200 dark:bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                  enabled ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>
          {error && (
            <p className="rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-400">{error}</p>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={saving || !name.trim()}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t("common.save")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
