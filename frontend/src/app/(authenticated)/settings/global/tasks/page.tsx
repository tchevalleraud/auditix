"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  Loader2,
  ListTodo,
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";

interface TaskNode {
  id: number;
  ipAddress: string;
  name: string;
}

interface TaskContext {
  id: number;
  name: string;
}

interface Task {
  id: number;
  type: string;
  status: string;
  worker: string | null;
  output: string | null;
  node: TaskNode | null;
  context: TaskContext | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface PaginatedResponse {
  items: Task[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

const statusColors: Record<string, string> = {
  pending:
    "text-slate-600 bg-slate-50 ring-slate-500/20 dark:text-slate-400 dark:bg-slate-800 dark:ring-slate-600/20",
  running:
    "text-blue-700 bg-blue-50 ring-blue-600/20 dark:text-blue-400 dark:bg-blue-500/10 dark:ring-blue-500/20",
  completed:
    "text-emerald-700 bg-emerald-50 ring-emerald-600/20 dark:text-emerald-400 dark:bg-emerald-500/10 dark:ring-emerald-500/20",
  failed:
    "text-red-700 bg-red-50 ring-red-600/20 dark:text-red-400 dark:bg-red-500/10 dark:ring-red-500/20",
};

export default function TasksPage() {
  const { t, locale } = useI18n();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 15;
  const pageRef = useRef(page);
  pageRef.current = page;

  const dateLocale =
    locale === "fr"
      ? "fr-FR"
      : locale === "de"
        ? "de-DE"
        : locale === "es"
          ? "es-ES"
          : locale === "it"
            ? "it-IT"
            : locale === "ja"
              ? "ja-JP"
              : "en-US";

  const load = useCallback(async (p?: number) => {
    const params = new URLSearchParams();
    if (statusFilter) params.set("status", statusFilter);
    if (typeFilter) params.set("type", typeFilter);
    params.set("page", String(p ?? page));
    params.set("limit", String(limit));
    const res = await fetch(`/api/admin/tasks?${params}`);
    if (res.ok) {
      const data: PaginatedResponse = await res.json();
      setTasks(data.items);
      setTotalPages(data.pages);
      setTotal(data.total);
    }
    setLoading(false);
  }, [statusFilter, typeFilter, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Mercure live updates
  useEffect(() => {
    const mercureUrl = new URL("/.well-known/mercure", window.location.origin);
    mercureUrl.searchParams.append("topic", "admin/tasks");
    const es = new EventSource(mercureUrl.toString(), { withCredentials: true });

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.event === "task.updated" && data.task) {
          const updatedTask: Task = data.task;
          // Only live-update if we're on page 1 (newest first)
          if (pageRef.current === 1) {
            setTasks((prev) => {
              const idx = prev.findIndex((t) => t.id === updatedTask.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = updatedTask;
                return next;
              }
              // New task: prepend and cap at limit
              return [updatedTask, ...prev].slice(0, limit);
            });
          }
        }
      } catch {
        // ignore
      }
    };

    return () => es.close();
  }, []);

  const goToPage = (p: number) => {
    setPage(p);
    setExpandedId(null);
  };

  const formatDate = (d: string | null) => {
    if (!d) return "—";
    return new Date(d).toLocaleString(dateLocale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "pending":
        return t("admin_tasks.pending");
      case "running":
        return t("admin_tasks.running");
      case "completed":
        return t("admin_tasks.completed");
      case "failed":
        return t("admin_tasks.failed");
      default:
        return status;
    }
  };

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
            {t("admin_tasks.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("admin_tasks.subtitle")}
          </p>
        </div>
        <span className="text-sm text-slate-400 dark:text-slate-500">
          {total} {t("admin_tasks.title").toLowerCase()}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
        >
          <option value="">{t("admin_tasks.filterAll")}</option>
          <option value="pending">{t("admin_tasks.pending")}</option>
          <option value="running">{t("admin_tasks.running")}</option>
          <option value="completed">{t("admin_tasks.completed")}</option>
          <option value="failed">{t("admin_tasks.failed")}</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="w-8 px-2 py-3" />
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("admin_tasks.colType")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("admin_tasks.colStatus")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("admin_tasks.colNode")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("admin_tasks.colContext")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("admin_tasks.colWorker")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">
                  {t("admin_tasks.colCreatedAt")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {tasks.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <ListTodo className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {t("admin_tasks.noTasks")}
                    </p>
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    expanded={expandedId === task.id}
                    onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
                    formatDate={formatDate}
                    statusLabel={statusLabel}
                    t={t}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 dark:border-slate-800 px-4 py-3">
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("admin_tasks.page")} {page} / {totalPages}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => goToPage(1)}
                disabled={page === 1}
                className="rounded-lg p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronsLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => goToPage(page - 1)}
                disabled={page === 1}
                className="rounded-lg p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button
                onClick={() => goToPage(page + 1)}
                disabled={page === totalPages}
                className="rounded-lg p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => goToPage(totalPages)}
                disabled={page === totalPages}
                className="rounded-lg p-2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-30 disabled:pointer-events-none"
              >
                <ChevronsRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TaskRow({
  task,
  expanded,
  onToggle,
  formatDate,
  statusLabel,
  t,
}: {
  task: Task;
  expanded: boolean;
  onToggle: () => void;
  formatDate: (d: string | null) => string;
  statusLabel: (s: string) => string;
  t: (key: string) => string;
}) {
  return (
    <>
      <tr
        className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
        onClick={onToggle}
      >
        <td className="px-2 py-3 text-center">
          {expanded ? (
            <ChevronDown className="h-4 w-4 text-slate-400 inline" />
          ) : (
            <ChevronRight className="h-4 w-4 text-slate-400 inline" />
          )}
        </td>
        <td className="px-4 py-3">
          <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 font-mono uppercase">
            {task.type}
          </span>
        </td>
        <td className="px-4 py-3">
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${
              statusColors[task.status] || statusColors.pending
            }`}
          >
            {task.status === "running" && (
              <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
            )}
            {statusLabel(task.status)}
          </span>
        </td>
        <td className="px-4 py-3">
          {task.node ? (
            <div>
              <span className="text-sm text-slate-900 dark:text-slate-100">
                {task.node.name}
              </span>
              <span className="ml-1.5 text-xs text-slate-400 dark:text-slate-500 font-mono">
                {task.node.ipAddress}
              </span>
            </div>
          ) : (
            <span className="text-sm text-slate-400">—</span>
          )}
        </td>
        <td className="px-4 py-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {task.context?.name || "—"}
          </span>
        </td>
        <td className="px-4 py-3">
          <span className="text-sm text-slate-500 dark:text-slate-400 font-mono">
            {task.worker || "—"}
          </span>
        </td>
        <td className="px-4 py-3 whitespace-nowrap">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {formatDate(task.createdAt)}
          </span>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td
            colSpan={7}
            className="px-6 py-4 bg-slate-50/50 dark:bg-slate-800/30"
          >
            <div className="space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-1">
                    {t("admin_tasks.colStartedAt")}
                  </p>
                  <p className="text-slate-700 dark:text-slate-300">
                    {formatDate(task.startedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-1">
                    {t("admin_tasks.colCompletedAt")}
                  </p>
                  <p className="text-slate-700 dark:text-slate-300">
                    {formatDate(task.completedAt)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-1">
                    {t("admin_tasks.colWorker")}
                  </p>
                  <p className="text-slate-700 dark:text-slate-300 font-mono">
                    {task.worker || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-1">
                    {t("admin_tasks.colType")}
                  </p>
                  <p className="text-slate-700 dark:text-slate-300 font-mono uppercase">
                    {task.type}
                  </p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase mb-1">
                  {t("admin_tasks.output")}
                </p>
                {task.output ? (
                  <pre className="rounded-lg bg-slate-900 dark:bg-slate-950 text-slate-100 p-4 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap">
                    {task.output}
                  </pre>
                ) : (
                  <p className="text-sm text-slate-400 dark:text-slate-500 italic">
                    {t("admin_tasks.noOutput")}
                  </p>
                )}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
