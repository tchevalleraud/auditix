"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Plus,
  Loader2,
  Search,
  Tags,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

interface TagItem {
  id: number;
  name: string;
  color: string;
  createdAt: string;
}

const PRESET_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#22c55e", "#14b8a6", "#06b6d4",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#d946ef", "#ec4899", "#f43f5e", "#6b7280",
];

export default function TagsPage() {
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const [tags, setTags] = useState<TagItem[]>([]);
  const [search, setSearch] = useState("");
  const [fetchLoading, setFetchLoading] = useState(true);

  // Modal state
  const [modal, setModal] = useState(false);
  const [editingTag, setEditingTag] = useState<TagItem | null>(null);
  const [tagName, setTagName] = useState("");
  const [tagColor, setTagColor] = useState("#6b7280");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<TagItem | null>(null);

  const dateLocale = locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  const loadTags = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/node-tags?context=${current.id}`);
    if (res.ok) setTags(await res.json());
    setFetchLoading(false);
  }, [current]);

  useEffect(() => { loadTags(); }, [loadTags]);

  const filtered = tags.filter(
    (t) => t.name.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditingTag(null);
    setTagName("");
    setTagColor("#6b7280");
    setModal(true);
  };

  const openEdit = (tag: TagItem) => {
    setEditingTag(tag);
    setTagName(tag.name);
    setTagColor(tag.color);
    setModal(true);
  };

  const handleSave = async () => {
    if (!tagName.trim() || !current) return;
    setSaving(true);
    try {
      if (editingTag) {
        await fetch(`/api/node-tags/${editingTag.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tagName.trim(), color: tagColor }),
        });
      } else {
        await fetch(`/api/node-tags?context=${current.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: tagName.trim(), color: tagColor }),
        });
      }
      setModal(false);
      loadTags();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tag: TagItem) => {
    await fetch(`/api/node-tags/${tag.id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    loadTags();
  };

  const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("tags.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("tags.subtitle")}</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("tags.newTag")}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder={t("tags.searchPlaceholder")}
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
                  {t("tags.colColor")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("tags.colName")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("tags.colCreatedAt")}
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("tags.colActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-5 py-12 text-center">
                    <Tags className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {search ? t("tags.noResult") : t("tags.noTags")}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((tag) => (
                  <tr key={tag.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3">
                      <div
                        className="h-6 w-6 rounded-full border border-slate-200 dark:border-slate-700"
                        style={{ backgroundColor: tag.color }}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <button
                        onClick={() => openEdit(tag)}
                        className="inline-flex items-center gap-2"
                      >
                        <span
                          className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name}
                        </span>
                      </button>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {new Date(tag.createdAt).toLocaleDateString(dateLocale)}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(tag)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Pencil className="h-4 w-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(tag)}
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editingTag ? t("tags.editTag") : t("tags.newTag")}
              </h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className={labelClass}>{t("tags.colName")}</label>
                <input
                  type="text"
                  value={tagName}
                  onChange={(e) => setTagName(e.target.value)}
                  placeholder={t("tags.namePlaceholder")}
                  className={inputClass}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("tags.colColor")}</label>
                <div className="flex items-center gap-3">
                  <div
                    className="h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0"
                    style={{ backgroundColor: tagColor }}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        onClick={() => setTagColor(c)}
                        className={`h-7 w-7 rounded-full border-2 transition-all ${tagColor === c ? "border-slate-900 dark:border-white scale-110" : "border-transparent hover:scale-105"}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </div>
                <input
                  type="text"
                  value={tagColor}
                  onChange={(e) => setTagColor(e.target.value)}
                  placeholder="#6b7280"
                  className={`${inputClass} mt-2 font-mono`}
                />
              </div>
              {/* Preview */}
              <div className="space-y-1.5">
                <label className={labelClass}>Preview</label>
                <div className="flex items-center gap-2">
                  <span
                    className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
                    style={{ backgroundColor: tagColor }}
                  >
                    {tagName || "Tag"}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !tagName.trim()}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingTag ? t("common.save") : t("common.create")}
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
              {t("tags.confirmDelete", { name: deleteConfirm.name })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteConfirm(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
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
    </div>
  );
}
