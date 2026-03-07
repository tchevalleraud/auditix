"use client";

import { useEffect, useState } from "react";
import { useAppContext } from "@/components/ContextProvider";
import { useI18n } from "@/components/I18nProvider";
import {
  Server,
  ClipboardCheck,
  Radio,
  FileText,
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Loader2,
  LayoutDashboard,
} from "lucide-react";

interface DashboardData {
  context: {
    id: number;
    name: string;
    monitoringEnabled: boolean;
  };
  stats: {
    equipments: number;
    audits: number;
    collections: number;
    reports: number;
  };
  recentAudits: {
    id: string;
    name: string;
    status: string;
    date: string;
    equipments: number;
  }[];
}

const statusConfig = {
  completed: {
    key: "status.completed",
    icon: CheckCircle2,
    className: "text-emerald-700 bg-emerald-50 ring-emerald-600/20 dark:text-emerald-400 dark:bg-emerald-500/10 dark:ring-emerald-500/20",
  },
  running: {
    key: "status.running",
    icon: Activity,
    className: "text-blue-700 bg-blue-50 ring-blue-600/20 dark:text-blue-400 dark:bg-blue-500/10 dark:ring-blue-500/20",
  },
  warning: {
    key: "status.warning",
    icon: AlertTriangle,
    className: "text-amber-700 bg-amber-50 ring-amber-600/20 dark:text-amber-400 dark:bg-amber-500/10 dark:ring-amber-500/20",
  },
  failed: {
    key: "status.failed",
    icon: XCircle,
    className: "text-red-700 bg-red-50 ring-red-600/20 dark:text-red-400 dark:bg-red-500/10 dark:ring-red-500/20",
  },
};

export default function Dashboard() {
  const { current } = useAppContext();
  const { t } = useI18n();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!current) {
      setData(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    fetch(`/api/contexts/${current.id}/dashboard`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [current]);

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <LayoutDashboard className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">{t("dashboard.noContextSelected")}</h2>
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">
          {t("dashboard.noContextSelectedDesc")}
        </p>
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

  const stats = [
    { name: t("dashboard.equipments"), value: data?.stats.equipments ?? 0, icon: Server, color: "bg-blue-500" },
    { name: t("dashboard.auditsInProgress"), value: data?.stats.audits ?? 0, icon: ClipboardCheck, color: "bg-slate-500" },
    { name: t("dashboard.collections24h"), value: data?.stats.collections ?? 0, icon: Radio, color: "bg-emerald-500" },
    { name: t("dashboard.reportsGenerated"), value: data?.stats.reports ?? 0, icon: FileText, color: "bg-amber-500" },
  ];

  const recentAudits = data?.recentAudits ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("dashboard.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("dashboard.subtitle", { name: current.name })}
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}
              >
                <stat.icon className="h-5 w-5 text-white" />
              </div>
            </div>
            <div className="mt-3">
              <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{stat.value}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{stat.name}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Recent Audits */}
        <div className="xl:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("dashboard.recentAudits")}
            </h2>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentAudits.length === 0 ? (
              <div className="px-5 py-8 text-center">
                <ClipboardCheck className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">
                  {t("dashboard.noAudits")}
                </p>
              </div>
            ) : (
              recentAudits.map((audit) => {
                const status = statusConfig[audit.status as keyof typeof statusConfig];
                const StatusIcon = status.icon;
                return (
                  <div
                    key={audit.id}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <span className="text-xs font-mono text-slate-400 dark:text-slate-500">
                        {audit.id}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                          {audit.name}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {audit.equipments} equipements
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-xs text-slate-400 dark:text-slate-500 hidden sm:block">
                        {audit.date}
                      </span>
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${status.className}`}
                      >
                        <StatusIcon className="h-3.5 w-3.5" />
                        {t(status.key)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Workers Status */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("dashboard.workers")}
            </h2>
          </div>
          <div className="p-5 space-y-4">
            {[
              { name: "Scheduler", count: 1, active: 1 },
              { name: "Monitoring", count: current.monitoringEnabled ? 1 : 0, active: current.monitoringEnabled ? 1 : 0 },
              { name: "Collector", count: 2, active: 2 },
              { name: "Generator", count: 1, active: 1 },
            ].map((worker) => (
              <div key={worker.name} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-slate-700 dark:text-slate-200">
                    {worker.name}
                  </span>
                  <span className="text-slate-400 dark:text-slate-500">
                    {worker.active}/{worker.count}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800">
                  <div
                    className={`h-2 rounded-full transition-all ${worker.count === 0 ? "bg-slate-300 dark:bg-slate-600" : "bg-emerald-500"}`}
                    style={{
                      width: worker.count === 0 ? "100%" : `${(worker.active / worker.count) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}

            <div className="mt-6 rounded-lg bg-slate-50 dark:bg-slate-800 p-4">
              {current.monitoringEnabled ? (
                <>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {t("dashboard.monitoringActive")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {t("dashboard.monitoringActiveDesc")}
                  </p>
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                      {t("dashboard.monitoringDisabled")}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                    {t("dashboard.monitoringDisabledDesc")}
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
