"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Calendar,
  Plus,
  Search,
  Loader2,
  Pencil,
  Trash2,
  X,
  Play,
  ToggleLeft,
  ToggleRight,
  Server,
  FileBarChart,
  ShieldCheck,
  ChevronDown,
  ChevronRight,
  Database,
  Info,
} from "lucide-react";
import CronBuilder from "@/components/CronBuilder";

interface ScheduleItem {
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
}

interface NodeOption {
  id: number;
  name: string | null;
  ipAddress: string;
  hostname: string | null;
}

interface ReportOption {
  id: number;
  name: string;
}

export default function SchedulesPage() {
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const router = useRouter();
  const [schedules, setSchedules] = useState<ScheduleItem[]>([]);
  const [search, setSearch] = useState("");
  const [fetchLoading, setFetchLoading] = useState(true);

  // Modal state
  const [modal, setModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [formName, setFormName] = useState("");
  const [formCron, setFormCron] = useState("");
  const [formEnabled, setFormEnabled] = useState(true);
  const [formCollectionEnabled, setFormCollectionEnabled] = useState(false);
  const [formCollectionNodeIds, setFormCollectionNodeIds] = useState<number[]>([]);
  const [formComplianceEnabled, setFormComplianceEnabled] = useState(false);
  const [formComplianceNodeIds, setFormComplianceNodeIds] = useState<number[]>([]);
  const [formReportEnabled, setFormReportEnabled] = useState(false);
  const [formReportIds, setFormReportIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  // Collapsible sections
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);

  // Options for selectors
  const [nodes, setNodes] = useState<NodeOption[]>([]);
  const [reports, setReports] = useState<ReportOption[]>([]);
  const [nodesLoading, setNodesLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);

  // Confirmation modals
  const [deleteConfirm, setDeleteConfirm] = useState<ScheduleItem | null>(null);
  const [triggerConfirm, setTriggerConfirm] = useState<ScheduleItem | null>(null);

  const dateLocale =
    locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  const loadSchedules = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/schedules?context=${current.id}`);
    if (res.ok) setSchedules(await res.json());
    setFetchLoading(false);
  }, [current]);

  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const loadOptions = useCallback(async () => {
    if (!current) return;
    setNodesLoading(true);
    setReportsLoading(true);
    try {
      const [nodesRes, reportsRes] = await Promise.all([
        fetch(`/api/nodes?context=${current.id}`),
        fetch(`/api/reports?context=${current.id}`),
      ]);
      if (nodesRes.ok) setNodes(await nodesRes.json());
      if (reportsRes.ok) setReports(await reportsRes.json());
    } finally {
      setNodesLoading(false);
      setReportsLoading(false);
    }
  }, [current]);

  const filtered = schedules.filter((s) =>
    s.name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingSchedule(null);
    setFormName("");
    setFormCron("");
    setFormEnabled(true);
    setFormCollectionEnabled(false);
    setFormCollectionNodeIds([]);
    setFormComplianceEnabled(false);
    setFormComplianceNodeIds([]);
    setFormReportEnabled(false);
    setFormReportIds([]);
    setCollectionOpen(false);
    setComplianceOpen(false);
    setReportOpen(false);
    setModal(true);
    loadOptions();
  };

  const openEdit = (schedule: ScheduleItem) => {
    setEditingSchedule(schedule);
    setFormName(schedule.name);
    setFormCron(schedule.cronExpression);
    setFormEnabled(schedule.enabled);
    setFormCollectionEnabled((schedule.collectionNodeIds ?? []).length > 0);
    setFormCollectionNodeIds(schedule.collectionNodeIds ?? []);
    setFormComplianceEnabled((schedule.complianceNodeIds ?? []).length > 0);
    setFormComplianceNodeIds(schedule.complianceNodeIds ?? []);
    setFormReportEnabled((schedule.reportIds ?? []).length > 0);
    setFormReportIds(schedule.reportIds ?? []);
    setCollectionOpen((schedule.collectionNodeIds ?? []).length > 0);
    setComplianceOpen((schedule.complianceNodeIds ?? []).length > 0);
    setReportOpen((schedule.reportIds ?? []).length > 0);
    setModal(true);
    loadOptions();
  };

  const handleSave = async () => {
    if (!formName.trim() || !formCron.trim() || !current) return;
    setSaving(true);
    try {
      const body = {
        name: formName.trim(),
        cronExpression: formCron.trim(),
        enabled: formEnabled,
        collectionNodeIds: formCollectionEnabled ? formCollectionNodeIds : null,
        complianceNodeIds: formComplianceEnabled ? formComplianceNodeIds : null,
        reportIds: formReportEnabled ? formReportIds : null,
      };
      const url = editingSchedule
        ? `/api/schedules/${editingSchedule.id}`
        : `/api/schedules?context=${current.id}`;
      const method = editingSchedule ? "PUT" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setModal(false);
        loadSchedules();
      } else {
        const err = await res.json().catch(() => ({}));
        console.error("Schedule save error:", res.status, err);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (schedule: ScheduleItem) => {
    await fetch(`/api/schedules/${schedule.id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    loadSchedules();
  };

  const handleTrigger = async (schedule: ScheduleItem) => {
    await fetch(`/api/schedules/${schedule.id}/trigger`, { method: "POST" });
    setTriggerConfirm(null);
    loadSchedules();
  };

  const handleToggleEnabled = async (schedule: ScheduleItem) => {
    const res = await fetch(`/api/schedules/${schedule.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...schedule, enabled: !schedule.enabled }),
    });
    if (res.ok) loadSchedules();
  };

  const toggleNodeId = (list: number[], setList: (v: number[]) => void, id: number) => {
    setList(list.includes(id) ? list.filter((n) => n !== id) : [...list, id]);
  };

  const toggleReportId = (id: number) => {
    setFormReportIds(
      formReportIds.includes(id) ? formReportIds.filter((r) => r !== id) : [...formReportIds, id]
    );
  };

  const getStatusBadge = (schedule: ScheduleItem) => {
    if (schedule.currentPhase && schedule.currentPhaseStatus === "running") {
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-700 dark:text-blue-300">
          <Loader2 className="h-3 w-3 animate-spin" />
          {schedule.currentPhase}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
        Idle
      </span>
    );
  };

  const getPhaseIndicators = (schedule: ScheduleItem) => {
    const indicators = [];
    if (schedule.collectionNodeIds && schedule.collectionNodeIds.length > 0) {
      indicators.push(
        <span key="c" className="inline-flex items-center justify-center rounded bg-emerald-100 dark:bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300" title={t("schedules.phaseCollection")}>
          C
        </span>
      );
    }
    if (schedule.complianceNodeIds && schedule.complianceNodeIds.length > 0) {
      indicators.push(
        <span key="co" className="inline-flex items-center justify-center rounded bg-amber-100 dark:bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-300" title={t("schedules.phaseCompliance")}>
          Co
        </span>
      );
    }
    if (schedule.reportIds && schedule.reportIds.length > 0) {
      indicators.push(
        <span key="r" className="inline-flex items-center justify-center rounded bg-violet-100 dark:bg-violet-500/10 px-1.5 py-0.5 text-[10px] font-bold text-violet-700 dark:text-violet-300" title={t("schedules.phaseReport")}>
          R
        </span>
      );
    }
    return indicators;
  };

  const inputClass =
    "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

  if (fetchLoading) {
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("schedules.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("schedules.subtitle")}</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("schedules.newSchedule")}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder={t("schedules.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("schedules.colName")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("schedules.colCron")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("schedules.colStatus")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("schedules.colNextRun")}
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("schedules.colActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <Calendar className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {search ? t("schedules.noResult") : t("schedules.noSchedules")}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((schedule) => (
                  <tr key={schedule.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => router.push(`/schedules/${schedule.id}`)}
                          className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:underline flex items-center gap-2"
                        >
                          <Calendar className="h-4 w-4 text-blue-500" />
                          {schedule.name}
                        </button>
                        <div className="flex items-center gap-1">
                          {getPhaseIndicators(schedule)}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <code className="rounded bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-700 dark:text-slate-300">
                        {schedule.cronExpression}
                      </code>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        {getStatusBadge(schedule)}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {schedule.nextRunAt
                        ? new Date(schedule.nextRunAt).toLocaleString(dateLocale)
                        : "\u2014"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleToggleEnabled(schedule)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                          title={schedule.enabled ? t("schedules.disable") : t("schedules.enable")}
                        >
                          {schedule.enabled ? (
                            <ToggleRight className="h-4 w-4 text-emerald-500" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-slate-400" />
                          )}
                        </button>
                        <button
                          onClick={() => openEdit(schedule)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Pencil className="h-4 w-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                        </button>
                        <button
                          onClick={() => setTriggerConfirm(schedule)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                        >
                          <Play className="h-4 w-4 text-slate-400 hover:text-blue-500" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(schedule)}
                          className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                        >
                          <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create/Edit Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingSchedule ? t("schedules.editSchedule") : t("schedules.newSchedule")}
              </h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {/* Name */}
              <div className="space-y-1.5">
                <label className={labelClass}>{t("schedules.colName")}</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t("schedules.namePlaceholder")}
                  className={inputClass}
                />
              </div>

              {/* Cron expression */}
              <div className="space-y-1.5">
                <label className={labelClass}>{t("schedules.cronExpression")}</label>
                <CronBuilder value={formCron} onChange={setFormCron} t={t} />
              </div>

              {/* Enabled toggle */}
              <div className="flex items-center justify-between">
                <label className={labelClass}>{t("schedules.enabled")}</label>
                <button
                  type="button"
                  onClick={() => setFormEnabled(!formEnabled)}
                  className="p-1"
                >
                  {formEnabled ? (
                    <ToggleRight className="h-6 w-6 text-emerald-500" />
                  ) : (
                    <ToggleLeft className="h-6 w-6 text-slate-400" />
                  )}
                </button>
              </div>

              {/* Collection section */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setCollectionOpen(!collectionOpen)}
                  className="flex items-center justify-between w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("schedules.phaseCollection")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFormCollectionEnabled(!formCollectionEnabled);
                      }}
                      className="p-0.5"
                    >
                      {formCollectionEnabled ? (
                        <ToggleRight className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-slate-400" />
                      )}
                    </button>
                    {collectionOpen ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </button>
                {collectionOpen && (
                  <div className="px-4 py-3 space-y-2 border-t border-slate-200 dark:border-slate-700">
                    {nodesLoading ? (
                      <div className="flex items-center justify-center py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      </div>
                    ) : nodes.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">{t("schedules.noNodes")}</p>
                    ) : (
                      nodes.map((node) => (
                        <label key={node.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formCollectionNodeIds.includes(node.id)}
                            onChange={() => toggleNodeId(formCollectionNodeIds, setFormCollectionNodeIds, node.id)}
                            className="rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20"
                          />
                          <Server className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            {node.name || node.hostname || node.ipAddress}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">{node.ipAddress}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Compliance section */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setComplianceOpen(!complianceOpen)}
                  className="flex items-center justify-between w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4 text-amber-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("schedules.phaseCompliance")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFormComplianceEnabled(!formComplianceEnabled);
                      }}
                      className="p-0.5"
                    >
                      {formComplianceEnabled ? (
                        <ToggleRight className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-slate-400" />
                      )}
                    </button>
                    {complianceOpen ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </button>
                {complianceOpen && (
                  <div className="px-4 py-3 space-y-2 border-t border-slate-200 dark:border-slate-700">
                    {nodesLoading ? (
                      <div className="flex items-center justify-center py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      </div>
                    ) : nodes.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">{t("schedules.noNodes")}</p>
                    ) : (
                      nodes.map((node) => (
                        <label key={node.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formComplianceNodeIds.includes(node.id)}
                            onChange={() => toggleNodeId(formComplianceNodeIds, setFormComplianceNodeIds, node.id)}
                            className="rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20"
                          />
                          <Server className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">
                            {node.name || node.hostname || node.ipAddress}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500">{node.ipAddress}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Report section */}
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setReportOpen(!reportOpen)}
                  className="flex items-center justify-between w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <FileBarChart className="h-4 w-4 text-violet-500" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("schedules.phaseReport")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setFormReportEnabled(!formReportEnabled);
                      }}
                      className="p-0.5"
                    >
                      {formReportEnabled ? (
                        <ToggleRight className="h-5 w-5 text-emerald-500" />
                      ) : (
                        <ToggleLeft className="h-5 w-5 text-slate-400" />
                      )}
                    </button>
                    {reportOpen ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-slate-400" />
                    )}
                  </div>
                </button>
                {reportOpen && (
                  <div className="px-4 py-3 space-y-2 border-t border-slate-200 dark:border-slate-700">
                    {reportsLoading ? (
                      <div className="flex items-center justify-center py-3">
                        <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                      </div>
                    ) : reports.length === 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">{t("schedules.noReports")}</p>
                    ) : (
                      reports.map((report) => (
                        <label key={report.id} className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formReportIds.includes(report.id)}
                            onChange={() => toggleReportId(report.id)}
                            className="rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20"
                          />
                          <FileBarChart className="h-3.5 w-3.5 text-slate-400" />
                          <span className="text-sm text-slate-700 dark:text-slate-300">{report.name}</span>
                        </label>
                      ))
                    )}
                  </div>
                )}
              </div>

              {/* Info text */}
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 px-3 py-2.5">
                <Info className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("schedules.executionOrder")}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formName.trim() || !formCron.trim()}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingSchedule ? t("common.save") : t("common.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("schedules.confirmDelete", { name: deleteConfirm.name })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleDelete(deleteConfirm)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trigger confirmation */}
      {triggerConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("schedules.confirmTrigger", { name: triggerConfirm.name })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setTriggerConfirm(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleTrigger(triggerConfirm)}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                {t("schedules.trigger")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
