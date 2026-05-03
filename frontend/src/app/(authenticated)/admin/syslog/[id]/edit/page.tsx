"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { ArrowLeft, Loader2, Check, AlertCircle, CheckCircle2, Send, Trash2 } from "lucide-react";

interface SyslogServer {
  id: number;
  name: string;
  host: string;
  port: number;
  protocol: "udp" | "tcp";
  minLevel: string;
  facility: number;
  appName: string;
  enabled: boolean;
}

const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";

const LEVELS = ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"];
const FACILITIES = [
  { value: 1, label: "user" },
  { value: 16, label: "local0" },
  { value: 17, label: "local1" },
  { value: 18, label: "local2" },
  { value: 19, label: "local3" },
  { value: 20, label: "local4" },
  { value: 21, label: "local5" },
  { value: 22, label: "local6" },
  { value: 23, label: "local7" },
];

type Tab = "general" | "test";

export default function EditSyslogServerPage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useI18n();
  const serverId = params.id as string;

  const [tab, setTab] = useState<Tab>("general");
  const [server, setServer] = useState<SyslogServer | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/admin/syslog/servers/${serverId}`);
    if (!res.ok) {
      router.push("/admin/syslog");
      return;
    }
    setServer(await res.json());
    setLoading(false);
  }, [serverId, router]);

  useEffect(() => { load(); }, [load]);

  const update = (patch: Partial<SyslogServer>) => {
    setServer((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaved(false);
  };

  const save = async () => {
    if (!server) return;
    setSaving(true);
    setError(null);
    const res = await fetch(`/api/admin/syslog/servers/${server.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: server.name,
        host: server.host,
        port: server.port,
        protocol: server.protocol,
        minLevel: server.minLevel,
        facility: server.facility,
        appName: server.appName,
        enabled: server.enabled,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Error");
      return;
    }
    const updated = await res.json();
    setServer(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const remove = async () => {
    if (!server) return;
    if (!confirm(t("admin_syslog.confirmDelete", { name: server.name }))) return;
    await fetch(`/api/admin/syslog/servers/${server.id}`, { method: "DELETE" });
    router.push("/admin/syslog");
  };

  const runTest = async () => {
    if (!server) return;
    setTesting(true);
    setTestResult(null);
    const res = await fetch(`/api/admin/syslog/servers/${server.id}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await res.json().catch(() => ({}));
    setTesting(false);
    setTestResult({ ok: !!data.ok, error: data.error });
  };

  if (loading || !server) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/syslog" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" />
          {t("admin_syslog.back")}
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{server.name}</h1>
          <button
            onClick={remove}
            className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            {t("admin_syslog.delete")}
          </button>
        </div>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex gap-6">
          {(["general", "test"] as Tab[]).map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`-mb-px border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                tab === id
                  ? "border-slate-900 text-slate-900 dark:border-white dark:text-white"
                  : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              {t(`admin_syslog.tab_${id}`)}
            </button>
          ))}
        </nav>
      </div>

      {tab === "general" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={server.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600"
            />
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("admin_syslog.enabled")}</span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_syslog.serverName")}</span>
            <input value={server.name} onChange={(e) => update({ name: e.target.value })} className={inputClass} />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block md:col-span-2">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_syslog.host")}</span>
              <input value={server.host} onChange={(e) => update({ host: e.target.value })} className={inputClass + " font-mono"} />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_syslog.port")}</span>
              <input
                type="number"
                min={1}
                max={65535}
                value={server.port}
                onChange={(e) => update({ port: Number(e.target.value) })}
                className={inputClass + " font-mono"}
              />
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_syslog.protocol")}</span>
              <select
                value={server.protocol}
                onChange={(e) => update({ protocol: e.target.value as "udp" | "tcp" })}
                className={inputClass}
              >
                <option value="udp">UDP</option>
                <option value="tcp">TCP</option>
              </select>
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_syslog.minLevel")}</span>
              <select
                value={server.minLevel}
                onChange={(e) => update({ minLevel: e.target.value })}
                className={inputClass}
              >
                {LEVELS.map((lv) => (
                  <option key={lv} value={lv}>{t(`admin_syslog.level_${lv}`)}</option>
                ))}
              </select>
              <span className="block mt-1 text-xs text-slate-500 dark:text-slate-400">{t("admin_syslog.minLevelHint")}</span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_syslog.facility")}</span>
              <select
                value={server.facility}
                onChange={(e) => update({ facility: Number(e.target.value) })}
                className={inputClass}
              >
                {FACILITIES.map((f) => (
                  <option key={f.value} value={f.value}>{f.label} ({f.value})</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_syslog.appName")}</span>
              <input value={server.appName} onChange={(e) => update({ appName: e.target.value })} className={inputClass + " font-mono"} />
            </label>
          </div>

          {error && (
            <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4" /> {error}
            </p>
          )}

          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {t("admin_syslog.save")}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> {t("admin_syslog.saved")}
              </span>
            )}
          </div>
        </div>
      )}

      {tab === "test" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("admin_syslog.testHint")}</p>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={runTest}
              disabled={testing}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t("admin_syslog.testSend")}
            </button>
          </div>

          {testResult && (
            testResult.ok ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{t("admin_syslog.testSuccess")}</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="break-all">{testResult.error ?? t("admin_syslog.testError")}</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
