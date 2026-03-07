"use client";

import { useState } from "react";
import Link from "next/link";
import { useAppContext, type AppContext } from "@/components/ContextProvider";
import { useI18n } from "@/components/I18nProvider";
import {
  Plus,
  Pencil,
  Trash2,
  Building2,
  Search,
} from "lucide-react";

export default function ContextsPage() {
  const { contexts, reload } = useAppContext();
  const { t, locale } = useI18n();
  const [search, setSearch] = useState("");

  const filtered = contexts.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (ctx: AppContext) => {
    if (!confirm(t("common.confirm_delete", { name: ctx.name }))) return;
    await fetch(`/api/contexts/${ctx.id}`, { method: "DELETE" });
    await reload();
  };

  const dateLocale = locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("admin_contexts.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("admin_contexts.subtitle")}
          </p>
        </div>
        <Link
          href="/admin/contexts/new"
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("admin_contexts.newContext")}
        </Link>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder={t("admin_contexts.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_contexts.colName")}
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_contexts.colDescription")}
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_contexts.colUsers")}
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_contexts.colMonitoring")}
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_contexts.colCreatedAt")}
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_contexts.colActions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center">
                  <Building2 className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    {search ? t("admin_contexts.noResult") : t("admin_contexts.noContexts")}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((ctx) => (
                <tr
                  key={ctx.id}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {ctx.name}
                      </span>
                      {ctx.isDefault && (
                        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                          {t("common.default")}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {ctx.description || "—"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-700 dark:text-slate-300">
                      {ctx.userCount}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                      ctx.monitoringEnabled
                        ? "text-emerald-700 bg-emerald-50 ring-emerald-600/20 dark:text-emerald-400 dark:bg-emerald-500/10 dark:ring-emerald-500/20"
                        : "text-slate-600 bg-slate-50 ring-slate-500/20 dark:text-slate-400 dark:bg-slate-800 dark:ring-slate-600/20"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${ctx.monitoringEnabled ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-500"}`} />
                      {ctx.monitoringEnabled ? t("admin_contexts.active") : t("admin_contexts.inactive")}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {new Date(ctx.createdAt).toLocaleDateString(dateLocale)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/admin/contexts/${ctx.id}/edit`}
                        className="rounded-lg p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      {!ctx.isDefault && (
                        <button
                          onClick={() => handleDelete(ctx)}
                          className="rounded-lg p-2 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
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
