"use client";

import { useState, useEffect, useCallback, useRef, Fragment } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Play,
  Circle,
  ChevronDown,
  ListChecks,
  FlaskConical,
  Server,
  Activity,
  CircleDot,
} from "lucide-react";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LabNodeRef {
  id: number;
  name: string | null;
  ipAddress: string;
  hostname: string | null;
}

interface LabNodeResult {
  compliant: number;
  total: number;
  passed: boolean;
}

interface TaskRow {
  id: number;
  name: string;
  description: string | null;
  nodes: Record<string, LabNodeResult | null>;
}

interface LabRow {
  id: number;
  name: string;
  description: string | null;
  tasks: TaskRow[];
  nodes: Record<string, LabNodeResult | null>;
}

interface LabData {
  context: { name: string; description: string | null };
  nodes: LabNodeRef[];
  labs: LabRow[];
  isCollecting: boolean;
  isEvaluating: boolean;
}

type ValidationPhase = null | "collection" | "compliance" | "done";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nodeLabel(node: LabNodeRef): string {
  return node.name || node.hostname || node.ipAddress;
}

/** Compute lab-level stats */
function labStats(lab: LabRow, nodes: LabNodeRef[]) {
  let tasksPassed = 0;
  let tasksTotal = lab.tasks.length;
  for (const task of lab.tasks) {
    const relevant = nodes.filter((n) => task.nodes[String(n.id)] !== null && task.nodes[String(n.id)] !== undefined);
    if (relevant.length === 0) continue;
    const allPassed = relevant.every((n) => {
      const r = task.nodes[String(n.id)];
      return r && r.total > 0 && r.passed;
    });
    if (allPassed) tasksPassed++;
  }
  return { tasksPassed, tasksTotal };
}

function taskStats(task: TaskRow, nodes: LabNodeRef[]) {
  const relevant = nodes.filter((n) => task.nodes[String(n.id)] !== null && task.nodes[String(n.id)] !== undefined);
  let nodesPassed = 0;
  let nodesTotal = relevant.length;
  let hasResults = false;
  for (const n of relevant) {
    const r = task.nodes[String(n.id)];
    if (r && r.total > 0) {
      hasResults = true;
      if (r.passed) nodesPassed++;
    }
  }
  return { nodesPassed, nodesTotal, hasResults };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ProgressRing({ percent, size = 40, stroke = 3.5, passed }: { percent: number; size?: number; stroke?: number; passed?: boolean }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;
  const color = passed ? "stroke-emerald-500" : percent > 0 ? "stroke-amber-500" : "stroke-slate-300 dark:stroke-slate-600";
  return (
    <svg width={size} height={size} className="shrink-0 -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" className="stroke-slate-100 dark:stroke-slate-800" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        className={`${color} transition-all duration-700 ease-out`}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circ}
        strokeDashoffset={offset}
      />
    </svg>
  );
}

function StatusBadge({ passed, hasResults }: { passed: boolean; hasResults: boolean }) {
  if (!hasResults) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
        <Circle className="h-3 w-3" />
        En attente
      </span>
    );
  }
  if (passed) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="h-3 w-3" />
        Conforme
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 dark:bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-700 dark:text-red-400">
      <XCircle className="h-3 w-3" />
      Non conforme
    </span>
  );
}

function NodeResultCell({ result }: { result: LabNodeResult | null | undefined }) {
  if (result === undefined || result === null) {
    return <div className="h-8 w-8 rounded-lg bg-slate-50 dark:bg-slate-800/50" />;
  }
  if (result.total === 0) {
    return (
      <div className="h-8 w-8 rounded-lg bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center">
        <CircleDot className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
      </div>
    );
  }
  if (result.passed) {
    return (
      <div className="h-8 w-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center" title={`${result.compliant}/${result.total}`}>
        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
      </div>
    );
  }
  return (
    <div className="h-8 w-8 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center" title={`${result.compliant}/${result.total}`}>
      <XCircle className="h-4 w-4 text-red-500" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function PublicLabPage() {
  const { token } = useParams();
  const [data, setData] = useState<LabData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const [phase, setPhase] = useState<ValidationPhase>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ---- Data fetching ------------------------------------------------------

  const loadData = useCallback(async () => {
    try {
      const res = await fetch(`/api/public/lab/${token}`);
      if (!res.ok) {
        setError("Page introuvable ou desactivee");
        setLoading(false);
        return;
      }
      const d: LabData = await res.json();
      setData(d);
      setLoading(false);

      // Auto-expand logic: only the first non-conforming lab is open
      setExpanded(() => {
        const next: Record<number, boolean> = {};
        let firstNonConformFound = false;
        for (const lab of d.labs) {
          const s = labStats(lab, d.nodes);
          const isPassed = s.tasksTotal > 0 && s.tasksPassed === s.tasksTotal;
          if (isPassed) {
            next[lab.id] = false;
          } else if (!firstNonConformFound) {
            next[lab.id] = true;
            firstNonConformFound = true;
          } else {
            next[lab.id] = false;
          }
        }
        return next;
      });

      if (d.isCollecting) {
        setValidating(true);
        setPhase("collection");
      } else if (d.isEvaluating) {
        setValidating(true);
        setPhase("compliance");
      }
    } catch {
      setError("Erreur de connexion");
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    autoRefreshRef.current = setInterval(() => { if (!validating) loadData(); }, 10_000);
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [loadData, validating]);

  // ---- Validation polling -------------------------------------------------

  useEffect(() => {
    if (!validating) {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      return;
    }
    const poll = async () => {
      try {
        const res = await fetch(`/api/public/lab/${token}/check`, { method: "POST" });
        if (!res.ok) return;
        const d = await res.json();
        if (d.phase === "done") { setValidating(false); setPhase("done"); loadData(); }
        else setPhase(d.phase);
      } catch { /* ignore */ }
    };
    pollRef.current = setInterval(poll, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [validating, token, loadData]);

  const handleValidate = async () => {
    setValidating(true);
    setPhase("collection");
    try {
      const res = await fetch(`/api/public/lab/${token}/validate`, { method: "POST" });
      if (!res.ok) { setValidating(false); setPhase(null); }
    } catch { setValidating(false); setPhase(null); }
  };

  const toggleExpand = (labId: number) => {
    setExpanded((prev) => ({ ...prev, [labId]: !prev[labId] }));
  };

  // ---- Loading / Error states ---------------------------------------------

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="relative">
            <div className="h-16 w-16 rounded-2xl bg-white dark:bg-slate-800 shadow-lg flex items-center justify-center mx-auto">
              <ShieldCheck className="h-8 w-8 text-blue-500" />
            </div>
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-slate-400 mx-auto" />
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="h-16 w-16 rounded-2xl bg-white dark:bg-slate-800 shadow-lg flex items-center justify-center mx-auto">
            <ShieldCheck className="h-8 w-8 text-slate-300 dark:text-slate-600" />
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{error || "Page introuvable"}</p>
        </div>
      </div>
    );
  }

  // ---- Compute global stats -----------------------------------------------

  const { nodes, labs } = data;
  const globalStats = labs.reduce(
    (acc, lab) => {
      const s = labStats(lab, nodes);
      acc.totalTasks += s.tasksTotal;
      acc.passedTasks += s.tasksPassed;
      if (s.tasksTotal > 0 && s.tasksPassed === s.tasksTotal) acc.passedLabs++;
      acc.totalLabs++;
      return acc;
    },
    { totalLabs: 0, passedLabs: 0, totalTasks: 0, passedTasks: 0 }
  );

  const globalPercent = globalStats.totalTasks > 0 ? Math.round((globalStats.passedTasks / globalStats.totalTasks) * 100) : 0;

  // ---- Render -------------------------------------------------------------

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex flex-col">
      {/* ---- Header ---- */}
      <header className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0">
        <div className="w-full px-6 py-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
                <ShieldCheck className="h-5 w-5 text-white" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  {data.context.name}
                </h1>
                {data.context.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{data.context.description}</p>
                )}
              </div>
            </div>

            <button
              onClick={handleValidate}
              disabled={validating}
              className="flex items-center gap-2.5 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:from-blue-500 hover:to-blue-600 disabled:opacity-60 disabled:shadow-none transition-all duration-200"
            >
              {validating ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  {phase === "collection" ? "Collecte en cours..." : "Evaluation en cours..."}
                </>
              ) : (
                <>
                  <Play className="h-4 w-4" />
                  Valider la configuration
                </>
              )}
            </button>
          </div>

          {/* Phase stepper */}
          {validating && (
            <div className="mt-5 flex items-center gap-3">
              <Step
                label="Collecte des donnees"
                active={phase === "collection"}
                done={phase === "compliance" || phase === "done"}
                number={1}
              />
              <div className={`h-0.5 flex-1 rounded-full transition-colors duration-500 ${phase === "compliance" || phase === "done" ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-700"}`} />
              <Step
                label="Evaluation de la conformite"
                active={phase === "compliance"}
                done={phase === "done"}
                number={2}
              />
              <div className={`h-0.5 flex-1 rounded-full transition-colors duration-500 ${phase === "done" ? "bg-emerald-400" : "bg-slate-200 dark:bg-slate-700"}`} />
              <Step label="Termine" active={false} done={phase === "done"} number={3} />
            </div>
          )}
        </div>
      </header>

      {/* ---- Summary cards ---- */}
      <div className="w-full px-6 pt-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <SummaryCard icon={<FlaskConical className="h-4.5 w-4.5" />} label="Labs" value={String(globalStats.totalLabs)} accent="blue" />
          <SummaryCard icon={<ListChecks className="h-4.5 w-4.5" />} label="Taches" value={`${globalStats.passedTasks}/${globalStats.totalTasks}`} accent="violet" />
          <SummaryCard icon={<Server className="h-4.5 w-4.5" />} label="Noeuds" value={String(nodes.length)} accent="slate" />
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center gap-4">
            <div className="relative">
              <ProgressRing percent={globalPercent} size={48} stroke={4} passed={globalPercent === 100} />
              <span className="absolute inset-0 flex items-center justify-center text-[11px] font-bold text-slate-700 dark:text-slate-300">
                {globalPercent}%
              </span>
            </div>
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">Conformite</p>
              <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{globalStats.passedLabs}/{globalStats.totalLabs}</p>
              <p className="text-[10px] text-slate-400 dark:text-slate-500">labs conformes</p>
            </div>
          </div>
        </div>
      </div>

      {/* ---- Labs list ---- */}
      <main className="flex-1 w-full px-6 py-6 space-y-4">
        {labs.length === 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-16 text-center">
            <FlaskConical className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Aucun lab disponible</p>
          </div>
        )}

        {labs.map((lab) => {
          const isExpanded = expanded[lab.id] ?? true;
          const stats = labStats(lab, nodes);
          const labPercent = stats.tasksTotal > 0 ? Math.round((stats.tasksPassed / stats.tasksTotal) * 100) : 0;
          const labPassed = stats.tasksTotal > 0 && stats.tasksPassed === stats.tasksTotal;
          const hasAnyResults = lab.tasks.some((t) => {
            const ts = taskStats(t, nodes);
            return ts.hasResults;
          });

          return (
            <div
              key={lab.id}
              className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm"
            >
              {/* Lab header */}
              <button
                onClick={() => toggleExpand(lab.id)}
                className="w-full text-left px-5 py-4 flex items-center gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
              >
                {/* Progress ring */}
                <div className="relative shrink-0">
                  <ProgressRing percent={labPercent} size={44} stroke={3.5} passed={labPassed} />
                  <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-slate-600 dark:text-slate-400">
                    {labPercent}%
                  </span>
                </div>

                {/* Lab info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2.5">
                    <FlaskConical className="h-4 w-4 text-blue-500 shrink-0" />
                    <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                      {lab.name}
                    </h2>
                    <StatusBadge passed={labPassed} hasResults={hasAnyResults} />
                  </div>
                  {lab.description && (
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate pl-6.5">{lab.description}</p>
                  )}
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-4 shrink-0">
                  <div className="text-right">
                    <p className="text-xs text-slate-400 dark:text-slate-500">Taches</p>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {stats.tasksPassed}<span className="text-slate-400 dark:text-slate-500">/{stats.tasksTotal}</span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-slate-400 dark:text-slate-500">Noeuds</p>
                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {nodes.filter((n) => lab.nodes[String(n.id)] != null).length}
                    </p>
                  </div>
                </div>

                {/* Chevron */}
                <ChevronDown
                  className={`h-4 w-4 text-slate-400 shrink-0 transition-transform duration-200 ${isExpanded ? "" : "-rotate-90"}`}
                />
              </button>

              {/* Tasks */}
              {isExpanded && lab.tasks.length > 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800 overflow-x-auto">
                  <table className="w-full border-collapse">
                    {/* Nodes header */}
                    <thead>
                      <tr className="bg-slate-50/70 dark:bg-slate-800/30">
                        <th className="sticky left-0 z-10 bg-slate-50 dark:bg-slate-800/60 px-5 py-2.5 text-left text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-r border-slate-100 dark:border-slate-800 min-w-[240px]">
                          Tache
                        </th>
                        {nodes.map((node) => (
                          <th
                            key={node.id}
                            className="px-3 py-2.5 text-center text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 min-w-[110px] whitespace-nowrap"
                          >
                            <div className="flex flex-col items-center gap-1">
                              <Server className="h-3 w-3 text-slate-400 dark:text-slate-500" />
                              <span>{nodeLabel(node)}</span>
                            </div>
                          </th>
                        ))}
                        <th className="sticky right-0 z-10 bg-slate-50 dark:bg-slate-800/60 px-4 py-2.5 text-center text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider border-b border-l border-slate-100 dark:border-slate-800 min-w-[100px]">
                          Statut
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {lab.tasks.map((task, taskIdx) => {
                        const ts = taskStats(task, nodes);
                        const taskPercent = ts.nodesTotal > 0 && ts.hasResults ? Math.round((ts.nodesPassed / ts.nodesTotal) * 100) : 0;
                        const taskPassed = ts.nodesTotal > 0 && ts.hasResults && ts.nodesPassed === ts.nodesTotal;

                        return (
                          <tr
                            key={task.id}
                            className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors ${
                              taskIdx < lab.tasks.length - 1 ? "border-b border-slate-50 dark:border-slate-800/50" : ""
                            }`}
                          >
                            {/* Task name (sticky left) */}
                            <td className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-5 py-3 border-r border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-2.5">
                                <div className={`h-6 w-6 rounded-lg flex items-center justify-center shrink-0 ${
                                  taskPassed
                                    ? "bg-emerald-50 dark:bg-emerald-500/10"
                                    : ts.hasResults
                                      ? "bg-red-50 dark:bg-red-500/10"
                                      : "bg-slate-50 dark:bg-slate-800"
                                }`}>
                                  {taskPassed ? (
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                  ) : ts.hasResults ? (
                                    <XCircle className="h-3.5 w-3.5 text-red-500" />
                                  ) : (
                                    <ListChecks className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{task.name}</p>
                                  {task.description && (
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{task.description}</p>
                                  )}
                                </div>
                              </div>
                            </td>

                            {/* Node cells */}
                            {nodes.map((node) => (
                              <td key={node.id} className="px-3 py-3 text-center align-middle">
                                <div className="flex justify-center">
                                  <NodeResultCell result={task.nodes[String(node.id)] ?? undefined} />
                                </div>
                              </td>
                            ))}

                            {/* Task status (sticky right) */}
                            <td className="sticky right-0 z-10 bg-white dark:bg-slate-900 px-4 py-3 text-center border-l border-slate-100 dark:border-slate-800">
                              {!ts.hasResults ? (
                                <span className="text-[10px] text-slate-400 dark:text-slate-500">--</span>
                              ) : (
                                <div className="flex flex-col items-center gap-1">
                                  <div className="w-14 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                    <div
                                      className={`h-full rounded-full transition-all duration-700 ease-out ${taskPassed ? "bg-emerald-500" : "bg-amber-500"}`}
                                      style={{ width: `${taskPercent}%` }}
                                    />
                                  </div>
                                  <span className={`text-[10px] font-semibold ${taskPassed ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}`}>
                                    {ts.nodesPassed}/{ts.nodesTotal}
                                  </span>
                                </div>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Empty tasks state */}
              {isExpanded && lab.tasks.length === 0 && (
                <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-8 text-center">
                  <ListChecks className="h-6 w-6 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-xs text-slate-400 dark:text-slate-500">Aucune tache configuree</p>
                </div>
              )}

              {/* Lab progress bar at bottom */}
              {stats.tasksTotal > 0 && (
                <div className="h-1 bg-slate-50 dark:bg-slate-800">
                  <div
                    className={`h-full transition-all duration-700 ease-out ${labPassed ? "bg-emerald-500" : labPercent > 0 ? "bg-amber-500" : "bg-slate-200 dark:bg-slate-700"}`}
                    style={{ width: `${labPercent}%` }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </main>

      {/* ---- Footer ---- */}
      <footer className="shrink-0 py-6 text-center">
        <span className="text-[11px] text-slate-400 dark:text-slate-500">
          Powered by <span className="font-semibold">Auditix</span>
        </span>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step component for stepper
// ---------------------------------------------------------------------------

function Step({ label, active, done, number }: { label: string; active: boolean; done: boolean; number: number }) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
          done
            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
            : active
              ? "bg-blue-500 text-white shadow-lg shadow-blue-500/30 animate-pulse"
              : "bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500"
        }`}
      >
        {done ? <CheckCircle2 className="h-4 w-4" /> : number}
      </div>
      <span
        className={`text-xs font-medium hidden md:block transition-colors ${
          done
            ? "text-emerald-700 dark:text-emerald-400"
            : active
              ? "text-blue-700 dark:text-blue-300"
              : "text-slate-400 dark:text-slate-500"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Summary card component
// ---------------------------------------------------------------------------

function SummaryCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: string; accent: "blue" | "violet" | "slate" }) {
  const colors = {
    blue: "from-blue-500 to-blue-600 shadow-blue-500/20",
    violet: "from-violet-500 to-violet-600 shadow-violet-500/20",
    slate: "from-slate-500 to-slate-600 shadow-slate-500/20",
  };
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex items-center gap-3">
      <div className={`h-9 w-9 rounded-lg bg-gradient-to-br ${colors[accent]} shadow-lg flex items-center justify-center text-white shrink-0`}>
        {icon}
      </div>
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{value}</p>
      </div>
    </div>
  );
}
