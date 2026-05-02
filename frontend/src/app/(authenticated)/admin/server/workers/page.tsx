"use client";

import { useCallback, useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  Loader2,
  Cpu,
  RefreshCw,
  Save,
  CheckCircle2,
  AlertTriangle,
  Power,
} from "lucide-react";

interface WorkerLive {
  currentContainers: number | null;
  totalContainers: number | null;
  queueReady: number | null;
  queueUnacked: number | null;
  queueConsumers: number | null;
}

interface WorkerSettings {
  queue: string;
  serviceName: string;
  enabled: boolean;
  minContainers: number;
  maxContainers: number;
  minProcessesPerContainer: number;
  maxProcessesPerContainer: number;
  scaleUpThreshold: number;
  scaleDownIdleSeconds: number;
  memoryLimitMb: number;
  updatedAt: string;
  live: WorkerLive;
}

type Toast = { kind: "success" | "error"; text: string };

export default function WorkerPoolPage() {
  const { t } = useI18n();
  const [items, setItems] = useState<WorkerSettings[]>([]);
  const [drafts, setDrafts] = useState<Record<string, WorkerSettings>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  const showToast = useCallback((value: Toast) => {
    setToast(value);
    window.setTimeout(() => setToast(null), 4000);
  }, []);

  const load = useCallback(async (refreshDrafts = true) => {
    const res = await fetch("/api/admin/server/workers");
    if (!res.ok) {
      setLoading(false);
      return;
    }
    const data = (await res.json()) as { items: WorkerSettings[] };
    setItems(data.items);
    if (refreshDrafts) {
      const next: Record<string, WorkerSettings> = {};
      data.items.forEach((it) => (next[it.queue] = { ...it }));
      setDrafts(next);
    } else {
      // Only sync the live block; keep editable fields untouched
      setDrafts((prev) => {
        const next = { ...prev };
        data.items.forEach((it) => {
          if (next[it.queue]) {
            next[it.queue] = { ...next[it.queue], live: it.live };
          } else {
            next[it.queue] = { ...it };
          }
        });
        return next;
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load(true);
    const id = window.setInterval(() => load(false), 5000);
    return () => window.clearInterval(id);
  }, [load]);

  const updateDraft = (queue: string, patch: Partial<WorkerSettings>) => {
    setDrafts((prev) => ({ ...prev, [queue]: { ...prev[queue], ...patch } }));
  };

  const isDirty = (queue: string): boolean => {
    const original = items.find((i) => i.queue === queue);
    const draft = drafts[queue];
    if (!original || !draft) return false;
    return (
      original.enabled !== draft.enabled ||
      original.minContainers !== draft.minContainers ||
      original.maxContainers !== draft.maxContainers ||
      original.minProcessesPerContainer !== draft.minProcessesPerContainer ||
      original.maxProcessesPerContainer !== draft.maxProcessesPerContainer ||
      original.scaleUpThreshold !== draft.scaleUpThreshold ||
      original.scaleDownIdleSeconds !== draft.scaleDownIdleSeconds ||
      original.memoryLimitMb !== draft.memoryLimitMb
    );
  };

  const save = async (queue: string) => {
    const draft = drafts[queue];
    if (!draft) return;
    setSaving(queue);
    const res = await fetch(`/api/admin/server/workers/${queue}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: draft.enabled,
        minContainers: draft.minContainers,
        maxContainers: draft.maxContainers,
        minProcessesPerContainer: draft.minProcessesPerContainer,
        maxProcessesPerContainer: draft.maxProcessesPerContainer,
        scaleUpThreshold: draft.scaleUpThreshold,
        scaleDownIdleSeconds: draft.scaleDownIdleSeconds,
        memoryLimitMb: draft.memoryLimitMb,
      }),
    });
    setSaving(null);
    if (!res.ok) {
      showToast({ kind: "error", text: t("admin_workers.errors.saveFailed") });
      return;
    }
    showToast({ kind: "success", text: t("admin_workers.saved") });
    await load(true);
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {t("admin_workers.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("admin_workers.subtitle")}
          </p>
        </div>
        <button
          onClick={() => load(true)}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
        >
          <RefreshCw className="h-4 w-4" />
          {t("admin_workers.refresh")}
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {Object.values(drafts).map((draft) => {
          const dirty = isDirty(draft.queue);
          const maxCapacity = draft.maxContainers * draft.maxProcessesPerContainer;
          const memoryEstimate =
            draft.maxContainers * draft.maxProcessesPerContainer * draft.memoryLimitMb;
          return (
            <div
              key={draft.queue}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800">
                    <Cpu className="h-5 w-5 text-slate-600 dark:text-slate-300" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {draft.serviceName}
                    </div>
                    <div className="text-xs text-slate-400 dark:text-slate-500">
                      {t("admin_workers.queue")}: {draft.queue}
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => updateDraft(draft.queue, { enabled: !draft.enabled })}
                  className={`flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                    draft.enabled
                      ? "text-emerald-700 bg-emerald-50 ring-emerald-600/20 dark:text-emerald-400 dark:bg-emerald-500/10"
                      : "text-slate-500 bg-slate-50 ring-slate-500/20 dark:text-slate-400 dark:bg-slate-800"
                  }`}
                >
                  <Power className="h-3.5 w-3.5" />
                  {draft.enabled ? t("admin_workers.enabled") : t("admin_workers.disabled")}
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="rounded-md bg-slate-50 dark:bg-slate-800/60 p-2.5">
                  <div className="text-slate-400 dark:text-slate-500">
                    {t("admin_workers.live.containers")}
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {draft.live.currentContainers ?? "—"}
                  </div>
                </div>
                <div className="rounded-md bg-slate-50 dark:bg-slate-800/60 p-2.5">
                  <div className="text-slate-400 dark:text-slate-500">
                    {t("admin_workers.live.consumers")}
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {draft.live.queueConsumers ?? "—"}
                  </div>
                </div>
                <div className="rounded-md bg-slate-50 dark:bg-slate-800/60 p-2.5">
                  <div className="text-slate-400 dark:text-slate-500">
                    {t("admin_workers.live.backlog")}
                  </div>
                  <div className="mt-0.5 font-semibold text-slate-900 dark:text-slate-100">
                    {draft.live.queueReady ?? "—"}
                    {draft.live.queueUnacked ? ` (+${draft.live.queueUnacked})` : ""}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <NumberField
                  label={t("admin_workers.minContainers")}
                  value={draft.minContainers}
                  min={1}
                  max={20}
                  onChange={(v) => updateDraft(draft.queue, { minContainers: v })}
                />
                <NumberField
                  label={t("admin_workers.maxContainers")}
                  value={draft.maxContainers}
                  min={draft.minContainers}
                  max={20}
                  onChange={(v) => updateDraft(draft.queue, { maxContainers: v })}
                />
                <NumberField
                  label={t("admin_workers.minProcesses")}
                  value={draft.minProcessesPerContainer}
                  min={1}
                  max={16}
                  onChange={(v) => updateDraft(draft.queue, { minProcessesPerContainer: v })}
                />
                <NumberField
                  label={t("admin_workers.maxProcesses")}
                  value={draft.maxProcessesPerContainer}
                  min={draft.minProcessesPerContainer}
                  max={16}
                  onChange={(v) => updateDraft(draft.queue, { maxProcessesPerContainer: v })}
                />
                <NumberField
                  label={t("admin_workers.scaleUpThreshold")}
                  value={draft.scaleUpThreshold}
                  min={1}
                  max={1000}
                  onChange={(v) => updateDraft(draft.queue, { scaleUpThreshold: v })}
                  hint={t("admin_workers.scaleUpThresholdHint")}
                />
                <NumberField
                  label={t("admin_workers.scaleDownIdle")}
                  value={draft.scaleDownIdleSeconds}
                  min={10}
                  max={3600}
                  onChange={(v) => updateDraft(draft.queue, { scaleDownIdleSeconds: v })}
                  hint={t("admin_workers.scaleDownIdleHint")}
                />
                <NumberField
                  label={t("admin_workers.memoryLimit")}
                  value={draft.memoryLimitMb}
                  min={64}
                  max={4096}
                  step={64}
                  onChange={(v) => updateDraft(draft.queue, { memoryLimitMb: v })}
                  hint="MB"
                />
                <div className="flex flex-col">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                    {t("admin_workers.maxCapacity")}
                  </label>
                  <div className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-700 dark:text-slate-300">
                    {maxCapacity} {t("admin_workers.processes")}
                  </div>
                  <span className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                    ~{(memoryEstimate / 1024).toFixed(1)} GB max
                  </span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800">
                <span className="text-[11px] text-slate-400 dark:text-slate-500">
                  {t("admin_workers.updatedAt")}: {new Date(draft.updatedAt).toLocaleString()}
                </span>
                <button
                  onClick={() => save(draft.queue)}
                  disabled={!dirty || saving === draft.queue}
                  className="flex items-center gap-1.5 rounded-md bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-40 transition-colors"
                >
                  {saving === draft.queue ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {t("admin_workers.save")}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${
            toast.kind === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {toast.kind === "success" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          {toast.text}
        </div>
      )}
    </div>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  hint?: string;
}) {
  return (
    <div className="flex flex-col">
      <label className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        step={step ?? 1}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isFinite(n)) return;
          onChange(Math.max(min, Math.min(max, Math.round(n))));
        }}
        className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
      />
      {hint && (
        <span className="mt-1 text-[10px] text-slate-400 dark:text-slate-500">{hint}</span>
      )}
    </div>
  );
}
