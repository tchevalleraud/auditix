"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  Loader2,
  Download,
  Trash2,
  RotateCcw,
  Play,
  CheckCircle2,
  AlertTriangle,
  FileText,
} from "lucide-react";

interface WordVersion {
  id: number;
  versionNumber: number;
  nodeId: number | null;
  nodeLabel: string | null;
  status: string | null;
  error: string | null;
  isCurrent: boolean;
  fileSize: number | null;
  createdBy: string | null;
  createdAt: string;
}

const STRINGS = {
  fr: {
    generate: "Générer le Word",
    generating: "Génération…",
    empty: "Aucune version Word générée pour l'instant.",
    version: "Version",
    node: "Équipement",
    date: "Date",
    size: "Taille",
    author: "Auteur",
    status: "Statut",
    actions: "Actions",
    current: "Courante",
    ready: "Prêt",
    running: "En cours",
    failed: "Échec",
    download: "Télécharger",
    setCurrent: "Définir comme courante",
    delete: "Supprimer",
    deleteSelected: "Supprimer la sélection",
    confirmDelete: "Supprimer cette version ?",
    confirmBulk: (n: number) => `Supprimer ${n} version(s) ?`,
  },
  en: {
    generate: "Generate Word",
    generating: "Generating…",
    empty: "No Word version generated yet.",
    version: "Version",
    node: "Device",
    date: "Date",
    size: "Size",
    author: "Author",
    status: "Status",
    actions: "Actions",
    current: "Current",
    ready: "Ready",
    running: "Running",
    failed: "Failed",
    download: "Download",
    setCurrent: "Set as current",
    delete: "Delete",
    deleteSelected: "Delete selection",
    confirmDelete: "Delete this version?",
    confirmBulk: (n: number) => `Delete ${n} version(s)?`,
  },
} as const;

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB"];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export default function WordVersionsTab({
  reportId,
  locale,
  isNodeReport,
}: {
  reportId: number;
  locale: string;
  isNodeReport: boolean;
}) {
  const s = STRINGS[locale === "fr" ? "fr" : "en"];
  const [versions, setVersions] = useState<WordVersion[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busyId, setBusyId] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/reports/${reportId}/word-versions`);
    if (res.ok) {
      const data: WordVersion[] = await res.json();
      setVersions(data);
      setGenerating(data.some((v) => v.status === "running" || v.status === "pending"));
    }
    setLoading(false);
  }, [reportId]);

  useEffect(() => {
    load();
  }, [load]);

  // Mercure SSE: react to Word generation lifecycle.
  useEffect(() => {
    const url = new URL("/.well-known/mercure", window.location.origin);
    url.searchParams.append("topic", `reports/${reportId}`);
    const es = new EventSource(url);
    esRef.current = es;
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.event === "word-generation") {
        if (data.status === "running") {
          setGenerating(true);
          load();
        } else {
          load();
        }
      }
    };
    return () => es.close();
  }, [reportId, load]);

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await fetch(`/api/reports/${reportId}/word-versions/generate`, { method: "POST" });
    if (!res.ok) setGenerating(false);
    else load();
  };

  const download = (vid: number) => {
    window.open(`/api/reports/${reportId}/word-versions/${vid}/download`, "_blank");
  };

  const restore = async (vid: number) => {
    setBusyId(vid);
    try {
      const res = await fetch(`/api/reports/${reportId}/word-versions/${vid}/restore`, { method: "POST" });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (vid: number) => {
    if (!window.confirm(s.confirmDelete)) return;
    setBusyId(vid);
    try {
      const res = await fetch(`/api/reports/${reportId}/word-versions/${vid}`, { method: "DELETE" });
      if (res.ok) {
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(vid);
          return next;
        });
        await load();
      }
    } finally {
      setBusyId(null);
    }
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0 || !window.confirm(s.confirmBulk(ids.length))) return;
    const res = await fetch(`/api/reports/${reportId}/word-versions/bulk-delete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (res.ok) {
      setSelected(new Set());
      await load();
    }
  };

  const toggle = (vid: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(vid)) next.delete(vid);
      else next.add(vid);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => (prev.size === versions.length ? new Set() : new Set(versions.map((v) => v.id))));
  };

  const fmtDate = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(locale);
    } catch {
      return iso;
    }
  };

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <FileText className="h-5 w-5 text-blue-500" />
          Word
        </h2>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={bulkDelete}
              className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-900 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              {s.deleteSelected} ({selected.size})
            </button>
          )}
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
            {generating ? s.generating : s.generate}
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
        {loading ? (
          <div className="flex items-center justify-center p-10 text-slate-400">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : versions.length === 0 ? (
          <div className="flex items-center justify-center p-10 text-sm text-slate-500 dark:text-slate-400">
            {s.empty}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 text-slate-500 dark:text-slate-400">
              <tr>
                <th className="w-10 px-3 py-2.5 text-left">
                  <input
                    type="checkbox"
                    checked={selected.size === versions.length && versions.length > 0}
                    onChange={toggleAll}
                    className="rounded border-slate-300"
                  />
                </th>
                <th className="px-3 py-2.5 text-left font-medium">{s.version}</th>
                {isNodeReport && <th className="px-3 py-2.5 text-left font-medium">{s.node}</th>}
                <th className="px-3 py-2.5 text-left font-medium">{s.date}</th>
                <th className="px-3 py-2.5 text-left font-medium">{s.size}</th>
                <th className="px-3 py-2.5 text-left font-medium">{s.author}</th>
                <th className="px-3 py-2.5 text-left font-medium">{s.status}</th>
                <th className="px-3 py-2.5 text-right font-medium">{s.actions}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {versions.map((v) => {
                const ready = v.status === null && v.fileSize !== null;
                const failed = v.status === "failed";
                const running = v.status === "running" || v.status === "pending";
                return (
                  <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="px-3 py-2.5">
                      <input
                        type="checkbox"
                        checked={selected.has(v.id)}
                        onChange={() => toggle(v.id)}
                        className="rounded border-slate-300"
                      />
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-900 dark:text-slate-100">v{v.versionNumber}</td>
                    {isNodeReport && (
                      <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{v.nodeLabel || "—"}</td>
                    )}
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{fmtDate(v.createdAt)}</td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{formatBytes(v.fileSize)}</td>
                    <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">{v.createdBy || "—"}</td>
                    <td className="px-3 py-2.5">
                      {running && (
                        <span className="inline-flex items-center gap-1.5 text-amber-600">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" /> {s.running}
                        </span>
                      )}
                      {failed && (
                        <span className="inline-flex items-center gap-1.5 text-red-600" title={v.error || ""}>
                          <AlertTriangle className="h-3.5 w-3.5" /> {s.failed}
                        </span>
                      )}
                      {ready && v.isCurrent && (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-green-100 dark:bg-green-900/40 px-2 py-0.5 text-xs font-medium text-green-700 dark:text-green-400">
                          <CheckCircle2 className="h-3.5 w-3.5" /> {s.current}
                        </span>
                      )}
                      {ready && !v.isCurrent && <span className="text-xs text-slate-400">{s.ready}</span>}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {ready && (
                          <>
                            <button
                              onClick={() => download(v.id)}
                              title={s.download}
                              className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-blue-600 transition-colors"
                            >
                              <Download className="h-4 w-4" />
                            </button>
                            {!v.isCurrent && (
                              <button
                                onClick={() => restore(v.id)}
                                disabled={busyId === v.id}
                                title={s.setCurrent}
                                className="p-1.5 rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-green-600 transition-colors disabled:opacity-50"
                              >
                                {busyId === v.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RotateCcw className="h-4 w-4" />
                                )}
                              </button>
                            )}
                          </>
                        )}
                        <button
                          onClick={() => remove(v.id)}
                          disabled={busyId === v.id}
                          title={s.delete}
                          className="p-1.5 rounded-md text-slate-500 hover:bg-red-50 dark:hover:bg-red-950 hover:text-red-600 transition-colors disabled:opacity-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
