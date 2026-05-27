"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { Loader2, Plus, Pencil, Trash2, KeyRound, CheckCircle2, XCircle, AlertCircle, Lock } from "lucide-react";

interface OidcProvider {
  id: number;
  slug: string;
  name: string;
  enabled: boolean;
  isReady: boolean;
}

export default function OidcProvidersPage() {
  const { t } = useI18n();
  const [providers, setProviders] = useState<OidcProvider[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/oidc/providers");
    setProviders(res.ok ? await res.json() : []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const remove = async (p: OidcProvider) => {
    if (!confirm(t("admin_oidc.confirmDelete", { name: p.name }))) return;
    await fetch(`/api/admin/oidc/providers/${p.id}`, { method: "DELETE" });
    await load();
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("admin_oidc.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("admin_oidc.subtitle")}</p>
        </div>
        <Link
          href="/settings/global/auth/new"
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("admin_oidc.addProvider")}
        </Link>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead className="bg-slate-50 dark:bg-slate-800/50">
            <tr>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("admin_oidc.providerName")}</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("admin_oidc.providerSlug")}</th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("admin_oidc.providerStatus")}</th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("admin_oidc.actions")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            <tr className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
              <td className="px-5 py-3.5">
                <div className="flex items-center gap-2">
                  <Lock className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{t("admin_oidc.internalProvider")}</span>
                </div>
              </td>
              <td className="px-5 py-3.5">
                <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">internal</code>
              </td>
              <td className="px-5 py-3.5">
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                  <CheckCircle2 className="h-3 w-3" />
                  {t("admin_oidc.statusReady")}
                </span>
              </td>
              <td className="px-5 py-3.5">
                <div className="flex items-center justify-end gap-1">
                  <Link
                    href="/settings/global/auth/internal"
                    className="rounded-lg p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                </div>
              </td>
            </tr>
            {providers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center">
                  <KeyRound className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">{t("admin_oidc.noProviders")}</p>
                </td>
              </tr>
            ) : (
              providers.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3.5">
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{p.name}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-700 dark:text-slate-300">{p.slug}</code>
                  </td>
                  <td className="px-5 py-3.5">
                    {!p.enabled ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-500/20">
                        <XCircle className="h-3 w-3" />
                        {t("admin_oidc.statusDisabled")}
                      </span>
                    ) : p.isReady ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 ring-1 ring-inset ring-emerald-500/20">
                        <CheckCircle2 className="h-3 w-3" />
                        {t("admin_oidc.statusReady")}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 ring-1 ring-inset ring-amber-500/20">
                        <AlertCircle className="h-3 w-3" />
                        {t("admin_oidc.statusNotReady")}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/settings/global/auth/${p.id}/edit`}
                        className="rounded-lg p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
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
    </div>
  );
}
