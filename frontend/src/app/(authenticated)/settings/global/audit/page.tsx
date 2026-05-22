"use client";

import { Fragment, useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  Loader2,
  RefreshCw,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  KeyRound,
  Cpu,
  AlertCircle,
  Settings,
  Search,
  Globe,
} from "lucide-react";

interface AuditEntry {
  id: number;
  loggedAt: string;
  level: string;
  category: string;
  action: string;
  actor: string | null;
  sourceIp: string | null;
  message: string;
  context: Record<string, unknown> | null;
}

interface PaginatedResponse {
  items: AuditEntry[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

type Tab = "all" | "auth" | "api" | "worker" | "error";

const LIMIT = 50;

const levelClass = (lvl: string) => {
  switch (lvl) {
    case "critical":
    case "error":
      return "text-red-700 bg-red-50 ring-red-600/20 dark:text-red-400 dark:bg-red-500/10 dark:ring-red-500/20";
    case "warning":
      return "text-amber-700 bg-amber-50 ring-amber-600/20 dark:text-amber-400 dark:bg-amber-500/10 dark:ring-amber-500/20";
    case "notice":
      return "text-sky-700 bg-sky-50 ring-sky-600/20 dark:text-sky-400 dark:bg-sky-500/10 dark:ring-sky-500/20";
    case "info":
      return "text-emerald-700 bg-emerald-50 ring-emerald-600/20 dark:text-emerald-400 dark:bg-emerald-500/10 dark:ring-emerald-500/20";
    default:
      return "text-slate-700 bg-slate-50 ring-slate-500/20 dark:text-slate-300 dark:bg-slate-800 dark:ring-slate-600/20";
  }
};

const categoryIcon = (category: string) => {
  switch (category) {
    case "auth":
      return KeyRound;
    case "api":
      return Globe;
    case "worker":
      return Cpu;
    case "error":
      return AlertCircle;
    default:
      return Settings;
  }
};

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString();
};

export default function AuditPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<Tab>("all");
  const [level, setLevel] = useState<string>("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(LIMIT));
    if (tab !== "all") params.set("category", tab);
    if (level) params.set("level", level);
    if (search.trim()) params.set("search", search.trim());

    const res = await fetch(`/api/admin/audit?${params.toString()}`);
    setData(res.ok ? await res.json() : null);
    setLoading(false);
  }, [tab, level, search, page]);

  useEffect(() => { load(); }, [load]);

  const tabs: { id: Tab; key: string; icon: typeof ScrollText }[] = [
    { id: "all", key: "admin_audit.tabAll", icon: ScrollText },
    { id: "auth", key: "admin_audit.tabAuth", icon: KeyRound },
    { id: "api", key: "admin_audit.tabApi", icon: Globe },
    { id: "worker", key: "admin_audit.tabWorker", icon: Cpu },
    { id: "error", key: "admin_audit.tabError", icon: AlertCircle },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("admin_audit.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("admin_audit.subtitle")}</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          {t("admin_audit.refresh")}
        </button>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex gap-6 overflow-x-auto">
          {tabs.map((tabItem) => {
            const Icon = tabItem.icon;
            return (
              <button
                key={tabItem.id}
                onClick={() => { setTab(tabItem.id); setPage(1); }}
                className={`-mb-px flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors whitespace-nowrap ${
                  tab === tabItem.id
                    ? "border-slate-900 text-slate-900 dark:border-white dark:text-white"
                    : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                {t(tabItem.key)}
              </button>
            );
          })}
        </nav>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder={t("admin_audit.searchPlaceholder")}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 pl-9 pr-3 py-2 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
          />
        </div>
        <select
          value={level}
          onChange={(e) => { setLevel(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
        >
          <option value="">{t("admin_audit.levelAll")}</option>
          <option value="debug">DEBUG</option>
          <option value="info">INFO</option>
          <option value="notice">NOTICE</option>
          <option value="warning">WARNING</option>
          <option value="error">ERROR</option>
          <option value="critical">CRITICAL</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {loading && !data ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
          </div>
        ) : !data || data.items.length === 0 ? (
          <div className="px-5 py-16 text-center">
            <ScrollText className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
            <p className="text-sm text-slate-400 dark:text-slate-500">{t("admin_audit.empty")}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-44">{t("admin_audit.colTime")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">{t("admin_audit.colLevel")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32">{t("admin_audit.colCategory")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("admin_audit.colMessage")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-44">{t("admin_audit.colActor")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.items.map((entry) => {
                const Icon = categoryIcon(entry.category);
                const expanded = expandedId === entry.id;
                return (
                  <Fragment key={entry.id}>
                    <tr
                      onClick={() => setExpandedId(expanded ? null : entry.id)}
                      className="cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="px-4 py-2.5 text-xs font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(entry.loggedAt)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ring-inset ${levelClass(entry.level)}`}>
                          {entry.level}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                          <Icon className="h-3.5 w-3.5" />
                          {t(`admin_audit.cat_${entry.category}`)}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200">
                        <div className="font-mono text-[11px] text-slate-400 dark:text-slate-500 mb-0.5">{entry.action}</div>
                        <div>{entry.message}</div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                        {entry.actor && <div className="font-medium text-slate-600 dark:text-slate-300">{entry.actor}</div>}
                        {entry.sourceIp && <div className="font-mono text-[11px]">{entry.sourceIp}</div>}
                      </td>
                    </tr>
                    {expanded && entry.context && (
                      <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                        <td colSpan={5} className="px-4 py-3">
                          <pre className="text-[11px] font-mono text-slate-600 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">
                            {JSON.stringify(entry.context, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}

        {data && data.pages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-4 py-3">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("admin_audit.pageOf", { page: String(data.page), pages: String(data.pages), total: String(data.total) })}
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={page <= 1}
                onClick={() => setPage(1)}
                className="rounded p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
                className="rounded p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                disabled={page >= data.pages}
                onClick={() => setPage(page + 1)}
                className="rounded p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                disabled={page >= data.pages}
                onClick={() => setPage(data.pages)}
                className="rounded p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
