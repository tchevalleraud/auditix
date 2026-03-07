"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  Loader2,
  RefreshCw,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

// --- Nginx types ---
interface NginxEntry {
  ip: string;
  datetime: string;
  method: string;
  url: string;
  status: number;
  size: number;
  referer: string | null;
  userAgent: string;
}

// --- Symfony types ---
interface SymfonyEntry {
  level: string;
  channel: string;
  message: string;
  datetime: string;
}

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

// --- Colors ---
const httpStatusColor = (code: number) => {
  if (code >= 500)
    return "text-red-700 bg-red-50 ring-red-600/20 dark:text-red-400 dark:bg-red-500/10 dark:ring-red-500/20";
  if (code >= 400)
    return "text-amber-700 bg-amber-50 ring-amber-600/20 dark:text-amber-400 dark:bg-amber-500/10 dark:ring-amber-500/20";
  if (code >= 300)
    return "text-sky-700 bg-sky-50 ring-sky-600/20 dark:text-sky-400 dark:bg-sky-500/10 dark:ring-sky-500/20";
  return "text-emerald-700 bg-emerald-50 ring-emerald-600/20 dark:text-emerald-400 dark:bg-emerald-500/10 dark:ring-emerald-500/20";
};

const methodColor = (method: string) => {
  switch (method) {
    case "GET": return "text-blue-700 dark:text-blue-400";
    case "POST": return "text-emerald-700 dark:text-emerald-400";
    case "PUT": case "PATCH": return "text-amber-700 dark:text-amber-400";
    case "DELETE": return "text-red-700 dark:text-red-400";
    default: return "text-slate-600 dark:text-slate-400";
  }
};

const levelColors: Record<string, string> = {
  debug: "text-slate-500 bg-slate-50 ring-slate-500/20 dark:text-slate-400 dark:bg-slate-800 dark:ring-slate-600/20",
  info: "text-blue-700 bg-blue-50 ring-blue-600/20 dark:text-blue-400 dark:bg-blue-500/10 dark:ring-blue-500/20",
  notice: "text-sky-700 bg-sky-50 ring-sky-600/20 dark:text-sky-400 dark:bg-sky-500/10 dark:ring-sky-500/20",
  warning: "text-amber-700 bg-amber-50 ring-amber-600/20 dark:text-amber-400 dark:bg-amber-500/10 dark:ring-amber-500/20",
  error: "text-red-700 bg-red-50 ring-red-600/20 dark:text-red-400 dark:bg-red-500/10 dark:ring-red-500/20",
  critical: "text-red-800 bg-red-100 ring-red-700/20 dark:text-red-300 dark:bg-red-600/10 dark:ring-red-400/20",
  alert: "text-orange-700 bg-orange-50 ring-orange-600/20 dark:text-orange-400 dark:bg-orange-500/10 dark:ring-orange-500/20",
  emergency: "text-rose-800 bg-rose-100 ring-rose-700/20 dark:text-rose-300 dark:bg-rose-600/10 dark:ring-rose-400/20",
};

// --- Pagination component ---
function Pagination({ page, totalPages, onPageChange }: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const btn = "rounded-lg p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none";
  return (
    <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-4 py-3">
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Page {page} / {totalPages}
      </p>
      <div className="flex items-center gap-1">
        <button onClick={() => onPageChange(1)} disabled={page === 1} className={btn}><ChevronsLeft className="h-4 w-4" /></button>
        <button onClick={() => onPageChange(page - 1)} disabled={page === 1} className={btn}><ChevronLeft className="h-4 w-4" /></button>
        <button onClick={() => onPageChange(page + 1)} disabled={page === totalPages} className={btn}><ChevronRight className="h-4 w-4" /></button>
        <button onClick={() => onPageChange(totalPages)} disabled={page === totalPages} className={btn}><ChevronsRight className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

// --- Main page ---
export default function LogsPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<"nginx" | "symfony">("nginx");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {t("admin_logs.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("admin_logs.subtitle")}
          </p>
        </div>
      </div>

      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={() => setTab("nginx")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "nginx"
              ? "border-slate-900 text-slate-900 dark:border-white dark:text-white"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          Nginx
        </button>
        <button
          onClick={() => setTab("symfony")}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
            tab === "symfony"
              ? "border-slate-900 text-slate-900 dark:border-white dark:text-white"
              : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
          }`}
        >
          Symfony
        </button>
      </div>

      {tab === "nginx" ? <NginxTab t={t} /> : <SymfonyTab t={t} />}
    </div>
  );
}

// --- Nginx Tab ---
function NginxTab({ t }: { t: (key: string) => string }) {
  const [logs, setLogs] = useState<NginxEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 30;

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (statusFilter) params.set("status", statusFilter);
    const res = await fetch(`/api/admin/logs/nginx?${params}`);
    if (res.ok) {
      const data: PaginatedResponse<NginxEntry> = await res.json();
      setLogs(data.items);
      setTotalPages(data.pages);
      setTotal(data.total);
    }
    setLoading(false);
    setRefreshing(false);
  }, [page, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const formatSize = (bytes: number) => {
    if (bytes === 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
          >
            <option value="">{t("admin_tasks.filterAll")}</option>
            <option value="2">2xx</option>
            <option value="3">3xx</option>
            <option value="4">4xx</option>
            <option value="5">5xx</option>
          </select>
          <span className="text-sm text-slate-400 dark:text-slate-500">{total} entries</span>
        </div>
        <button
          onClick={() => { setRefreshing(true); load(); }}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {t("admin_logs.refresh")}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{t("admin_logs.colDatetime")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{t("admin_logs.colMethod")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">URL</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{t("admin_logs.colStatus")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{t("admin_logs.colSize")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {logs.length === 0 ? (
                <tr><td colSpan={6} className="px-4 py-12 text-center"><ScrollText className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" /><p className="text-sm text-slate-400 dark:text-slate-500">{t("admin_logs.noLogs")}</p></td></tr>
              ) : logs.map((entry, i) => (
                <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400 font-mono">{entry.datetime}</td>
                  <td className="px-4 py-2 whitespace-nowrap"><span className={`font-semibold font-mono ${methodColor(entry.method)}`}>{entry.method}</span></td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300 font-mono max-w-md truncate">{entry.url}</td>
                  <td className="px-4 py-2 whitespace-nowrap"><span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 ring-inset ${httpStatusColor(entry.status)}`}>{entry.status}</span></td>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400 font-mono">{formatSize(entry.size)}</td>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400 font-mono">{entry.ip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}

// --- Symfony Tab ---
function SymfonyTab({ t }: { t: (key: string) => string }) {
  const [logs, setLogs] = useState<SymfonyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [levelFilter, setLevelFilter] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 30;

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (levelFilter) params.set("level", levelFilter);
    const res = await fetch(`/api/admin/logs/symfony?${params}`);
    if (res.ok) {
      const data: PaginatedResponse<SymfonyEntry> = await res.json();
      setLogs(data.items);
      setTotalPages(data.pages);
      setTotal(data.total);
    }
    setLoading(false);
    setRefreshing(false);
  }, [page, levelFilter]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <select
            value={levelFilter}
            onChange={(e) => { setLevelFilter(e.target.value); setPage(1); }}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
          >
            <option value="">{t("admin_tasks.filterAll")}</option>
            <option value="debug">DEBUG</option>
            <option value="info">INFO</option>
            <option value="notice">NOTICE</option>
            <option value="warning">WARNING</option>
            <option value="error">ERROR</option>
            <option value="critical">CRITICAL</option>
          </select>
          <span className="text-sm text-slate-400 dark:text-slate-500">{total} entries</span>
        </div>
        <button
          onClick={() => { setRefreshing(true); load(); }}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {t("admin_logs.refresh")}
        </button>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{t("admin_logs.colDatetime")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{t("admin_logs.colLevel")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{t("admin_logs.colChannel")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("admin_logs.colMessage")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono text-xs">
              {logs.length === 0 ? (
                <tr><td colSpan={4} className="px-4 py-12 text-center"><ScrollText className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" /><p className="text-sm text-slate-400 dark:text-slate-500">{t("admin_logs.noLogs")}</p></td></tr>
              ) : logs.map((entry, i) => (
                <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">{entry.datetime || "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">
                    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ring-1 ring-inset ${levelColors[entry.level] || levelColors.info}`}>
                      {entry.level}
                    </span>
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap text-slate-500 dark:text-slate-400">{entry.channel || "—"}</td>
                  <td className="px-4 py-2 text-slate-700 dark:text-slate-300 max-w-xl truncate">{entry.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}
