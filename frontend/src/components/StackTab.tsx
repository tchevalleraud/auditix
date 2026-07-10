"use client";

import { useEffect, useState } from "react";
import { Layers, Loader2 } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

interface StackUnitRange {
  name: string | null;
  endOfSaleDate: string | null;
  endOfSupportDate: string | null;
  endOfLifeDate: string | null;
}

interface StackUnit {
  key: string;
  serial: string | null;
  model: string | null;
  version: string | null;
  implicit: boolean;
  grade: string;
  score: number;
  productRange: StackUnitRange | null;
}

const GRADE_COLORS: Record<string, string> = {
  A: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  B: "bg-lime-100 text-lime-700 dark:bg-lime-900/40 dark:text-lime-300",
  C: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  D: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300",
  E: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  F: "bg-red-200 text-red-800 dark:bg-red-900/60 dark:text-red-200",
};

export default function StackTab({ nodeId }: { nodeId: string }) {
  const { t } = useI18n();
  const [units, setUnits] = useState<StackUnit[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/nodes/${nodeId}/stack`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { units: [] }))
      .then((data: { units: StackUnit[] }) => {
        if (!cancelled) setUnits(data.units ?? []);
      })
      .catch(() => {
        if (!cancelled) setUnits([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  const list = units ?? [];
  // A single implicit unit means the node isn't actually stacked.
  if (list.length === 0 || (list.length === 1 && list[0].implicit)) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-slate-400">
        <Layers className="h-6 w-6" />
        <p className="text-sm">{t("stack.tab.notStacked")}</p>
      </div>
    );
  }

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString() : "—");

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-800 text-left text-xs uppercase tracking-wide text-slate-400">
            <th className="px-3 py-2 font-medium">{t("stack.tab.unit")}</th>
            <th className="px-3 py-2 font-medium">{t("stack.tab.serial")}</th>
            <th className="px-3 py-2 font-medium">{t("stack.tab.model")}</th>
            <th className="px-3 py-2 font-medium">{t("stack.tab.version")}</th>
            <th className="px-3 py-2 font-medium">{t("stack.tab.productRange")}</th>
            <th className="px-3 py-2 font-medium">{t("stack.tab.endOfLife")}</th>
            <th className="px-3 py-2 font-medium">{t("stack.tab.lifecycle")}</th>
          </tr>
        </thead>
        <tbody>
          {list.map((u) => (
            <tr key={u.key} className="border-b border-slate-100 dark:border-slate-800/60">
              <td className="px-3 py-2 font-medium text-slate-700 dark:text-slate-300">{u.key}</td>
              <td className="px-3 py-2 font-mono text-xs text-slate-600 dark:text-slate-400">{u.serial ?? "—"}</td>
              <td className="px-3 py-2 text-slate-700 dark:text-slate-300">{u.model ?? "—"}</td>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{u.version ?? "—"}</td>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{u.productRange?.name ?? "—"}</td>
              <td className="px-3 py-2 text-slate-600 dark:text-slate-400">{fmtDate(u.productRange?.endOfLifeDate ?? null)}</td>
              <td className="px-3 py-2">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${GRADE_COLORS[u.grade] ?? "bg-slate-100 text-slate-600"}`}>
                  {u.grade}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
