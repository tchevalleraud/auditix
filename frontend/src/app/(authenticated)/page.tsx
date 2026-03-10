"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useAppContext } from "@/components/ContextProvider";
import { useI18n } from "@/components/I18nProvider";
import {
  Server,
  Database,
  FileSearch,
  Loader2,
  LayoutDashboard,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Activity,
  Tags,
  KeyRound,
  Box,
  Cpu,
  ArrowRight,
} from "lucide-react";

interface RecentCollection {
  id: number;
  nodeIp: string;
  nodeName: string | null;
  status: string;
  commandCount: number;
  completedCount: number;
  error: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface DashboardData {
  nodes: {
    total: number;
    reachable: number;
    unreachable: number;
    unknown: number;
    byManufacturer: { name: string; total: number }[];
  };
  collections: {
    total: number;
    pending: number;
    running: number;
    completed: number;
    failed: number;
    recent: RecentCollection[];
  };
  rules: {
    total: number;
    enabled: number;
  };
  inventory: {
    tags: number;
    profiles: number;
    models: number;
    manufacturers: number;
  };
  monitoring: boolean;
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; className: string; key: string }> = {
  completed: { icon: CheckCircle2, key: "dashboard.statusCompleted", className: "text-emerald-600 dark:text-emerald-400" },
  running: { icon: Activity, key: "dashboard.statusRunning", className: "text-blue-600 dark:text-blue-400" },
  pending: { icon: Clock, key: "dashboard.statusPending", className: "text-slate-400 dark:text-slate-500" },
  failed: { icon: XCircle, key: "dashboard.statusFailed", className: "text-red-600 dark:text-red-400" },
};

function timeAgo(dateStr: string, t: (k: string, v?: Record<string, string>) => string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t("dashboard.justNow");
  if (minutes < 60) return t("dashboard.minutesAgo", { n: String(minutes) });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("dashboard.hoursAgo", { n: String(hours) });
  const days = Math.floor(hours / 24);
  return t("dashboard.daysAgo", { n: String(days) });
}

export default function Dashboard() {
  const { current } = useAppContext();
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const prevContextId = useRef<number | null>(null);

  useEffect(() => {
    if (!current) {
      setData(null);
      setLoading(false);
      prevContextId.current = null;
      return;
    }

    // Only show loading spinner on initial load or context switch, not on background refreshes
    const contextChanged = current.id !== prevContextId.current;
    if (contextChanged) {
      setLoading(true);
      setData(null);
      prevContextId.current = current.id;
    }

    fetch(`/api/contexts/${current.id}/dashboard`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [current]);

  // Silent re-fetch for Mercure updates (no spinner)
  const silentRefresh = useCallback(() => {
    if (!current) return;
    fetch(`/api/contexts/${current.id}/dashboard`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {});
  }, [current]);

  // Mercure SSE: real-time ping updates for node reachability
  useEffect(() => {
    if (!current || !data?.monitoring) return;

    const url = new URL("/.well-known/mercure", window.location.origin);
    url.searchParams.append("topic", `nodes/context/${current.id}`);

    const es = new EventSource(url);
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;

    es.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === "ping") {
          // Debounce: wait 500ms after last ping event before re-fetching
          if (debounceTimer) clearTimeout(debounceTimer);
          debounceTimer = setTimeout(silentRefresh, 500);
        }
      } catch {}
    };

    return () => {
      es.close();
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [current, data?.monitoring, silentRefresh]);

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <LayoutDashboard className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">{t("dashboard.noContextSelected")}</h2>
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">{t("dashboard.noContextSelectedDesc")}</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  if (!data) return null;

  const nodeReachablePercent = data.nodes.total > 0 ? Math.round((data.nodes.reachable / data.nodes.total) * 100) : 0;
  const collectionSuccessPercent = data.collections.total > 0 ? Math.round((data.collections.completed / data.collections.total) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("dashboard.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("dashboard.subtitle", { name: current.name })}
        </p>
      </div>

      {/* Main stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Nodes */}
        <Link href="/nodes" className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500">
              <Server className="h-5 w-5 text-white" />
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.nodes.total}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("dashboard.nodes")}</p>
          </div>
          {data.monitoring && data.nodes.total > 0 && (
            <div className="mt-3 flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {data.nodes.reachable}
              </span>
              <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {data.nodes.unreachable}
              </span>
              {data.nodes.unknown > 0 && (
                <span className="flex items-center gap-1 text-slate-400 dark:text-slate-500">
                  <span className="h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                  {data.nodes.unknown}
                </span>
              )}
            </div>
          )}
        </Link>

        {/* Collections */}
        <Link href="/collections" className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500">
              <Database className="h-5 w-5 text-white" />
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.collections.total}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("dashboard.collections")}</p>
          </div>
          {data.collections.total > 0 && (
            <div className="mt-3 flex items-center gap-3 text-xs">
              <span className="text-emerald-600 dark:text-emerald-400">{data.collections.completed} {t("dashboard.statusCompleted")}</span>
              {data.collections.failed > 0 && (
                <span className="text-red-600 dark:text-red-400">{data.collections.failed} {t("dashboard.statusFailed")}</span>
              )}
              {data.collections.running > 0 && (
                <span className="text-blue-600 dark:text-blue-400">{data.collections.running} {t("dashboard.statusRunning")}</span>
              )}
            </div>
          )}
        </Link>

        {/* Rules */}
        <Link href="/collection-rules" className="group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm hover:border-slate-300 dark:hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500">
              <FileSearch className="h-5 w-5 text-white" />
            </div>
            <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600 group-hover:text-slate-400 dark:group-hover:text-slate-500 transition-colors" />
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{data.rules.total}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("dashboard.rules")}</p>
          </div>
          {data.rules.total > 0 && (
            <div className="mt-3 text-xs text-slate-400 dark:text-slate-500">
              {data.rules.enabled} {t("dashboard.rulesEnabled")}
            </div>
          )}
        </Link>

        {/* Monitoring */}
        <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${data.monitoring ? "bg-emerald-500" : "bg-slate-400 dark:bg-slate-600"}`}>
              <Activity className="h-5 w-5 text-white" />
            </div>
            {data.monitoring && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                {t("dashboard.monitoringActive")}
              </span>
            )}
          </div>
          <div className="mt-3">
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {data.monitoring ? `${nodeReachablePercent}%` : "—"}
            </p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {data.monitoring ? t("dashboard.reachability") : t("dashboard.monitoringDisabled")}
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Recent Collections */}
        <div className="xl:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("dashboard.recentCollections")}
            </h2>
            {data.collections.total > 0 && (
              <Link href="/collections" className="text-xs font-medium text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                {t("dashboard.viewAll")}
              </Link>
            )}
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.collections.recent.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <Database className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">{t("dashboard.noCollections")}</p>
              </div>
            ) : (
              data.collections.recent.map((col) => {
                const cfg = statusConfig[col.status] ?? statusConfig.pending;
                const StatusIcon = cfg.icon;
                const progress = col.commandCount > 0 ? Math.round((col.completedCount / col.commandCount) * 100) : 0;
                return (
                  <div key={col.id} className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <StatusIcon className={`h-4 w-4 shrink-0 ${cfg.className}`} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                          {col.nodeName || col.nodeIp}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {col.nodeIp} · {col.completedCount}/{col.commandCount} {t("dashboard.commands")}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      {col.status === "running" && (
                        <div className="w-16 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
                          <div className="h-1.5 rounded-full bg-blue-500 transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      )}
                      <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block whitespace-nowrap">
                        {timeAgo(col.createdAt, t)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <div className="space-y-4">
          {/* Node health (if monitoring) */}
          {data.monitoring && data.nodes.total > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">{t("dashboard.nodeHealth")}</h2>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                  {data.nodes.reachable > 0 && (
                    <div className="h-full bg-emerald-500" style={{ width: `${(data.nodes.reachable / data.nodes.total) * 100}%` }} />
                  )}
                  {data.nodes.unreachable > 0 && (
                    <div className="h-full bg-red-500" style={{ width: `${(data.nodes.unreachable / data.nodes.total) * 100}%` }} />
                  )}
                  {data.nodes.unknown > 0 && (
                    <div className="h-full bg-slate-300 dark:bg-slate-600" style={{ width: `${(data.nodes.unknown / data.nodes.total) * 100}%` }} />
                  )}
                </div>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    {t("dashboard.reachable")}
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{data.nodes.reachable}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <span className="h-2 w-2 rounded-full bg-red-500" />
                    {t("dashboard.unreachable")}
                  </span>
                  <span className="font-medium text-slate-900 dark:text-slate-100">{data.nodes.unreachable}</span>
                </div>
                {data.nodes.unknown > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                      <span className="h-2 w-2 rounded-full bg-slate-300 dark:bg-slate-600" />
                      {t("dashboard.unknown")}
                    </span>
                    <span className="font-medium text-slate-900 dark:text-slate-100">{data.nodes.unknown}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Manufacturers breakdown */}
          {data.nodes.byManufacturer.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t("dashboard.topManufacturers")}</h2>
              <div className="space-y-2.5">
                {data.nodes.byManufacturer.map((m) => (
                  <div key={m.name} className="flex items-center justify-between">
                    <span className="text-sm text-slate-600 dark:text-slate-400 truncate">{m.name}</span>
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100 ml-3">{m.total}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Collection success rate */}
          {data.collections.total > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t("dashboard.collectionStats")}</h2>
              <div className="flex items-center gap-3 mb-3">
                <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden flex">
                  {data.collections.completed > 0 && (
                    <div className="h-full bg-emerald-500" style={{ width: `${(data.collections.completed / data.collections.total) * 100}%` }} />
                  )}
                  {data.collections.failed > 0 && (
                    <div className="h-full bg-red-500" style={{ width: `${(data.collections.failed / data.collections.total) * 100}%` }} />
                  )}
                </div>
                <span className="text-xs font-medium text-slate-900 dark:text-slate-100">{collectionSuccessPercent}%</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                  {data.collections.completed} {t("dashboard.statusCompleted")}
                </div>
                <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                  <XCircle className="h-3.5 w-3.5 text-red-500" />
                  {data.collections.failed} {t("dashboard.statusFailed")}
                </div>
                {data.collections.pending > 0 && (
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <Clock className="h-3.5 w-3.5 text-slate-400" />
                    {data.collections.pending} {t("dashboard.statusPending")}
                  </div>
                )}
                {data.collections.running > 0 && (
                  <div className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                    <Activity className="h-3.5 w-3.5 text-blue-500" />
                    {data.collections.running} {t("dashboard.statusRunning")}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Quick inventory */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-5">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-3">{t("dashboard.quickInventory")}</h2>
            <div className="space-y-2">
              {[
                { icon: Box, label: t("dashboard.manufacturers"), value: data.inventory.manufacturers, href: "/manufacturers" },
                { icon: Cpu, label: t("dashboard.models"), value: data.inventory.models, href: "/models" },
                { icon: KeyRound, label: t("dashboard.profiles"), value: data.inventory.profiles, href: "/profiles" },
                { icon: Tags, label: t("dashboard.tags"), value: data.inventory.tags, href: "/tags" },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center justify-between py-1.5 group"
                >
                  <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200 transition-colors">
                    <item.icon className="h-3.5 w-3.5" />
                    {item.label}
                  </span>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.value}</span>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
