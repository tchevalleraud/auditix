"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  Save,
  CheckCircle2,
  Calendar,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Server,
  FileBarChart,
  Mail,
  ShieldCheck,
  Database,
  ArrowRight,
  Play,
  X,
  Settings as SettingsIcon,
  Tag as TagIcon,
  Layers,
  FileText,
  Sparkles,
} from "lucide-react";
import CronBuilder from "@/components/CronBuilder";

type NodeMode = "all" | "tag" | "individual";
type TabKey =
  | "general"
  | "nodes"
  | "collect"
  | "extract"
  | "cleanup"
  | "compliance"
  | "report"
  | "mail"
  | "settings";

interface ScheduleDetail {
  id: number;
  name: string;
  cronExpression: string;
  enabled: boolean;
  currentPhase: string | null;
  currentPhaseStatus: string | null;
  lastTriggeredAt: string | null;
  lastCompletedAt: string | null;
  nextRunAt: string | null;
  nodeSelectionMode: NodeMode | null;
  nodeTagId: number | null;
  nodeIds: number[] | null;
  collectEnabled: boolean;
  extractEnabled: boolean;
  cleanupEnabled: boolean;
  complianceEnabled: boolean;
  reportIds: number[] | null;
  mailReportIds: number[] | null;
  createdAt: string;
  updatedAt: string | null;
}

interface ContextNode {
  id: number;
  name: string | null;
  ipAddress: string;
  hostname: string | null;
  tags?: { id: number; name: string; color: string }[];
  dynamicTags?: { id: number; name: string; color: string }[];
}

interface ContextReport {
  id: number;
  name: string;
}

interface ContextMailReport {
  id: number;
  name: string;
  mailServer: { id: number; name: string } | null;
}

interface NodeTag {
  id: number;
  name: string;
  color: string;
}

const PHASE_ORDER = ["collect", "extract", "cleanup", "compliance", "report", "mail"] as const;

export default function ScheduleDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const { current } = useAppContext();
  const scheduleId = Number(id);

  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  // Form fields
  const [name, setName] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [enabled, setEnabled] = useState(false);

  // Node selection (shared)
  const [nodeMode, setNodeMode] = useState<NodeMode>("individual");
  const [nodeTagId, setNodeTagId] = useState<number | null>(null);
  const [nodeIds, setNodeIds] = useState<number[]>([]);

  // Phase toggles
  const [collectEnabled, setCollectEnabled] = useState(false);
  const [extractEnabled, setExtractEnabled] = useState(false);
  const [cleanupEnabled, setCleanupEnabled] = useState(false);
  const [complianceEnabled, setComplianceEnabled] = useState(false);
  const [reportEnabled, setReportEnabled] = useState(false);
  const [mailEnabled, setMailEnabled] = useState(false);

  // Phase data
  const [reportIds, setReportIds] = useState<number[]>([]);
  const [mailReportIds, setMailReportIds] = useState<number[]>([]);

  // Context data
  const [contextNodes, setContextNodes] = useState<ContextNode[]>([]);
  const [contextReports, setContextReports] = useState<ContextReport[]>([]);
  const [contextMailReports, setContextMailReports] = useState<ContextMailReport[]>([]);
  const [contextTags, setContextTags] = useState<NodeTag[]>([]);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Toast
  const [toast, setToast] = useState<{ message: string; visible: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, visible: true });
    toastTimer.current = setTimeout(() => {
      setToast((prev) => (prev ? { ...prev, visible: false } : null));
      setTimeout(() => setToast(null), 300);
    }, 2000);
  }, []);

  const loadSchedule = useCallback(async () => {
    const res = await fetch(`/api/schedules/${scheduleId}`);
    if (!res.ok) {
      router.push("/schedules");
      return;
    }
    const data: ScheduleDetail = await res.json();
    setSchedule(data);
    setName(data.name);
    setCronExpression(data.cronExpression);
    setEnabled(data.enabled);
    setNodeMode((data.nodeSelectionMode as NodeMode) || "individual");
    setNodeTagId(data.nodeTagId);
    setNodeIds(data.nodeIds || []);
    setCollectEnabled(data.collectEnabled);
    setExtractEnabled(data.extractEnabled);
    setCleanupEnabled(data.cleanupEnabled);
    setComplianceEnabled(data.complianceEnabled);
    setReportEnabled(data.reportIds !== null);
    setMailEnabled(data.mailReportIds !== null);
    setReportIds(data.reportIds || []);
    setMailReportIds(data.mailReportIds || []);
    setLoading(false);
  }, [scheduleId, router]);

  const loadContextNodes = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/nodes?context=${current.id}`);
    if (res.ok) {
      const data = await res.json();
      setContextNodes(data);
    }
  }, [current]);

  const loadContextReports = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/reports?context=${current.id}`);
    if (res.ok) setContextReports(await res.json());
  }, [current]);

  const loadContextMailReports = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/mail-reports?context=${current.id}`);
    if (res.ok) setContextMailReports(await res.json());
  }, [current]);

  const loadContextTags = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/node-tags?context=${current.id}`);
    if (res.ok) setContextTags(await res.json());
  }, [current]);

  useEffect(() => {
    loadSchedule();
    loadContextNodes();
    loadContextReports();
    loadContextMailReports();
    loadContextTags();
  }, [loadSchedule, loadContextNodes, loadContextReports, loadContextMailReports, loadContextTags]);

  // Mercure live updates
  useEffect(() => {
    const url = new URL("/.well-known/mercure", window.location.origin);
    url.searchParams.append("topic", `schedules/${scheduleId}`);
    const es = new EventSource(url.toString(), { withCredentials: true });

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === "schedule.deleted") {
          router.push("/schedules");
          return;
        }
        if (data.schedule && data.schedule.id === scheduleId) {
          setSchedule((prev) => (prev ? { ...prev, ...data.schedule } : prev));
        }
      } catch {
        // ignore
      }
    };

    return () => es.close();
  }, [scheduleId, router]);

  // Polling fallback while running (in case Mercure is down)
  useEffect(() => {
    if (!schedule || !schedule.currentPhase) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/schedules/${scheduleId}`);
      if (res.ok) {
        const data: ScheduleDetail = await res.json();
        setSchedule((prev) => (prev ? { ...prev, ...data } : data));
      }
    }, 30000);
    return () => clearInterval(interval);
  }, [schedule?.currentPhase, scheduleId]);

  const resolvedNodeCount = useMemo(() => {
    if (nodeMode === "all") return contextNodes.length;
    if (nodeMode === "tag" && nodeTagId) {
      return contextNodes.filter((n) => {
        const all = [...(n.tags || []), ...(n.dynamicTags || [])];
        return all.some((tg) => tg.id === nodeTagId);
      }).length;
    }
    if (nodeMode === "individual") return nodeIds.length;
    return 0;
  }, [nodeMode, nodeTagId, nodeIds, contextNodes]);

  const requiresNodes = collectEnabled || extractEnabled || complianceEnabled;
  const nodeModeValid =
    !requiresNodes ||
    nodeMode === "all" ||
    (nodeMode === "tag" && nodeTagId !== null) ||
    (nodeMode === "individual" && nodeIds.length > 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/schedules/${scheduleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          cronExpression: cronExpression.trim(),
          enabled,
          nodeSelectionMode: requiresNodes ? nodeMode : null,
          nodeTagId: requiresNodes && nodeMode === "tag" ? nodeTagId : null,
          nodeIds: requiresNodes && nodeMode === "individual" ? nodeIds : null,
          collectEnabled,
          extractEnabled,
          cleanupEnabled,
          complianceEnabled,
          reportIds: reportEnabled ? reportIds : null,
          mailReportIds: mailEnabled ? mailReportIds : null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSchedule(data);
        showToast(t("schedules.saved"));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleTrigger = async () => {
    const res = await fetch(`/api/schedules/${scheduleId}/trigger`, { method: "POST" });
    if (res.ok) setSchedule(await res.json());
  };

  const handleCancel = async () => {
    const res = await fetch(`/api/schedules/${scheduleId}/cancel`, { method: "POST" });
    if (res.ok) setSchedule(await res.json());
  };

  const handleDelete = async () => {
    await fetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
    router.push("/schedules");
  };

  if (loading || !schedule) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  const isRunning = !!schedule.currentPhase;

  const phaseMeta: Record<string, { label: string; icon: typeof Database; enabled: boolean }> = {
    collect: { label: t("schedules.tabCollect"), icon: Database, enabled: collectEnabled },
    extract: { label: t("schedules.tabExtract"), icon: Sparkles, enabled: extractEnabled },
    cleanup: { label: t("schedules.tabCleanup"), icon: Trash2, enabled: cleanupEnabled },
    compliance: { label: t("schedules.tabCompliance"), icon: ShieldCheck, enabled: complianceEnabled },
    report: { label: t("schedules.tabReport"), icon: FileBarChart, enabled: reportEnabled },
    mail: { label: t("schedules.tabMail"), icon: Mail, enabled: mailEnabled },
  };

  const inputClass =
    "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

  const tabs: { key: TabKey; label: string; icon: typeof Database; phaseKey?: string }[] = [
    { key: "general", label: t("schedules.tabGeneral"), icon: SettingsIcon },
    { key: "nodes", label: t("schedules.tabNodes"), icon: Server },
    { key: "collect", label: t("schedules.tabCollect"), icon: Database, phaseKey: "collect" },
    { key: "extract", label: t("schedules.tabExtract"), icon: Sparkles, phaseKey: "extract" },
    { key: "cleanup", label: t("schedules.tabCleanup"), icon: Trash2, phaseKey: "cleanup" },
    { key: "compliance", label: t("schedules.tabCompliance"), icon: ShieldCheck, phaseKey: "compliance" },
    { key: "report", label: t("schedules.tabReport"), icon: FileBarChart, phaseKey: "report" },
    { key: "mail", label: t("schedules.tabMail"), icon: Mail, phaseKey: "mail" },
  ];

  const renderToggle = (value: boolean, onChange: (v: boolean) => void) => (
    <button type="button" onClick={() => onChange(!value)}>
      {value ? (
        <ToggleRight className="h-6 w-6 text-emerald-500" />
      ) : (
        <ToggleLeft className="h-6 w-6 text-slate-400" />
      )}
    </button>
  );

  const renderPhaseTabContent = (
    phaseKey: string,
    enabledState: boolean,
    setEnabledState: (v: boolean) => void,
    description: string,
    extra?: React.ReactNode,
  ) => {
    const Icon = phaseMeta[phaseKey].icon;
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {phaseMeta[phaseKey].label}
            </h2>
          </div>
          {renderToggle(enabledState, setEnabledState)}
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400">{description}</p>
        {enabledState && extra}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/schedules"
              className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <ArrowLeft className="h-5 w-5 text-slate-400" />
            </Link>
            <Calendar className="h-5 w-5 text-blue-500" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{schedule.name}</h1>
            {renderToggle(enabled, setEnabled)}
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
                isRunning
                  ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
              }`}
            >
              {isRunning ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin" />
                  {t("schedules.statusRunning")}
                  {schedule.currentPhase && (
                    <span className="text-blue-500 dark:text-blue-400">
                      ({phaseMeta[schedule.currentPhase]?.label || schedule.currentPhase})
                    </span>
                  )}
                </>
              ) : (
                t("schedules.statusIdle")
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleTrigger}
              disabled={isRunning}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              <Play className="h-4 w-4" />
              {t("schedules.triggerNow")}
            </button>
            {isRunning && (
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-4 w-4" />
                {t("schedules.cancelRun")}
              </button>
            )}
          </div>
        </div>

        {/* Execution order */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3">
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">
            {t("schedules.executionOrder")}
          </span>
          {PHASE_ORDER.map((p, idx) => {
            const meta = phaseMeta[p];
            const Icon = meta.icon;
            const isCurrent = schedule.currentPhase === p;
            const isPast =
              schedule.currentPhase &&
              PHASE_ORDER.indexOf(schedule.currentPhase as typeof PHASE_ORDER[number]) > idx;
            return (
              <div key={p} className="flex items-center gap-2">
                {idx > 0 && (
                  <ArrowRight className="h-3 w-3 text-slate-300 dark:text-slate-600" />
                )}
                <span
                  className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium border transition-colors ${
                    isCurrent
                      ? "bg-blue-50 dark:bg-blue-500/10 border-blue-500 text-blue-700 dark:text-blue-300 ring-2 ring-blue-300/40"
                      : isPast
                      ? "bg-emerald-50 dark:bg-emerald-500/10 border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                      : meta.enabled
                      ? "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200"
                      : "border-slate-200 dark:border-slate-800 text-slate-400 dark:text-slate-600 opacity-60"
                  }`}
                >
                  {isCurrent ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : isPast ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <Icon className="h-3 w-3" />
                  )}
                  {meta.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Tabs bar */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-1 overflow-x-auto overflow-y-hidden">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const phaseEnabled = tab.phaseKey ? phaseMeta[tab.phaseKey].enabled : null;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors whitespace-nowrap ${
                  isActive
                    ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                <Icon className="h-4 w-4" />
                {tab.label}
                {phaseEnabled !== null && (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      phaseEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-700"
                    }`}
                  />
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
            activeTab === "settings"
              ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
              : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
          }`}
        >
          <SettingsIcon className="h-4 w-4" />
          {t("schedules.tabSettings")}
        </button>
      </div>

      {/* Tab content */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
        {activeTab === "general" && (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className={labelClass}>{t("schedules.cronExpression")}</label>
              <CronBuilder value={cronExpression} onChange={setCronExpression} t={t} />
            </div>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
                <p className="text-xs text-slate-400">{t("schedules.nextRun")}</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {schedule.nextRunAt ? new Date(schedule.nextRunAt).toLocaleString() : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
                <p className="text-xs text-slate-400">{t("schedules.lastTriggered")}</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {schedule.lastTriggeredAt
                    ? new Date(schedule.lastTriggeredAt).toLocaleString()
                    : t("schedules.never")}
                </p>
              </div>
              <div className="rounded-lg border border-slate-200 dark:border-slate-800 px-4 py-3">
                <p className="text-xs text-slate-400">{t("schedules.lastCompleted")}</p>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {schedule.lastCompletedAt
                    ? new Date(schedule.lastCompletedAt).toLocaleString()
                    : t("schedules.never")}
                </p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "nodes" && (
          <div className="space-y-5">
            <div className="grid grid-cols-3 gap-3">
              {(["all", "tag", "individual"] as const).map((mode) => {
                const labels: Record<NodeMode, [string, string, typeof Database]> = {
                  all: [t("schedules.nodeModeAll"), t("schedules.nodeModeAllDesc"), Layers],
                  tag: [t("schedules.nodeModeTag"), t("schedules.nodeModeTagDesc"), TagIcon],
                  individual: [
                    t("schedules.nodeModeIndividual"),
                    t("schedules.nodeModeIndividualDesc"),
                    Server,
                  ],
                };
                const [label, desc, Icon] = labels[mode];
                const selected = nodeMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setNodeMode(mode)}
                    className={`flex flex-col items-start gap-2 rounded-lg border p-4 text-left transition-colors ${
                      selected
                        ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800"
                        : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                    }`}
                  >
                    <Icon className="h-4 w-4 text-slate-500 dark:text-slate-400" />
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {label}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">{desc}</span>
                  </button>
                );
              })}
            </div>

            {nodeMode === "tag" && (
              <div className="space-y-1.5">
                <label className={labelClass}>{t("schedules.selectTag")}</label>
                {contextTags.length === 0 ? (
                  <p className="text-sm text-slate-400">{t("schedules.noTags")}</p>
                ) : (
                  <select
                    value={nodeTagId ?? ""}
                    onChange={(e) => setNodeTagId(e.target.value ? Number(e.target.value) : null)}
                    className={inputClass}
                  >
                    <option value="">—</option>
                    {contextTags.map((tag) => (
                      <option key={tag.id} value={tag.id}>
                        {tag.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {nodeMode === "individual" && (
              <div>
                {contextNodes.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
                    {t("schedules.noNodes")}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {contextNodes.map((node) => {
                      const isSelected = nodeIds.includes(node.id);
                      const nodeLabel = node.name || node.hostname || node.ipAddress;
                      const showIp = nodeLabel !== node.ipAddress;
                      const allTags = [
                        ...(node.tags || []).map((t) => ({ ...t, dynamic: false })),
                        ...(node.dynamicTags || []).map((t) => ({ ...t, dynamic: true })),
                      ];
                      return (
                        <label
                          key={node.id}
                          className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                            isSelected
                              ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800"
                              : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={(e) => {
                              if (e.target.checked) setNodeIds([...nodeIds, node.id]);
                              else setNodeIds(nodeIds.filter((nid) => nid !== node.id));
                            }}
                            className="rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-500"
                          />
                          <Server className="h-4 w-4 text-slate-400 shrink-0" />
                          <div className="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {nodeLabel}
                            </span>
                            {showIp && (
                              <span className="text-xs text-slate-400 dark:text-slate-500 font-mono">
                                {node.ipAddress}
                              </span>
                            )}
                            {allTags.map((tag) => (
                              <span
                                key={`${tag.dynamic ? "d" : "m"}-${tag.id}`}
                                className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                                  tag.dynamic ? "border border-dashed" : ""
                                }`}
                                style={{
                                  backgroundColor: tag.dynamic ? "transparent" : `${tag.color}20`,
                                  color: tag.color,
                                  borderColor: tag.dynamic ? `${tag.color}80` : "transparent",
                                }}
                                title={tag.dynamic ? `${tag.name} (dynamic)` : tag.name}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <p className="text-xs text-slate-400 dark:text-slate-500">
              {t("schedules.resolvedNodes")}: <span className="font-medium text-slate-700 dark:text-slate-200">{resolvedNodeCount}</span>
            </p>
          </div>
        )}

        {activeTab === "collect" &&
          renderPhaseTabContent("collect", collectEnabled, setCollectEnabled, t("schedules.collectDesc"))}

        {activeTab === "extract" &&
          renderPhaseTabContent("extract", extractEnabled, setExtractEnabled, t("schedules.extractDesc"))}

        {activeTab === "cleanup" &&
          renderPhaseTabContent("cleanup", cleanupEnabled, setCleanupEnabled, t("schedules.cleanupDesc"))}

        {activeTab === "compliance" &&
          renderPhaseTabContent(
            "compliance",
            complianceEnabled,
            setComplianceEnabled,
            t("schedules.complianceDesc"),
          )}

        {activeTab === "report" &&
          renderPhaseTabContent(
            "report",
            reportEnabled,
            setReportEnabled,
            "",
            <div>
              {contextReports.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
                  {t("schedules.noReports")}
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {contextReports.map((report) => {
                    const isSelected = reportIds.includes(report.id);
                    return (
                      <label
                        key={report.id}
                        className={`flex items-center gap-3 rounded-lg border px-4 py-3 cursor-pointer transition-colors ${
                          isSelected
                            ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800"
                            : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            if (e.target.checked) setReportIds([...reportIds, report.id]);
                            else setReportIds(reportIds.filter((rid) => rid !== report.id));
                          }}
                          className="rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-500"
                        />
                        <FileText className="h-4 w-4 text-slate-400" />
                        <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {report.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                {t("schedules.reportCount", { count: String(reportIds.length) })}
              </p>
            </div>,
          )}

        {activeTab === "mail" &&
          renderPhaseTabContent(
            "mail",
            mailEnabled,
            setMailEnabled,
            "",
            <div>
              {contextMailReports.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
                  {t("schedules.noMailReports")}
                </p>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {contextMailReports.map((report) => {
                    const isSelected = mailReportIds.includes(report.id);
                    const disabled = !report.mailServer;
                    return (
                      <label
                        key={report.id}
                        className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} ${
                          isSelected
                            ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800"
                            : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={disabled}
                          onChange={(e) => {
                            if (e.target.checked) setMailReportIds([...mailReportIds, report.id]);
                            else setMailReportIds(mailReportIds.filter((rid) => rid !== report.id));
                          }}
                          className="rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-500"
                        />
                        <Mail className="h-4 w-4 text-slate-400" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 block truncate">
                            {report.name}
                          </span>
                          {!report.mailServer && (
                            <span className="text-xs text-amber-600 dark:text-amber-400">
                              {t("schedules.mailReportNoServer")}
                            </span>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">
                {t("schedules.mailReportCount", { count: String(mailReportIds.length) })}
              </p>
            </div>,
          )}

        {activeTab === "settings" && (
          <div className="space-y-6">
            <div className="space-y-1.5">
              <label className={labelClass}>{t("schedules.name")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("schedules.namePlaceholder")}
                className={inputClass}
              />
            </div>
            <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50/50 dark:bg-red-500/5 p-6 space-y-3">
              <h3 className="text-sm font-semibold text-red-700 dark:text-red-400">
                {t("schedules.dangerZone")}
              </h3>
              <p className="text-sm text-red-600/80 dark:text-red-400/80">
                {t("schedules.dangerZoneDesc")}
              </p>
              <button
                onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                {t("schedules.deleteSchedule")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Save bar */}
      <div className="sticky bottom-4 flex items-center justify-end">
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || !cronExpression.trim() || !nodeModeValid}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors shadow-lg"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t("common.save")}
        </button>
      </div>

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("schedules.confirmDelete", { name: schedule.name })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-300 ${
            toast.visible ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2"
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          {toast.message}
        </div>
      )}
    </div>
  );
}
