"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { X, Upload, Loader2, FileArchive, ArrowLeft, CheckCircle2, AlertCircle } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

interface PreviewContext {
  sourceName: string;
  effectiveName: string;
  action: "create" | "merge-default" | "rename";
  isDefault: boolean;
  counts: Record<string, number>;
}

interface PreviewResponse {
  format: string;
  version: number;
  exportedAt: string | null;
  contexts: PreviewContext[];
}

interface ImportedContext {
  id: number;
  name: string;
  isDefault: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}

const actionStyle: Record<PreviewContext["action"], { color: string; bg: string }> = {
  create: { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-500/20" },
  "merge-default": { color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-500/20" },
  rename: { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-500/20" },
};

export default function ContextImportModal({ open, onClose, onImported }: Props) {
  const { t } = useI18n();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [file, setFile] = useState<File | null>(null);
  const [filename, setFilename] = useState("");
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [imported, setImported] = useState<ImportedContext[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setStep(1);
    setFile(null);
    setFilename("");
    setPreview(null);
    setImported([]);
    setDragOver(false);
    setError(null);
    setAnalyzing(false);
    setImporting(false);
  };

  const close = () => { reset(); onClose(); };

  const ingestFile = async (selected: File) => {
    setError(null);
    if (!selected.name.toLowerCase().endsWith(".zip")) {
      setError(t("admin_contexts.importNotZip"));
      return;
    }
    setFile(selected);
    setFilename(selected.name);
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", selected);
      const res = await fetch("/api/contexts/import/preview", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("admin_contexts.importPreviewError"));
        setAnalyzing(false);
        return;
      }
      setPreview(await res.json());
      setStep(2);
    } catch {
      setError(t("admin_contexts.importPreviewError"));
    } finally {
      setAnalyzing(false);
    }
  };

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/contexts/import", { method: "POST", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("admin_contexts.importError"));
        setImporting(false);
        return;
      }
      const data = await res.json();
      setImported(data.imported || []);
      setStep(3);
      onImported();
    } catch {
      setError(t("admin_contexts.importError"));
    } finally {
      setImporting(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) ingestFile(f);
  };

  const onFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) ingestFile(f);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-4xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            {step === 2 && !importing && (
              <button onClick={reset} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title={t("common.back")}>
                <ArrowLeft className="h-4 w-4 text-slate-500" />
              </button>
            )}
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("admin_contexts.importTitle")}</h3>
          </div>
          <button onClick={close} disabled={importing} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 && (
            <div className="space-y-4">
              <div
                onDrop={onDrop}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onClick={() => !analyzing && fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-16 transition-colors ${
                  analyzing ? "cursor-wait opacity-60" : "cursor-pointer"
                } ${
                  dragOver
                    ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800"
                    : "border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600"
                }`}
              >
                {analyzing ? <Loader2 className="h-10 w-10 text-slate-400 animate-spin" /> : <Upload className="h-10 w-10 text-slate-400" />}
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {analyzing ? t("admin_contexts.importAnalyzing") : t("admin_contexts.importDrop")}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t("admin_contexts.importFormats")}</p>
                <input ref={fileInputRef} type="file" accept=".zip,application/zip" onChange={onFileChange} className="hidden" />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
          )}

          {step === 2 && preview && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <FileArchive className="h-4 w-4" />
                <span className="font-medium text-slate-700 dark:text-slate-300">{filename}</span>
                <span>—</span>
                <span>{t("admin_contexts.importContextCount", { count: String(preview.contexts.length) })}</span>
              </div>

              <div className="space-y-3">
                {preview.contexts.map((ctx, idx) => {
                  const style = actionStyle[ctx.action];
                  return (
                    <div key={idx} className="rounded-lg border border-slate-200 dark:border-slate-800 p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-semibold text-slate-900 dark:text-slate-100">{ctx.effectiveName}</span>
                            {ctx.effectiveName !== ctx.sourceName && (
                              <span className="text-xs text-slate-400 dark:text-slate-500">({t("admin_contexts.importOriginalName")} : {ctx.sourceName})</span>
                            )}
                          </div>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style.bg} ${style.color}`}>
                          {t(`admin_contexts.importAction_${ctx.action}`)}
                        </span>
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-xs text-slate-500 dark:text-slate-400">
                        {Object.entries(ctx.counts).map(([key, value]) => (
                          <div key={key} className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-700 dark:text-slate-300">{value}</span>
                            <span>{t(`admin_contexts.importEntity_${key}`)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {t("admin_contexts.importDone", { count: String(imported.length) })}
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("admin_contexts.colName")}</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">ID</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {imported.map((c) => (
                      <tr key={c.id}>
                        <td className="px-3 py-2 text-slate-700 dark:text-slate-300">
                          {c.name}
                          {c.isDefault && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-500 dark:text-slate-400">
                              {t("common.default")}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs font-mono text-slate-500 dark:text-slate-400">{c.id}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {step === 2 && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <button onClick={close} disabled={importing} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50">
              {t("common.cancel")}
            </button>
            <button
              onClick={handleImport}
              disabled={importing || preview!.contexts.length === 0}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("admin_contexts.importSubmit")}
            </button>
          </div>
        )}

        {step === 3 && (
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800 shrink-0">
            <button onClick={close} className="rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
              {t("common.close")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
