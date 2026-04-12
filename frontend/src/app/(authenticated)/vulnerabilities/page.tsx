"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  ShieldAlert,
  Search,
  RefreshCw,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

interface CveItem {
  id: number;
  cveId: string;
  description: string | null;
  cvssScore: number | null;
  cvssVector: string | null;
  severity: string;
  publishedAt: string | null;
  affectedModels: number;
  syncedAt: string;
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
  none: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
};

const CVSS_COLORS = (score: number | null) => {
  if (score === null) return "text-slate-400";
  if (score >= 9.0) return "text-red-600 dark:text-red-400";
  if (score >= 7.0) return "text-orange-600 dark:text-orange-400";
  if (score >= 4.0) return "text-amber-600 dark:text-amber-400";
  if (score >= 0.1) return "text-blue-600 dark:text-blue-400";
  return "text-slate-400";
};

const inputClass =
  "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";

export default function VulnerabilitiesPage() {
  const { t } = useI18n();
  const { current } = useAppContext();

  const [items, setItems] = useState<CveItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [severity, setSeverity] = useState("");
  const [sort, setSort] = useState("cvssScore");
  const [order, setOrder] = useState<"ASC" | "DESC">("DESC");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ lastSyncAt: string | null; lastSyncStatus: string | null; enabled: boolean } | null>(null);

  const limit = 50;

  const load = useCallback(async () => {
    if (!current?.id) return;
    setLoading(true);
    const params = new URLSearchParams({
      context: String(current.id),
      page: String(page),
      limit: String(limit),
      sort,
      order,
    });
    if (search) params.set("search", search);
    if (severity) params.set("severity", severity);

    const res = await fetch(`/api/vulnerabilities?${params}`);
    if (res.ok) {
      const data = await res.json();
      setItems(data.items);
      setTotal(data.total);
    }
    setLoading(false);
  }, [current?.id, page, search, severity, sort, order]);

  const loadStatus = useCallback(async () => {
    if (!current?.id) return;
    const res = await fetch(`/api/vulnerabilities/stats?context=${current.id}`);
    if (res.ok) {
      const data = await res.json();
      setSyncStatus({ lastSyncAt: data.lastSyncAt, lastSyncStatus: data.lastSyncStatus, enabled: data.enabled });
    }
  }, [current?.id]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { loadStatus(); }, [loadStatus]);

  const handleSync = async () => {
    if (!current?.id || syncing) return;
    setSyncing(true);
    await fetch("/api/vulnerabilities/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contextId: current.id }),
    });
    setTimeout(() => {
      setSyncing(false);
      load();
      loadStatus();
    }, 2000);
  };

  const toggleSort = (col: string) => {
    if (sort === col) {
      setOrder(order === "DESC" ? "ASC" : "DESC");
    } else {
      setSort(col);
      setOrder("DESC");
    }
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <ShieldAlert className="h-7 w-7" />
            {t("vulnerabilities.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("vulnerabilities.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {syncStatus?.lastSyncAt && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {t("vulnerabilities.lastSync").replace("{date}", new Date(syncStatus.lastSyncAt).toLocaleString())}
            </span>
          )}
          {syncStatus && !syncStatus.lastSyncAt && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {t("vulnerabilities.neverSynced")}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? t("vulnerabilities.syncing") : t("vulnerabilities.syncNow")}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder={t("vulnerabilities.searchPlaceholder")}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className={inputClass}
          />
        </div>
        <select
          value={severity}
          onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
          className="w-48 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 px-3 text-sm text-slate-700 dark:text-slate-200 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
        >
          <option value="">{t("vulnerabilities.allSeverities")}</option>
          <option value="critical">{t("vulnerabilities.critical")}</option>
          <option value="high">{t("vulnerabilities.high")}</option>
          <option value="medium">{t("vulnerabilities.medium")}</option>
          <option value="low">{t("vulnerabilities.low")}</option>
          <option value="none">{t("vulnerabilities.none")}</option>
        </select>
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {total} CVE{total !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <th
                className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white"
                onClick={() => toggleSort("cveId")}
              >
                {t("vulnerabilities.cveId")} {sort === "cveId" ? (order === "ASC" ? "\u2191" : "\u2193") : ""}
              </th>
              <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("vulnerabilities.description")}
              </th>
              <th
                className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white"
                onClick={() => toggleSort("cvssScore")}
              >
                {t("vulnerabilities.cvssScore")} {sort === "cvssScore" ? (order === "ASC" ? "\u2191" : "\u2193") : ""}
              </th>
              <th
                className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white"
                onClick={() => toggleSort("severity")}
              >
                {t("vulnerabilities.severity")} {sort === "severity" ? (order === "ASC" ? "\u2191" : "\u2193") : ""}
              </th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                {t("vulnerabilities.affectedModels")}
              </th>
              <th
                className="px-4 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider cursor-pointer hover:text-slate-900 dark:hover:text-white"
                onClick={() => toggleSort("publishedAt")}
              >
                {t("vulnerabilities.publishedAt")} {sort === "publishedAt" ? (order === "ASC" ? "\u2191" : "\u2193") : ""}
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  {t("common.loading")}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-12 text-center text-slate-400">
                  {t("vulnerabilities.noVulnerabilities")}
                </td>
              </tr>
            ) : (
              items.map((cve) => (
                <tr key={cve.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <Link
                      href={`/vulnerabilities/${cve.id}`}
                      className="font-mono text-sm font-medium text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                    >
                      {cve.cveId}
                    </Link>
                  </td>
                  <td className="px-4 py-3 max-w-md">
                    <span className="text-slate-600 dark:text-slate-300 line-clamp-2 text-xs">
                      {cve.description || "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-mono font-semibold ${CVSS_COLORS(cve.cvssScore)}`}>
                      {cve.cvssScore !== null ? cve.cvssScore.toFixed(1) : "-"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_COLORS[cve.severity] || SEVERITY_COLORS.none}`}>
                      {t(`vulnerabilities.${cve.severity}` as any) || cve.severity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-slate-600 dark:text-slate-300">
                    {cve.affectedModels}
                  </td>
                  <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400 text-xs">
                    {cve.publishedAt ? new Date(cve.publishedAt).toLocaleDateString() : "-"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            Page {page} / {totalPages}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page <= 1}
              className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page >= totalPages}
              className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
