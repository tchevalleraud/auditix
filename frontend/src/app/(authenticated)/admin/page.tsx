"use client";

import { useAppContext } from "@/components/ContextProvider";
import { useI18n } from "@/components/I18nProvider";
import {
  Building2,
  Activity,
  ActivitySquare,
  Server,
} from "lucide-react";

export default function AdminDashboard() {
  const { contexts } = useAppContext();
  const { t } = useI18n();

  const totalContexts = contexts.length;
  const monitoringActive = contexts.filter((c) => c.monitoringEnabled).length;
  const monitoringInactive = totalContexts - monitoringActive;

  const stats = [
    { name: t("admin_dashboard.contexts"), value: totalContexts, icon: Building2, color: "bg-blue-500" },
    { name: t("admin_dashboard.monitoringActive"), value: monitoringActive, icon: Activity, color: "bg-emerald-500" },
    { name: t("admin_dashboard.monitoringInactive"), value: monitoringInactive, icon: ActivitySquare, color: "bg-slate-400" },
    { name: t("admin_dashboard.allEquipments"), value: 0, icon: Server, color: "bg-slate-500" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("admin_dashboard.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("admin_dashboard.subtitle")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <div
            key={stat.name}
            className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-sm"
          >
            <div className="flex items-center justify-between">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.color}`}>
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

      {/* Contexts overview */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("admin_dashboard.contexts")}
          </h2>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          {contexts.length === 0 ? (
            <div className="px-5 py-8 text-center">
              <Building2 className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-slate-400 dark:text-slate-500">{t("admin_dashboard.noContexts")}</p>
            </div>
          ) : (
            contexts.map((ctx) => (
              <div
                key={ctx.id}
                className="flex items-center justify-between px-5 py-3.5"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${ctx.monitoringEnabled ? "bg-emerald-500" : "bg-red-500"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                      {ctx.name}
                    </p>
                    {ctx.description && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                        {ctx.description}
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {ctx.isDefault && (
                    <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                      {t("admin_dashboard.defaultBadge")}
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
                    ctx.monitoringEnabled
                      ? "text-emerald-700 bg-emerald-50 ring-emerald-600/20 dark:text-emerald-400 dark:bg-emerald-500/10 dark:ring-emerald-500/20"
                      : "text-slate-600 bg-slate-50 ring-slate-500/20 dark:text-slate-400 dark:bg-slate-800 dark:ring-slate-600/20"
                  }`}>
                    {ctx.monitoringEnabled ? t("admin_dashboard.monitoringActiveBadge") : t("admin_dashboard.monitoringInactiveBadge")}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
