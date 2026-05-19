"use client";

import { ReactNode } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ScanSearch,
  ArrowUpCircle,
  Wifi,
  WifiOff,
} from "lucide-react";

export interface NodeTagLite {
  id: number;
  name: string;
  color: string;
}

export interface NodeDynamicTagLite extends NodeTagLite {
  ruleId: number | null;
  ruleName: string | null;
}

export interface NodeRow {
  id: number;
  name: string | null;
  ipAddress: string;
  hostname: string | null;
  score: string | null;
  complianceScore?: string | null;
  vulnerabilityScore?: string | null;
  systemUpdateScore?: string | null;
  policy: string;
  discoveredModel: string | null;
  discoveredVersion: string | null;
  productModel: string | null;
  complianceEvaluating: string | null;
  enforcing: string | null;
  isReachable: boolean | null;
  lastPingAt: string | null;
  monitoringEnabled: boolean;
  manufacturer: { id: number; name: string; logo: string | null } | null;
  model: { id: number; name: string } | null;
  profile: { id: number; name: string } | null;
  tags: NodeTagLite[];
  dynamicTags: NodeDynamicTagLite[];
  createdAt: string;
}

export interface NodeExtras {
  compliancePenalty?: number;
  complianceScoreNumeric?: number | null;
  complianceCounts?: { compliant: number; non_compliant: number; error: number; not_applicable: number };
  vulnerability?: {
    total: number;
    bySeverity: Record<string, number>;
    penalty: number;
    numeric: number | null;
  };
  systemUpdate?: {
    recommendedVersion: string | null;
    releaseDate: string | null;
    endOfSaleDate: string | null;
    endOfSupportDate: string | null;
    endOfLifeDate: string | null;
    numeric: number | null;
  };
  scoreNumeric?: number | null;
  vulnerabilityScoreNumeric?: number | null;
  systemUpdateScoreNumeric?: number | null;
  inventory?: Record<string, string[]>;
}

export interface FieldRef {
  field: string;
  params?: Record<string, string | number | null>;
}

export interface CellContext {
  extras?: NodeExtras;
  complianceStats?: { compliant: number; non_compliant: number; error: number; not_applicable: number };
  complianceStatus?: string;
  collectStatus?: string;
  extractStatus?: string;
  productRanges: { name: string; recommendedVersion: string | null }[];
  t: (k: string, v?: Record<string, string>) => string;
  locale: string;
}

export const SCORE_COLORS: Record<string, string> = {
  A: "bg-emerald-500",
  B: "bg-lime-500",
  C: "bg-yellow-500",
  D: "bg-orange-500",
  E: "bg-red-400",
  F: "bg-red-600",
};

const SEVERITY_COLOR: Record<string, string> = {
  critical: "text-red-600 dark:text-red-400",
  high: "text-orange-600 dark:text-orange-400",
  medium: "text-amber-600 dark:text-amber-400",
  low: "text-yellow-600 dark:text-yellow-400",
  none: "text-slate-500 dark:text-slate-400",
};

function formatDate(s: string | null | undefined, locale: string): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleDateString(locale);
  } catch { return "—"; }
}

function getUpgradeInfo(node: NodeRow, productRanges: { name: string; recommendedVersion: string | null }[]) {
  if (!node.productModel || !node.discoveredVersion) return null;
  const candidates = productRanges.filter((pr) => {
    const hwName = pr.name.replace(/\s*\(.*$/, "");
    return node.productModel!.toLowerCase().includes(hwName.toLowerCase());
  });
  if (candidates.length === 0) return null;
  let match = candidates[0];
  if (candidates.length > 1) {
    const vMajor = parseInt(node.discoveredVersion.split(".")[0], 10);
    for (const c of candidates) {
      if (!c.recommendedVersion) continue;
      const rMajor = parseInt(c.recommendedVersion.split(".")[0], 10);
      if (Math.abs(vMajor - rMajor) <= 5) { match = c; break; }
    }
  }
  if (!match.recommendedVersion) return null;
  const cmp = node.discoveredVersion.localeCompare(match.recommendedVersion, undefined, { numeric: true, sensitivity: "base" });
  if (cmp >= 0) return null;
  return { needsUpgrade: true, recommended: match.recommendedVersion };
}

function gradeBadge(grade: string | null | undefined): ReactNode {
  if (!grade) return <span className="text-slate-300 dark:text-slate-600">—</span>;
  return (
    <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white ${SCORE_COLORS[grade] ?? "bg-slate-300 dark:bg-slate-600"}`}>
      {grade}
    </span>
  );
}

function dash(): ReactNode { return <span className="text-slate-300 dark:text-slate-600">—</span>; }

export function renderTagList(node: NodeRow, mode: "all" | "manual" | "dynamic"): ReactNode {
  const manual = node.tags ?? [];
  const dyn = node.dynamicTags ?? [];
  const manualIds = new Set(manual.map((t) => t.id));
  const dynUnique = dyn.filter((t) => !manualIds.has(t.id));
  let list: { id: number; name: string; color: string; dynamic: boolean; ruleName?: string | null }[] = [];
  if (mode === "manual") list = manual.map((t) => ({ ...t, dynamic: false, ruleName: null }));
  else if (mode === "dynamic") list = dynUnique.map((t) => ({ ...t, dynamic: true }));
  else list = [
    ...manual.map((t) => ({ ...t, dynamic: false, ruleName: null as string | null })),
    ...dynUnique.map((t) => ({ ...t, dynamic: true })),
  ];

  if (list.length === 0) return null;
  const visible = list.slice(0, 3);
  const extra = list.length - visible.length;
  return (
    <div className="flex items-center gap-1 mt-0.5">
      {visible.map((tag, i) => (
        <span
          key={`${tag.dynamic ? "d" : "m"}-${tag.id}-${i}`}
          className={`inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium text-white leading-4 ${tag.dynamic ? "border border-dashed border-white/60" : ""}`}
          style={{ backgroundColor: tag.color }}
          title={tag.dynamic ? `Auto${tag.ruleName ? ` · ${tag.ruleName}` : ""}` : undefined}
        >
          {tag.name}
        </span>
      ))}
      {extra > 0 && (
        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">+{extra}</span>
      )}
    </div>
  );
}

export function renderCell(node: NodeRow, ref: FieldRef, ctx: CellContext, variant: "primary" | "secondary" = "primary"): ReactNode {
  const extras = ctx.extras;
  const small = variant === "secondary";
  const textCls = small ? "text-xs text-slate-500 dark:text-slate-400" : "text-sm text-slate-700 dark:text-slate-300";

  switch (ref.field) {
    case "score": {
      if (ctx.complianceStatus) {
        return (
          <div className="flex h-7 w-7 items-center justify-center">
            <Loader2 className={`h-5 w-5 animate-spin ${ctx.complianceStatus === "running" ? "text-blue-500" : "text-slate-400"}`} />
          </div>
        );
      }
      if (!node.score) return <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-700" />;
      return (
        <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${SCORE_COLORS[node.score] ?? "bg-slate-300 dark:bg-slate-600"}`}>
          {node.score}
        </div>
      );
    }

    case "complianceBar":
    case "complianceBarOnly": {
      const showPercent = ref.field === "complianceBar";
      const isEvaluating = !!ctx.complianceStatus;
      const wrapClass = `flex items-center gap-2 min-w-[140px] w-full`;
      if (isEvaluating) {
        return (
          <div className={wrapClass}>
            <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden relative">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: ctx.complianceStatus === "running"
                    ? "linear-gradient(90deg, transparent 0%, #3b82f6 50%, transparent 100%)"
                    : "linear-gradient(90deg, transparent 0%, #94a3b8 50%, transparent 100%)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 1.5s ease-in-out infinite",
                }}
              />
            </div>
            {showPercent && (
              <span className={`text-xs whitespace-nowrap ${ctx.complianceStatus === "running" ? "text-blue-500" : "text-slate-400 dark:text-slate-500"}`}>
                {ctx.complianceStatus === "running" ? ctx.t("compliance.evaluating") : ctx.t("compliance.pending")}
              </span>
            )}
          </div>
        );
      }
      const st = ctx.complianceStats;
      if (!st) {
        return (
          <div className={wrapClass}>
            <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full bg-slate-200 dark:bg-slate-700" style={{ width: "100%" }} />
            </div>
            {showPercent && <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">—</span>}
          </div>
        );
      }
      const c = st.compliant || 0;
      const nc = st.non_compliant || 0;
      const err = st.error || 0;
      const total = c + nc + err;
      if (total === 0) {
        return (
          <div className={wrapClass}>
            <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div className="h-full rounded-full bg-slate-200 dark:bg-slate-700" style={{ width: "100%" }} />
            </div>
            {showPercent && <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">—</span>}
          </div>
        );
      }
      const pC = (c / total) * 100;
      const pNC = ((c + nc) / total) * 100;
      const pct = Math.round((c / total) * 100);
      return (
        <div className={wrapClass}>
          <div className="flex-1 h-2 rounded-full overflow-hidden relative">
            <div className="absolute inset-0" style={{
              background: `linear-gradient(to right, ${[
                ...(c > 0 ? [`#10b981 0%, #10b981 ${pC}%`] : []),
                ...(nc > 0 ? [`#ef4444 ${pC}%, #ef4444 ${pNC}%`] : []),
                ...(err > 0 ? [`#ef4444 ${pNC}%, #ef4444 100%`] : []),
              ].join(", ")})`
            }} />
            {err > 0 && (
              <div className="absolute inset-0" style={{
                clipPath: `inset(0 0 0 ${pNC}%)`,
                backgroundImage: `repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(255,255,255,0.35) 2px, rgba(255,255,255,0.35) 4px)`,
              }} />
            )}
          </div>
          {showPercent && <span className="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">{pct}%</span>}
        </div>
      );
    }

    case "complianceScore": return gradeBadge(node.complianceScore);
    case "vulnerabilityScore": return gradeBadge(node.vulnerabilityScore);
    case "systemUpdateScore": return gradeBadge(node.systemUpdateScore);

    case "complianceScoreNumeric": {
      const v = extras?.complianceScoreNumeric;
      if (v == null) return dash();
      return <span className={textCls}>{v.toFixed(1)}</span>;
    }
    case "vulnerabilityScoreNumeric": {
      const v = extras?.vulnerability?.numeric ?? extras?.vulnerabilityScoreNumeric;
      if (v == null) return dash();
      return <span className={textCls}>{Number(v).toFixed(1)}</span>;
    }
    case "systemUpdateScoreNumeric": {
      const v = extras?.systemUpdate?.numeric ?? extras?.systemUpdateScoreNumeric;
      if (v == null) return dash();
      return <span className={textCls}>{Number(v).toFixed(1)}</span>;
    }
    case "compliancePenalty": {
      const v = extras?.compliancePenalty;
      if (v == null) return dash();
      return <span className={textCls}>{v}</span>;
    }
    case "vulnerabilityPenalty": {
      const v = extras?.vulnerability?.penalty;
      if (v == null) return dash();
      return <span className={textCls}>{v}</span>;
    }

    case "hostname": {
      const name = node.hostname || node.name;
      return (
        <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-900 dark:text-slate-100">
          {name || <span className="text-slate-300 dark:text-slate-600">—</span>}
          {ctx.collectStatus && (
            ctx.collectStatus === "completed" ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> :
            ctx.collectStatus === "failed" ? <XCircle className="h-4 w-4 text-red-500 shrink-0" /> :
            ctx.collectStatus === "running" ? <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" /> :
            <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
          )}
          {ctx.extractStatus && (
            ctx.extractStatus === "completed" ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" /> :
            ctx.extractStatus === "failed" ? <XCircle className="h-4 w-4 text-red-500 shrink-0" /> :
            ctx.extractStatus === "running" ? <ScanSearch className="h-4 w-4 animate-pulse text-amber-500 shrink-0" /> :
            <ScanSearch className="h-4 w-4 animate-pulse text-slate-400 shrink-0" />
          )}
        </span>
      );
    }

    case "name":
      return <span className={textCls}>{node.name || dash()}</span>;

    case "ipAddress": {
      return (
        <span className="flex items-center gap-2">
          <span className={`font-mono ${small ? "text-xs" : "text-sm"} text-slate-700 dark:text-slate-300`}>{node.ipAddress}</span>
          {node.monitoringEnabled && (
            <span className={`inline-block h-2 w-2 rounded-full ${node.isReachable === null ? "bg-slate-300 dark:bg-slate-600" : node.isReachable ? "bg-emerald-500" : "bg-red-500"}`} />
          )}
        </span>
      );
    }

    case "manufacturer": {
      if (!node.manufacturer) return dash();
      return (
        <div className="flex items-center gap-2">
          {node.manufacturer.logo && (
            <img src={`/api/logos/${node.manufacturer.logo}`} alt="" className="h-5 w-5 object-contain shrink-0" />
          )}
          <span className={textCls}>{node.manufacturer.name}</span>
        </div>
      );
    }

    case "model": return <span className={textCls}>{node.model?.name || dash()}</span>;
    case "profile": return <span className={textCls}>{node.profile?.name || dash()}</span>;
    case "productModel": return <span className={textCls}>{node.productModel || dash()}</span>;
    case "discoveredModel": return <span className={textCls}>{node.discoveredModel || dash()}</span>;

    case "discoveredVersion": {
      if (!node.discoveredVersion) return dash();
      const info = getUpgradeInfo(node, ctx.productRanges);
      return (
        <span className={`inline-flex items-center gap-1.5 ${textCls}`}>
          {node.discoveredVersion}
          {info && (
            <span title={`${ctx.t("systemUpdates.recommendedVersion")}: ${info.recommended}`}>
              <ArrowUpCircle className="h-3.5 w-3.5 text-amber-500" />
            </span>
          )}
        </span>
      );
    }

    case "tags": return renderTagList(node, "all") ?? dash();
    case "manualTags": return renderTagList(node, "manual") ?? dash();
    case "dynamicTags": return renderTagList(node, "dynamic") ?? dash();

    case "policy": {
      return (
        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
          node.enforcing
            ? "bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400"
            : node.policy === "enforce"
            ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400"
            : "bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400"
        }`}>
          {node.enforcing && <Loader2 className="h-3 w-3 animate-spin" />}
          {node.enforcing
            ? ctx.t("nodes.enforcing")
            : node.policy === "enforce" ? ctx.t("nodes.policyEnforce") : ctx.t("nodes.policyAudit")}
        </span>
      );
    }

    case "cveTotal": {
      const v = extras?.vulnerability?.total;
      if (v == null) return dash();
      return <span className={textCls}>{v}</span>;
    }
    case "cveCritical":
    case "cveHigh":
    case "cveMedium":
    case "cveLow": {
      const sev = ref.field.replace("cve", "").toLowerCase();
      const v = extras?.vulnerability?.bySeverity?.[sev] ?? 0;
      if (v === 0) return <span className="text-slate-300 dark:text-slate-600">0</span>;
      return <span className={`font-medium ${SEVERITY_COLOR[sev]}`}>{v}</span>;
    }

    case "recommendedVersion": return <span className={textCls}>{extras?.systemUpdate?.recommendedVersion || dash()}</span>;
    case "releaseDate": return <span className={textCls}>{formatDate(extras?.systemUpdate?.releaseDate, ctx.locale)}</span>;
    case "endOfSaleDate": return <span className={textCls}>{formatDate(extras?.systemUpdate?.endOfSaleDate, ctx.locale)}</span>;
    case "endOfSupportDate": return <span className={textCls}>{formatDate(extras?.systemUpdate?.endOfSupportDate, ctx.locale)}</span>;
    case "endOfLifeDate": return <span className={textCls}>{formatDate(extras?.systemUpdate?.endOfLifeDate, ctx.locale)}</span>;

    case "taskIndicators": {
      const items: ReactNode[] = [];
      if (ctx.collectStatus) {
        items.push(
          ctx.collectStatus === "completed" ? <CheckCircle2 key="c-c" className="h-4 w-4 text-emerald-500" /> :
          ctx.collectStatus === "failed" ? <XCircle key="c-f" className="h-4 w-4 text-red-500" /> :
          ctx.collectStatus === "running" ? <Loader2 key="c-r" className="h-4 w-4 animate-spin text-blue-500" /> :
          <Loader2 key="c-p" className="h-4 w-4 animate-spin text-slate-400" />
        );
      }
      if (ctx.extractStatus) {
        items.push(
          ctx.extractStatus === "completed" ? <CheckCircle2 key="e-c" className="h-4 w-4 text-emerald-500" /> :
          ctx.extractStatus === "failed" ? <XCircle key="e-f" className="h-4 w-4 text-red-500" /> :
          ctx.extractStatus === "running" ? <ScanSearch key="e-r" className="h-4 w-4 animate-pulse text-amber-500" /> :
          <ScanSearch key="e-p" className="h-4 w-4 animate-pulse text-slate-400" />
        );
      }
      if (items.length === 0) return dash();
      return <div className="flex items-center gap-1">{items}</div>;
    }

    case "isReachable": {
      if (!node.monitoringEnabled) return dash();
      if (node.isReachable === null) return <span className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300 dark:bg-slate-600" />;
      return node.isReachable
        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600"><Wifi className="h-3.5 w-3.5" />OK</span>
        : <span className="inline-flex items-center gap-1 text-xs text-red-500"><WifiOff className="h-3.5 w-3.5" />KO</span>;
    }
    case "lastPingAt": return <span className={textCls}>{node.lastPingAt ? new Date(node.lastPingAt).toLocaleString(ctx.locale) : dash()}</span>;

    case "createdAt": return <span className={textCls}>{formatDate(node.createdAt, ctx.locale)}</span>;

    case "inventory": {
      const cat = typeof ref.params?.category === "string" ? ref.params.category : "";
      const col = typeof ref.params?.column === "string" ? ref.params.column : "";
      const entryKey = typeof ref.params?.key === "string" ? ref.params.key : "";
      if (!cat || !col) return dash();
      const idxKey = `${cat}||${entryKey}||${col}`;
      const values = extras?.inventory?.[idxKey];
      if (!values || values.length === 0) return dash();
      if (values.length === 1) return <span className={textCls}>{values[0]}</span>;
      return <span className={textCls} title={values.join(", ")}>{values[0]} <span className="text-slate-400">+{values.length - 1}</span></span>;
    }
  }

  return dash();
}

export function getSortValue(node: NodeRow, ref: FieldRef, extras: NodeExtras | undefined, complianceStats: { compliant: number; non_compliant: number; error: number; not_applicable: number } | undefined): string | number {
  switch (ref.field) {
    case "score": return node.score || "Z";
    case "complianceScore": return node.complianceScore || "Z";
    case "vulnerabilityScore": return node.vulnerabilityScore || "Z";
    case "systemUpdateScore": return node.systemUpdateScore || "Z";
    case "complianceBar":
    case "complianceBarOnly": {
      const st = complianceStats;
      if (!st) return -1;
      const total = (st.compliant || 0) + (st.non_compliant || 0) + (st.error || 0);
      return total > 0 ? (st.compliant / total) : -1;
    }
    case "complianceScoreNumeric": return extras?.complianceScoreNumeric ?? -1;
    case "vulnerabilityScoreNumeric": return extras?.vulnerability?.numeric ?? -1;
    case "systemUpdateScoreNumeric": return extras?.systemUpdate?.numeric ?? -1;
    case "compliancePenalty": return extras?.compliancePenalty ?? -1;
    case "vulnerabilityPenalty": return extras?.vulnerability?.penalty ?? -1;
    case "hostname": return (node.hostname || node.name || "").toLowerCase();
    case "name": return (node.name || "").toLowerCase();
    case "ipAddress": {
      const parts = node.ipAddress.split(".").map((p) => parseInt(p, 10));
      if (parts.length !== 4 || parts.some(isNaN)) return 0;
      return ((parts[0] * 256 + parts[1]) * 256 + parts[2]) * 256 + parts[3];
    }
    case "manufacturer": return (node.manufacturer?.name || "").toLowerCase();
    case "model": return (node.model?.name || "").toLowerCase();
    case "profile": return (node.profile?.name || "").toLowerCase();
    case "productModel": return (node.productModel || "").toLowerCase();
    case "discoveredModel": return (node.discoveredModel || "").toLowerCase();
    case "discoveredVersion": return (node.discoveredVersion || "").toLowerCase();
    case "policy": return node.policy || "";
    case "cveTotal": return extras?.vulnerability?.total ?? -1;
    case "cveCritical": return extras?.vulnerability?.bySeverity?.critical ?? -1;
    case "cveHigh": return extras?.vulnerability?.bySeverity?.high ?? -1;
    case "cveMedium": return extras?.vulnerability?.bySeverity?.medium ?? -1;
    case "cveLow": return extras?.vulnerability?.bySeverity?.low ?? -1;
    case "releaseDate": return extras?.systemUpdate?.releaseDate || "";
    case "endOfSaleDate": return extras?.systemUpdate?.endOfSaleDate || "";
    case "endOfSupportDate": return extras?.systemUpdate?.endOfSupportDate || "";
    case "endOfLifeDate": return extras?.systemUpdate?.endOfLifeDate || "";
    case "lastPingAt": return node.lastPingAt || "";
    case "createdAt": return node.createdAt || "";
    case "inventory": {
      const cat = typeof ref.params?.category === "string" ? ref.params.category : "";
      const col = typeof ref.params?.column === "string" ? ref.params.column : "";
      const entryKey = typeof ref.params?.key === "string" ? ref.params.key : "";
      const idxKey = `${cat}||${entryKey}||${col}`;
      const values = extras?.inventory?.[idxKey];
      return values?.[0] || "";
    }
  }
  return "";
}
