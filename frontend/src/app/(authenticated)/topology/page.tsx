"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Network, Plus } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import TopologyMap from "@/components/topology2/TopologyMap";

interface TopologySummary {
  id: number;
  name: string;
  description: string | null;
  isPrimary: boolean;
  memberCount: number | null;
}

export default function TopologyPage() {
  const { t } = useI18n();
  const { current } = useAppContext();
  const [primary, setPrimary] = useState<TopologySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/topologies/primary?context=${current.id}`);
      if (res.ok) {
        const data = await res.json();
        setPrimary(data ?? null);
      } else {
        setPrimary(null);
      }
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !newName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`/api/topologies?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setCreateError(err?.error ?? `HTTP ${res.status}`);
        return;
      }
      const created = await res.json();
      // Navigate to the configure page so the user picks members + tunes design
      window.location.href = `/topology/${created.id}/configure`;
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="-m-6 flex items-center justify-center" style={{ height: "calc(100vh - 4rem)" }}>
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!primary) {
    return (
      <div className="-m-6 flex items-center justify-center p-8" style={{ height: "calc(100vh - 4rem)" }}>
        <div className="w-full max-w-md rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-sm">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 mb-3">
              <Network className="h-7 w-7 text-slate-500 dark:text-slate-400" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">
              {t("topology.onboardingTitle")}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {t("topology.onboardingSubtitle")}
            </p>
          </div>

          <form onSubmit={handleCreate} className="space-y-3">
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                {t("topology.fieldNameLabel")}
              </label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("topology.namePlaceholder")}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none"
                autoFocus
              />
            </div>
            {createError && (
              <p className="text-xs text-red-600 dark:text-red-400">{createError}</p>
            )}
            <button
              type="submit"
              disabled={creating || !newName.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {creating ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              {t("topology.createFirst")}
            </button>
          </form>

          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 text-center">
            <Link
              href="/topology/list"
              className="text-xs text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              {t("topology.goToList")}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="-m-6" style={{ height: "calc(100vh - 4rem)" }}>
      <TopologyMap topologyId={primary.id} />
    </div>
  );
}
