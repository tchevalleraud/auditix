"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { ArrowLeft, Loader2, Plus, AlertCircle } from "lucide-react";

const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";

export default function NewSyslogServerPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [host, setHost] = useState("");
  const [port, setPort] = useState(514);
  const [protocol, setProtocol] = useState<"udp" | "tcp">("udp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await fetch("/api/settings/global/syslog/servers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), host: host.trim(), port, protocol }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Error");
      setLoading(false);
      return;
    }
    const created = await res.json();
    router.push(`/settings/global/syslog/${created.id}/edit`);
  };

  return (
    <div className="space-y-6">
      <div>
        <Link href="/settings/global/syslog" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" />
          {t("admin_syslog.back")}
        </Link>
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("admin_syslog.addServer")}</h1>
          <button
            type="submit"
            form="settings-form-syslog-new"
            disabled={loading || !name.trim() || !host.trim()}
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t("admin_syslog.add")}
          </button>
        </div>
      </div>

      <form id="settings-form-syslog-new" onSubmit={submit} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
        <label className="block">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_syslog.serverName")}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            placeholder={t("admin_syslog.serverNamePlaceholder")}
            className={inputClass}
          />
        </label>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="block md:col-span-2">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_syslog.host")}</span>
            <input
              value={host}
              onChange={(e) => setHost(e.target.value)}
              required
              placeholder="logs.example.com"
              className={inputClass + " font-mono"}
            />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_syslog.port")}</span>
            <input
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => setPort(Number(e.target.value))}
              className={inputClass + " font-mono"}
            />
          </label>
        </div>

        <label className="block">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_syslog.protocol")}</span>
          <select
            value={protocol}
            onChange={(e) => setProtocol(e.target.value as "udp" | "tcp")}
            className={inputClass}
          >
            <option value="udp">UDP</option>
            <option value="tcp">TCP</option>
          </select>
        </label>

        {error && (
          <p className="flex items-center gap-1 text-sm text-red-600 dark:text-red-400">
            <AlertCircle className="h-4 w-4" /> {error}
          </p>
        )}

        <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <Link href="/settings/global/syslog" className="rounded-lg border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            {t("admin_syslog.cancel")}
          </Link>
        </div>
      </form>
    </div>
  );
}
