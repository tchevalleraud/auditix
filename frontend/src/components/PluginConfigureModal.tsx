"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

type FieldType = "text" | "password" | "number" | "boolean" | "select" | "textarea";

interface SelectOption {
  value: string | number;
  label: string;
}

interface SchemaField {
  name: string;
  type: FieldType;
  label?: string;
  help?: string;
  required?: boolean;
  default?: unknown;
  options?: SelectOption[];
}

export interface ConfigurationSchema {
  fields?: SchemaField[];
}

interface Props {
  open: boolean;
  pluginName: string;
  schema: ConfigurationSchema | null | undefined;
  value: Record<string, unknown> | null;
  onClose: () => void;
  onSave: (value: Record<string, unknown>) => Promise<void> | void;
  t: (k: string) => string;
}

/**
 * Modal that renders a dynamic configuration form based on a plugin's
 * getConfigurationSchema() output. Configuration is persisted per-context
 * via the parent's onSave callback.
 */
export function PluginConfigureModal({ open, pluginName, schema, value, onClose, onSave, t }: Props) {
  const [draft, setDraft] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    // Seed each field with current value, falling back to its default.
    const seed: Record<string, unknown> = {};
    for (const f of schema?.fields ?? []) {
      if (value && Object.prototype.hasOwnProperty.call(value, f.name)) {
        seed[f.name] = value[f.name];
      } else if (f.default !== undefined) {
        seed[f.name] = f.default;
      } else {
        seed[f.name] = f.type === "boolean" ? false : "";
      }
    }
    setDraft(seed);
    setError(null);
  }, [open, schema, value]);

  if (!open) return null;

  const fields = schema?.fields ?? [];

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(draft);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("pluginConfig.saveFailed"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("pluginConfig.title")} — {pluginName}
          </h2>
          <button onClick={onClose} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
          {fields.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("pluginConfig.empty")}</p>
          ) : (
            fields.map((f) => (
              <FieldRenderer
                key={f.name}
                field={f}
                value={draft[f.name]}
                onChange={(v) => setDraft({ ...draft, [f.name]: v })}
              />
            ))
          )}
        </div>
        {error && (
          <div className="border-t border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/10 px-5 py-2 text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}
        <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            {t("common.cancel")}
          </button>
          <button
            onClick={handleSave}
            disabled={saving || fields.length === 0}
            className="rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50"
          >
            {saving ? t("pluginConfig.saving") : t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldRenderer({ field, value, onChange }: {
  field: SchemaField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";
  const inputClass =
    "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20";

  const label = (
    <label className={labelClass}>
      {field.label ?? field.name}
      {field.required && <span className="text-red-500 ml-1">*</span>}
    </label>
  );
  const help = field.help ? (
    <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">{field.help}</p>
  ) : null;

  if (field.type === "boolean") {
    return (
      <div>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-400"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {field.label ?? field.name}
          </span>
        </label>
        {help}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        {label}
        <select
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className={inputClass}
        >
          {(field.options ?? []).map((o) => (
            <option key={String(o.value)} value={String(o.value)}>{o.label}</option>
          ))}
        </select>
        {help}
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        {label}
        <textarea
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          rows={4}
          className={inputClass}
        />
        {help}
      </div>
    );
  }

  return (
    <div>
      {label}
      <input
        type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(e) => onChange(field.type === "number" ? Number(e.target.value) : e.target.value)}
        className={inputClass}
      />
      {help}
    </div>
  );
}
