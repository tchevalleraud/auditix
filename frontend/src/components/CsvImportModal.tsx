"use client";

import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { X, Upload, Loader2, FileText, ArrowLeft } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

interface Manufacturer { id: number; name: string; }
interface Model { id: number; name: string; manufacturer: { id: number }; }
interface Profile { id: number; name: string; }

interface Props {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
  contextId: number;
  manufacturers: Manufacturer[];
  models: Model[];
  profiles: Profile[];
}

interface Rule {
  manufacturerId: number | null;
  modelId: number | null;
  profileId: number | null;
  policy: string | null;
}

const inputClass =
  "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

const isValidIp = (s: string) => {
  if (!/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(s)) return false;
  return s.split(".").every((p) => Number(p) >= 0 && Number(p) <= 255);
};

function parseCsv(text: string): { headers: string[]; rows: string[][] } {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const candidates = [",", ";", "\t"];
  let sep = ",";
  let bestCount = 0;
  for (const c of candidates) {
    const count = firstLine.split(c).length;
    if (count > bestCount) { bestCount = count; sep = c; }
  }

  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = "";
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuote) {
        if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (ch === '"') inQuote = false;
        else cur += ch;
      } else {
        if (ch === '"') inQuote = true;
        else if (ch === sep) { out.push(cur); cur = ""; }
        else cur += ch;
      }
    }
    out.push(cur);
    return out;
  };

  const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseLine(lines[0]).map((h) => h.trim());
  const rows = lines.slice(1).map(parseLine);
  return { headers, rows };
}

export default function CsvImportModal({
  open, onClose, onImported, contextId, manufacturers, models, profiles,
}: Props) {
  const { t } = useI18n();

  const [step, setStep] = useState<1 | 2>(1);
  const [filename, setFilename] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [ipColumn, setIpColumn] = useState<number | null>(null);
  const [matchColumn, setMatchColumn] = useState<number | null>(null);
  const [rules, setRules] = useState<Record<string, Rule>>({});
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, created: 0, skipped: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!open) return null;

  const reset = () => {
    setStep(1);
    setFilename("");
    setHeaders([]);
    setRows([]);
    setIpColumn(null);
    setMatchColumn(null);
    setRules({});
    setDragOver(false);
    setError(null);
    setImporting(false);
    setProgress({ done: 0, total: 0, created: 0, skipped: 0 });
  };

  const close = () => { reset(); onClose(); };

  const ingestFile = (file: File) => {
    setError(null);
    if (!file.name.toLowerCase().endsWith(".csv") && file.type !== "text/csv") {
      setError(t("nodes.csvImportNotCsv"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result ?? "");
      const parsed = parseCsv(text);
      if (parsed.headers.length === 0 || parsed.rows.length === 0) {
        setError(t("nodes.csvImportEmpty"));
        return;
      }
      setFilename(file.name);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      const guessIp = parsed.headers.findIndex((h) => /ip|address|adresse/i.test(h));
      setIpColumn(guessIp >= 0 ? guessIp : null);
      setStep(2);
    };
    reader.onerror = () => setError(t("nodes.csvImportReadError"));
    reader.readAsText(file);
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

  const uniqueValues = matchColumn !== null
    ? Array.from(new Set(rows.map((r) => (r[matchColumn] ?? "").trim()).filter((v) => v.length > 0))).sort()
    : [];

  const setRule = <K extends keyof Rule>(value: string, key: K, val: Rule[K]) => {
    setRules((prev) => {
      const cur: Rule = prev[value] ?? { manufacturerId: null, modelId: null, profileId: null, policy: null };
      const next: Rule = { ...cur, [key]: val };
      if (key === "manufacturerId") next.modelId = null;
      return { ...prev, [value]: next };
    });
  };

  const handleImport = async () => {
    if (ipColumn === null) return;
    setImporting(true);
    let created = 0;
    let skipped = 0;
    setProgress({ done: 0, total: rows.length, created: 0, skipped: 0 });
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const ip = (row[ipColumn] ?? "").trim();
      if (!isValidIp(ip)) {
        skipped++;
        setProgress({ done: i + 1, total: rows.length, created, skipped });
        continue;
      }
      const rule = matchColumn !== null ? rules[(row[matchColumn] ?? "").trim()] : undefined;
      const body: Record<string, unknown> = {
        ipAddress: ip,
        policy: rule?.policy ?? "audit",
      };
      if (rule?.profileId) body.profileId = rule.profileId;
      if (rule?.manufacturerId) body.manufacturerId = rule.manufacturerId;
      if (rule?.modelId) body.modelId = rule.modelId;
      try {
        const res = await fetch(`/api/nodes?context=${contextId}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) created++; else skipped++;
      } catch {
        skipped++;
      }
      setProgress({ done: i + 1, total: rows.length, created, skipped });
    }
    setImporting(false);
    onImported();
    close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-6xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            {step === 2 && !importing && (
              <button onClick={() => { reset(); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title={t("nodes.csvImportBack")}>
                <ArrowLeft className="h-4 w-4 text-slate-500" />
              </button>
            )}
            <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("nodes.csvImportTitle")}</h3>
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
                onClick={() => fileInputRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-16 cursor-pointer transition-colors ${
                  dragOver
                    ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800"
                    : "border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600"
                }`}
              >
                <Upload className="h-10 w-10 text-slate-400" />
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("nodes.csvImportDrop")}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t("nodes.csvImportFormats")}</p>
                <input ref={fileInputRef} type="file" accept=".csv,text/csv" onChange={onFileChange} className="hidden" />
              </div>
              {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                <FileText className="h-4 w-4" />
                <span className="font-medium text-slate-700 dark:text-slate-300">{filename}</span>
                <span>—</span>
                <span>{t("nodes.csvImportRowCount", { count: String(rows.length) })}</span>
              </div>

              <div className="rounded-lg border border-slate-200 dark:border-slate-800 max-h-72 overflow-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 dark:bg-slate-800/50 sticky top-0">
                    <tr>{headers.map((h, i) => (
                      <th key={i} className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{h}</th>
                    ))}</tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rows.map((r, i) => (
                      <tr key={i}>{headers.map((_, j) => (
                        <td key={j} className="px-3 py-1.5 text-slate-600 dark:text-slate-400 whitespace-nowrap">{r[j] ?? ""}</td>
                      ))}</tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="space-y-1.5 max-w-md">
                <label className={labelClass}>{t("nodes.csvImportIpColumn")} *</label>
                <select value={ipColumn ?? ""} onChange={(e) => setIpColumn(e.target.value === "" ? null : Number(e.target.value))} className={inputClass}>
                  <option value="">--</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{t("nodes.csvImportRulesTitle")}</h4>
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t("nodes.csvImportRulesHelp")}</p>
                <div className="space-y-1.5 max-w-md">
                  <label className={labelClass}>{t("nodes.csvImportMatchColumn")} *</label>
                  <select value={matchColumn ?? ""} onChange={(e) => { setMatchColumn(e.target.value === "" ? null : Number(e.target.value)); setRules({}); }} className={inputClass}>
                    <option value="">--</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select>
                </div>

                {matchColumn !== null && uniqueValues.length > 0 && (
                  <div className="mt-3 rounded-lg border border-slate-200 dark:border-slate-800 overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 dark:bg-slate-800/50">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("nodes.csvImportColValue")}</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("nodes.manufacturer")}</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("nodes.model")}</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("nodes.profile")}</th>
                          <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("nodes.policy")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {uniqueValues.map((v) => {
                          const rule = rules[v];
                          const filteredModels = rule?.manufacturerId
                            ? models.filter((m) => m.manufacturer?.id === rule.manufacturerId)
                            : models;
                          const cellSelect = "w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs text-slate-700 dark:text-slate-300";
                          return (
                            <tr key={v}>
                              <td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300 whitespace-nowrap">{v}</td>
                              <td className="px-3 py-2">
                                <select value={rule?.manufacturerId ?? ""} onChange={(e) => setRule(v, "manufacturerId", e.target.value ? Number(e.target.value) : null)} className={cellSelect}>
                                  <option value="">--</option>
                                  {manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <select value={rule?.modelId ?? ""} onChange={(e) => setRule(v, "modelId", e.target.value ? Number(e.target.value) : null)} className={cellSelect}>
                                  <option value="">--</option>
                                  {filteredModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <select value={rule?.profileId ?? ""} onChange={(e) => setRule(v, "profileId", e.target.value ? Number(e.target.value) : null)} className={cellSelect}>
                                  <option value="">--</option>
                                  {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              </td>
                              <td className="px-3 py-2">
                                <select value={rule?.policy ?? ""} onChange={(e) => setRule(v, "policy", e.target.value || null)} className={cellSelect}>
                                  <option value="">--</option>
                                  <option value="audit">Audit</option>
                                  <option value="enforce">Enforce</option>
                                </select>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {importing && (
                <div className="space-y-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 p-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-700 dark:text-slate-300">{t("nodes.csvImportProgress", { done: String(progress.done), total: String(progress.total) })}</span>
                    <span className="text-slate-500 dark:text-slate-400">{t("nodes.csvImportProgressDetail", { created: String(progress.created), skipped: String(progress.skipped) })}</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div className="h-full bg-slate-900 dark:bg-white transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                </div>
              )}
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
              disabled={importing || ipColumn === null || matchColumn === null}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("nodes.csvImportSubmit", { count: String(rows.length) })}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
