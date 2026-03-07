"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertTriangle,
  HeartPulse,
} from "lucide-react";

interface Service {
  name: string;
  status: "healthy" | "unhealthy" | "degraded" | "unknown";
  version?: string;
  image?: string;
  replicas?: number;
  totalReplicas?: number;
}

export default function HealthPage() {
  const { t } = useI18n();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/health");
    if (res.ok) setServices(await res.json());
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRefresh = () => {
    setRefreshing(true);
    load();
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
      case "unhealthy":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "degraded":
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      default:
        return <HelpCircle className="h-5 w-5 text-slate-400" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "healthy":
        return t("admin_health.healthy");
      case "unhealthy":
        return t("admin_health.unhealthy");
      case "degraded":
        return t("admin_health.degraded");
      default:
        return t("admin_health.unknown");
    }
  };

  const statusBadgeClass = (status: string) => {
    switch (status) {
      case "healthy":
        return "text-emerald-700 bg-emerald-50 ring-emerald-600/20 dark:text-emerald-400 dark:bg-emerald-500/10 dark:ring-emerald-500/20";
      case "unhealthy":
        return "text-red-700 bg-red-50 ring-red-600/20 dark:text-red-400 dark:bg-red-500/10 dark:ring-red-500/20";
      case "degraded":
        return "text-amber-700 bg-amber-50 ring-amber-600/20 dark:text-amber-400 dark:bg-amber-500/10 dark:ring-amber-500/20";
      default:
        return "text-slate-600 bg-slate-50 ring-slate-500/20 dark:text-slate-400 dark:bg-slate-800 dark:ring-slate-600/20";
    }
  };

  const infraServices = services.filter((s) => s.replicas === undefined);
  const workerServices = services.filter((s) => s.replicas !== undefined);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {t("admin_health.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("admin_health.subtitle")}
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          {refreshing ? t("admin_health.refreshing") : t("admin_health.refresh")}
        </button>
      </div>

      {/* Infrastructure */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
          {t("admin_health.infrastructure")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {infraServices.map((service) => (
            <div
              key={service.name}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {service.name}
                </span>
                {statusIcon(service.status)}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(service.status)}`}
                >
                  {statusLabel(service.status)}
                </span>
                {service.version && (
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    v{service.version}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Workers */}
      {workerServices.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">
            {t("admin_health.workers")}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {workerServices.map((service) => (
              <div
                key={service.name}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {service.name}
                  </span>
                  {statusIcon(service.status)}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${statusBadgeClass(service.status)}`}
                  >
                    {statusLabel(service.status)}
                  </span>
                  <span className="text-xs text-slate-400 dark:text-slate-500">
                    {service.replicas}/{service.totalReplicas} replica{(service.totalReplicas ?? 0) !== 1 ? "s" : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {services.length === 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
          <HeartPulse className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
          <p className="text-sm text-slate-400 dark:text-slate-500">
            {t("common.noResult")}
          </p>
        </div>
      )}
    </div>
  );
}
