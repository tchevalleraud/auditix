"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import {
  X,
  Upload,
  Loader2,
  FileArchive,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

interface FileEntry {
  filename: string;
  ipAddress: string | null;
  nodeId: number | null;
  nodeName: string | null;
  status: string;
  message: string | null;
  collectionId: number | null;
}

interface AnalysisResponse {
  dryRun: boolean;
  totalFiles: number;
  imported: number;
  files: FileEntry[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  contextId: number;
}

const DEFAULT_PROMPT_REGEX = "^[\\w\\-.]+:\\d+#(.+)$";

const statusStyle: Record<string, { color: string; bg: string; Icon: typeof CheckCircle2 }> = {
  matched: { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-500/20", Icon: CheckCircle2 },
  imported: { color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-500/20", Icon: CheckCircle2 },
  "no-node": { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-500/20", Icon: AlertCircle },
  "no-model": { color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-100 dark:bg-amber-500/20", Icon: AlertCircle },
  "invalid-name": { color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-700/40", Icon: XCircle },
  empty: { color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-700/40", Icon: XCircle },
  failed: { color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-500/20", Icon: XCircle },
};

export default function CollectionsZipImportModal({ open, onClose, onImported, contextId }: Props) {
  const { t } = useI18n();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [filename, setFilename] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [result, setResult] = useState<AnalysisResponse | null>(null);
  const [promptRegex, setPromptRegex] = useState(DEFAULT_PROMPT_REGEX);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setStep(1);
    setFilename("");
    setFile(null);
    setAnalysis(null);
    setResult(null);
    setPromptRegex(DEFAULT_PROMPT_REGEX);
    setDragOver(false);
    setError(null);
    setAnalyzing(false);
    setImporting(false);
  };

  const close = () => { reset(); onClose(); };

  const ingestFile = async (selected: File) => {
    setError(null);
    if (!selected.name.toLowerCase().endsWith(".zip") && selected.type !== "application/zip" && selected.type !== "application/x-zip-compressed") {
      setError(t("collections.zipImportNotZip"));
      return;
    }
    setFile(selected);
    setFilename(selected.name);
    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append("file", selected);
      const res = await fetch(`/api/collections/import-zip?context=${contextId}&dryRun=1`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("collections.zipImportAnalyzeError"));
        setAnalyzing(false);
        return;
      }
      const data: AnalysisResponse = await res.json();
      setAnalysis(data);
      setStep(2);
    } catch {
      setError(t("collections.zipImportAnalyzeError"));
    } finally {
      setAnalyzing(false);
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

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      if (promptRegex.trim()) {
        formData.append("promptPattern", promptRegex.trim());
      }
      const res = await fetch(`/api/collections/import-zip?context=${contextId}`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || t("collections.zipImportError"));
        setImporting(false);
        return;
      }
      const data: AnalysisResponse = await res.json();
      setResult(data);
      setStep(3);
      onImported();
    } catch {
      setError(t("collections.zipImportError"));
    } finally {
      setImporting(false);
    }
  };

  const importableCount = analysis?.files.filter((f) => f.status === "matched").length ?? 0;
  const displayed = step === 3 ? result : analysis;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-5xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            {step === 2 && !importing && (
              <button onClick={() => { reset(); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title={t("common.back")}>
                <ArrowLeft className="h-4 w-4 text-slate-500" />
              </button>
            )}
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("collections.zipImportTitle")}</h3>
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
                {analyzing ? (
                  <Loader2 className="h-10 w-10 text-slate-400 animate-spin" />
                ) : (
                  <Upload className="h-10 w-10 text-slate-400" />
                )}
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {analyzing ? t("collections.zipImportAnalyzing") : t("collections.zipImportDrop")}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t("collections.zipImportFormats")}</p>
                <input ref={fileInputRef} type="file" accept=".zip,application/zip" onChange={onFileChange} className="hidden" />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
          )}

          {(step === 2 || step === 3) && displayed && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <FileArchive className="h-4 w-4" />
                <span className="font-medium text-slate-700 dark:text-slate-300">{filename}</span>
                <span>—</span>
                <span>{t("collections.zipImportFileCount", { count: String(displayed.totalFiles) })}</span>
              </div>

              {step === 3 && result && (
                <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/30 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                  {t("collections.zipImportDone", { count: String(result.imported) })}
                </div>
              )}

              {step === 2 && (
                <>
                  <div className="rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                    {t("collections.zipImportSummary", { count: String(importableCount), total: String(displayed.totalFiles) })}
                  </div>
                  <div className="space-y-1.5">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("collections.zipImportPromptRegex")}</label>
                    <input
                      type="text"
                      value={promptRegex}
                      onChange={(e) => setPromptRegex(e.target.value)}
                      placeholder={DEFAULT_PROMPT_REGEX}
                      disabled={importing}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none disabled:opacity-50"
                    />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{t("collections.zipImportPromptRegexHelp")}</p>
                  </div>
                </>
              )}

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 max-h-[50vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("collections.zipImportColFile")}</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("collections.zipImportColIp")}</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("collections.zipImportColNode")}</th>
                      <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("collections.zipImportColStatus")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {displayed.files.map((f, i) => {
                      const sc = statusStyle[f.status] || statusStyle.failed;
                      const Icon = sc.Icon;
                      return (
                        <tr key={i}>
                          <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">{f.filename}</td>
                          <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">{f.ipAddress || "\u2014"}</td>
                          <td className="px-3 py-2 text-xs text-slate-700 dark:text-slate-300">{f.nodeName || "\u2014"}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${sc.bg} ${sc.color}`}>
                              <Icon className="h-3.5 w-3.5" />
                              {t(`collections.zipImportStatus_${f.status}`)}
                            </span>
                            {f.message && (
                              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">{f.message}</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
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
              disabled={importing || importableCount === 0}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("collections.zipImportSubmit", { count: String(importableCount) })}
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
