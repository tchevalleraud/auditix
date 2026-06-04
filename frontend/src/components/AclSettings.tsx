"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { useAppContext } from "@/components/ContextProvider";
import { useI18n } from "@/components/I18nProvider";
import type { AclConfig, AclEntryRole, AclFieldEntry } from "@/components/ContextProvider";

const ENTRY_ROLES: AclEntryRole[] = ["source", "destination", "protocol", "port", "service", "qualifier", "detail"];

interface Category {
  id: number;
  name: string;
}

const selectClass =
  "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors disabled:opacity-50";
const inputClass = selectClass;

interface AclSettingsProps {
  /** Form id the header Save button submits via the HTML5 `form` attribute. */
  formId: string;
  /** Reports the in-flight save state up to the header button. */
  onSavingChange?: (saving: boolean) => void;
  /** Fired once a save succeeds so the header can flash its "saved" state. */
  onSaved?: () => void;
}

export default function AclSettings({ formId, onSavingChange, onSaved }: AclSettingsProps) {
  const { current, reload } = useAppContext();
  const { t } = useI18n();

  const [categories, setCategories] = useState<Category[]>([]);
  const [aclCols, setAclCols] = useState<string[]>([]);
  const [aceCols, setAceCols] = useState<string[]>([]);
  const [config, setConfig] = useState<AclConfig>(current?.aclConfig ?? {});

  const aclCatId = config.aclSource?.categoryId ?? null;
  const aceCatId = config.aceSource?.categoryId ?? null;

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
    setConfig(current?.aclConfig ?? {});
  }, [current]);

  const loadColumns = useCallback(
    async (catId: number | null, setter: (cols: string[]) => void) => {
      if (!catId) {
        setter([]);
        return;
      }
      const res = await fetch(`/api/inventory-categories/${catId}/columns`);
      setter(res.ok ? await res.json() : []);
    },
    []
  );

  useEffect(() => {
    loadColumns(aclCatId, setAclCols);
  }, [aclCatId, loadColumns]);
  useEffect(() => {
    loadColumns(aceCatId, setAceCols);
  }, [aceCatId, loadColumns]);

  const setAclField = (field: string, value: string | number | null) =>
    setConfig((c) => ({ ...c, aclSource: { ...c.aclSource, categoryId: c.aclSource?.categoryId ?? null, [field]: value } }));
  const setAceField = (field: string, value: string | number | string[] | null) =>
    setConfig((c) => ({ ...c, aceSource: { ...c.aceSource, categoryId: c.aceSource?.categoryId ?? null, [field]: value } }));

  // Add / remove / edit the ordered list of field entries (role -> column).
  const entries: AclFieldEntry[] = config.aceSource?.entries ?? [];

  const setEntries = (next: AclFieldEntry[]) =>
    setConfig((c) => ({ ...c, aceSource: { ...c.aceSource, categoryId: c.aceSource?.categoryId ?? null, entries: next } }));

  const addEntry = () => setEntries([...entries, { role: "source", column: aceCols[0] ?? "" }]);
  const removeEntry = (i: number) => setEntries(entries.filter((_, idx) => idx !== i));
  const updateEntry = (i: number, patch: Partial<AclFieldEntry>) =>
    setEntries(entries.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    onSavingChange?.(true);
    try {
      const res = await fetch(`/api/contexts/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aclConfig: config }),
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
    cols: string[],
    value: string | null | undefined,
    onChange: (v: string | null) => void,
    catChosen: boolean
  ) => (
    <select
      className={selectClass}
      value={value ?? ""}
      disabled={!catChosen}
      onChange={(e) => onChange(e.target.value || null)}
    >
      <option value="">{t("acl.settings.selectColumn")}</option>
      {cols.map((c) => (
        <option key={c} value={c}>
          {c}
        </option>
      ))}
    </select>
  );

  const field = (label: string, node: React.ReactNode) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">{label}</label>
      {node}
    </div>
  );

  // ID picker: choose between the inventory entry key or a value column.
  const idField = (
    mode: string | null | undefined,
    idCol: string | null | undefined,
    cols: string[],
    catChosen: boolean,
    onModeChange: (v: string) => void,
    onColChange: (v: string | null) => void
  ) =>
    field(
      t("acl.fields.id"),
      <div className="space-y-2">
        <select
          className={selectClass}
          value={mode ?? "key"}
          disabled={!catChosen}
          onChange={(e) => onModeChange(e.target.value)}
        >
          <option value="key">{t("acl.settings.idModeKey")}</option>
          <option value="column">{t("acl.settings.idModeColumn")}</option>
        </select>
        {(mode ?? "key") === "column" && colSelect(cols, idCol, onColChange, catChosen)}
      </div>
    );

  return (
    <form id={formId} onSubmit={save} className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t("acl.settings.title")}</h2>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("acl.settings.description")}</p>
      </div>

      {/* ACL source */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t("acl.settings.aclSource")}</h3>
        {field(
          t("acl.settings.category"),
          <select
            className={selectClass}
            value={aclCatId ?? ""}
            onChange={(e) => setAclField("categoryId", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t("acl.settings.selectCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {idField(
            config.aclSource?.idMode,
            config.aclSource?.idCol,
            aclCols,
            !!aclCatId,
            (v) => setAclField("idMode", v),
            (v) => setAclField("idCol", v)
          )}
          {field(t("acl.fields.name"), colSelect(aclCols, config.aclSource?.nameCol, (v) => setAclField("nameCol", v), !!aclCatId))}
          {field(t("acl.fields.type"), colSelect(aclCols, config.aclSource?.typeCol, (v) => setAclField("typeCol", v), !!aclCatId))}
          {field(t("acl.fields.defaultAction"), colSelect(aclCols, config.aclSource?.defaultActionCol, (v) => setAclField("defaultActionCol", v), !!aclCatId))}
          {field(t("acl.fields.ports"), colSelect(aclCols, config.aclSource?.portsCol, (v) => setAclField("portsCol", v), !!aclCatId))}
          {field(t("acl.fields.vlans"), colSelect(aclCols, config.aclSource?.vlansCol, (v) => setAclField("vlansCol", v), !!aclCatId))}
          {field(t("acl.fields.vni"), colSelect(aclCols, config.aclSource?.vniCol, (v) => setAclField("vniCol", v), !!aclCatId))}
        </div>
      </div>

      {/* ACE source */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">{t("acl.settings.aceSource")}</h3>
        {field(
          t("acl.settings.category"),
          <select
            className={selectClass}
            value={aceCatId ?? ""}
            onChange={(e) => setAceField("categoryId", e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">{t("acl.settings.selectCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        {/* Structure: how each ACE row is identified and linked to its ACL. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {idField(
            config.aceSource?.idMode,
            config.aceSource?.idCol,
            aceCols,
            !!aceCatId,
            (v) => setAceField("idMode", v),
            (v) => setAceField("idCol", v)
          )}
          {field(t("acl.settings.parentRef"), colSelect(aceCols, config.aceSource?.parentRefCol, (v) => setAceField("parentRefCol", v), !!aceCatId))}
        </div>

        {/* Name + action. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {field(t("acl.fields.name"), colSelect(aceCols, config.aceSource?.nameCol, (v) => setAceField("nameCol", v), !!aceCatId))}
          {field(t("acl.fields.action"), colSelect(aceCols, config.aceSource?.actionCol, (v) => setAceField("actionCol", v), !!aceCatId))}
          {field(
            t("acl.settings.actionDelimiter"),
            <input
              type="text"
              className={inputClass}
              disabled={!aceCatId}
              placeholder={t("acl.settings.actionDelimiterPlaceholder")}
              value={config.aceSource?.actionDelimiter ?? ""}
              onChange={(e) => setAceField("actionDelimiter", e.target.value || null)}
            />
          )}
        </div>

        {/* Field entries: add/remove rows mapping a role to one inventory column.
            The row key is dynamic (one ACE per inventory row); several "source"
            entries aggregate into the Source cell, etc. */}
        {field(
          t("acl.settings.entries"),
          <>
            <p className="mb-2 text-xs text-slate-400 dark:text-slate-500">{t("acl.settings.entriesHint")}</p>
            {!aceCatId ? (
              <p className="text-xs text-slate-400 dark:text-slate-500">{t("acl.settings.selectCategory")}</p>
            ) : (
              <div className="space-y-2">
                {entries.map((entry, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <select
                      className={`${selectClass} sm:w-44`}
                      value={entry.role}
                      onChange={(e) => updateEntry(i, { role: e.target.value as AclEntryRole })}
                    >
                      {ENTRY_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {t(`acl.roles.${r}`)}
                        </option>
                      ))}
                    </select>
                    <select
                      className={selectClass}
                      value={entry.column}
                      onChange={(e) => updateEntry(i, { column: e.target.value })}
                    >
                      <option value="">{t("acl.settings.selectColumn")}</option>
                      {aceCols.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeEntry(i)}
                      aria-label={t("common.delete")}
                      className="shrink-0 rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-400 hover:text-red-600 hover:border-red-300 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={addEntry}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("acl.settings.addEntry")}
                </button>
              </div>
            )}
          </>
        )}

        {/* Enabled flag — shown last. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {field(t("acl.fields.enabled"), colSelect(aceCols, config.aceSource?.enabledCol, (v) => setAceField("enabledCol", v), !!aceCatId))}
        </div>
      </div>

    </form>
  );
}
