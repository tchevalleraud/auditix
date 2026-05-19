"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  Eye,
  Loader2,
  Network,
  Plus,
  Settings,
  Star,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";

interface TopologySummary {
  id: number;
  name: string;
  description: string | null;
  isPrimary: boolean;
  memberCount: number | null;
  createdAt: string;
  updatedAt: string;
}

export default function TopologyListPage() {
  const { t } = useI18n();
  const { current } = useAppContext();
  const [items, setItems] = useState<TopologySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/topologies?context=${current.id}`);
      if (res.ok) {
        setItems(await res.json());
      }
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => { load(); }, [load]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !createName.trim()) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch(`/api/topologies?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim() || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setCreateError(err?.error ?? `HTTP ${res.status}`);
        return;
      }
      setCreateOpen(false);
      setCreateName("");
      setCreateDescription("");
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleSetPrimary = async (id: number) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/topologies/${id}/set-primary`, { method: "POST" });
      if (res.ok) await load();
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(t("topology.confirmDelete").replace("{name}", name))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/topologies/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) await load();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Network className="h-6 w-6" />
            {t("topology.listTitle")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {t("topology.listSubtitle")}
          </p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("topology.new")}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-12 text-center">
          <Network className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("topology.listEmpty")}</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
          <table className="w-full">
            <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
              <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="px-4 py-3 w-12"></th>
                <th className="px-4 py-3">{t("topology.colName")}</th>
                <th className="px-4 py-3">{t("topology.colDescription")}</th>
                <th className="px-4 py-3">{t("topology.colMembers")}</th>
                <th className="px-4 py-3 text-right">{t("topology.colActions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {items.map((item) => (
                <tr key={item.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                  <td className="px-4 py-3">
                    <button
                      onClick={() => !item.isPrimary && handleSetPrimary(item.id)}
                      disabled={item.isPrimary || busyId === item.id}
                      title={item.isPrimary ? t("topology.isPrimary") : t("topology.setPrimary")}
                      className={`p-1.5 rounded-lg transition-colors ${
                        item.isPrimary
                          ? "text-amber-500 cursor-default"
                          : "text-slate-300 dark:text-slate-600 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10"
                      }`}
                    >
                      <Star className={`h-4 w-4 ${item.isPrimary ? "fill-amber-500" : ""}`} />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/topology/${item.id}`} className="text-sm font-medium text-slate-900 dark:text-white hover:underline">
                      {item.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 dark:text-slate-400 max-w-md truncate">
                    {item.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-600 dark:text-slate-300">
                    {item.memberCount ?? 0}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <Link
                        href={`/topology/${item.id}`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title={t("topology.openMap")}
                      >
                        <Eye className="h-4 w-4" />
                      </Link>
                      <Link
                        href={`/topology/${item.id}/configure`}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        title={t("topology.configure")}
                      >
                        <Settings className="h-4 w-4" />
                      </Link>
                      <button
                        onClick={() => handleDelete(item.id, item.name)}
                        disabled={busyId === item.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors disabled:opacity-50"
                        title={t("topology.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setCreateOpen(false)}>
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl"
          >
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">
              {t("topology.createTitle")}
            </h2>
            <form onSubmit={handleCreate} className="space-y-3">
              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  {t("topology.fieldNameLabel")}
                </label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  {t("topology.fieldDescriptionLabel")}
                </label>
                <textarea
                  value={createDescription}
                  onChange={(e) => setCreateDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm resize-none"
                />
              </div>
              {createError && <p className="text-xs text-red-600 dark:text-red-400">{createError}</p>}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setCreateOpen(false)}
                  className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="submit"
                  disabled={creating || !createName.trim()}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 disabled:opacity-50"
                >
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {t("topology.create")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
