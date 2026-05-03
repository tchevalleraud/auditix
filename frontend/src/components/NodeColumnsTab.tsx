"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { Loader2, Check, GripVertical, Plus, Trash2, RotateCcw, ChevronUp, ChevronDown, AlignLeft, AlignCenter, AlignRight } from "lucide-react";

export interface FieldDef {
  key: string;
  category: string;
  sortable?: boolean;
  reactive?: boolean;
  primaryOnly?: boolean;
  parameterized?: boolean;
}

export interface CatalogCategory {
  key: string;
  labelKey: string;
}

export interface Catalog {
  categories: CatalogCategory[];
  fields: FieldDef[];
}

export interface FieldRef {
  field: string;
  params?: Record<string, string | number | null>;
}

export type ColumnAlign = "left" | "center" | "right";
export type ColumnWidth = "auto" | "min";

export interface ColumnDef {
  id: string;
  primary: FieldRef;
  secondary: FieldRef | null;
  labelOverride?: string;
  align?: ColumnAlign;
  width?: ColumnWidth;
  minWidth?: number;
}

export interface DefaultSort {
  column: string;
  direction: "asc" | "desc";
}

export interface ColumnsConfig {
  columns: ColumnDef[];
  pageSize?: number;
  defaultSort?: DefaultSort | null;
}

export const PAGE_SIZES = [5, 10, 15, 25, 50, 100, 200];

interface InventoryCatalogEntry {
  category: string;
  columns: string[];
}

const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";

function genId() {
  return Math.random().toString(36).slice(2, 10);
}

export function NodeColumnsTab({ contextId }: { contextId: number }) {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [inventoryCatalog, setInventoryCatalog] = useState<InventoryCatalogEntry[]>([]);
  const [config, setConfig] = useState<ColumnsConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [catRes, cfgRes, invRes] = await Promise.all([
        fetch("/api/nodes/columns-catalog"),
        fetch(`/api/contexts/${contextId}/node-columns-config`),
        fetch(`/api/contexts/${contextId}/inventory-columns-catalog`),
      ]);
      if (catRes.ok) setCatalog(await catRes.json());
      if (cfgRes.ok) setConfig(await cfgRes.json());
      if (invRes.ok) setInventoryCatalog(await invRes.json());
    } catch (e) {
      setError(t("nodeColumns.saveError"));
    }
  }, [contextId, t]);

  useEffect(() => { loadAll(); }, [loadAll]);

  const saveConfig = useCallback(async (next: ColumnsConfig) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/contexts/${contextId}/node-columns-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error("save failed");
      const data = await res.json();
      setConfig(data);
      setSavedAt(Date.now());
    } catch {
      setError(t("nodeColumns.saveError"));
    } finally {
      setSaving(false);
    }
  }, [contextId, t]);

  const resetDefault = useCallback(async () => {
    if (!confirm(t("nodeColumns.resetConfirm"))) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/contexts/${contextId}/node-columns-config`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setConfig(data);
      setSavedAt(Date.now());
    } catch {
      setError(t("nodeColumns.saveError"));
    } finally {
      setSaving(false);
    }
  }, [contextId, t]);

  if (!catalog || !config) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const fieldsByKey = new Map(catalog.fields.map(f => [f.key, f]));

  const updateColumn = (id: string, patch: Partial<ColumnDef>) => {
    const next: ColumnsConfig = {
      columns: config.columns.map(c => c.id === id ? { ...c, ...patch } : c),
    };
    setConfig(next);
    saveConfig(next);
  };

  const removeColumn = (id: string) => {
    const next: ColumnsConfig = { columns: config.columns.filter(c => c.id !== id) };
    setConfig(next);
    saveConfig(next);
  };

  const moveColumn = (id: string, dir: -1 | 1) => {
    const idx = config.columns.findIndex(c => c.id === id);
    if (idx < 0) return;
    const target = idx + dir;
    if (target < 0 || target >= config.columns.length) return;
    const cols = [...config.columns];
    const [moved] = cols.splice(idx, 1);
    cols.splice(target, 0, moved);
    const next: ColumnsConfig = { columns: cols };
    setConfig(next);
    saveConfig(next);
  };

  const onDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) return;
    const srcIdx = config.columns.findIndex(c => c.id === dragId);
    const tgtIdx = config.columns.findIndex(c => c.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const cols = [...config.columns];
    const [moved] = cols.splice(srcIdx, 1);
    cols.splice(tgtIdx, 0, moved);
    const next: ColumnsConfig = { columns: cols };
    setConfig(next);
    saveConfig(next);
    setDragId(null);
  };

  const addColumn = () => {
    const next: ColumnsConfig = {
      columns: [
        ...config.columns,
        { id: genId(), primary: { field: "hostname" }, secondary: null },
      ],
    };
    setConfig(next);
    saveConfig(next);
  };

  const sortableFields = catalog.fields.filter((f) => f.sortable);
  const ds = config.defaultSort ?? null;

  const updateDefaultSort = (column: string, direction: "asc" | "desc") => {
    const next: ColumnsConfig = column ? { ...config, defaultSort: { column, direction } } : { ...config, defaultSort: null };
    setConfig(next);
    saveConfig(next);
  };

  const updatePageSize = (size: number) => {
    const next: ColumnsConfig = { ...config, pageSize: size };
    setConfig(next);
    saveConfig(next);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("nodeColumns.tableDefaults")}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("nodeColumns.tableDefaultsDesc")}</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{t("nodeColumns.defaultPageSize")}</label>
            <select
              value={config.pageSize ?? 15}
              onChange={(e) => updatePageSize(Number(e.target.value))}
              className={inputClass}
            >
              {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{t("nodeColumns.defaultSort")}</label>
            <select
              value={ds?.column ?? ""}
              onChange={(e) => updateDefaultSort(e.target.value, ds?.direction ?? "asc")}
              className={inputClass}
            >
              <option value="">{t("nodeColumns.defaultSortNone")}</option>
              {catalog.categories.map((cat) => {
                const opts = sortableFields.filter((f) => f.category === cat.key);
                if (opts.length === 0) return null;
                return (
                  <optgroup key={cat.key} label={t(cat.labelKey)}>
                    {opts.map((f) => (
                      <option key={f.key} value={f.key}>{t(`nodeColumns.field.${f.key}`)}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">&nbsp;</label>
            <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
              {(["asc", "desc"] as const).map((d) => {
                const active = (ds?.direction ?? "asc") === d;
                const disabled = !ds?.column;
                return (
                  <button
                    key={d}
                    type="button"
                    disabled={disabled}
                    onClick={() => ds?.column && updateDefaultSort(ds.column, d)}
                    className={`px-3 py-2 text-xs font-medium transition-colors ${
                      disabled
                        ? "bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-600 cursor-not-allowed"
                        : active
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                    }`}
                  >
                    {t(`nodeColumns.defaultSort${d === "asc" ? "Asc" : "Desc"}`)}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("nodeColumns.title")}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("nodeColumns.desc")}</p>
        </div>

        <div className="space-y-2">
          {config.columns.map((col) => (
            <ColumnRow
              key={col.id}
              col={col}
              catalog={catalog}
              fieldsByKey={fieldsByKey}
              inventoryCatalog={inventoryCatalog}
              onUpdate={(patch) => updateColumn(col.id, patch)}
              onRemove={() => removeColumn(col.id)}
              onMoveUp={() => moveColumn(col.id, -1)}
              onMoveDown={() => moveColumn(col.id, 1)}
              onDragStart={() => setDragId(col.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onDrop(col.id)}
              dragging={dragId === col.id}
              t={t}
            />
          ))}
        </div>

        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <button
              onClick={addColumn}
              className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-white px-3 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("nodeColumns.addColumn")}
            </button>
            <button
              onClick={resetDefault}
              className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
              {t("nodeColumns.resetDefault")}
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            {saving && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
            {!saving && savedAt > 0 && (
              <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                {t("nodeColumns.saved")}
              </span>
            )}
            {error && <span className="text-red-500">{error}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

function ColumnRow({
  col, catalog, fieldsByKey, inventoryCatalog,
  onUpdate, onRemove, onMoveUp, onMoveDown,
  onDragStart, onDragOver, onDrop, dragging, t,
}: {
  col: ColumnDef;
  catalog: Catalog;
  fieldsByKey: Map<string, FieldDef>;
  inventoryCatalog: InventoryCatalogEntry[];
  onUpdate: (patch: Partial<ColumnDef>) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: () => void;
  dragging: boolean;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  const primaryDef = fieldsByKey.get(col.primary.field);
  const secondaryAllowed = primaryDef && !primaryDef.primaryOnly;
  const [localLabel, setLocalLabel] = useState(col.labelOverride ?? "");
  const lastPropLabel = useRef(col.labelOverride ?? "");
  useEffect(() => {
    if ((col.labelOverride ?? "") !== lastPropLabel.current) {
      lastPropLabel.current = col.labelOverride ?? "";
      setLocalLabel(col.labelOverride ?? "");
    }
  }, [col.labelOverride]);
  const [localMinWidth, setLocalMinWidth] = useState(col.minWidth ? String(col.minWidth) : "");
  const lastPropMinWidth = useRef(col.minWidth);
  useEffect(() => {
    if (col.minWidth !== lastPropMinWidth.current) {
      lastPropMinWidth.current = col.minWidth;
      setLocalMinWidth(col.minWidth ? String(col.minWidth) : "");
    }
  }, [col.minWidth]);
  const widthMode = col.width ?? "auto";

  const onChangePrimary = (key: string) => {
    const def = fieldsByKey.get(key);
    if (!def) return;
    const ref: FieldRef = { field: key };
    if (def.parameterized) ref.params = {};
    const next: Partial<ColumnDef> = { primary: ref };
    if (col.secondary && fieldsByKey.get(col.secondary.field)?.primaryOnly) {
      next.secondary = null;
    }
    if (def.primaryOnly && col.secondary) {
      next.secondary = null;
    }
    onUpdate(next);
  };

  const onChangeSecondary = (key: string) => {
    if (key === "") {
      onUpdate({ secondary: null });
      return;
    }
    const def = fieldsByKey.get(key);
    if (!def || def.primaryOnly) return;
    const ref: FieldRef = { field: key };
    if (def.parameterized) ref.params = {};
    onUpdate({ secondary: ref });
  };

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`flex items-start gap-2 rounded-lg border p-3 transition-colors ${
        dragging
          ? "border-slate-400 bg-slate-50 dark:bg-slate-800/60"
          : "border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30"
      }`}
    >
      <div className="flex flex-col items-center pt-1.5 gap-0.5">
        <button onClick={onMoveUp} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" title={t("nodeColumns.moveUp")}>
          <ChevronUp className="h-4 w-4" />
        </button>
        <GripVertical className="h-4 w-4 text-slate-400 cursor-grab" />
        <button onClick={onMoveDown} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" title={t("nodeColumns.moveDown")}>
          <ChevronDown className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{t("nodeColumns.labelOverride")}</label>
            <input
              type="text"
              value={localLabel}
              placeholder={t("nodeColumns.labelOverridePlaceholder")}
              onChange={(e) => setLocalLabel(e.target.value)}
              onBlur={() => {
                if (localLabel !== (col.labelOverride ?? "")) {
                  onUpdate({ labelOverride: localLabel });
                }
              }}
              className={inputClass}
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{t("nodeColumns.alignLabel")}</label>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                {(["left", "center", "right"] as const).map((al) => {
                  const Icon = al === "left" ? AlignLeft : al === "center" ? AlignCenter : AlignRight;
                  const active = (col.align ?? "left") === al;
                  return (
                    <button
                      key={al}
                      type="button"
                      onClick={() => onUpdate({ align: al })}
                      title={t(`nodeColumns.align${al[0].toUpperCase()}${al.slice(1)}`)}
                      className={`flex items-center justify-center px-2.5 py-2 text-sm transition-colors ${
                        active
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
              <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                {(["auto", "min"] as const).map((w) => {
                  const active = widthMode === w;
                  return (
                    <button
                      key={w}
                      type="button"
                      onClick={() => onUpdate({ width: w })}
                      title={t("nodeColumns.widthLabel")}
                      className={`px-2.5 py-2 text-xs font-medium transition-colors ${
                        active
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                          : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700"
                      }`}
                    >
                      {t(`nodeColumns.width${w[0].toUpperCase()}${w.slice(1)}`)}
                    </button>
                  );
                })}
              </div>
              {widthMode === "min" && (
                <input
                  type="number"
                  min={0}
                  max={2000}
                  step={10}
                  value={localMinWidth}
                  placeholder={t("nodeColumns.minWidthPlaceholder")}
                  onChange={(e) => setLocalMinWidth(e.target.value)}
                  onBlur={() => {
                    const n = parseInt(localMinWidth, 10);
                    const next = Number.isFinite(n) && n > 0 ? n : undefined;
                    if (next !== col.minWidth) {
                      onUpdate({ minWidth: next });
                    }
                  }}
                  title={t("nodeColumns.minWidthLabel")}
                  className={`${inputClass} w-24`}
                />
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{t("nodeColumns.primary")}</label>
            <FieldPicker
              value={col.primary.field}
              categories={catalog.categories}
              fields={catalog.fields}
              allowPrimaryOnly={true}
              onChange={onChangePrimary}
              t={t}
            />
            {primaryDef?.parameterized && (
              <InventoryParams
                params={col.primary.params ?? {}}
                inventoryCatalog={inventoryCatalog}
                onChange={(params) => onUpdate({ primary: { ...col.primary, params } })}
                t={t}
              />
            )}
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400">{t("nodeColumns.secondary")}</label>
            <FieldPicker
              value={col.secondary?.field ?? ""}
              categories={catalog.categories}
              fields={catalog.fields}
              allowPrimaryOnly={false}
              allowEmpty={true}
              disabled={!secondaryAllowed}
              onChange={onChangeSecondary}
              t={t}
            />
            {col.secondary && fieldsByKey.get(col.secondary.field)?.parameterized && (
              <InventoryParams
                params={col.secondary.params ?? {}}
                inventoryCatalog={inventoryCatalog}
                onChange={(params) => onUpdate({ secondary: { ...col.secondary!, params } })}
                t={t}
              />
            )}
          </div>
        </div>
      </div>

      <button
        onClick={onRemove}
        title={t("nodeColumns.remove")}
        className="mt-1.5 text-slate-400 hover:text-red-500 transition-colors"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function FieldPicker({
  value, categories, fields, allowPrimaryOnly, allowEmpty, disabled, onChange, t,
}: {
  value: string;
  categories: CatalogCategory[];
  fields: FieldDef[];
  allowPrimaryOnly: boolean;
  allowEmpty?: boolean;
  disabled?: boolean;
  onChange: (k: string) => void;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className={inputClass}
    >
      {allowEmpty && <option value="">{t("nodeColumns.noSecondary")}</option>}
      {!allowEmpty && value === "" && <option value="">{t("nodeColumns.selectField")}</option>}
      {categories.map((cat) => {
        const opts = fields.filter((f) => f.category === cat.key && (allowPrimaryOnly || !f.primaryOnly));
        if (opts.length === 0) return null;
        return (
          <optgroup key={cat.key} label={t(cat.labelKey)}>
            {opts.map((f) => (
              <option key={f.key} value={f.key}>{t(`nodeColumns.field.${f.key}`)}</option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

function InventoryParams({
  params, inventoryCatalog, onChange, t,
}: {
  params: Record<string, string | number | null>;
  inventoryCatalog: InventoryCatalogEntry[];
  onChange: (p: Record<string, string | number | null>) => void;
  t: (k: string, v?: Record<string, string>) => string;
}) {
  if (inventoryCatalog.length === 0) {
    return <p className="text-xs text-slate-400">{t("nodeColumns.inventoryNoData")}</p>;
  }
  const cat = typeof params.category === "string" ? params.category : "";
  const col = typeof params.column === "string" ? params.column : "";
  const cols = inventoryCatalog.find((c) => c.category === cat)?.columns ?? [];

  return (
    <div className="grid grid-cols-2 gap-2">
      <select
        value={cat}
        onChange={(e) => onChange({ category: e.target.value, column: "" })}
        className={inputClass}
      >
        <option value="">{t("nodeColumns.inventoryCategory")}</option>
        {inventoryCatalog.map((c) => (
          <option key={c.category} value={c.category}>{c.category}</option>
        ))}
      </select>
      <select
        value={col}
        disabled={!cat}
        onChange={(e) => onChange({ category: cat, column: e.target.value })}
        className={inputClass}
      >
        <option value="">{t("nodeColumns.inventoryColumn")}</option>
        {cols.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}
