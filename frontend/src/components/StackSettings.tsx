"use client";

import { useCallback, useEffect, useState } from "react";
import { useAppContext } from "@/components/ContextProvider";
import { useI18n } from "@/components/I18nProvider";
import type { StackConfig } from "@/components/ContextProvider";

interface Category {
  id: number;
  name: string;
}

const selectClass =
  "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors disabled:opacity-50";

interface StackSettingsProps {
  /** Form id the header Save button submits via the HTML5 `form` attribute. */
  formId: string;
  /** Reports the in-flight save state up to the header button. */
  onSavingChange?: (saving: boolean) => void;
  /** Fired once a save succeeds so the header can flash its "saved" state. */
  onSaved?: () => void;
}

export default function StackSettings({ formId, onSavingChange, onSaved }: StackSettingsProps) {
  const { current, reload } = useAppContext();
  const { t } = useI18n();

  const [categories, setCategories] = useState<Category[]>([]);
  const [cols, setCols] = useState<string[]>([]);
  const [config, setConfig] = useState<StackConfig>(current?.stackConfig ?? { categoryId: null });

  const catId = config.categoryId ?? null;

  // Load inventory categories for the current context.
  useEffect(() => {
    if (!current) return;
    fetch(`/api/inventory-categories?context=${current.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Category[]) => setCategories(data))
      .catch(() => setCategories([]));
  }, [current]);

  // Reset local config when the context changes.
  useEffect(() => {
    setConfig(current?.stackConfig ?? { categoryId: null });
  }, [current]);

  const loadColumns = useCallback(async (id: number | null) => {
    if (!id) {
      setCols([]);
      return;
    }
    const res = await fetch(`/api/inventory-categories/${id}/columns`);
    setCols(res.ok ? await res.json() : []);
  }, []);

  useEffect(() => {
    loadColumns(catId);
  }, [catId, loadColumns]);

  const setField = (field: keyof StackConfig, value: string | number | null) =>
    setConfig((c) => ({ ...c, [field]: value }));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    onSavingChange?.(true);
    try {
      const categoryName = categories.find((c) => c.id === catId)?.name ?? null;
      const res = await fetch(`/api/contexts/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stackConfig: { ...config, categoryName } }),
      });
      if (res.ok) {
        await reload();
        onSaved?.();
      }
    } finally {
      onSavingChange?.(false);
    }
  };

  const colSelect = (
    value: string | null | undefined,
    onChange: (v: string | null) => void,
    optional = false
  ) => (
    <select
      className={selectClass}
      value={value ?? ""}
      disabled={!catId}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{optional ? t("stack.settings.none") : t("stack.settings.selectColumn")}</option>
      {cols.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );

  const field = (label: string, help: string | null, node: React.ReactNode) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {node}
      {help && <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{help}</p>}
    </div>
  );

  return (
    <form id={formId} onSubmit={save} className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
          {t("stack.settings.title")}
        </h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("stack.settings.description")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {field(
          t("stack.settings.category"),
          t("stack.settings.categoryHelp"),
          <select
            className={selectClass}
            value={catId ?? ""}
            onChange={(e) => setField("categoryId", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t("stack.settings.selectCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <div className="hidden sm:block" />
        {field(
          t("stack.settings.serialColumn"),
          null,
          colSelect(config.serialColumn, (v) => setField("serialColumn", v))
        )}
        {field(
          t("stack.settings.modelColumn"),
          null,
          colSelect(config.modelColumn, (v) => setField("modelColumn", v))
        )}
        {field(
          t("stack.settings.versionColumn"),
          t("stack.settings.versionColumnHelp"),
          colSelect(config.versionColumn, (v) => setField("versionColumn", v), true)
        )}
      </div>
    </form>
  );
}
