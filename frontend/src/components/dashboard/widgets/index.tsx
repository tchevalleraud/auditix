"use client";

import Link from "next/link";
import {
  PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Server, FileSearch, ShieldCheck, ShieldAlert, AlertCircle, AlertTriangle, Activity,
  Tags, KeyRound, Box, Cpu, Network, FileText, Zap, ArrowRight,
} from "lucide-react";

// ---- Shared types ----

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DashboardData = Record<string, any>;
type T = (key: string, params?: Record<string, string>) => string;

interface WidgetProps {
  data: DashboardData;
  t: T;
}

// ---- Shared helpers ----

const GRADE_COLORS: Record<string, string> = { A: "#10b981", B: "#84cc16", C: "#eab308", D: "#f97316", E: "#ef4444", F: "#991b1b", unrated: "#94a3b8" };
const SEVERITY_COLORS: Record<string, string> = { critical: "#991b1b", high: "#ef4444", medium: "#f97316", low: "#eab308", info: "#3b82f6" };
const MFR_COLORS = ["#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ec4899", "#06b6d4", "#84cc16"];
const tooltipStyle = { backgroundColor: "rgb(15 23 42)", border: "none", borderRadius: "8px", color: "#f1f5f9", fontSize: "12px" };

function scoreColor(score: number | null) {
  if (score === null) return "#94a3b8";
  if (score >= 90) return "#10b981";
  if (score >= 75) return "#84cc16";
  if (score >= 60) return "#eab308";
  if (score >= 45) return "#f97316";
  return "#ef4444";
}

function KpiTile({ icon: Icon, label, value, accent }: { icon: typeof Server; label: string; value: string | number; accent: string }) {
  const map: Record<string, string> = {
    emerald: "bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    red: "bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400",
    rose: "bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400",
    blue: "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400",
    violet: "bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400",
    amber: "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400",
    teal: "bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400",
  };
  return (
    <div className="rounded-lg border border-slate-100 dark:border-slate-800 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <div className={`flex h-6 w-6 items-center justify-center rounded-md ${map[accent] ?? map.blue}`}>
          <Icon className="h-3.5 w-3.5" />
        </div>
        <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 truncate uppercase tracking-wider">{label}</span>
      </div>
      <p className="mt-1 text-xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
    </div>
  );
}

// ---- COMPLIANCE WIDGETS ----

export function ComplianceScoreWidget({ data, t }: WidgetProps) {
  const c = data.compliance;
  if (!c) return null;
  const score = c.globalScore as number | null;
  const grade = c.globalGrade as string | null;
  const color = scoreColor(score);
  const size = 130;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex flex-col items-center justify-center h-full gap-2">
      <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size/2} cy={size/2} r={radius} stroke="currentColor" strokeWidth={stroke} fill="none" className="text-slate-100 dark:text-slate-800" />
          {score !== null && <circle cx={size/2} cy={size/2} r={radius} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }} />}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {score !== null ? (
            <>
              <span className="text-3xl font-bold tracking-tight leading-none" style={{ color }}>{grade ?? "—"}</span>
              <span className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{score}/100</span>
            </>
          ) : (
            <span className="text-2xl font-bold text-slate-300 dark:text-slate-600">—</span>
          )}
        </div>
      </div>
      <p className="text-[10px] text-slate-400">{t("dashboard.globalScore")}</p>
    </div>
  );
}

export function ComplianceHeroWidget({ data, t }: WidgetProps) {
  const c = data.compliance;
  if (!c) return null;
  const score = c.globalScore as number | null;
  const grade = c.globalGrade as string | null;
  const color = scoreColor(score);
  const size = 120;
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = score !== null ? Math.max(0, Math.min(100, score)) : 0;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="flex gap-5 h-full">
      <div className="flex flex-col items-center justify-center shrink-0 pr-5 border-r border-slate-100 dark:border-slate-800">
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
          <svg width={size} height={size} className="-rotate-90">
            <circle cx={size/2} cy={size/2} r={radius} stroke="currentColor" strokeWidth={stroke} fill="none" className="text-slate-100 dark:text-slate-800" />
            {score !== null && <circle cx={size/2} cy={size/2} r={radius} stroke={color} strokeWidth={stroke} fill="none" strokeDasharray={circumference} strokeDashoffset={offset} strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.6s ease" }} />}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-bold tracking-tight leading-none" style={{ color }}>{grade ?? "—"}</span>
            <span className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{score !== null ? `${score}/100` : "N/A"}</span>
          </div>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">{t("dashboard.globalScore")}</p>
      </div>
      <div className="flex-1 grid grid-cols-2 sm:grid-cols-3 gap-2 content-start">
        <KpiTile icon={ShieldCheck} label={t("dashboard.compliantResults")} value={c.byStatus.compliant} accent="emerald" />
        <KpiTile icon={ShieldAlert} label={t("dashboard.violations")} value={c.byStatus.non_compliant} accent="red" />
        <KpiTile icon={AlertCircle} label={t("dashboard.criticalViolations")} value={c.bySeverity.critical} accent="rose" />
        <KpiTile icon={Server} label={t("dashboard.evaluatedNodes")} value={`${c.evaluatedNodes}/${c.totalNodes}`} accent="blue" />
        <KpiTile icon={FileSearch} label={t("dashboard.activePolicies")} value={c.enabledPolicies} accent="violet" />
        <KpiTile icon={AlertTriangle} label={t("dashboard.errors")} value={c.byStatus.error} accent="amber" />
      </div>
    </div>
  );
}

export function ComplianceKpisWidget({ data, t }: WidgetProps) {
  const c = data.compliance;
  if (!c) return null;
  return (
    <div className="grid grid-cols-2 gap-2 h-full content-start">
      <KpiTile icon={ShieldCheck} label={t("dashboard.compliantResults")} value={c.byStatus.compliant} accent="emerald" />
      <KpiTile icon={ShieldAlert} label={t("dashboard.violations")} value={c.byStatus.non_compliant} accent="red" />
      <KpiTile icon={AlertCircle} label={t("dashboard.criticalViolations")} value={c.bySeverity.critical} accent="rose" />
      <KpiTile icon={Server} label={t("dashboard.evaluatedNodes")} value={`${c.evaluatedNodes}/${c.totalNodes}`} accent="blue" />
      <KpiTile icon={FileSearch} label={t("dashboard.activePolicies")} value={c.enabledPolicies} accent="violet" />
      <KpiTile icon={AlertTriangle} label={t("dashboard.errors")} value={c.byStatus.error} accent="amber" />
    </div>
  );
}

export function ComplianceGradeChartWidget({ data, t }: WidgetProps) {
  const c = data.compliance;
  if (!c) return null;
  const chartData = (["A","B","C","D","E","F","unrated"] as const).map((g) => ({
    grade: g === "unrated" ? t("dashboard.unrated") : g, key: g, value: c.byGrade[g], color: GRADE_COLORS[g],
  })).filter((d) => d.value > 0);
  if (chartData.length === 0) return <p className="text-sm text-center text-slate-400 py-8">{t("dashboard.noData")}</p>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
        <XAxis dataKey="grade" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgba(148,163,184,0.1)" }} contentStyle={tooltipStyle} />
        <Bar dataKey="value" radius={[6,6,0,0]}>{chartData.map((e) => <Cell key={e.key} fill={e.color} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ComplianceSeverityChartWidget({ data, t }: WidgetProps) {
  const c = data.compliance;
  if (!c) return null;
  const labels: Record<string, string> = { critical: t("dashboard.severityCritical"), high: t("dashboard.severityHigh"), medium: t("dashboard.severityMedium"), low: t("dashboard.severityLow"), info: t("dashboard.severityInfo") };
  const chartData = (["critical","high","medium","low","info"] as const).map((s) => ({
    severity: labels[s], key: s, value: c.bySeverity[s], color: SEVERITY_COLORS[s],
  })).filter((d) => d.value > 0);
  const total = chartData.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="flex flex-col items-center justify-center h-full"><ShieldCheck className="h-10 w-10 text-emerald-500 mb-2" /><p className="text-sm text-slate-400">{t("dashboard.allCompliant")}</p></div>;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={chartData} layout="vertical" margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
        <YAxis dataKey="severity" type="category" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickLine={false} width={70} />
        <Tooltip cursor={{ fill: "rgba(148,163,184,0.1)" }} contentStyle={tooltipStyle} />
        <Bar dataKey="value" radius={[0,6,6,0]}>{chartData.map((e) => <Cell key={e.key} fill={e.color} />)}</Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export function ComplianceUnhealthyNodesWidget({ data, t }: WidgetProps) {
  const nodes = data.compliance?.topUnhealthyNodes ?? [];
  if (nodes.length === 0) return <div className="flex flex-col items-center justify-center h-full"><ShieldCheck className="h-8 w-8 text-emerald-500 mb-2" /><p className="text-sm text-slate-400">{t("dashboard.allCompliant")}</p></div>;
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800 -mx-4 -mt-4">
      {nodes.map((n: DashboardData) => (
        <Link key={n.id} href={`/nodes/${n.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md text-xs font-bold text-white shrink-0" style={{ backgroundColor: GRADE_COLORS[n.grade] ?? GRADE_COLORS.unrated }}>{n.grade ?? "?"}</div>
            <div className="min-w-0"><p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{n.name || n.ipAddress}</p><p className="text-[10px] text-slate-400 truncate">{n.ipAddress}</p></div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {n.criticalCount > 0 && <span className="rounded-full bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">{n.criticalCount}C</span>}
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{n.violations}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

export function ComplianceViolatedRulesWidget({ data, t }: WidgetProps) {
  const rules = data.compliance?.topViolatedRules ?? [];
  if (rules.length === 0) return <div className="flex flex-col items-center justify-center h-full"><ShieldCheck className="h-8 w-8 text-emerald-500 mb-2" /><p className="text-sm text-slate-400">{t("dashboard.allCompliant")}</p></div>;
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800 -mx-4 -mt-4">
      {rules.map((r: DashboardData) => (
        <Link key={r.id} href={`/compliance/rules/${r.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
          <div className="min-w-0 flex-1"><p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{r.name}</p><p className="text-[10px] text-slate-400 truncate font-mono">{r.identifier}</p></div>
          <div className="flex items-center gap-1.5 shrink-0 ml-2">
            {r.criticalCount > 0 && <span className="rounded-full bg-red-50 dark:bg-red-500/10 px-1.5 py-0.5 text-[10px] font-medium text-red-600 dark:text-red-400">C·{r.criticalCount}</span>}
            <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">{r.violationCount}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}

// ---- NODES WIDGETS ----

export function NodesKpiWidget({ data, t }: WidgetProps) {
  const n = data.nodes;
  if (!n) return null;
  return (
    <div className="flex flex-col items-center justify-center h-full gap-1">
      <Server className="h-6 w-6 text-blue-500" />
      <p className="text-3xl font-bold text-slate-900 dark:text-slate-100">{n.total}</p>
      <p className="text-[10px] text-slate-400 uppercase tracking-wider">{t("dashboard.nodes")}</p>
      {data.monitoring && (
        <div className="flex items-center gap-2 mt-1 text-xs">
          <span className="flex items-center gap-1 text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{n.reachable}</span>
          <span className="flex items-center gap-1 text-red-500"><span className="h-1.5 w-1.5 rounded-full bg-red-500" />{n.unreachable}</span>
        </div>
      )}
    </div>
  );
}

export function NodesSummaryWidget({ data, t }: WidgetProps) {
  return (
    <div className="grid grid-cols-2 gap-2 h-full content-start">
      <KpiTile icon={Server} label={t("dashboard.nodes")} value={data.nodes?.total ?? 0} accent="blue" />
      <KpiTile icon={Activity} label={t("dashboard.reachable")} value={data.nodes?.reachable ?? 0} accent="emerald" />
      <KpiTile icon={AlertCircle} label={t("dashboard.unreachable")} value={data.nodes?.unreachable ?? 0} accent="red" />
      <KpiTile icon={Server} label={t("dashboard.unknown")} value={data.nodes?.unknown ?? 0} accent="amber" />
    </div>
  );
}

export function NodesReachabilityWidget({ data, t }: WidgetProps) {
  if (!data.monitoring || !data.nodes) return <p className="text-sm text-center text-slate-400 py-8">{t("dashboard.monitoringDisabled")}</p>;
  const chartData = [
    { name: t("dashboard.reachable"), value: data.nodes.reachable, color: "#10b981" },
    { name: t("dashboard.unreachable"), value: data.nodes.unreachable, color: "#ef4444" },
    { name: t("dashboard.unknown"), value: data.nodes.unknown, color: "#94a3b8" },
  ].filter((d) => d.value > 0);
  if (chartData.length === 0) return <p className="text-sm text-center text-slate-400 py-8">{t("dashboard.noData")}</p>;
  return (
    <div className="flex items-center gap-3 h-full">
      <ResponsiveContainer width={110} height={110}>
        <PieChart><Pie data={chartData} cx="50%" cy="50%" innerRadius={32} outerRadius={50} paddingAngle={2} dataKey="value">{chartData.map((e, i) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1 text-xs">
        {chartData.map((e) => (
          <div key={e.name} className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 truncate"><span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />{e.name}</span><span className="font-semibold text-slate-900 dark:text-slate-100 ml-2">{e.value}</span></div>
        ))}
      </div>
    </div>
  );
}

export function NodesManufacturersWidget({ data, t }: WidgetProps) {
  const chartData = (data.nodes?.byManufacturer ?? []).map((m: DashboardData, i: number) => ({ name: m.name, value: Number(m.total), color: MFR_COLORS[i % MFR_COLORS.length] }));
  if (chartData.length === 0) return <p className="text-sm text-center text-slate-400 py-8">{t("dashboard.noData")}</p>;
  return (
    <div className="flex items-center gap-3 h-full">
      <ResponsiveContainer width={110} height={110}>
        <PieChart><Pie data={chartData} cx="50%" cy="50%" innerRadius={32} outerRadius={50} paddingAngle={2} dataKey="value">{chartData.map((e: DashboardData, i: number) => <Cell key={i} fill={e.color} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1 text-xs min-w-0">
        {chartData.slice(0, 5).map((e: DashboardData) => (
          <div key={e.name} className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 truncate min-w-0"><span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} /><span className="truncate">{e.name}</span></span><span className="font-semibold text-slate-900 dark:text-slate-100 ml-2 shrink-0">{e.value}</span></div>
        ))}
      </div>
    </div>
  );
}

// ---- TOPOLOGY WIDGETS ----

export function TopologySummaryWidget({ data, t }: WidgetProps) {
  const topo = data.topology ?? { maps: 0, devices: 0, links: 0 };
  return (
    <div className="grid grid-cols-2 gap-2 h-full content-start">
      <KpiTile icon={Network} label={t("dashboard.topoMaps")} value={topo.maps} accent="violet" />
      <KpiTile icon={Server} label={t("dashboard.topoDevices")} value={topo.devices} accent="blue" />
      <KpiTile icon={Activity} label={t("dashboard.topoLinks")} value={topo.links} accent="teal" />
    </div>
  );
}

// ---- COLLECTIONS WIDGETS ----

export function CollectionsSummaryWidget({ data, t }: WidgetProps) {
  return (
    <div className="grid grid-cols-2 gap-2 h-full content-start">
      <KpiTile icon={FileSearch} label={t("dashboard.rules")} value={`${data.rules?.enabled ?? 0}/${data.rules?.total ?? 0}`} accent="amber" />
      <KpiTile icon={Box} label={t("dashboard.manufacturers")} value={data.inventory?.manufacturers ?? 0} accent="blue" />
      <KpiTile icon={Cpu} label={t("dashboard.models")} value={data.inventory?.models ?? 0} accent="violet" />
      <KpiTile icon={Tags} label={t("dashboard.tags")} value={data.inventory?.tags ?? 0} accent="teal" />
    </div>
  );
}

export function CollectionsRecentWidget({ data, t }: WidgetProps) {
  return (
    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs h-full content-start">
      <Link href="/manufacturers" className="flex items-center justify-between group">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"><Box className="h-3.5 w-3.5" />{t("dashboard.manufacturers")}</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{data.inventory?.manufacturers ?? 0}</span>
      </Link>
      <Link href="/models" className="flex items-center justify-between group">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"><Cpu className="h-3.5 w-3.5" />{t("dashboard.models")}</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{data.inventory?.models ?? 0}</span>
      </Link>
      <Link href="/profiles" className="flex items-center justify-between group">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"><KeyRound className="h-3.5 w-3.5" />{t("dashboard.profiles")}</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{data.inventory?.profiles ?? 0}</span>
      </Link>
      <Link href="/tags" className="flex items-center justify-between group">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"><Tags className="h-3.5 w-3.5" />{t("dashboard.tags")}</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{data.inventory?.tags ?? 0}</span>
      </Link>
    </div>
  );
}

export function CollectionsInventoryWidget({ data, t }: WidgetProps) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs h-full content-start">
      <Link href="/manufacturers" className="flex items-center justify-between group">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"><Box className="h-3.5 w-3.5" />{t("dashboard.manufacturers")}</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{data.inventory?.manufacturers ?? 0}</span>
      </Link>
      <Link href="/models" className="flex items-center justify-between group">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"><Cpu className="h-3.5 w-3.5" />{t("dashboard.models")}</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{data.inventory?.models ?? 0}</span>
      </Link>
      <Link href="/profiles" className="flex items-center justify-between group">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"><KeyRound className="h-3.5 w-3.5" />{t("dashboard.profiles")}</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{data.inventory?.profiles ?? 0}</span>
      </Link>
      <Link href="/tags" className="flex items-center justify-between group">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"><Tags className="h-3.5 w-3.5" />{t("dashboard.tags")}</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{data.inventory?.tags ?? 0}</span>
      </Link>
      <Link href="/collection-rules" className="flex items-center justify-between group col-span-2 pt-2 border-t border-slate-100 dark:border-slate-800">
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 group-hover:text-slate-900 dark:group-hover:text-slate-200"><FileSearch className="h-3.5 w-3.5" />{t("dashboard.rules")}</span>
        <span className="font-semibold text-slate-900 dark:text-slate-100">{data.rules?.enabled ?? 0}<span className="text-slate-400">/{data.rules?.total ?? 0}</span></span>
      </Link>
    </div>
  );
}

// ---- REPORTS WIDGETS ----

export function ReportsSummaryWidget({ data, t }: WidgetProps) {
  const reports = data.reports ?? { total: 0, generated: 0 };
  return (
    <div className="grid grid-cols-2 gap-2 h-full content-start">
      <KpiTile icon={FileText} label={t("dashboard.reportsTotal")} value={reports.total} accent="rose" />
      <KpiTile icon={FileText} label={t("dashboard.reportsGenerated")} value={reports.generated} accent="emerald" />
    </div>
  );
}

// ---- AUTOMATIONS WIDGETS ----

export function AutomationsSummaryWidget({ data, t }: WidgetProps) {
  const auto = data.automations ?? { schedulers: 0, active: 0 };
  return (
    <div className="grid grid-cols-2 gap-2 h-full content-start">
      <KpiTile icon={Zap} label={t("dashboard.schedulers")} value={auto.schedulers} accent="teal" />
      <KpiTile icon={Activity} label={t("dashboard.activeJobs")} value={auto.active} accent="amber" />
    </div>
  );
}

// ---- VULNERABILITY WIDGETS ----

export function VulnerabilitySummaryWidget({ data, t }: WidgetProps) {
  const v = data.vulnerabilities;
  if (!v || !v.enabled) return <div className="flex flex-col items-center justify-center h-full"><ShieldAlert className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" /><p className="text-xs text-slate-400">Disabled</p></div>;
  return (
    <div className="grid grid-cols-2 gap-2 h-full content-start">
      <KpiTile icon={ShieldAlert} label={t("dashboard.w_vulnerability-summary")} value={v.total} accent="red" />
      <KpiTile icon={AlertCircle} label={t("dashboard.severityCritical")} value={v.bySeverity?.critical ?? 0} accent="rose" />
      <KpiTile icon={AlertTriangle} label={t("dashboard.severityHigh")} value={v.bySeverity?.high ?? 0} accent="amber" />
      <KpiTile icon={ShieldCheck} label={t("dashboard.severityMedium")} value={v.bySeverity?.medium ?? 0} accent="blue" />
    </div>
  );
}

export function VulnerabilitySeverityChartWidget({ data, t }: WidgetProps) {
  const v = data.vulnerabilities;
  if (!v || !v.enabled) return <div className="flex flex-col items-center justify-center h-full"><ShieldAlert className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" /><p className="text-xs text-slate-400">Disabled</p></div>;
  const VULN_SEV_COLORS: Record<string, string> = { critical: "#991b1b", high: "#ef4444", medium: "#f97316", low: "#eab308", none: "#94a3b8" };
  const labels: Record<string, string> = { critical: t("dashboard.severityCritical"), high: t("dashboard.severityHigh"), medium: t("dashboard.severityMedium"), low: t("dashboard.severityLow"), none: "None" };
  const chartData = (["critical","high","medium","low","none"] as const).map((s) => ({
    severity: labels[s] ?? s, key: s, value: v.bySeverity?.[s] ?? 0, color: VULN_SEV_COLORS[s],
  })).filter((d) => d.value > 0);
  if (chartData.length === 0) return <div className="flex flex-col items-center justify-center h-full"><ShieldCheck className="h-10 w-10 text-emerald-500 mb-2" /><p className="text-sm text-slate-400">{t("dashboard.noData")}</p></div>;
  return (
    <div className="flex items-center gap-3 h-full">
      <ResponsiveContainer width={110} height={110}>
        <PieChart><Pie data={chartData} cx="50%" cy="50%" innerRadius={32} outerRadius={50} paddingAngle={2} dataKey="value">{chartData.map((e) => <Cell key={e.key} fill={e.color} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart>
      </ResponsiveContainer>
      <div className="flex-1 space-y-1 text-xs">
        {chartData.map((e) => (
          <div key={e.key} className="flex items-center justify-between"><span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400 truncate"><span className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: e.color }} />{e.severity}</span><span className="font-semibold text-slate-900 dark:text-slate-100 ml-2">{e.value}</span></div>
        ))}
      </div>
    </div>
  );
}

export function VulnerabilityTopCvesWidget({ data, t }: WidgetProps) {
  const v = data.vulnerabilities;
  if (!v || !v.enabled) return <div className="flex flex-col items-center justify-center h-full"><ShieldAlert className="h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" /><p className="text-xs text-slate-400">Disabled</p></div>;
  const models = v.topAffectedModels ?? [];
  if (models.length === 0) return <div className="flex flex-col items-center justify-center h-full"><ShieldCheck className="h-8 w-8 text-emerald-500 mb-2" /><p className="text-sm text-slate-400">{t("dashboard.noData")}</p></div>;
  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800 -mx-4 -mt-4">
      {models.map((m: DashboardData, i: number) => (
        <div key={i} className="flex items-center justify-between px-4 py-2.5">
          <div className="min-w-0"><p className="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">{m.name}</p><p className="text-[10px] text-slate-400 truncate">{m.manufacturer}</p></div>
          <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 shrink-0 ml-2">{m.cve_count} CVE</span>
        </div>
      ))}
    </div>
  );
}

// ---- WIDGET RENDERER ----

const WIDGET_COMPONENTS: Record<string, React.ComponentType<WidgetProps>> = {
  "compliance-score": ComplianceScoreWidget,
  "compliance-hero": ComplianceHeroWidget,
  "compliance-kpis": ComplianceKpisWidget,
  "compliance-grade-chart": ComplianceGradeChartWidget,
  "compliance-severity-chart": ComplianceSeverityChartWidget,
  "compliance-unhealthy-nodes": ComplianceUnhealthyNodesWidget,
  "compliance-violated-rules": ComplianceViolatedRulesWidget,
  "nodes-kpi": NodesKpiWidget,
  "nodes-summary": NodesSummaryWidget,
  "nodes-reachability": NodesReachabilityWidget,
  "nodes-manufacturers": NodesManufacturersWidget,
  "topology-summary": TopologySummaryWidget,
  "collections-summary": CollectionsSummaryWidget,
  "collections-recent": CollectionsRecentWidget,
  "collections-inventory": CollectionsInventoryWidget,
  "reports-summary": ReportsSummaryWidget,
  "automations-summary": AutomationsSummaryWidget,
  "vulnerability-summary": VulnerabilitySummaryWidget,
  "vulnerability-severity-chart": VulnerabilitySeverityChartWidget,
  "vulnerability-top-cves": VulnerabilityTopCvesWidget,
};

const WIDGET_ICONS: Record<string, React.ReactNode> = {
  "compliance-score": <ShieldCheck className="h-3.5 w-3.5" />,
  "compliance-hero": <ShieldCheck className="h-3.5 w-3.5" />,
  "compliance-kpis": <ShieldCheck className="h-3.5 w-3.5" />,
  "compliance-grade-chart": <ShieldCheck className="h-3.5 w-3.5" />,
  "compliance-severity-chart": <ShieldAlert className="h-3.5 w-3.5" />,
  "compliance-unhealthy-nodes": <AlertCircle className="h-3.5 w-3.5" />,
  "compliance-violated-rules": <AlertTriangle className="h-3.5 w-3.5" />,
  "nodes-kpi": <Server className="h-3.5 w-3.5" />,
  "nodes-summary": <Server className="h-3.5 w-3.5" />,
  "nodes-reachability": <Activity className="h-3.5 w-3.5" />,
  "nodes-manufacturers": <Box className="h-3.5 w-3.5" />,
  "topology-summary": <Network className="h-3.5 w-3.5" />,
  "collections-summary": <FileSearch className="h-3.5 w-3.5" />,
  "collections-recent": <FileSearch className="h-3.5 w-3.5" />,
  "collections-inventory": <KeyRound className="h-3.5 w-3.5" />,
  "reports-summary": <FileText className="h-3.5 w-3.5" />,
  "automations-summary": <Zap className="h-3.5 w-3.5" />,
  "vulnerability-summary": <ShieldAlert className="h-3.5 w-3.5" />,
  "vulnerability-severity-chart": <ShieldAlert className="h-3.5 w-3.5" />,
  "vulnerability-top-cves": <ShieldAlert className="h-3.5 w-3.5" />,
};

export function getWidgetComponent(type: string) { return WIDGET_COMPONENTS[type] ?? null; }
export function getWidgetIcon(type: string) { return WIDGET_ICONS[type] ?? <Box className="h-3.5 w-3.5" />; }
