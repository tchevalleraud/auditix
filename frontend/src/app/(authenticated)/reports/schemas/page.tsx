"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Download,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Workflow,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";

interface SchemaSummary {
  id: number;
  name: string;
  description: string | null;
  managedByPlugin: string | null;
  createdAt: string;
  updatedAt: string;
}

export default function ReportSchemasListPage() {
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const router = useRouter();
  const [items, setItems] = useState<SchemaSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [visioOpen, setVisioOpen] = useState(false);
  const [visioFile, setVisioFile] = useState<File | null>(null);
  const [visioPages, setVisioPages] = useState<{ index: number; name: string }[]>([]);
  const [visioPage, setVisioPage] = useState(0);
  const [visioLoadingPages, setVisioLoadingPages] = useState(false);
  const [visioImporting, setVisioImporting] = useState(false);
  const [visioError, setVisioError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const dateLocale =
    locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/report-schemas?context=${current.id}`);
      if (res.ok) {
        setItems(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !createName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`/api/report-schemas?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setCreateError(err?.error ?? `HTTP ${res.status}`);
        return;
      }
      setCreateOpen(false);
      setCreateName("");
      setCreateDescription("");
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleImportClick = () => {
    setImportError(null);
    importInputRef.current?.click();
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-picked
    if (!file || !current) return;
    setImporting(true);
    setImportError(null);
    try {
      const text = await file.text();
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { throw new Error("Fichier JSON invalide"); }
      const res = await fetch(`/api/report-schemas/import?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const created = await res.json();
      await load();
      router.push(`/reports/schemas/${created.id}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  };

  const openVisioModal = () => {
    setVisioOpen(true);
    setVisioFile(null);
    setVisioPages([]);
    setVisioPage(0);
    setVisioError(null);
  };

  const handleVisioFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // reset so the same file can be re-picked
    if (!file || !current) return;
    setVisioFile(file);
    setVisioPages([]);
    setVisioPage(0);
    setVisioError(null);
    setVisioLoadingPages(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/report-schemas/import-visio/pages?context=${current.id}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setVisioPages(data.pages ?? []);
    } catch (err) {
      setVisioError(err instanceof Error ? err.message : String(err));
    } finally {
      setVisioLoadingPages(false);
    }
  };

  const handleVisioImport = async () => {
    if (!visioFile || !current) return;
    setVisioImporting(true);
    setVisioError(null);
    try {
      const fd = new FormData();
      fd.append("file", visioFile);
      const res = await fetch(`/api/report-schemas/import-visio?context=${current.id}&page=${visioPage}`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const created = await res.json();
      setVisioOpen(false);
      await load();
      router.push(`/reports/schemas/${created.id}`);
    } catch (err) {
      setVisioError(err instanceof Error ? err.message : String(err));
    } finally {
      setVisioImporting(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(t("schemas.confirmDelete").replace("{name}", name))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/report-schemas/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Workflow className="h-6 w-6" />
            {t("schemas.listTitle")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("schemas.listSubtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
          <button
            onClick={handleImportClick}
            disabled={importing}
            title={t("schemas.importJsonTitle")}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("schemas.importJson")}
          </button>
          <button
            onClick={openVisioModal}
            title={t("schemas.importVisioTitle")}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            <Upload className="h-4 w-4" />
            {t("schemas.importVisio")}
          </button>
          <button
            onClick={() => setCreateOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("schemas.new")}
          </button>
        </div>
      </div>

      {importError && (
        <div className="rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          Import impossible : {importError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-12 text-center">
          <Workflow className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("schemas.listEmpty")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full">
            <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3">{t("schemas.colName")}</th>
                <th className="px-4 py-3">{t("schemas.colDescription")}</th>
                <th className="px-4 py-3">{t("schemas.colUpdatedAt")}</th>
                <th className="px-4 py-3 text-right">{t("schemas.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Link href={`/reports/schemas/${item.id}`} className="text-sm font-medium text-slate-900 dark:text-white hover:underline">
                        {item.name}
                      </Link>
                      {item.managedByPlugin && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-violet-700 bg-violet-100 ring-1 ring-inset ring-violet-200 dark:text-violet-300 dark:bg-violet-900/40 dark:ring-violet-700/50"
                          title={`Managed by plugin "${item.managedByPlugin}" — read-only`}
                        >
                          {item.managedByPlugin}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-md truncate">
                    {item.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400">
                    {new Date(item.updatedAt).toLocaleString(dateLocale)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/reports/schemas/${item.id}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title={t("schemas.open")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Link>
                      <a
                        href={`/api/report-schemas/${item.id}/export`}
                        download
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title="Exporter en JSON"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      {!item.managedByPlugin && (
                        <button
                          onClick={() => handleDelete(item.id, item.name)}
                          disabled={busyId === item.id}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          title={t("schemas.delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreateOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl"
          >
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              {t("schemas.createTitle")}
            </h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  {t("schemas.fieldNameLabel")}
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  {t("schemas.fieldDescriptionLabel")}
                </label>
                <textarea
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm resize-none"
                />
              </div>
              {createError && <p className="text-xs text-red-600 dark:text-red-400">{createError}</p>}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={creating || !createName.trim()}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {t("schemas.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {visioOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !visioImporting && setVisioOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl"
          >
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">
              {t("schemas.importVisioTitle")}
            </h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
              {t("schemas.importVisioHint")}
            </p>

            <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              <Upload className="h-4 w-4 shrink-0" />
              <span className="truncate">{visioFile ? visioFile.name : t("schemas.importVisioChoose")}</span>
              <input type="file" accept=".vsdx,.vsdt" onChange={handleVisioFileSelected} className="hidden" />
            </label>

            {visioLoadingPages && (
              <div className="flex items-center gap-2 mt-4 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("schemas.importVisioReading")}
              </div>
            )}

            {visioPages.length > 0 && (
              <div className="mt-4 space-y-1">
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                  {t("schemas.importVisioTab")}
                </label>
                <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                  {visioPages.map((p) => (
                    <label key={p.index} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                      <input
                        type="radio"
                        name="visio-page"
                        checked={visioPage === p.index}
                        onChange={() => setVisioPage(p.index)}
                      />
                      <span className="text-slate-700 dark:text-slate-200">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {visioError && <p className="text-xs text-red-600 dark:text-red-400 mt-3">{visioError}</p>}

            <div className="flex items-center justify-end gap-2 pt-5">
              <button
                type="button"
                onClick={() => setVisioOpen(false)}
                disabled={visioImporting}
                className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={handleVisioImport}
                disabled={visioImporting || visioPages.length === 0}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 disabled:opacity-50"
              >
                {visioImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {t("schemas.importVisioAction")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
