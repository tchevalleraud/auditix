"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Plus,
  Loader2,
  Search,
  BookOpen,
  Pencil,
  Trash2,
  X,
  ToggleLeft,
  ToggleRight,
  Download,
  Upload,
  CheckCircle2,
  AlertTriangle,
  ClipboardCheck,
  Tag,
} from "lucide-react";

interface PolicyItem {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  createdAt: string;
}

interface ImportPreview {
  policy: { name: string; description: string | null; enabled: boolean; exists: boolean };
  ruleCount: number;
  extraRuleCount: number;
  categories: { name: string; exists: boolean }[];
  exportedAt: string | null;
}

export default function CompliancePoliciesPage() {
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const router = useRouter();
  const [policies, setPolicies] = useState<PolicyItem[]>([]);
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

  // Modal state
  const [modal, setModal] = useState(false);
  const [policyName, setPolicyName] = useState("");
  const [policyDescription, setPolicyDescription] = useState("");
  const [policyEnabled, setPolicyEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<PolicyItem | null>(null);

  const dateLocale = locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  const loadPolicies = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/compliance-policies?context=${current.id}`);
    if (res.ok) setPolicies(await res.json());
    setFetchLoading(false);
  }, [current]);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  const filtered = policies.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(search.toLowerCase()))
  );

  const openCreate = () => {
    setPolicyName("");
    setPolicyDescription("");
    setPolicyEnabled(true);
    setModal(true);
  };

  const handleSave = async () => {
    if (!policyName.trim() || !current) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/compliance-policies?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: policyName.trim(),
          description: policyDescription.trim() || null,
          enabled: policyEnabled,
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setModal(false);
        router.push(`/compliance/policies/${created.id}`);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (policy: PolicyItem) => {
    await fetch(`/api/compliance-policies/${policy.id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    loadPolicies();
  };

  const handleExport = async (policy: PolicyItem) => {
    setExportingId(policy.id);
    try {
      const res = await fetch(`/api/compliance-policies/${policy.id}/export`);
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") || "";
      const match = disposition.match(/filename="?([^"]+)"?/);
      const filename = match?.[1] || `policy-${policy.name}.json`;
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
      const res = await fetch(`/api/compliance-policies/preview-import?context=${current.id}`, {
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
      const res = await fetch(`/api/compliance-policies/import?context=${current.id}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Import failed");
      }
      await loadPolicies();
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

  const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("compliance_policies.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("compliance_policies.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={importInputRef} type="file" accept=".json" onChange={handleFileSelect} className="hidden" />
          <button
            onClick={() => importInputRef.current?.click()}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Upload className="h-4 w-4" />
            {t("compliance_policies.import")}
          </button>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("compliance_policies.newPolicy")}
          </button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder={t("compliance_policies.searchPlaceholder")}
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
                  {t("compliance_policies.colName")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("compliance_policies.colDescription")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("compliance_policies.colStatus")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("compliance_policies.colCreatedAt")}
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("compliance_policies.colActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <BookOpen className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {search ? t("compliance_policies.noResult") : t("compliance_policies.noPolicies")}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((policy) => (
                  <tr key={policy.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3">
                      <button
                        onClick={() => router.push(`/compliance/policies/${policy.id}`)}
                        className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:underline"
                      >
                        {policy.name}
                      </button>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-xs truncate">
                      {policy.description || "—"}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        policy.enabled
                          ? "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                      }`}>
                        {policy.enabled ? t("compliance_policies.enabled") : t("compliance_policies.disabled")}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {new Date(policy.createdAt).toLocaleDateString(dateLocale)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleExport(policy)}
                          disabled={exportingId === policy.id}
                          className="rounded-lg p-2 text-slate-400 hover:text-blue-600 dark:text-slate-500 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors disabled:opacity-50"
                          title={t("compliance_policies.export")}
                        >
                          {exportingId === policy.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                        </button>
                        <button
                          onClick={() => router.push(`/compliance/policies/${policy.id}`)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Pencil className="h-4 w-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(policy)}
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
                {t("compliance_policies.newPolicy")}
              </h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className={labelClass}>{t("compliance_policies.colName")}</label>
                <input
                  type="text"
                  value={policyName}
                  onChange={(e) => setPolicyName(e.target.value)}
                  placeholder={t("compliance_policies.namePlaceholder")}
                  className={inputClass}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("compliance_policies.colDescription")}</label>
                <textarea
                  value={policyDescription}
                  onChange={(e) => setPolicyDescription(e.target.value)}
                  rows={3}
                  placeholder={t("compliance_policies.descriptionPlaceholder")}
                  className={`${inputClass} resize-none`}
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <button type="button" onClick={() => setPolicyEnabled(!policyEnabled)}>
                  {policyEnabled ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                </button>
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  {policyEnabled ? t("compliance_policies.enabled") : t("compliance_policies.disabled")}
                </span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !policyName.trim()}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import preview modal */}
      {(importFile) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <Upload className="h-5 w-5 text-slate-400" />
                <div>
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("compliance_policies.importPreviewTitle")}</h3>
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
                  {/* Policy */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                      <BookOpen className="h-3.5 w-3.5" />
                      {t("compliance_policies.importSectionPolicy")}
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{importPreview.policy.name}</p>
                        {importPreview.policy.description && (
                          <p className="text-xs text-slate-400 mt-0.5">{importPreview.policy.description}</p>
                        )}
                      </div>
                      {importPreview.policy.exists ? (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-500/20">
                          <AlertTriangle className="h-3 w-3" />
                          {t("compliance_policies.importExists")}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
                          <Plus className="h-3 w-3" />
                          {t("compliance_policies.importNew")}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Rules & Extra rules summary */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 text-center">
                      <ClipboardCheck className="h-4 w-4 text-slate-400 mx-auto mb-1" />
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{importPreview.ruleCount}</p>
                      <p className="text-xs text-slate-400">{t("compliance_policies.importRules")}</p>
                    </div>
                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-3 text-center">
                      <Tag className="h-4 w-4 text-slate-400 mx-auto mb-1" />
                      <p className="text-lg font-semibold text-slate-900 dark:text-slate-100">{importPreview.extraRuleCount}</p>
                      <p className="text-xs text-slate-400">{t("compliance_policies.importExtraRules")}</p>
                    </div>
                  </div>

                  {/* Inventory categories */}
                  {importPreview.categories.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                        {t("compliance_policies.importSectionCategories")} ({importPreview.categories.length})
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                        {importPreview.categories.map((c, i) => (
                          <div key={i} className="px-4 py-2.5 flex items-center justify-between">
                            <span className="text-sm text-slate-700 dark:text-slate-300">{c.name}</span>
                            {c.exists ? (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 ring-1 ring-inset ring-slate-300/50 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-600/50">
                                <CheckCircle2 className="h-3 w-3" />
                                {t("compliance_policies.importExists")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20">
                                <Plus className="h-3 w-3" />
                                {t("compliance_policies.importNew")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warning if policy already exists */}
                  {importPreview.policy.exists && (
                    <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-4 py-3">
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-xs text-amber-700 dark:text-amber-400">{t("compliance_policies.importWarningDuplicate")}</p>
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
                  {t("compliance_policies.importCancel")}
                </button>
                <button
                  onClick={handleConfirmImport}
                  disabled={importing}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {t("compliance_policies.importConfirm")}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("compliance_policies.confirmDelete", { name: deleteConfirm.name })}
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
    </div>
  );
}
