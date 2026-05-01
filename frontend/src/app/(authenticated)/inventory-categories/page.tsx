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
  Columns3,
  Eye,
  EyeOff,
  GripVertical,
} from "lucide-react";

interface InventoryCategoryItem {
  id: number;
  name: string;
  keyLabel: string | null;
  createdAt: string | null;
  usageCount: number;
}

interface ColumnConfigItem {
  label: string;
  visible: boolean;
}

interface SortConfig {
  column: string | null;
  direction: "asc" | "desc";
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
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const [columnsModal, setColumnsModal] = useState<InventoryCategoryItem | null>(null);
  const [columnsConfig, setColumnsConfig] = useState<ColumnConfigItem[]>([]);
  const [sortConfig, setSortConfig] = useState<SortConfig>({ column: null, direction: "asc" });
  const [columnsLoading, setColumnsLoading] = useState(false);
  const [columnsSaving, setColumnsSaving] = useState(false);
  const [columnsDragIdx, setColumnsDragIdx] = useState<number | null>(null);

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

  const filteredIds = filtered.map((c) => c.id);
  const allFilteredSelected = filtered.length > 0 && filteredIds.every((id) => selected.has(id));

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allFilteredSelected) {
        filteredIds.forEach((id) => next.delete(id));
      } else {
        filteredIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    setBulkDeleting(true);
    try {
      for (const id of selected) {
        await fetch(`/api/inventory-categories/${id}`, { method: "DELETE" });
      }
      setSelected(new Set());
      setBulkDeleteConfirm(false);
      load();
    } finally {
      setBulkDeleting(false);
    }
  };

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

  const openColumns = async (cat: InventoryCategoryItem) => {
    setColumnsModal(cat);
    setColumnsConfig([]);
    setSortConfig({ column: null, direction: "asc" });
    setColumnsLoading(true);
    try {
      const res = await fetch(`/api/inventory-categories/${cat.id}/column-config`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.columns)) {
          setColumnsConfig(data.columns as ColumnConfigItem[]);
        }
        if (data && data.sort) {
          setSortConfig({
            column: typeof data.sort.column === "string" && data.sort.column ? data.sort.column : null,
            direction: data.sort.direction === "desc" ? "desc" : "asc",
          });
        }
      }
    } finally {
      setColumnsLoading(false);
    }
  };

  const moveColumn = (from: number, to: number) => {
    if (from === to || to < 0 || to >= columnsConfig.length) return;
    setColumnsConfig((prev) => {
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const toggleColumnVisible = (idx: number) => {
    setColumnsConfig((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, visible: !c.visible } : c))
    );
  };

  const handleSaveColumns = async () => {
    if (!columnsModal) return;
    setColumnsSaving(true);
    try {
      await fetch(`/api/inventory-categories/${columnsModal.id}/column-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ columns: columnsConfig, sort: sortConfig }),
      });
      setColumnsModal(null);
    } finally {
      setColumnsSaving(false);
    }
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
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button
              onClick={() => setBulkDeleteConfirm(true)}
              className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            >
              <Trash2 className="h-4 w-4" />
              {t("inventory_categories.deleteSelected", { count: String(selected.size) })}
            </button>
          )}
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("inventory_categories.newCategory")}
          </button>
        </div>
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
                <th className="px-4 py-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20"
                  />
                </th>
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
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <FolderTree className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {search ? t("inventory_categories.noResult") : t("inventory_categories.noCategories")}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((cat) => (
                  <tr key={cat.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors ${selected.has(cat.id) ? "bg-slate-50 dark:bg-slate-800/30" : ""}`}>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(cat.id)}
                        onChange={() => toggleSelect(cat.id)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20"
                      />
                    </td>
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
                          onClick={() => openColumns(cat)}
                          title={t("inventory_categories.manageColumns")}
                          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <Columns3 className="h-4 w-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" />
                        </button>
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

      {columnsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg flex flex-col max-h-[80vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                {t("inventory_categories.columnsTitle", { name: columnsModal.name })}
              </h3>
              <button onClick={() => setColumnsModal(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="px-6 py-4 flex-1 overflow-y-auto">
              <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{t("inventory_categories.columnsHint")}</p>

              <div className="mb-4 grid grid-cols-[1fr_auto] gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("inventory_categories.sortBy")}</label>
                  <select
                    value={sortConfig.column ?? ""}
                    onChange={(e) => setSortConfig((s) => ({ ...s, column: e.target.value || null }))}
                    className={inputClass}
                  >
                    <option value="">{t("inventory_categories.sortByKey")}</option>
                    {columnsConfig.map((c) => (
                      <option key={c.label} value={c.label}>{c.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-500 dark:text-slate-400 invisible">.</label>
                  <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setSortConfig((s) => ({ ...s, direction: "asc" }))}
                      className={`px-3 py-2.5 text-xs font-medium transition-colors ${sortConfig.direction === "asc" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                    >
                      {t("inventory_categories.sortAsc")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setSortConfig((s) => ({ ...s, direction: "desc" }))}
                      className={`px-3 py-2.5 text-xs font-medium transition-colors ${sortConfig.direction === "desc" ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700"}`}
                    >
                      {t("inventory_categories.sortDesc")}
                    </button>
                  </div>
                </div>
              </div>

              {columnsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                </div>
              ) : columnsConfig.length === 0 ? (
                <p className="text-sm text-slate-400 dark:text-slate-500 text-center py-12">
                  {t("inventory_categories.columnsEmpty")}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {columnsConfig.map((col, idx) => (
                    <li
                      key={col.label}
                      draggable
                      onDragStart={() => setColumnsDragIdx(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => {
                        if (columnsDragIdx !== null) moveColumn(columnsDragIdx, idx);
                        setColumnsDragIdx(null);
                      }}
                      onDragEnd={() => setColumnsDragIdx(null)}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 ${columnsDragIdx === idx ? "opacity-40" : ""}`}
                    >
                      <GripVertical className="h-4 w-4 text-slate-300 dark:text-slate-600 cursor-grab shrink-0" />
                      <span className={`flex-1 truncate text-sm font-mono ${col.visible ? "text-slate-700 dark:text-slate-200" : "text-slate-400 dark:text-slate-500 line-through"}`}>
                        {col.label}
                      </span>
                      <button
                        onClick={() => toggleColumnVisible(idx)}
                        title={col.visible ? t("inventory_categories.columnVisible") : t("inventory_categories.columnHidden")}
                        className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors shrink-0"
                      >
                        {col.visible ? (
                          <Eye className="h-4 w-4 text-slate-600 dark:text-slate-300" />
                        ) : (
                          <EyeOff className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setColumnsModal(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleSaveColumns}
                disabled={columnsSaving || columnsLoading}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {columnsSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
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

      {bulkDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("inventory_categories.confirmBulkDelete", { count: String(selected.size) })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setBulkDeleteConfirm(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {bulkDeleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
