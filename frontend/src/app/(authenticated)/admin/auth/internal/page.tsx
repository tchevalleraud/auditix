"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { ArrowLeft, Loader2, Check, Lock, Clock } from "lucide-react";

interface AuthSettings {
  passwordMinLength: number;
  passwordMaxLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireDigit: boolean;
  passwordRequireSymbol: boolean;
  idleTimeoutSeconds: number;
}

const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";

export default function InternalAuthPage() {
  const { t } = useI18n();
  const [settings, setSettings] = useState<AuthSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/auth/settings");
    setSettings(res.ok ? await res.json() : null);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    const res = await fetch("/api/admin/auth/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    if (res.ok) {
      setSettings(await res.json());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
    setSaving(false);
  };

  if (loading || !settings) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" /></div>;
  }

  const update = <K extends keyof AuthSettings>(k: K, v: AuthSettings[K]) => setSettings({ ...settings, [k]: v });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/admin/auth" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" />
          {t("admin_oidc.back")}
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Lock className="h-6 w-6" />
              {t("admin_oidc.internalProvider")}
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("admin_oidc.internalProviderHint")}</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              {t("admin_oidc.save")}
            </button>
            {saved && <span className="flex items-center gap-1 text-sm text-emerald-600 dark:text-emerald-400"><Check className="h-4 w-4" /> {t("admin_oidc.saved")}</span>}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("admin_oidc.passwordPolicy")}</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("admin_oidc.passwordPolicyHint")}</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_oidc.passwordMinLength")}</span>
            <input type="number" min={1} className={inputClass} value={settings.passwordMinLength} onChange={(e) => update("passwordMinLength", Math.max(1, parseInt(e.target.value) || 1))} />
          </label>
          <label className="block">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_oidc.passwordMaxLength")}</span>
            <input type="number" min={1} className={inputClass} value={settings.passwordMaxLength} onChange={(e) => update("passwordMaxLength", Math.max(1, parseInt(e.target.value) || 1))} />
          </label>
        </div>

        <div className="space-y-2">
          {([
            ["passwordRequireUppercase", t("admin_oidc.passwordRequireUppercase")],
            ["passwordRequireLowercase", t("admin_oidc.passwordRequireLowercase")],
            ["passwordRequireDigit", t("admin_oidc.passwordRequireDigit")],
            ["passwordRequireSymbol", t("admin_oidc.passwordRequireSymbol")],
          ] as [keyof AuthSettings, string][]).map(([key, label]) => (
            <label key={key} className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={settings[key] as boolean}
                onChange={(e) => update(key, e.target.checked as never)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-500"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">{label}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <Clock className="h-4 w-4" />
          {t("admin_oidc.idleTimeout")}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("admin_oidc.idleTimeoutHint")}</p>

        <label className="block max-w-xs">
          <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_oidc.idleTimeoutSeconds")}</span>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min={60}
              step={60}
              className={inputClass}
              value={settings.idleTimeoutSeconds}
              onChange={(e) => update("idleTimeoutSeconds", Math.max(60, parseInt(e.target.value) || 60))}
            />
            <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
              ({Math.round(settings.idleTimeoutSeconds / 60)} min)
            </span>
          </div>
        </label>
      </div>
    </div>
  );
}
