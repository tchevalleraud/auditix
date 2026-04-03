"use client";

import { useState, useEffect, useCallback, useRef } from "react";
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
  ShieldCheck,
  Database,
  Clock,
  ArrowRight,
  Info,
  Play,
  X,
} from "lucide-react";
import CronBuilder from "@/components/CronBuilder";

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
  collectionNodeIds: number[] | null;
  complianceNodeIds: number[] | null;
  reportIds: number[] | null;
  createdAt: string;
  updatedAt: string | null;
}

interface ContextNode {
  id: number;
  name: string | null;
  ipAddress: string;
  hostname: string | null;
}

interface ContextReport {
  id: number;
  name: string;
}

export default function ScheduleDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const { current } = useAppContext();
  const scheduleId = Number(id);

  const [schedule, setSchedule] = useState<ScheduleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form fields
  const [name, setName] = useState("");
  const [cronExpression, setCronExpression] = useState("");
  const [enabled, setEnabled] = useState(false);

  // Phase toggles
  const [collectionEnabled, setCollectionEnabled] = useState(false);
  const [complianceEnabled, setComplianceEnabled] = useState(false);
  const [reportEnabled, setReportEnabled] = useState(false);

  // Phase selections
  const [collectionNodeIds, setCollectionNodeIds] = useState<number[]>([]);
  const [complianceNodeIds, setComplianceNodeIds] = useState<number[]>([]);
  const [reportIds, setReportIds] = useState<number[]>([]);

  // Context data
  const [contextNodes, setContextNodes] = useState<ContextNode[]>([]);
  const [contextReports, setContextReports] = useState<ContextReport[]>([]);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  // Toast notification
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
    setCollectionEnabled(data.collectionNodeIds !== null);
    setComplianceEnabled(data.complianceNodeIds !== null);
    setReportEnabled(data.reportIds !== null);
    setCollectionNodeIds(data.collectionNodeIds || []);
    setComplianceNodeIds(data.complianceNodeIds || []);
    setReportIds(data.reportIds || []);
    setLoading(false);
  }, [scheduleId, router]);

  const loadContextNodes = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/nodes?context=${current.id}`);
    if (res.ok) {
      const data = await res.json();
      setContextNodes(
        data.map((n: ContextNode) => ({
          id: n.id,
          name: n.name,
          ipAddress: n.ipAddress,
          hostname: n.hostname,
        }))
      );
    }
  }, [current]);

  const loadContextReports = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/reports?context=${current.id}`);
    if (res.ok) {
      const data = await res.json();
      setContextReports(
        data.map((r: ContextReport) => ({
          id: r.id,
          name: r.name,
        }))
      );
    }
  }, [current]);

  useEffect(() => {
    loadSchedule();
    loadContextNodes();
    loadContextReports();
  }, [loadSchedule, loadContextNodes, loadContextReports]);

  // Auto-refresh when running
  useEffect(() => {
    if (!schedule || !schedule.currentPhase) return;
    const interval = setInterval(async () => {
      const res = await fetch(`/api/schedules/${scheduleId}`);
      if (res.ok) {
        const data: ScheduleDetail = await res.json();
        setSchedule(data);
        // If no longer running, stop polling
        if (!data.currentPhase) {
          clearInterval(interval);
        }
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [schedule?.currentPhase, scheduleId]);

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
          collectionNodeIds: collectionEnabled ? collectionNodeIds : null,
          complianceNodeIds: complianceEnabled ? complianceNodeIds : null,
          reportIds: reportEnabled ? reportIds : null,
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
    if (res.ok) {
      const data = await res.json();
      setSchedule(data);
    }
  };

  const handleCancel = async () => {
    const res = await fetch(`/api/schedules/${scheduleId}/cancel`, { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setSchedule(data);
    }
  };

  const handleDelete = async () => {
    await fetch(`/api/schedules/${scheduleId}`, { method: "DELETE" });
    router.push("/schedules");
  };

  const inputClass =
    "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

  if (loading || !schedule) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  const isRunning = !!schedule.currentPhase;

  const phases = [
    { key: "collection", label: t("schedules.phaseCollection"), icon: Database },
    { key: "compliance", label: t("schedules.phaseCompliance"), icon: ShieldCheck },
    { key: "report", label: t("schedules.phaseReport"), icon: FileBarChart },
  ];

  const phaseOrder = ["collection", "compliance", "report"];
  const currentPhaseIndex = schedule.currentPhase
    ? phaseOrder.indexOf(schedule.currentPhase)
    : -1;

  const isPhaseEnabled = (key: string) => {
    if (key === "collection") return collectionEnabled;
    if (key === "compliance") return complianceEnabled;
    if (key === "report") return reportEnabled;
    return false;
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/schedules"
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-slate-400" />
          </Link>
          <div className="flex items-center gap-3">
            <Calendar className="h-5 w-5 text-blue-500" />
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {schedule.name}
            </h1>
            <button type="button" onClick={() => setEnabled(!enabled)}>
              {enabled ? (
                <ToggleRight className="h-6 w-6 text-emerald-500" />
              ) : (
                <ToggleLeft className="h-6 w-6 text-slate-400" />
              )}
            </button>
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
                      ({t(`schedules.phase${schedule.currentPhase.charAt(0).toUpperCase() + schedule.currentPhase.slice(1)}`)})
                    </span>
                  )}
                </>
              ) : (
                t("schedules.statusIdle")
              )}
            </span>
          </div>
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

      {/* Main content - two columns */}
      <div className="flex gap-6">
        {/* Left column - Configuration (2/3) */}
        <div className="w-2/3 space-y-6">
          {/* General card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("schedules.general")}
            </h2>
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
            <div className="space-y-1.5">
              <label className={labelClass}>{t("schedules.cronExpression")}</label>
              <CronBuilder value={cronExpression} onChange={setCronExpression} t={t} />
            </div>
          </div>

          {/* Collection Phase card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t("schedules.phaseCollection")}
                </h2>
              </div>
              <button type="button" onClick={() => setCollectionEnabled(!collectionEnabled)}>
                {collectionEnabled ? (
                  <ToggleRight className="h-6 w-6 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-6 w-6 text-slate-400" />
                )}
              </button>
            </div>
            {collectionEnabled && (
              <>
                {contextNodes.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
                    {t("schedules.noNodes")}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {contextNodes.map((node) => {
                      const isSelected = collectionNodeIds.includes(node.id);
                      const nodeLabel = node.name || node.hostname || node.ipAddress;
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
                              if (e.target.checked) {
                                setCollectionNodeIds([...collectionNodeIds, node.id]);
                              } else {
                                setCollectionNodeIds(collectionNodeIds.filter((nid) => nid !== node.id));
                              }
                            }}
                            className="rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-500"
                          />
                          <Server className="h-4 w-4 text-slate-400" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {nodeLabel}
                            </span>
                            {node.name && (
                              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                                {node.ipAddress}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {t("schedules.nodeCount", { count: String(collectionNodeIds.length) })}
                </p>
              </>
            )}
          </div>

          {/* Compliance Phase card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t("schedules.phaseCompliance")}
                </h2>
              </div>
              <button type="button" onClick={() => setComplianceEnabled(!complianceEnabled)}>
                {complianceEnabled ? (
                  <ToggleRight className="h-6 w-6 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-6 w-6 text-slate-400" />
                )}
              </button>
            </div>
            {complianceEnabled && (
              <>
                {contextNodes.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
                    {t("schedules.noNodes")}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {contextNodes.map((node) => {
                      const isSelected = complianceNodeIds.includes(node.id);
                      const nodeLabel = node.name || node.hostname || node.ipAddress;
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
                              if (e.target.checked) {
                                setComplianceNodeIds([...complianceNodeIds, node.id]);
                              } else {
                                setComplianceNodeIds(complianceNodeIds.filter((nid) => nid !== node.id));
                              }
                            }}
                            className="rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-500"
                          />
                          <Server className="h-4 w-4 text-slate-400" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {nodeLabel}
                            </span>
                            {node.name && (
                              <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                                {node.ipAddress}
                              </span>
                            )}
                          </div>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {t("schedules.nodeCount", { count: String(complianceNodeIds.length) })}
                </p>
              </>
            )}
          </div>

          {/* Report Phase card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileBarChart className="h-4 w-4 text-slate-400" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {t("schedules.phaseReport")}
                </h2>
              </div>
              <button type="button" onClick={() => setReportEnabled(!reportEnabled)}>
                {reportEnabled ? (
                  <ToggleRight className="h-6 w-6 text-emerald-500" />
                ) : (
                  <ToggleLeft className="h-6 w-6 text-slate-400" />
                )}
              </button>
            </div>
            {reportEnabled && (
              <>
                {contextReports.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 py-4 text-center">
                    {t("schedules.noReports")}
                  </p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
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
                              if (e.target.checked) {
                                setReportIds([...reportIds, report.id]);
                              } else {
                                setReportIds(reportIds.filter((rid) => rid !== report.id));
                              }
                            }}
                            className="rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-500"
                          />
                          <FileBarChart className="h-4 w-4 text-slate-400" />
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            {report.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {t("schedules.reportCount", { count: String(reportIds.length) })}
                </p>
              </>
            )}
          </div>

          {/* Save button */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !name.trim() || !cronExpression.trim()}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("common.save")}
            </button>
          </div>

          {/* Danger zone */}
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

        {/* Right column - Status (1/3) */}
        <div className="w-1/3 space-y-6">
          {/* Status card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("schedules.status")}
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {t("schedules.colStatus")}
                </span>
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
                    </>
                  ) : (
                    t("schedules.statusIdle")
                  )}
                </span>
              </div>
              {isRunning && (
                <>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500 dark:text-slate-400">
                      {t("schedules.currentPhase")}
                    </span>
                    <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {t(`schedules.phase${schedule.currentPhase!.charAt(0).toUpperCase() + schedule.currentPhase!.slice(1)}`)}
                    </span>
                  </div>
                  {schedule.currentPhaseStatus && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500 dark:text-slate-400">
                        {t("schedules.phaseActive")}
                      </span>
                      <span className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        {schedule.currentPhaseStatus}
                      </span>
                    </div>
                  )}
                </>
              )}
              {/* Phase progression */}
              {isRunning && (
                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    {phases.map((phase, idx) => {
                      const phaseIdx = phaseOrder.indexOf(phase.key);
                      let status: "done" | "active" | "pending" = "pending";
                      if (phaseIdx < currentPhaseIndex) status = "done";
                      else if (phaseIdx === currentPhaseIndex) status = "active";
                      const Icon = phase.icon;
                      return (
                        <div key={phase.key} className="flex items-center gap-2">
                          {idx > 0 && (
                            <ArrowRight
                              className={`h-3 w-3 ${
                                status === "done" || status === "active"
                                  ? "text-blue-400"
                                  : "text-slate-300 dark:text-slate-600"
                              }`}
                            />
                          )}
                          <div
                            className={`flex items-center gap-1.5 rounded-full px-2 py-1 text-xs font-medium ${
                              status === "done"
                                ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                                : status === "active"
                                ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
                                : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
                            }`}
                          >
                            {status === "done" ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : status === "active" ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Icon className="h-3 w-3" />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Schedule card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("schedules.schedule")}
            </h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {t("schedules.nextRun")}
                </span>
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {schedule.nextRunAt
                    ? new Date(schedule.nextRunAt).toLocaleString()
                    : "-"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {t("schedules.lastTriggered")}
                </span>
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {schedule.lastTriggeredAt
                    ? new Date(schedule.lastTriggeredAt).toLocaleString()
                    : t("schedules.never")}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-500 dark:text-slate-400">
                  {t("schedules.lastCompleted")}
                </span>
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {schedule.lastCompletedAt
                    ? new Date(schedule.lastCompletedAt).toLocaleString()
                    : t("schedules.never")}
                </span>
              </div>
            </div>
          </div>

          {/* Execution order card */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("schedules.executionOrder")}
            </h2>
            <div className="flex items-center justify-center gap-3">
              {phases.map((phase, idx) => {
                const phaseEnabled = isPhaseEnabled(phase.key);
                const Icon = phase.icon;
                return (
                  <div key={phase.key} className="flex items-center gap-3">
                    {idx > 0 && (
                      <ArrowRight className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                    )}
                    <div
                      className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-colors ${
                        phaseEnabled
                          ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800"
                          : "border-slate-200 dark:border-slate-700 opacity-40"
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 ${
                          phaseEnabled
                            ? "text-slate-900 dark:text-white"
                            : "text-slate-400"
                        }`}
                      />
                      <span
                        className={`text-xs font-medium ${
                          phaseEnabled
                            ? "text-slate-900 dark:text-white"
                            : "text-slate-400 dark:text-slate-500"
                        }`}
                      >
                        {phase.label}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
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

      {/* Toast notification */}
      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[60] flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white shadow-lg transition-all duration-300 ${
            toast.visible
              ? "opacity-100 translate-y-0"
              : "opacity-0 translate-y-2"
          }`}
        >
          <CheckCircle2 className="h-4 w-4" />
          {toast.message}
        </div>
      )}
    </div>
  );
}
