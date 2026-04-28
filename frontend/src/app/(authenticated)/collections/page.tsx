"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import CollectionsZipImportModal from "@/components/CollectionsZipImportModal";
import {
  Loader2,
  Search,
  Database,
  Trash2,
  Tag,
  Plus,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Upload,
} from "lucide-react";

interface CollectionItem {
  id: number;
  node: { id: number; name: string | null; hostname: string | null; ipAddress: string };
  tags: string[];
  status: string;
  worker: string | null;
  commandCount: number;
  completedCount: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; bg: string }> = {
  completed: { icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "bg-emerald-100 dark:bg-emerald-500/20" },
  failed: { icon: XCircle, color: "text-red-600 dark:text-red-400", bg: "bg-red-100 dark:bg-red-500/20" },
  running: { icon: Loader2, color: "text-blue-600 dark:text-blue-400", bg: "bg-blue-100 dark:bg-blue-500/20" },
  pending: { icon: Clock, color: "text-slate-500 dark:text-slate-400", bg: "bg-slate-100 dark:bg-slate-500/20" },
};

export default function CollectionsPage() {
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Tag management
  const [tagModalId, setTagModalId] = useState<number | null>(null);
  const [newTag, setNewTag] = useState("");

  // ZIP import
  const [zipImportOpen, setZipImportOpen] = useState(false);

  const load = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/collections?context=${current.id}`);
    if (res.ok) setCollections(await res.json());
    setLoading(false);
  }, [current]);

  useEffect(() => { load(); }, [load]);

  // Collect all unique tags
  const allTags = Array.from(new Set(collections.flatMap((c) => c.tags))).sort();

  // Filter
  const filtered = collections.filter((c) => {
    const matchSearch =
      !search ||
      c.node.ipAddress.toLowerCase().includes(search.toLowerCase()) ||
      (c.node.name && c.node.name.toLowerCase().includes(search.toLowerCase())) ||
      (c.node.hostname && c.node.hostname.toLowerCase().includes(search.toLowerCase())) ||
      String(c.id).includes(search);
    const matchTag = !tagFilter || (tagFilter === "__none__" ? c.tags.length === 0 : c.tags.includes(tagFilter));
    return matchSearch && matchTag;
  });

  const filteredIds = new Set(filtered.map((c) => c.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((c) => selected.has(c.id));

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/collections/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (res.ok) {
        setCollections((prev) => prev.filter((c) => !selected.has(c.id)));
        setSelected(new Set());
      }
    } finally {
      setDeleting(false);
      setConfirmDelete(false);
    }
  };

  const addTag = async (collectionId: number) => {
    if (!newTag.trim()) return;
    const res = await fetch(`/api/collections/${collectionId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: newTag.trim() }),
    });
    if (res.ok) {
      const updated: CollectionItem = await res.json();
      setCollections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setNewTag("");
    }
  };

  const removeTag = async (collectionId: number, tag: string) => {
    const res = await fetch(`/api/collections/${collectionId}/tags/${encodeURIComponent(tag)}`, {
      method: "DELETE",
    });
    if (res.ok) {
      const updated: CollectionItem = await res.json();
      setCollections((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    }
  };

  const fmt = (iso: string | null) => {
    if (!iso) return "\u2014";
    return new Date(iso).toLocaleString(locale, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("collections.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("collections.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={deleting}
              className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-800 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("collections.deleteSelected", { count: String(selected.size) })}
            </button>
          )}
          <button
            onClick={() => setZipImportOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <Upload className="h-4 w-4" />
            {t("collections.importCollections")}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            placeholder={t("collections.searchPlaceholder")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
          />
        </div>
        {allTags.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Tag className="h-4 w-4 text-slate-400" />
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 px-3 text-sm text-slate-700 dark:text-slate-200 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition-colors"
            >
              <option value="">{t("collections.allTags")}</option>
              <option value="__none__">{t("collections.noTag")}</option>
              {allTags.map((tag) => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-16">
                  #
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("collections.colNode")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("collections.colTags")}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("collections.colStatus")}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("collections.colProgress")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("collections.colCreatedAt")}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-14">
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center">
                    <Database className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {search || tagFilter ? t("collections.noResult") : t("collections.noCollections")}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((col) => {
                  const sc = statusConfig[col.status] || statusConfig.pending;
                  const StatusIcon = sc.icon;
                  return (
                    <tr key={col.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors ${selected.has(col.id) ? "bg-slate-50 dark:bg-slate-800/30" : ""}`}>
                      <td className="px-4 py-2 text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(col.id)}
                          onChange={() => toggleSelect(col.id)}
                          className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20"
                        />
                      </td>
                      <td className="px-4 py-2">
                        <span className="text-sm font-mono text-slate-500 dark:text-slate-400">{col.id}</span>
                      </td>
                      <td className="px-4 py-2">
                        <Link href={`/nodes/${col.node.id}?tab=collections&collectionId=${col.id}`} className="group">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:underline">
                            {col.node.hostname || col.node.name || col.node.ipAddress}
                          </span>
                          {(col.node.hostname || col.node.name) && (
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">{col.node.ipAddress}</div>
                          )}
                        </Link>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-1 flex-wrap">
                          {col.tags.map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300"
                            >
                              {tag}
                              <button
                                onClick={() => removeTag(col.id, tag)}
                                className="hover:text-red-500 transition-colors"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                          <button
                            onClick={() => { setTagModalId(tagModalId === col.id ? null : col.id); setNewTag(""); }}
                            className="inline-flex items-center rounded-full border border-dashed border-slate-300 dark:border-slate-600 px-1.5 py-0.5 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:border-slate-400 dark:hover:border-slate-500 transition-colors"
                          >
                            <Plus className="h-3 w-3" />
                          </button>
                          {tagModalId === col.id && (
                            <div className="flex items-center gap-1 ml-1">
                              <input
                                type="text"
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => { if (e.key === "Enter") addTag(col.id); if (e.key === "Escape") setTagModalId(null); }}
                                placeholder={t("collections.addTagPlaceholder")}
                                className="w-32 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-0.5 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:border-slate-400"
                                autoFocus
                              />
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${sc.bg} ${sc.color}`}>
                          <StatusIcon className={`h-3.5 w-3.5 ${col.status === "running" ? "animate-spin" : ""}`} />
                          {t(`collections.status_${col.status}`)}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-center">
                        <span className="text-sm text-slate-600 dark:text-slate-300 font-mono">
                          {col.completedCount}/{col.commandCount}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="text-sm text-slate-600 dark:text-slate-300">{fmt(col.createdAt)}</div>
                        {col.completedAt && (
                          <div className="text-xs text-slate-400 dark:text-slate-500">{fmt(col.completedAt)}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {col.error && (
                          <button
                            title={col.error}
                            className="text-red-400 hover:text-red-600 transition-colors"
                          >
                            <AlertCircle className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ZIP import modal */}
      {current && (
        <CollectionsZipImportModal
          open={zipImportOpen}
          onClose={() => setZipImportOpen(false)}
          onImported={() => { void load(); }}
          contextId={current.id}
        />
      )}

      {/* Confirm delete modal */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("common.delete")}</h3>
              <button onClick={() => setConfirmDelete(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6">
              <p className="text-sm text-slate-600 dark:text-slate-300">
                {t("collections.confirmDelete", { count: String(selected.size) })}
              </p>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setConfirmDelete(false)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
