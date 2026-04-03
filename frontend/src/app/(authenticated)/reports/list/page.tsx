"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Plus,
  Loader2,
  Search,
  FileText,
  Pencil,
  Trash2,
  X,
  Globe,
  Server,
  FileBarChart,
} from "lucide-react";

interface ReportItem {
  id: number;
  name: string;
  description: string | null;
  locale: string;
  type: string;
  createdAt: string;
}

const LOCALE_LABELS: Record<string, string> = {
  fr: "Français",
  en: "English",
  de: "Deutsch",
  es: "Español",
  it: "Italiano",
  ja: "日本語",
};

export default function ReportsListPage() {
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const router = useRouter();
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [search, setSearch] = useState("");
  const [fetchLoading, setFetchLoading] = useState(true);

  const [modal, setModal] = useState(false);
  const [reportName, setReportName] = useState("");
  const [reportDescription, setReportDescription] = useState("");
  const [reportLocale, setReportLocale] = useState("fr");
  const [reportType, setReportType] = useState<"general" | "node">("general");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ReportItem | null>(null);

  const dateLocale =
    locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  const loadReports = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/reports?context=${current.id}`);
    if (res.ok) setReports(await res.json());
    setFetchLoading(false);
  }, [current]);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const filtered = reports.filter(
    (r) =>
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      (r.description && r.description.toLowerCase().includes(search.toLowerCase()))
  );

  const openCreate = () => {
    setReportName("");
    setReportDescription("");
    setReportLocale("fr");
    setReportType("general");
    setModal(true);
  };

  const handleSave = async () => {
    if (!reportName.trim() || !current) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/reports?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: reportName.trim(),
          description: reportDescription.trim() || null,
          locale: reportLocale,
          type: reportType,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setModal(false);
        router.push(`/reports/list/${created.id}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (report: ReportItem) => {
    await fetch(`/api/reports/${report.id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    loadReports();
  };

  const inputClass =
    "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("reports.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("reports.subtitle")}</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("reports.newReport")}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder={t("reports.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("reports.colName")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("reports.colDescription")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("reports.colType")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("reports.colLanguage")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("reports.colCreatedAt")}
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("reports.colActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <FileText className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {search ? t("reports.noResult") : t("reports.noReports")}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((report) => (
                  <tr key={report.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3">
                      <button
                        onClick={() => router.push(`/reports/list/${report.id}`)}
                        className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:underline flex items-center gap-2"
                      >
                        <FileText className="h-4 w-4 text-blue-500" />
                        {report.name}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate">
                      {report.description || "\u2014"}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        report.type === "node"
                          ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                      }`}>
                        {report.type === "node" ? <Server className="h-3 w-3" /> : <FileBarChart className="h-3 w-3" />}
                        {report.type === "node" ? t("reports.typeNode") : t("reports.typeGeneral")}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-50 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                        <Globe className="h-3 w-3" />
                        {LOCALE_LABELS[report.locale] || report.locale}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {new Date(report.createdAt).toLocaleDateString(dateLocale)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => router.push(`/reports/list/${report.id}`)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Pencil className="h-4 w-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(report)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
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

      {/* Create Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t("reports.newReport")}
              </h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className={labelClass}>{t("reports.colName")}</label>
                <input
                  type="text"
                  value={reportName}
                  onChange={(e) => setReportName(e.target.value)}
                  placeholder={t("reports.namePlaceholder")}
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("reports.colDescription")}</label>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  rows={3}
                  placeholder={t("reports.descriptionPlaceholder")}
                  className={`${inputClass} resize-none`}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("reports.typeLabel")}</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setReportType("general")}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                      reportType === "general"
                        ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <FileBarChart className={`h-6 w-6 ${reportType === "general" ? "text-slate-900 dark:text-white" : "text-slate-400"}`} />
                    <span className={`text-sm font-medium ${reportType === "general" ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>
                      {t("reports.typeGeneral")}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 text-center">{t("reports.typeGeneralDesc")}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setReportType("node")}
                    className={`flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors ${
                      reportType === "node"
                        ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <Server className={`h-6 w-6 ${reportType === "node" ? "text-slate-900 dark:text-white" : "text-slate-400"}`} />
                    <span className={`text-sm font-medium ${reportType === "node" ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-slate-400"}`}>
                      {t("reports.typeNode")}
                    </span>
                    <span className="text-xs text-slate-400 dark:text-slate-500 text-center">{t("reports.typeNodeDesc")}</span>
                  </button>
                </div>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("reports.reportLocale")}</label>
                <select
                  value={reportLocale}
                  onChange={(e) => setReportLocale(e.target.value)}
                  className={inputClass}
                >
                  {Object.entries(LOCALE_LABELS).map(([code, label]) => (
                    <option key={code} value={code}>{label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !reportName.trim()}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("reports.confirmDelete", { name: deleteConfirm.name })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
