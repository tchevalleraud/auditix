"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  ArrowLeft,
  FlaskConical,
  Plus,
  Loader2,
  Pencil,
  Trash2,
  X,
  ShieldCheck,
  ListChecks,
  GripVertical,
} from "lucide-react";

interface PolicyRef {
  id: number;
  name: string;
}

interface TaskItem {
  id: number;
  name: string;
  description: string | null;
  position: number;
  policies: PolicyRef[];
  createdAt: string;
}

interface LabDetail {
  id: number;
  name: string;
  description: string | null;
  tasks: TaskItem[];
  createdAt: string;
}

interface PolicyOption {
  id: number;
  name: string;
}

export default function LabDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { t } = useI18n();
  const { current } = useAppContext();

  const [lab, setLab] = useState<LabDetail | null>(null);
  const [loading, setLoading] = useState(true);

  // Task modal state
  const [taskModal, setTaskModal] = useState(false);
  const [editingTask, setEditingTask] = useState<TaskItem | null>(null);
  const [taskName, setTaskName] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [selectedPolicyIds, setSelectedPolicyIds] = useState<number[]>([]);
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<TaskItem | null>(null);

  const loadLab = useCallback(async () => {
    const res = await fetch(`/api/labs/${id}`);
    if (res.ok) {
      setLab(await res.json());
    }
    setLoading(false);
  }, [id]);

  const loadPolicies = useCallback(async () => {
    if (!current) return;
    setPoliciesLoading(true);
    try {
      const res = await fetch(`/api/compliance-policies?context=${current.id}`);
      if (res.ok) setPolicies(await res.json());
    } finally {
      setPoliciesLoading(false);
    }
  }, [current]);

  useEffect(() => {
    loadLab();
  }, [loadLab]);

  const openCreateTask = () => {
    setEditingTask(null);
    setTaskName("");
    setTaskDescription("");
    setSelectedPolicyIds([]);
    setTaskModal(true);
    loadPolicies();
  };

  const openEditTask = (task: TaskItem) => {
    setEditingTask(task);
    setTaskName(task.name);
    setTaskDescription(task.description || "");
    setSelectedPolicyIds(task.policies.map((p) => p.id));
    setTaskModal(true);
    loadPolicies();
  };

  const togglePolicy = (pid: number) => {
    setSelectedPolicyIds((prev) =>
      prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid]
    );
  };

  const handleSaveTask = async () => {
    if (!taskName.trim() || !lab) return;
    setSaving(true);
    try {
      if (editingTask) {
        const res = await fetch(`/api/labs/${lab.id}/tasks/${editingTask.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: taskName.trim(),
            description: taskDescription.trim() || null,
            policyIds: selectedPolicyIds,
          }),
        });
        if (res.ok) {
          setTaskModal(false);
          loadLab();
        }
      } else {
        const res = await fetch(`/api/labs/${lab.id}/tasks`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: taskName.trim(),
            description: taskDescription.trim() || null,
            policyIds: selectedPolicyIds,
            position: lab.tasks.length,
          }),
        });
        if (res.ok) {
          setTaskModal(false);
          loadLab();
        }
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async (task: TaskItem) => {
    if (!lab) return;
    await fetch(`/api/labs/${lab.id}/tasks/${task.id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    loadLab();
  };

  const inputClass =
    "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  if (!lab) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <FlaskConical className="h-12 w-12 text-slate-300 dark:text-slate-600" />
        <p className="text-sm text-slate-500 dark:text-slate-400">Lab not found</p>
        <button
          onClick={() => router.push("/labs")}
          className="text-sm text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          {t("labs.backToLabs")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/labs")}
            className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <ArrowLeft className="h-5 w-5 text-slate-500 dark:text-slate-400" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-blue-500" />
              {lab.name}
            </h1>
            {lab.description && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{lab.description}</p>
            )}
          </div>
        </div>
        <button
          onClick={openCreateTask}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("labs.newTask")}
        </button>
      </div>

      {/* Tasks list */}
      {lab.tasks.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-12 text-center">
          <ListChecks className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("labs.noTasks")}</p>
          <button
            onClick={openCreateTask}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("labs.newTask")}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {lab.tasks.map((task, idx) => (
            <div
              key={task.id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden"
            >
              <div className="flex items-start gap-4 px-5 py-4">
                <div className="flex items-center gap-2 pt-0.5 text-slate-300 dark:text-slate-600">
                  <GripVertical className="h-4 w-4" />
                  <span className="text-xs font-mono w-5 text-center">{idx + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <ListChecks className="h-4 w-4 text-blue-500 shrink-0" />
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {task.name}
                    </h3>
                  </div>
                  {task.description && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">
                      {task.description}
                    </p>
                  )}
                  {task.policies.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {task.policies.map((policy) => (
                        <span
                          key={policy.id}
                          className="inline-flex items-center gap-1 rounded-full bg-slate-50 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300"
                        >
                          <ShieldCheck className="h-3 w-3" />
                          {policy.name}
                        </span>
                      ))}
                    </div>
                  )}
                  {task.policies.length === 0 && (
                    <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
                      {t("labs.noPolicies")}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEditTask(task)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Pencil className="h-4 w-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(task)}
                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  >
                    <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task Create / Edit Modal */}
      {taskModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingTask ? editingTask.name : t("labs.newTask")}
              </h3>
              <button onClick={() => setTaskModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className={labelClass}>{t("labs.taskName")}</label>
                <input
                  type="text"
                  value={taskName}
                  onChange={(e) => setTaskName(e.target.value)}
                  placeholder={t("labs.taskNamePlaceholder")}
                  className={inputClass}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveTask();
                  }}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("labs.taskDescription")}</label>
                <textarea
                  value={taskDescription}
                  onChange={(e) => setTaskDescription(e.target.value)}
                  rows={3}
                  placeholder={t("labs.taskDescriptionPlaceholder")}
                  className={`${inputClass} resize-none`}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("labs.policies")}</label>
                {policiesLoading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
                  </div>
                ) : policies.length === 0 ? (
                  <p className="text-sm text-slate-400 dark:text-slate-500 py-2">
                    {t("labs.noPolicies")}
                  </p>
                ) : (
                  <div className="max-h-48 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 space-y-2">
                    {policies.map((policy) => (
                      <label
                        key={policy.id}
                        className="flex items-center gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedPolicyIds.includes(policy.id)}
                          onChange={() => togglePolicy(policy.id)}
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400 dark:focus:ring-slate-500"
                        />
                        <ShieldCheck className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        <span className="text-sm text-slate-700 dark:text-slate-300">{policy.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setTaskModal(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSaveTask}
                disabled={saving || !taskName.trim()}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingTask ? t("common.save") : t("common.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete task confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("labs.confirmDeleteTask", { name: deleteConfirm.name })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => handleDeleteTask(deleteConfirm)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
