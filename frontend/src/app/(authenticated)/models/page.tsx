"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Plus,
  Trash2,
  Loader2,
  Search,
  Cpu,
  TerminalSquare,
} from "lucide-react";

interface ManufacturerInfo {
  id: number;
  name: string;
  logo: string | null;
}

interface ModelItem {
  id: number;
  name: string;
  description: string | null;
  connectionScript: string | null;
  manufacturer: ManufacturerInfo;
  createdAt: string;
}

export default function ModelsPage() {
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const [models, setModels] = useState<ModelItem[]>([]);
  const [search, setSearch] = useState("");
  const [fetchLoading, setFetchLoading] = useState(true);

  const loadModels = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/models?context=${current.id}`);
    if (res.ok) setModels(await res.json());
    setFetchLoading(false);
  }, [current]);

  useEffect(() => {
    loadModels();
  }, [loadModels]);

  const filtered = models.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      (m.description ?? "").toLowerCase().includes(search.toLowerCase()) ||
      m.manufacturer.name.toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (model: ModelItem) => {
    if (!confirm(t("models.confirmDelete", { name: model.name }))) return;
    await fetch(`/api/models/${model.id}`, { method: "DELETE" });
    await loadModels();
  };

  const dateLocale =
    locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  if (fetchLoading) {
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("models.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("models.subtitle")}
          </p>
        </div>
        <Link
          href="/models/new"
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("models.newModel")}
        </Link>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder={t("models.searchPlaceholder")}
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
                {t("models.colName")}
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("models.colManufacturer")}
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("models.colDescription")}
              </th>
              <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("models.colScript")}
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("models.colCreatedAt")}
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("models.colActions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center">
                  <Cpu className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    {search ? t("models.noResult") : t("models.noModels")}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((model) => (
                <tr
                  key={model.id}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <Link href={`/models/${model.id}`} className="flex items-center gap-3 group">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                        <Cpu className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                      </div>
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:underline">
                        {model.name}
                      </span>
                    </Link>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      {model.manufacturer.logo ? (
                        <img
                          src={model.manufacturer.logo}
                          alt=""
                          className="h-5 w-5 rounded object-contain"
                        />
                      ) : null}
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {model.manufacturer.name}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">
                      {model.description || "\u2014"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-center">
                    {model.connectionScript ? (
                      <TerminalSquare className="inline-block h-4 w-4 text-slate-500 dark:text-slate-400" />
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">{"\u2014"}</span>
                    )}
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {new Date(model.createdAt).toLocaleDateString(dateLocale)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleDelete(model)}
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
