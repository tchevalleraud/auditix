"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Plus,
  Loader2,
  Search,
  FolderTree,
  Pencil,
  Trash2,
  X,
} from "lucide-react";

interface InventoryCategoryItem {
  id: number;
  name: string;
  keyLabel: string | null;
  createdAt: string | null;
  usageCount: number;
}

export default function InventoryCategoriesPage() {
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const [categories, setCategories] = useState<InventoryCategoryItem[]>([]);
  const [search, setSearch] = useState("");
  const [fetchLoading, setFetchLoading] = useState(true);

  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<InventoryCategoryItem | null>(null);
  const [name, setName] = useState("");
  const [keyLabel, setKeyLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<InventoryCategoryItem | null>(null);

  const dateLocale = locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  const load = useCallback(async () => {
    if (!current) return;
    setFetchLoading(true);
    const res = await fetch(`/api/inventory-categories?context=${current.id}`);
    if (res.ok) setCategories(await res.json());
    setFetchLoading(false);
  }, [current]);

  useEffect(() => { load(); }, [load]);

  const filtered = categories.filter((c) => {
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.keyLabel ?? "").toLowerCase().includes(q);
  });

  const openCreate = () => {
    setEditing(null);
    setName("");
    setKeyLabel("");
    setModal(true);
  };

  const openEdit = (cat: InventoryCategoryItem) => {
    setEditing(cat);
    setName(cat.name);
    setKeyLabel(cat.keyLabel ?? "");
    setModal(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !current) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), keyLabel: keyLabel.trim() || null };
      if (editing) {
        await fetch(`/api/inventory-categories/${editing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      } else {
        await fetch(`/api/inventory-categories?context=${current.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      setModal(false);
      load();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: InventoryCategoryItem) => {
    await fetch(`/api/inventory-categories/${cat.id}`, { method: "DELETE" });
    setDeleteConfirm(null);
    load();
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("inventory_categories.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("inventory_categories.subtitle")}</p>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("inventory_categories.newCategory")}
        </button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder={t("inventory_categories.searchPlaceholder")}
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
                  {t("inventory_categories.colName")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("inventory_categories.colKeyLabel")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("inventory_categories.colUsage")}
                </th>
                <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("inventory_categories.colCreatedAt")}
                </th>
                <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("inventory_categories.colActions")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-12 text-center">
                    <FolderTree className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {search ? t("inventory_categories.noResult") : t("inventory_categories.noCategories")}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((cat) => (
                  <tr key={cat.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-5 py-3">
                      <button
                        onClick={() => openEdit(cat)}
                        className="text-sm font-medium text-slate-900 dark:text-slate-100 hover:underline"
                      >
                        {cat.name}
                      </button>
                    </td>
                    <td className="px-5 py-3">
                      {cat.keyLabel ? (
                        <span className="inline-flex items-center rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-mono text-slate-600 dark:text-slate-300">
                          {cat.keyLabel}
                        </span>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-600">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                        {cat.usageCount}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-500 dark:text-slate-400">
                      {cat.createdAt ? new Date(cat.createdAt).toLocaleDateString(dateLocale) : "—"}
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEdit(cat)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Pencil className="h-4 w-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(cat)}
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

      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {editing ? t("inventory_categories.editCategory") : t("inventory_categories.newCategory")}
              </h3>
              <button onClick={() => setModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className={labelClass}>{t("inventory_categories.colName")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("inventory_categories.namePlaceholder")}
                  className={inputClass}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("inventory_categories.colKeyLabel")}</label>
                <input
                  type="text"
                  value={keyLabel}
                  onChange={(e) => setKeyLabel(e.target.value)}
                  placeholder={t("inventory_categories.keyLabelPlaceholder")}
                  className={`${inputClass} font-mono`}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
                />
                <p className="text-xs text-slate-400 dark:text-slate-500">{t("inventory_categories.keyLabelHint")}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !name.trim()}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editing ? t("common.save") : t("common.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("inventory_categories.confirmDelete", { name: deleteConfirm.name })}
            </p>
            {deleteConfirm.usageCount > 0 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t("inventory_categories.deleteUsageWarning", { count: String(deleteConfirm.usageCount) })}
              </p>
            )}
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
