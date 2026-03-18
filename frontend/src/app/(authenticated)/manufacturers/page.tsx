"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Box,
  Download,
  Upload,
  X,
  CheckCircle2,
  AlertTriangle,
  Package,
  Terminal,
  ShieldCheck,
  Tag,
} from "lucide-react";

interface EditorItem {
  id: number;
  name: string;
  description: string | null;
  logo: string | null;
  createdAt: string;
}

interface ImportPreview {
  manufacturer: { name: string; description: string | null; hasLogo: boolean; exists: boolean };
  models: { name: string; exists: boolean }[];
  commandCount: number;
  ruleCount: number;
  extractCount: number;
  categories: { name: string; exists: boolean }[];
  exportedAt: string | null;
}

export default function EditorsPage() {
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const [editors, setEditors] = useState<EditorItem[]>([]);
  const [search, setSearch] = useState("");
  const [fetchLoading, setFetchLoading] = useState(true);
  const [exportingId, setExportingId] = useState<number | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  // Import modal state
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const loadEditors = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/manufacturers?context=${current.id}`);
    if (res.ok) setEditors(await res.json());
    setFetchLoading(false);
  }, [current]);

  useEffect(() => {
    loadEditors();
  }, [loadEditors]);

  const filtered = editors.filter(
    (e) =>
      e.name.toLowerCase().includes(search.toLowerCase()) ||
      (e.description ?? "").toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (editor: EditorItem) => {
    if (!confirm(t("admin_editors.confirmDelete", { name: editor.name }))) return;
    await fetch(`/api/manufacturers/${editor.id}`, { method: "DELETE" });
    await loadEditors();
  };

  const handleExport = async (editor: EditorItem) => {
    setExportingId(editor.id);
    try {
      const res = await fetch(`/api/manufacturers/${editor.id}/export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `manufacturer-${editor.name}.json`;
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
      const res = await fetch(`/api/manufacturers/preview-import?context=${current.id}`, {
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
      const res = await fetch(`/api/manufacturers/import?context=${current.id}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Import failed");
      }
      await loadEditors();
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

  const dateLocale =
    locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  if (fetchLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  const newCount = importPreview ? [
    !importPreview.manufacturer.exists ? 1 : 0,
    importPreview.models.filter((m) => !m.exists).length,
    importPreview.categories.filter((c) => !c.exists).length,
  ].reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("admin_editors.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("admin_editors.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={importInputRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
          <button
            onClick={() => importInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Upload className="h-4 w-4" />
            {t("admin_editors.import")}
          </button>
          <Link
            href="/manufacturers/new"
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("admin_editors.newEditor")}
          </Link>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder={t("admin_editors.searchPlaceholder")}
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
                {t("admin_editors.colName")}
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_editors.colDescription")}
              </th>
              <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_editors.colCreatedAt")}
              </th>
              <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("admin_editors.colActions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-12 text-center">
                  <Box className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">
                    {search ? t("admin_editors.noResult") : t("admin_editors.noEditors")}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((editor) => (
                <tr
                  key={editor.id}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                >
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      {editor.logo ? (
                        <img
                          src={editor.logo}
                          alt=""
                          className="h-8 w-8 rounded-lg object-contain bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-0.5"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                          <Box className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        </div>
                      )}
                      <Link href={`/manufacturers/${editor.id}/edit`} className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:underline">
                        {editor.name}
                      </Link>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-500 dark:text-slate-400 line-clamp-1">
                      {editor.description || "\u2014"}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {new Date(editor.createdAt).toLocaleDateString(dateLocale)}
                    </span>
                  </td>
                  <td className="px-5 py-3.5">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleExport(editor)}
                        disabled={exportingId === editor.id}
                        className="rounded-lg p-2 text-slate-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                        title={t("admin_editors.export")}
                      >
                        {exportingId === editor.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                      </button>
                      <Link
                        href={`/manufacturers/${editor.id}/edit`}
                        className="rounded-lg p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(editor)}
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

      {/* Import preview modal */}
      {(importFile) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <Upload className="h-5 w-5 text-slate-400" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("admin_editors.importPreviewTitle")}</h3>
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
                  {/* Manufacturer */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <Box className="h-3.5 w-3.5" />
                      {t("admin_editors.importSectionManufacturer")}
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {importPreview.manufacturer.hasLogo ? (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20">
                            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                          </div>
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <Box className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                          </div>
                        )}
                        <div>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{importPreview.manufacturer.name}</p>
                          {importPreview.manufacturer.description && (
                            <p className="text-xs text-slate-400 mt-0.5">{importPreview.manufacturer.description}</p>
                          )}
                          {importPreview.manufacturer.hasLogo && (
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5">{t("admin_editors.importWithLogo")}</p>
                          )}
                        </div>
                      </div>
                      {importPreview.manufacturer.exists ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20">
                          <AlertTriangle className="h-3 w-3" />
                          {t("admin_editors.importExists")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
                          <Plus className="h-3 w-3" />
                          {t("admin_editors.importNew")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Models */}
                  {importPreview.models.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        <Package className="h-3.5 w-3.5" />
                        {t("admin_editors.importSectionModels")} ({importPreview.models.length})
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                        {importPreview.models.map((m, i) => (
                          <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                            <span className="text-sm text-slate-700 dark:text-slate-300">{m.name}</span>
                            {m.exists ? (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20">
                                <AlertTriangle className="h-3 w-3" />
                                {t("admin_editors.importExists")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
                                <Plus className="h-3 w-3" />
                                {t("admin_editors.importNew")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Commands & Rules summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 text-center">
                      <Terminal className="h-4 w-4 text-slate-400 mx-auto mb-1" />
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{importPreview.commandCount}</p>
                      <p className="text-xs text-slate-400">{t("admin_editors.importCommands")}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 text-center">
                      <ShieldCheck className="h-4 w-4 text-slate-400 mx-auto mb-1" />
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{importPreview.ruleCount}</p>
                      <p className="text-xs text-slate-400">{t("admin_editors.importRules")}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 text-center">
                      <Tag className="h-4 w-4 text-slate-400 mx-auto mb-1" />
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{importPreview.extractCount}</p>
                      <p className="text-xs text-slate-400">{t("admin_editors.importExtracts")}</p>
                    </div>
                  </div>

                  {/* Inventory categories */}
                  {importPreview.categories.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("admin_editors.importSectionCategories")} ({importPreview.categories.length})
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                        {importPreview.categories.map((c, i) => (
                          <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                            <span className="text-sm text-slate-700 dark:text-slate-300">{c.name}</span>
                            {c.exists ? (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300/50 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-600/50">
                                <CheckCircle2 className="h-3 w-3" />
                                {t("admin_editors.importExists")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
                                <Plus className="h-3 w-3" />
                                {t("admin_editors.importNew")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warning if manufacturer already exists */}
                  {importPreview.manufacturer.exists && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-4 py-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">{t("admin_editors.importWarningDuplicate")}</p>
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
                  {t("admin_editors.importCancel")}
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {t("admin_editors.importConfirm")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
