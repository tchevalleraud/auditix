"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Plus,
  Loader2,
  Search,
  Palette,
  Pencil,
  Trash2,
  X,
  Star,
  Download,
  Upload,
  AlertTriangle,
} from "lucide-react";

interface ThemeItem {
  id: number;
  name: string;
  description: string | null;
  isDefault: boolean;
  styles: {
    colors: { primary: string; secondary: string };
    body: { font: string; size: number };
  };
  createdAt: string;
}

interface ImportPreview {
  theme: {
    name: string;
    description: string | null;
    exists: boolean;
    colors: { primary: string; secondary: string };
    font: string;
    fontSize: number;
  };
  exportedAt: string | null;
}

export default function ReportThemesPage() {
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const router = useRouter();
  const [themes, setThemes] = useState<ThemeItem[]>([]);
  const [search, setSearch] = useState("");
  const [fetchLoading, setFetchLoading] = useState(true);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [modal, setModal] = useState(false);
  const [themeName, setThemeName] = useState("");
  const [themeDescription, setThemeDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<ThemeItem | null>(null);

  // Import modal state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const dateLocale =
    locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  const loadThemes = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/report-themes?context=${current.id}`);
    if (res.ok) setThemes(await res.json());
    setFetchLoading(false);
  }, [current]);

  useEffect(() => {
    loadThemes();
  }, [loadThemes]);

  const filtered = themes.filter(
    (th) =>
      th.name.toLowerCase().includes(search.toLowerCase()) ||
      (th.description && th.description.toLowerCase().includes(search.toLowerCase()))
  );

  const openCreate = () => {
    setThemeName("");
    setThemeDescription("");
    setModal(true);
  };

  const handleSave = async () => {
    if (!themeName.trim() || !current) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/report-themes?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: themeName.trim(),
          description: themeDescription.trim() || null,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setModal(false);
        router.push(`/reports/themes/${created.id}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (theme: ThemeItem) => {
    await fetch(`/api/report-themes/${theme.id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    loadThemes();
  };

  const handleExport = async (theme: ThemeItem) => {
    setExportingId(theme.id);
    try {
      const res = await fetch(`/api/report-themes/${theme.id}/export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `theme-${theme.name}.json`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error(e);
    } finally {
      setExportingId(null);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !current) return;
    if (importInputRef.current) importInputRef.current.value = "";

    setImportFile(file);
    setPreviewLoading(true);
    setPreviewError(null);
    setImportPreview(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/report-themes/preview-import?context=${current.id}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Preview failed");
      }
      setImportPreview(await res.json());
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleConfirmImport = async () => {
    if (!importFile || !current) return;
    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const res = await fetch(`/api/report-themes/import?context=${current.id}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Import failed");
      }
      await loadThemes();
      closeImportModal();
    } catch (e: unknown) {
      setPreviewError(e instanceof Error ? e.message : "Import failed");
    } finally {
      setImporting(false);
    }
  };

  const closeImportModal = () => {
    setImportFile(null);
    setImportPreview(null);
    setPreviewError(null);
    setPreviewLoading(false);
    setImporting(false);
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("report_themes.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("report_themes.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={importInputRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
          <button
            onClick={() => importInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Upload className="h-4 w-4" />
            {t("report_themes.import")}
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("report_themes.newTheme")}
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder={t("report_themes.searchPlaceholder")}
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
                  {t("report_themes.colName")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("report_themes.colDescription")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("report_themes.colPreview")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("report_themes.colCreatedAt")}
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("report_themes.colActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <Palette className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {search ? t("report_themes.noResult") : t("report_themes.noThemes")}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((theme) => (
                  <tr key={theme.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3">
                      <button
                        onClick={() => router.push(`/reports/themes/${theme.id}`)}
                        className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:underline flex items-center gap-2"
                      >
                        {theme.name}
                        {theme.isDefault && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500" />}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate">
                      {theme.description || "\u2014"}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="h-5 w-5 rounded-full border border-slate-200 dark:border-slate-700"
                          style={{ backgroundColor: theme.styles?.colors?.primary || "#1e293b" }}
                        />
                        <div
                          className="h-5 w-5 rounded-full border border-slate-200 dark:border-slate-700"
                          style={{ backgroundColor: theme.styles?.colors?.secondary || "#3b82f6" }}
                        />
                        <span className="text-xs text-slate-400 dark:text-slate-500 ml-1">
                          {theme.styles?.body?.font || "Calibri"} &middot; {theme.styles?.body?.size || 11}pt
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {new Date(theme.createdAt).toLocaleDateString(dateLocale)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleExport(theme)}
                          disabled={exportingId === theme.id}
                          className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                          title={t("report_themes.export")}
                        >
                          {exportingId === theme.id ? (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                          ) : (
                            <Download className="h-4 w-4 text-slate-400 hover:text-blue-600 dark:hover:text-blue-400" />
                          )}
                        </button>
                        <button
                          onClick={() => router.push(`/reports/themes/${theme.id}`)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Pencil className="h-4 w-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                        </button>
                        {!theme.isDefault && (
                          <button
                            onClick={() => setDeleteConfirm(theme)}
                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
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

      {/* Create Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t("report_themes.newTheme")}
              </h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className={labelClass}>{t("report_themes.colName")}</label>
                <input
                  type="text"
                  value={themeName}
                  onChange={(e) => setThemeName(e.target.value)}
                  placeholder={t("report_themes.namePlaceholder")}
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSave();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("report_themes.colDescription")}</label>
                <textarea
                  value={themeDescription}
                  onChange={(e) => setThemeDescription(e.target.value)}
                  rows={3}
                  placeholder={t("report_themes.descriptionPlaceholder")}
                  className={`${inputClass} resize-none`}
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !themeName.trim()}
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
              {t("report_themes.confirmDelete", { name: deleteConfirm.name })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
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

      {/* Import preview modal */}
      {importFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <Upload className="h-5 w-5 text-slate-400" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("report_themes.importPreviewTitle")}</h3>
                  <p className="text-xs text-slate-400 dark:text-slate-500">{importFile.name}</p>
                </div>
              </div>
              <button onClick={closeImportModal} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
              {previewLoading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-900 dark:text-white" />
                </div>
              )}

              {previewError && (
                <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3">
                  <p className="text-sm text-red-700 dark:text-red-400">{previewError}</p>
                </div>
              )}

              {importPreview && !previewLoading && (
                <>
                  {/* Theme info */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <Palette className="h-3.5 w-3.5" />
                      {t("report_themes.importSectionTheme")}
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5">
                          <div
                            className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700"
                            style={{ backgroundColor: importPreview.theme.colors.primary }}
                          />
                          <div
                            className="h-8 w-8 rounded-lg border border-slate-200 dark:border-slate-700"
                            style={{ backgroundColor: importPreview.theme.colors.secondary }}
                          />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{importPreview.theme.name}</p>
                          {importPreview.theme.description && (
                            <p className="text-xs text-slate-400 mt-0.5">{importPreview.theme.description}</p>
                          )}
                          <p className="text-xs text-slate-400 mt-0.5">
                            {importPreview.theme.font} &middot; {importPreview.theme.fontSize}pt
                          </p>
                        </div>
                      </div>
                      {importPreview.theme.exists ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20">
                          <AlertTriangle className="h-3 w-3" />
                          {t("report_themes.importExists")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
                          <Plus className="h-3 w-3" />
                          {t("report_themes.importNew")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Warning if theme already exists */}
                  {importPreview.theme.exists && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-4 py-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">{t("report_themes.importWarningDuplicate")}</p>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            {importPreview && !previewLoading && (
              <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
                <button
                  onClick={closeImportModal}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {t("report_themes.importConfirm")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
