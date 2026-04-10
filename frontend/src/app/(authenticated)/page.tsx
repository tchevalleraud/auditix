"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { useAppContext } from "@/components/ContextProvider";
import { useI18n } from "@/components/I18nProvider";
import {
  Server,
  FileSearch,
  Loader2,
  LayoutDashboard,
  AlertTriangle,
  Activity,
  Tags,
  KeyRound,
  Box,
  Cpu,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
} from "lucide-react";

interface ComplianceData {
  globalScore: number | null;
  globalGrade: string | null;
  evaluatedNodes: number;
  totalNodes: number;
  enabledPolicies: number;
  byStatus: {
    compliant: number;
    non_compliant: number;
    error: number;
    not_applicable: number;
    skipped: number;
  };
  bySeverity: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
  };
  byGrade: {
    A: number; B: number; C: number; D: number; E: number; F: number;
    unrated: number;
  };
  topUnhealthyNodes: {
    id: number;
    name: string;
    ipAddress: string;
    grade: string | null;
    violations: number;
    criticalCount: number;
  }[];
  topViolatedRules: {
    id: number;
    identifier: string;
    name: string;
    violationCount: number;
    criticalCount: number;
    highCount: number;
  }[];
  lastEvaluatedAt: string | null;
}

interface DashboardData {
  nodes: {
    total: number;
    reachable: number;
    unreachable: number;
    unknown: number;
    byManufacturer: { name: string; total: number }[];
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
  compliance: ComplianceData;
}

const GRADE_COLORS: Record<string, string> = {
  A: "#10b981", // emerald
  B: "#84cc16", // lime
  C: "#eab308", // yellow
  D: "#f97316", // orange
  E: "#ef4444", // red
  F: "#991b1b", // dark red
  unrated: "#94a3b8", // slate
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#991b1b",
  high: "#ef4444",
  medium: "#f97316",
  low: "#eab308",
  info: "#3b82f6",
};

const MANUFACTURER_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16"];

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

function scoreColor(score: number | null): string {
  if (score === null) return "#94a3b8";
  if (score >= 90) return "#10b981";
  if (score >= 75) return "#84cc16";
  if (score >= 60) return "#eab308";
  if (score >= 45) return "#f97316";
  return "#ef4444";
}

interface ScoreGaugeProps {
  score: number | null;
  grade: string | null;
  size?: number;
}

function ScoreGauge({ score, grade, size = 150 }: ScoreGaugeProps) {
  const stroke = 12;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = circumference - (progress / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="currentColor"
          strokeWidth={stroke}
          fill="none"
          className="text-slate-100 dark:text-slate-800"
        />
        {score !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {score !== null ? (
          <>
            <span className="text-4xl font-bold tracking-tight leading-none" style={{ color }}>
              {grade ?? "—"}
            </span>
            <span className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
              {score}/100
            </span>
          </>
        ) : (
          <>
            <span className="text-2xl font-bold text-slate-300 dark:text-slate-600">—</span>
            <span className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">N/A</span>
          </>
        )}
      </div>
    </div>
  );
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

  const silentRefresh = useCallback(() => {
    if (!current) return;
    fetch(`/api/contexts/${current.id}/dashboard`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {});
  }, [current]);

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

  const compliance = data.compliance;
  const totalViolations =
    compliance.bySeverity.critical +
    compliance.bySeverity.high +
    compliance.bySeverity.medium +
    compliance.bySeverity.low +
    compliance.bySeverity.info;

  const gradeChartData = (["A", "B", "C", "D", "E", "F", "unrated"] as const)
    .map((g) => ({
      grade: g === "unrated" ? t("dashboard.unrated") : g,
      key: g,
      value: compliance.byGrade[g],
      color: GRADE_COLORS[g],
    }))
    .filter((d) => d.value > 0);

  const severityLabel: Record<string, string> = {
    critical: t("dashboard.severityCritical"),
    high: t("dashboard.severityHigh"),
    medium: t("dashboard.severityMedium"),
    low: t("dashboard.severityLow"),
    info: t("dashboard.severityInfo"),
  };

  const severityChartData = (["critical", "high", "medium", "low", "info"] as const)
    .map((s) => ({
      severity: severityLabel[s],
      key: s,
      value: compliance.bySeverity[s],
      color: SEVERITY_COLORS[s],
    }))
    .filter((d) => d.value > 0);

  const reachabilityData = data.monitoring && data.nodes.total > 0 ? [
    { name: t("dashboard.reachable"), value: data.nodes.reachable, color: "#10b981" },
    { name: t("dashboard.unreachable"), value: data.nodes.unreachable, color: "#ef4444" },
    { name: t("dashboard.unknown"), value: data.nodes.unknown, color: "#94a3b8" },
  ].filter((d) => d.value > 0) : [];

  const manufacturerChartData = data.nodes.byManufacturer.map((m, i) => ({
    name: m.name,
    value: Number(m.total),
    color: MANUFACTURER_COLORS[i % MANUFACTURER_COLORS.length],
  }));

  const cardClass = "rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm";

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("dashboard.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("dashboard.subtitle", { name: current.name })}
        </p>
      </div>

      {/* Hero: Global Compliance Score */}
      <div className={`${cardClass} overflow-hidden`}>
        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-5 p-5">
          {/* Score gauge */}
          <div className="flex flex-col items-center justify-center lg:border-r lg:border-slate-100 lg:dark:border-slate-800 lg:pr-5">
            <h2 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              {t("dashboard.globalScore")}
            </h2>
            <ScoreGauge score={compliance.globalScore} grade={compliance.globalGrade} />
            {compliance.lastEvaluatedAt && (
              <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">
                {t("dashboard.lastEvaluated")}: {timeAgo(compliance.lastEvaluatedAt, t)}
              </p>
            )}
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <KpiTile
              icon={ShieldCheck}
              label={t("dashboard.compliantResults")}
              value={compliance.byStatus.compliant}
              accent="emerald"
            />
            <KpiTile
              icon={ShieldAlert}
              label={t("dashboard.violations")}
              value={compliance.byStatus.non_compliant}
              accent="red"
            />
            <KpiTile
              icon={AlertCircle}
              label={t("dashboard.criticalViolations")}
              value={compliance.bySeverity.critical}
              accent="rose"
            />
            <KpiTile
              icon={Server}
              label={t("dashboard.evaluatedNodes")}
              value={`${compliance.evaluatedNodes}/${compliance.totalNodes}`}
              accent="blue"
            />
            <KpiTile
              icon={FileSearch}
              label={t("dashboard.activePolicies")}
              value={compliance.enabledPolicies}
              accent="violet"
            />
            <KpiTile
              icon={AlertTriangle}
              label={t("dashboard.errors")}
              value={compliance.byStatus.error}
              accent="amber"
            />
          </div>
        </div>
      </div>

      {compliance.evaluatedNodes === 0 && compliance.enabledPolicies === 0 && (
        <div className={`${cardClass} p-6 flex items-start gap-4`}>
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-500/10 shrink-0">
            <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("dashboard.noComplianceTitle")}</h3>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("dashboard.noComplianceDesc")}</p>
            <Link
              href="/compliance/policies"
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t("dashboard.configurePolicies")}
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      )}

      {/* Compliance details */}
      {compliance.evaluatedNodes > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {/* Grade distribution */}
          <div className={`${cardClass} p-5`}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
              {t("dashboard.nodeGradeDistribution")}
            </h2>
            {gradeChartData.length === 0 ? (
              <EmptyChart label={t("dashboard.noData")} />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={gradeChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <XAxis dataKey="grade" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip
                    cursor={{ fill: "rgba(148, 163, 184, 0.1)" }}
                    contentStyle={{
                      backgroundColor: "rgb(15 23 42)",
                      border: "none",
                      borderRadius: "8px",
                      color: "#f1f5f9",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                    {gradeChartData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Severity distribution */}
          <div className={`${cardClass} p-5`}>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mb-4">
              {t("dashboard.violationsBySeverity")}
            </h2>
            {totalViolations === 0 ? (
              <div className="flex flex-col items-center justify-center h-[220px] text-center">
                <ShieldCheck className="h-10 w-10 text-emerald-500 mb-2" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  {t("dashboard.allCompliant")}
                </p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={severityChartData}
                  layout="vertical"
                  margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
                >
                  <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis dataKey="severity" type="category" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} width={70} />
                  <Tooltip
                    cursor={{ fill: "rgba(148, 163, 184, 0.1)" }}
                    contentStyle={{
                      backgroundColor: "rgb(15 23 42)",
                      border: "none",
                      borderRadius: "8px",
                      color: "#f1f5f9",
                      fontSize: "12px",
                    }}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                    {severityChartData.map((entry) => (
                      <Cell key={entry.key} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>

          {/* Top unhealthy nodes */}
          <div className={`${cardClass}`}>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("dashboard.topUnhealthyNodes")}
              </h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {compliance.topUnhealthyNodes.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">{t("dashboard.allCompliant")}</p>
                </div>
              ) : (
                compliance.topUnhealthyNodes.map((node) => (
                  <Link
                    key={node.id}
                    href={`/nodes/${node.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <GradeBadge grade={node.grade} />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">
                          {node.name || node.ipAddress}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{node.ipAddress}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {node.criticalCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                          <AlertCircle className="h-3 w-3" />
                          {node.criticalCount}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{node.violations}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>

          {/* Top violated rules */}
          <div className={`${cardClass}`}>
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("dashboard.topViolatedRules")}
              </h2>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {compliance.topViolatedRules.length === 0 ? (
                <div className="px-5 py-8 text-center">
                  <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">{t("dashboard.allCompliant")}</p>
                </div>
              ) : (
                compliance.topViolatedRules.map((rule) => (
                  <Link
                    key={rule.id}
                    href={`/compliance/rules/${rule.id}`}
                    className="flex items-center justify-between px-5 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate">{rule.name}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500 truncate font-mono">{rule.identifier}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {rule.criticalCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-50 dark:bg-red-500/10 px-2 py-0.5 text-xs font-medium text-red-600 dark:text-red-400">
                          C·{rule.criticalCount}
                        </span>
                      )}
                      {rule.highCount > 0 && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 dark:bg-orange-500/10 px-2 py-0.5 text-xs font-medium text-orange-600 dark:text-orange-400">
                          H·{rule.highCount}
                        </span>
                      )}
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{rule.violationCount}</span>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Infrastructure insights — single compact row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Reachability donut (or fallback to node count summary) */}
        <div className={`${cardClass} p-4`}>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              {data.monitoring ? t("dashboard.nodeHealth") : t("dashboard.nodes")}
            </h2>
            {data.monitoring && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {t("dashboard.monitoringActive")}
              </span>
            )}
          </div>
          {data.monitoring && reachabilityData.length > 0 ? (
            <div className="flex items-center gap-3">
              <ResponsiveContainer width={110} height={110}>
                <PieChart>
                  <Pie data={reachabilityData} cx="50%" cy="50%" innerRadius={32} outerRadius={50} paddingAngle={2} dataKey="value">
                    {reachabilityData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgb(15 23 42)", border: "none", borderRadius: "8px", color: "#f1f5f9", fontSize: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1 text-xs">
                {reachabilityData.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 truncate">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      {entry.name}
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 ml-2">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <Link href="/nodes" className="flex items-center justify-between group">
              <div>
                <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{data.nodes.total}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {data.monitoring ? t("dashboard.reachability") : t("dashboard.monitoringDisabled")}
                </p>
              </div>
              <Server className="h-8 w-8 text-blue-500" />
            </Link>
          )}
        </div>

        {/* Top manufacturers */}
        <div className={`${cardClass} p-4`}>
          <h2 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            {t("dashboard.topManufacturers")}
          </h2>
          {manufacturerChartData.length > 0 ? (
            <div className="flex items-center gap-3">
              <ResponsiveContainer width={110} height={110}>
                <PieChart>
                  <Pie data={manufacturerChartData} cx="50%" cy="50%" innerRadius={32} outerRadius={50} paddingAngle={2} dataKey="value">
                    {manufacturerChartData.map((entry, i) => (<Cell key={i} fill={entry.color} />))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgb(15 23 42)", border: "none", borderRadius: "8px", color: "#f1f5f9", fontSize: "12px" }}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-1 text-xs min-w-0">
                {manufacturerChartData.slice(0, 4).map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 truncate min-w-0">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                      <span className="truncate">{entry.name}</span>
                    </span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 ml-2 shrink-0">{entry.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-slate-400 dark:text-slate-500">{t("dashboard.noData")}</p>
          )}
        </div>

        {/* Quick inventory & rules */}
        <div className={`${cardClass} p-4`}>
          <h2 className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
            {t("dashboard.quickInventory")}
          </h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
            <Link href="/manufacturers" className="flex items-center justify-between group">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200">
                <Box className="h-3.5 w-3.5" />{t("dashboard.manufacturers")}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{data.inventory.manufacturers}</span>
            </Link>
            <Link href="/models" className="flex items-center justify-between group">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200">
                <Cpu className="h-3.5 w-3.5" />{t("dashboard.models")}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{data.inventory.models}</span>
            </Link>
            <Link href="/profiles" className="flex items-center justify-between group">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200">
                <KeyRound className="h-3.5 w-3.5" />{t("dashboard.profiles")}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{data.inventory.profiles}</span>
            </Link>
            <Link href="/tags" className="flex items-center justify-between group">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200">
                <Tags className="h-3.5 w-3.5" />{t("dashboard.tags")}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">{data.inventory.tags}</span>
            </Link>
            <Link href="/collection-rules" className="flex items-center justify-between group col-span-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200">
                <FileSearch className="h-3.5 w-3.5" />{t("dashboard.rules")}
              </span>
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                {data.rules.enabled}<span className="text-slate-400 dark:text-slate-500">/{data.rules.total}</span>
              </span>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

interface KpiTileProps {
  icon: typeof Server;
  label: string;
  value: string | number;
  accent: "emerald" | "red" | "rose" | "blue" | "violet" | "amber";
}

function KpiTile({ icon: Icon, label, value, accent }: KpiTileProps) {
  const accentMap: Record<string, string> = {
    emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    red: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
    rose: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400",
    blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
    violet: "bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400",
    amber: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };
  return (
    <div className="rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${accentMap[accent]}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 truncate uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

function GradeBadge({ grade }: { grade: string | null }) {
  const g = grade && GRADE_COLORS[grade] ? grade : "unrated";
  const color = GRADE_COLORS[g];
  return (
    <div
      className="flex h-9 w-9 items-center justify-center rounded-lg text-sm font-bold text-white shrink-0"
      style={{ backgroundColor: color }}
    >
      {grade ?? "?"}
    </div>
  );
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center h-[220px]">
      <p className="text-sm text-slate-400 dark:text-slate-500">{label}</p>
    </div>
  );
}
