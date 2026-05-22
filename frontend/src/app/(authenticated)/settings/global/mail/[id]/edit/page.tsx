"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { ArrowLeft, Loader2, Check, AlertCircle, CheckCircle2, Send, Trash2 } from "lucide-react";

interface MailServer {
  id: number;
  name: string;
  host: string;
  port: number;
  encryption: "none" | "tls" | "ssl";
  username: string | null;
  password: string | null;
  fromEmail: string;
  fromName: string | null;
  enabled: boolean;
  addressingMode: "to" | "bcc" | "mail_merge";
}

const SECRET_PLACEHOLDER = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";

type Tab = "general" | "test";

export default function EditMailServerPage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useI18n();
  const serverId = params.id as string;

  const [tab, setTab] = useState<Tab>("general");
  const [server, setServer] = useState<MailServer | null>(null);
  const [passwordInput, setPasswordInput] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [testRecipient, setTestRecipient] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/settings/global/mail/servers/${serverId}`);
    if (!res.ok) {
      router.push("/settings/global/mail");
      return;
    }
    setServer(await res.json());
    setLoading(false);
  }, [serverId, router]);

  useEffect(() => { load(); }, [load]);

  const update = (patch: Partial<MailServer>) => {
    setServer((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaved(false);
  };

  const save = async () => {
    if (!server) return;
    setSaving(true);
    setError(null);
    const body: Record<string, unknown> = {
      name: server.name,
      host: server.host,
      port: server.port,
      encryption: server.encryption,
      username: server.username,
      fromEmail: server.fromEmail,
      fromName: server.fromName,
      enabled: server.enabled,
      addressingMode: server.addressingMode,
    };
    if (passwordInput !== null) {
      body.password = passwordInput;
    }
    const res = await fetch(`/api/settings/global/mail/servers/${server.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Error");
      return;
    }
    const updated = await res.json();
    setServer(updated);
    setPasswordInput(null);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const remove = async () => {
    if (!server) return;
    if (!confirm(t("admin_mail.confirmDelete", { name: server.name }))) return;
    await fetch(`/api/settings/global/mail/servers/${server.id}`, { method: "DELETE" });
    router.push("/settings/global/mail");
  };

  const runTest = async () => {
    if (!server) return;
    setTesting(true);
    setTestResult(null);
    const res = await fetch(`/api/settings/global/mail/servers/${server.id}/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: testRecipient.trim() }),
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
        <Link href="/settings/global/mail" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" />
          {t("admin_mail.back")}
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{server.name}</h1>
          <button
            onClick={remove}
            className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          >
            <Trash2 className="h-4 w-4" />
            {t("admin_mail.delete")}
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
              {t(`admin_mail.tab_${id}`)}
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
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("admin_mail.enabled")}</span>
          </label>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_mail.serverName")}</span>
            <input value={server.name} onChange={(e) => update({ name: e.target.value })} className={inputClass} />
          </label>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <label className="block md:col-span-2">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_mail.host")}</span>
              <input value={server.host} onChange={(e) => update({ host: e.target.value })} className={inputClass + " font-mono"} />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_mail.port")}</span>
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

          <label className="block">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_mail.encryption")}</span>
            <select
              value={server.encryption}
              onChange={(e) => update({ encryption: e.target.value as MailServer["encryption"] })}
              className={inputClass}
            >
              <option value="none">{t("admin_mail.encryptionNone")}</option>
              <option value="tls">{t("admin_mail.encryptionTls")}</option>
              <option value="ssl">{t("admin_mail.encryptionSsl")}</option>
            </select>
          </label>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_mail.username")}</span>
              <input
                value={server.username ?? ""}
                onChange={(e) => update({ username: e.target.value || null })}
                placeholder={t("admin_mail.usernamePlaceholder")}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_mail.password")}</span>
              <input
                type="password"
                value={passwordInput ?? (server.password ?? "")}
                onChange={(e) => { setPasswordInput(e.target.value); setSaved(false); }}
                placeholder={server.password === SECRET_PLACEHOLDER ? SECRET_PLACEHOLDER : ""}
                className={inputClass}
              />
              {server.password === SECRET_PLACEHOLDER && passwordInput === null && (
                <span className="block mt-1 text-xs text-slate-500 dark:text-slate-400">{t("admin_mail.passwordHint")}</span>
              )}
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_mail.fromEmail")}</span>
              <input
                type="email"
                value={server.fromEmail}
                onChange={(e) => update({ fromEmail: e.target.value })}
                className={inputClass}
              />
            </label>
            <label className="block">
              <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_mail.fromName")}</span>
              <input
                value={server.fromName ?? ""}
                onChange={(e) => update({ fromName: e.target.value || null })}
                placeholder={t("admin_mail.fromNamePlaceholder")}
                className={inputClass}
              />
            </label>
          </div>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_mail.addressingMode")}</span>
            <select
              value={server.addressingMode}
              onChange={(e) => update({ addressingMode: e.target.value as MailServer["addressingMode"] })}
              className={inputClass}
            >
              <option value="to">{t("admin_mail.addressingTo")}</option>
              <option value="bcc">{t("admin_mail.addressingBcc")}</option>
              <option value="mail_merge">{t("admin_mail.addressingMailMerge")}</option>
            </select>
            <span className="block mt-1 text-xs text-slate-500 dark:text-slate-400">
              {server.addressingMode === "to" && t("admin_mail.addressingToHint")}
              {server.addressingMode === "bcc" && t("admin_mail.addressingBccHint")}
              {server.addressingMode === "mail_merge" && t("admin_mail.addressingMailMergeHint")}
            </span>
          </label>

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
              {t("admin_mail.save")}
            </button>
            {saved && (
              <span className="inline-flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4" /> {t("admin_mail.saved")}
              </span>
            )}
          </div>
        </div>
      )}

      {tab === "test" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("admin_mail.testHint")}</p>
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_mail.testRecipient")}</span>
            <input
              type="email"
              value={testRecipient}
              onChange={(e) => setTestRecipient(e.target.value)}
              placeholder="recipient@example.com"
              className={inputClass}
            />
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={runTest}
              disabled={testing || !testRecipient.trim()}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {t("admin_mail.testSend")}
            </button>
          </div>

          {testResult && (
            testResult.ok ? (
              <div className="flex items-start gap-2 rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
                <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{t("admin_mail.testSuccess")}</span>
              </div>
            ) : (
              <div className="flex items-start gap-2 rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span className="break-all">{testResult.error ?? t("admin_mail.testError")}</span>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
