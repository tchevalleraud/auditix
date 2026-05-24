"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Network,
  Sigma,
  Workflow,
  X,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import type { InventoryCategoryOption } from "@/components/topology2/NodeLabelEditor";

export type ProtocolType = "lldp" | "isis";

export interface EdgeStylePartial {
  type?: "straight" | "orthogonal" | "curved";
  color?: string;
  width?: number;
  dash?: "solid" | "dashed" | "dotted";
  curveTension?: number;
  aggregationGroup?: string;
}

export interface ProtocolMapping {
  destNodeColumn: string;
  nodeMatchField: "auto" | "name" | "hostname" | "ipAddress" | "inventory";
  nodeMatchInventoryCategoryId?: number | null;
  nodeMatchInventoryKey?: string;
  nodeMatchInventoryColumn?: string;
  localPortColumn: string;
  remotePortColumn: string;
  metricColumn: string;
  aggregationCategoryId?: number | null;
  aggregationKeyColumn?: string;
  aggregationValueColumn?: string;
  linkAreaColumn?: string;
  areaCategoryId?: number | null;
  areaColumn?: string;
}

export interface ProtocolDraft {
  name: string;
  type: ProtocolType;
  inventoryCategoryId: number | null;
  inventoryCategoryName: string | null;
  mapping: ProtocolMapping;
  edgeStyle: EdgeStylePartial;
}

interface Props {
  mode: "create" | "edit";
  initial?: ProtocolDraft;
  inventoryCategories: InventoryCategoryOption[];
  aggregateParallelLinksEnabled: boolean;
  onCancel: () => void;
  onSubmit: (draft: ProtocolDraft) => Promise<void> | void;
}

type Step = "protocol" | "mapping" | "aggregation" | "areas" | "style";

const PROTOCOLS: { value: ProtocolType; titleKey: string; descKey: string }[] = [
  { value: "lldp", titleKey: "topology.protocolWizardLldpTitle", descKey: "topology.protocolWizardLldpDesc" },
  { value: "isis", titleKey: "topology.protocolWizardIsisTitle", descKey: "topology.protocolWizardIsisDesc" },
];

function defaultDraft(): ProtocolDraft {
  return {
    name: "LLDP",
    type: "lldp",
    inventoryCategoryId: null,
    inventoryCategoryName: null,
    mapping: {
      destNodeColumn: "",
      nodeMatchField: "auto",
      nodeMatchInventoryCategoryId: null,
      nodeMatchInventoryKey: "",
      nodeMatchInventoryColumn: "",
      localPortColumn: "",
      remotePortColumn: "",
      metricColumn: "",
      aggregationCategoryId: null,
      aggregationKeyColumn: "",
      aggregationValueColumn: "",
      linkAreaColumn: "",
      areaCategoryId: null,
      areaColumn: "",
    },
    edgeStyle: {
      type: "straight",
      color: "#6366f1",
      width: 0.5,
      dash: "solid",
      curveTension: 0.3,
    },
  };
}

export default function ProtocolWorkflowModal({
  mode,
  initial,
  inventoryCategories,
  aggregateParallelLinksEnabled,
  onCancel,
  onSubmit,
}: Props) {
  const { t } = useI18n();

  const [draft, setDraft] = useState<ProtocolDraft>(() => {
    if (initial) return JSON.parse(JSON.stringify(initial)) as ProtocolDraft;
    return defaultDraft();
  });

  const stepOrder = useMemo<Step[]>(() => {
    const steps: Step[] = [];
    if (mode === "create") steps.push("protocol");
    steps.push("mapping");
    if (draft.type === "lldp") steps.push("aggregation");
    if (draft.type === "isis") steps.push("areas");
    steps.push("style");
    return steps;
  }, [mode, draft.type]);

  const [step, setStep] = useState<Step>(() => stepOrder[0]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!stepOrder.includes(step)) {
      setStep(stepOrder[0]);
    }
  }, [stepOrder, step]);

  const update = (patch: Partial<ProtocolDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const updateMapping = (patch: Partial<ProtocolMapping>) =>
    setDraft((d) => ({ ...d, mapping: { ...d.mapping, ...patch } }));
  const updateStyle = (patch: Partial<EdgeStylePartial>) =>
    setDraft((d) => ({ ...d, edgeStyle: { ...d.edgeStyle, ...patch } }));

  const colsForCategory = (categoryName: string | null): string[] => {
    if (!categoryName) return [];
    return inventoryCategories.find((c) => c.name === categoryName)?.columns ?? [];
  };
  const keysForCategory = (categoryName: string | null): string[] => {
    if (!categoryName) return [];
    return inventoryCategories.find((c) => c.name === categoryName)?.keys ?? [];
  };

  const mainCols = colsForCategory(draft.inventoryCategoryName);

  const matchCatName = useMemo(() => {
    const id = draft.mapping.nodeMatchInventoryCategoryId;
    if (!id) return null;
    return inventoryCategories.find((c) => c.id === id)?.name ?? null;
  }, [draft.mapping.nodeMatchInventoryCategoryId, inventoryCategories]);
  const matchCols = colsForCategory(matchCatName);
  const matchKeys = keysForCategory(matchCatName);

  const aggCatName = useMemo(() => {
    const id = draft.mapping.aggregationCategoryId;
    if (id) {
      return inventoryCategories.find((c) => c.id === id)?.name ?? null;
    }
    return draft.inventoryCategoryName;
  }, [draft.mapping.aggregationCategoryId, draft.inventoryCategoryName, inventoryCategories]);
  const aggCols = colsForCategory(aggCatName);

  const areaCatName = useMemo(() => {
    const id = draft.mapping.areaCategoryId;
    if (!id) return null;
    return inventoryCategories.find((c) => c.id === id)?.name ?? null;
  }, [draft.mapping.areaCategoryId, inventoryCategories]);
  const areaCols = colsForCategory(areaCatName);

  const canAdvance = useMemo(() => {
    switch (step) {
      case "protocol":
        return draft.type === "lldp" || draft.type === "isis";
      case "mapping":
        return (
          draft.name.trim().length > 0 &&
          !!draft.inventoryCategoryId &&
          draft.mapping.destNodeColumn !== ""
        );
      case "aggregation":
        return true;
      case "areas":
        return true;
      case "style":
        return true;
      default:
        return false;
    }
  }, [step, draft]);

  const next = () => {
    const idx = stepOrder.indexOf(step);
    if (idx < stepOrder.length - 1) setStep(stepOrder[idx + 1]);
  };
  const prev = () => {
    const idx = stepOrder.indexOf(step);
    if (idx > 0) setStep(stepOrder[idx - 1]);
  };

  const isLast = stepOrder.indexOf(step) === stepOrder.length - 1;
  const isFirst = stepOrder.indexOf(step) === 0;

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(draft);
    } finally {
      setSubmitting(false);
    }
  };

  const stepLabel = (s: Step): string => {
    switch (s) {
      case "protocol":
        return t("topology.protocolWizardStepProtocol");
      case "mapping":
        return t("topology.protocolWizardStepMapping");
      case "aggregation":
        return t("topology.protocolWizardStepAggregation");
      case "areas":
        return t("topology.protocolWizardStepAreas");
      case "style":
        return t("topology.protocolWizardStepStyle");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={onCancel} />
      <div className="relative z-10 w-[80vw] max-w-3xl max-h-[90vh] flex flex-col rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-indigo-500" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {mode === "create"
                ? t("topology.protocolWizardTitleCreate")
                : t("topology.protocolWizardTitleEdit")}
            </h3>
          </div>
          <button
            onClick={onCancel}
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 px-6 py-3 border-b border-slate-100 dark:border-slate-800 text-xs overflow-x-auto">
          {stepOrder.map((s, i) => {
            const isActive = s === step;
            const isPast = stepOrder.indexOf(step) > i;
            return (
              <div key={s} className="flex items-center gap-2 shrink-0">
                <div
                  className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${
                    isActive
                      ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                      : isPast
                      ? "bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400"
                      : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                  }`}
                >
                  {isPast ? <Check className="h-3 w-3" /> : <span>{i + 1}</span>}
                  <span>{stepLabel(s)}</span>
                </div>
                {i < stepOrder.length - 1 && (
                  <span className="text-slate-300 dark:text-slate-600">›</span>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex-1 overflow-auto p-6">
          {step === "protocol" && (
            <div className="space-y-5">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t("topology.protocolWizardProtocolHint")}
              </p>
              <div className="grid grid-cols-1 gap-3">
                {PROTOCOLS.map((p) => {
                  const selected = draft.type === p.value;
                  const Icon = p.value === "isis" ? Sigma : Network;
                  return (
                    <button
                      key={p.value}
                      type="button"
                      onClick={() =>
                        update({
                          type: p.value,
                          name: draft.name === "" || draft.name === "LLDP" || draft.name === "ISIS"
                            ? p.value.toUpperCase()
                            : draft.name,
                        })
                      }
                      className={`text-left rounded-xl border-2 p-4 transition-all ${
                        selected
                          ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10"
                          : "border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600"
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Icon className="h-5 w-5 text-indigo-500" />
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {t(p.titleKey)}
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">{t(p.descKey)}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {step === "mapping" && (
            <div className="space-y-6">
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  {t("topology.protocolWizardIdentitySection")}
                </h4>
                <Field label={t("topology.protocolName")}>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => update({ name: e.target.value })}
                    className={inputCls}
                  />
                </Field>
              </div>

              <Section title={t("topology.protocolWizardCategorySection")}>
                <Field label={t("topology.protocolCategory")}>
                  <select
                    value={draft.inventoryCategoryId ?? ""}
                    onChange={(e) => {
                      const cid = e.target.value ? Number(e.target.value) : null;
                      const cname = cid
                        ? inventoryCategories.find((c) => c.id === cid)?.name ?? null
                        : null;
                      update({
                        inventoryCategoryId: cid,
                        inventoryCategoryName: cname,
                      });
                      updateMapping({ destNodeColumn: "", localPortColumn: "", remotePortColumn: "", metricColumn: "" });
                    }}
                    className={inputCls}
                  >
                    <option value="">—</option>
                    {inventoryCategories
                      .filter((c) => c.id !== null)
                      .map((c) => (
                        <option key={c.id ?? ""} value={c.id ?? ""}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label={t("topology.protocolDestNodeColumn")}>
                  <select
                    value={draft.mapping.destNodeColumn}
                    onChange={(e) => updateMapping({ destNodeColumn: e.target.value })}
                    disabled={mainCols.length === 0}
                    className={inputCls}
                  >
                    <option value="">—</option>
                    {mainCols.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
              </Section>

              <Section title={t("topology.protocolWizardMatchSection")}>
                <Field label={t("topology.protocolNodeMatchField")}>
                  <select
                    value={draft.mapping.nodeMatchField}
                    onChange={(e) =>
                      updateMapping({
                        nodeMatchField: e.target.value as ProtocolMapping["nodeMatchField"],
                      })
                    }
                    className={inputCls}
                  >
                    <option value="auto">{t("topology.protocolMatchAuto")}</option>
                    <option value="name">{t("topology.fieldName")}</option>
                    <option value="hostname">{t("topology.fieldHostname")}</option>
                    <option value="ipAddress">{t("topology.fieldIp")}</option>
                    <option value="inventory">{t("topology.protocolMatchInventory")}</option>
                  </select>
                </Field>

                {draft.mapping.nodeMatchField === "inventory" && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-3 space-y-3">
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {t("topology.protocolMatchInventoryHint")}
                    </p>
                    <Field label={t("topology.protocolMatchInventoryCategory")}>
                      <select
                        value={draft.mapping.nodeMatchInventoryCategoryId ?? ""}
                        onChange={(e) =>
                          updateMapping({
                            nodeMatchInventoryCategoryId: e.target.value
                              ? Number(e.target.value)
                              : null,
                            nodeMatchInventoryKey: "",
                            nodeMatchInventoryColumn: "",
                          })
                        }
                        className={inputCls}
                      >
                        <option value="">—</option>
                        {inventoryCategories
                          .filter((c) => c.id !== null)
                          .map((c) => (
                            <option key={c.id ?? ""} value={c.id ?? ""}>
                              {c.name}
                            </option>
                          ))}
                      </select>
                    </Field>
                    <Field
                      label={t("topology.protocolMatchInventoryKey")}
                      help={t("topology.protocolMatchInventoryKeyHelp")}
                    >
                      <select
                        value={draft.mapping.nodeMatchInventoryKey ?? ""}
                        onChange={(e) => updateMapping({ nodeMatchInventoryKey: e.target.value })}
                        disabled={matchKeys.length === 0}
                        className={inputCls}
                      >
                        <option value="">{t("topology.protocolMatchInventoryKeyAny")}</option>
                        {matchKeys.map((k) => (
                          <option key={k} value={k}>
                            {k}
                          </option>
                        ))}
                      </select>
                    </Field>
                    <Field label={t("topology.protocolMatchInventoryColumn")}>
                      <select
                        value={draft.mapping.nodeMatchInventoryColumn ?? ""}
                        onChange={(e) => updateMapping({ nodeMatchInventoryColumn: e.target.value })}
                        disabled={matchCols.length === 0}
                        className={inputCls}
                      >
                        <option value="">—</option>
                        {matchCols.map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                    </Field>
                  </div>
                )}
              </Section>

              <Section title={t("topology.protocolWizardPortsSection")}>
                <Field label={t("topology.protocolLocalPortColumn")}>
                  <select
                    value={draft.mapping.localPortColumn}
                    onChange={(e) => updateMapping({ localPortColumn: e.target.value })}
                    disabled={mainCols.length === 0}
                    className={inputCls}
                  >
                    <option value="">—</option>
                    {mainCols.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                {draft.type !== "isis" ? (
                  <Field label={t("topology.protocolRemotePortColumn")}>
                    <select
                      value={draft.mapping.remotePortColumn}
                      onChange={(e) => updateMapping({ remotePortColumn: e.target.value })}
                      disabled={mainCols.length === 0}
                      className={inputCls}
                    >
                      <option value="">—</option>
                      {mainCols.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <Field label={t("topology.protocolCostColumn")}>
                    <select
                      value={draft.mapping.metricColumn}
                      onChange={(e) => updateMapping({ metricColumn: e.target.value })}
                      disabled={mainCols.length === 0}
                      className={inputCls}
                    >
                      <option value="">—</option>
                      {mainCols.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </Field>
                )}
              </Section>
            </div>
          )}

          {step === "aggregation" && (
            <div className="space-y-5">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t("topology.protocolAggregationHintNew")}
              </p>
              <Field label={t("topology.protocolAggregationCategory")}>
                <select
                  value={draft.mapping.aggregationCategoryId ?? ""}
                  onChange={(e) =>
                    updateMapping({
                      aggregationCategoryId: e.target.value ? Number(e.target.value) : null,
                      aggregationValueColumn: "",
                    })
                  }
                  className={inputCls}
                >
                  <option value="">{t("topology.protocolAggregationCategoryReuse")}</option>
                  {inventoryCategories
                    .filter((c) => c.id !== null)
                    .map((c) => (
                      <option key={c.id ?? ""} value={c.id ?? ""}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={t("topology.protocolAggregationKeyColumn")}>
                <select
                  value={draft.mapping.aggregationKeyColumn ?? ""}
                  onChange={(e) => updateMapping({ aggregationKeyColumn: e.target.value })}
                  disabled={mainCols.length === 0}
                  className={inputCls}
                >
                  <option value="">{t("topology.protocolAggregationKeyDefault")}</option>
                  {mainCols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("topology.protocolAggregationValueColumn")}>
                <select
                  value={draft.mapping.aggregationValueColumn ?? ""}
                  onChange={(e) => updateMapping({ aggregationValueColumn: e.target.value })}
                  disabled={aggCols.length === 0}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {aggCols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {step === "areas" && (
            <div className="space-y-5">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t("topology.protocolIsisAreasHint")}
              </p>
              <Field label={t("topology.protocolLinkAreaColumn")}>
                <select
                  value={draft.mapping.linkAreaColumn ?? ""}
                  onChange={(e) => updateMapping({ linkAreaColumn: e.target.value })}
                  disabled={mainCols.length === 0}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {mainCols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={t("topology.protocolAreaCategory")}>
                <select
                  value={draft.mapping.areaCategoryId ?? ""}
                  onChange={(e) =>
                    updateMapping({
                      areaCategoryId: e.target.value ? Number(e.target.value) : null,
                      areaColumn: "",
                    })
                  }
                  className={inputCls}
                >
                  <option value="">—</option>
                  {inventoryCategories
                    .filter((c) => c.id !== null)
                    .map((c) => (
                      <option key={c.id ?? ""} value={c.id ?? ""}>
                        {c.name}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={t("topology.protocolAreaColumn")}>
                <select
                  value={draft.mapping.areaColumn ?? ""}
                  onChange={(e) => updateMapping({ areaColumn: e.target.value })}
                  disabled={areaCols.length === 0}
                  className={inputCls}
                >
                  <option value="">—</option>
                  {areaCols.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {step === "style" && (
            <div className="space-y-5">
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {t("topology.protocolWizardStyleHint")}
              </p>
              <Field label={t("topology.edgeType")}>
                <select
                  value={draft.edgeStyle.type ?? "straight"}
                  onChange={(e) => updateStyle({ type: e.target.value as EdgeStylePartial["type"] })}
                  className={inputCls}
                >
                  <option value="straight">{t("topology.edgeTypeStraight")}</option>
                  <option value="orthogonal">{t("topology.edgeTypeOrthogonal")}</option>
                  <option value="curved">{t("topology.edgeTypeCurved")}</option>
                </select>
              </Field>
              <Field label={t("topology.edgeDash")}>
                <select
                  value={draft.edgeStyle.dash ?? "solid"}
                  onChange={(e) => updateStyle({ dash: e.target.value as EdgeStylePartial["dash"] })}
                  className={inputCls}
                >
                  <option value="solid">{t("topology.edgeDashSolid")}</option>
                  <option value="dashed">{t("topology.edgeDashDashed")}</option>
                  <option value="dotted">{t("topology.edgeDashDotted")}</option>
                </select>
              </Field>
              <Field label={t("topology.edgeWidth")}>
                <input
                  type="number"
                  step={0.5}
                  min={0.5}
                  max={10}
                  value={draft.edgeStyle.width ?? 0.5}
                  onChange={(e) => updateStyle({ width: Number(e.target.value) })}
                  className={inputCls}
                />
              </Field>
              <Field label={t("topology.edgeColor")}>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={draft.edgeStyle.color ?? "#6366f1"}
                    onChange={(e) => updateStyle({ color: e.target.value })}
                    className="h-10 w-10 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    value={draft.edgeStyle.color ?? "#6366f1"}
                    onChange={(e) => updateStyle({ color: e.target.value })}
                    className={`${inputCls} font-mono text-xs`}
                  />
                </div>
              </Field>
              {aggregateParallelLinksEnabled && (
                <Field
                  label={t("topology.aggregationGroup")}
                  help={t("topology.protocolAggregationHint")}
                >
                  <input
                    type="text"
                    value={draft.edgeStyle.aggregationGroup ?? ""}
                    onChange={(e) => updateStyle({ aggregationGroup: e.target.value })}
                    placeholder={t("topology.aggregationGroupPlaceholder")}
                    className={inputCls}
                  />
                </Field>
              )}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-slate-100 dark:border-slate-800 px-6 py-4">
          <button
            type="button"
            onClick={prev}
            disabled={isFirst}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            {t("topology.protocolWizardBack")}
          </button>
          {isLast ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !canAdvance}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {mode === "create"
                ? t("topology.protocolWizardFinishCreate")
                : t("topology.protocolWizardFinishUpdate")}
            </button>
          ) : (
            <button
              type="button"
              onClick={next}
              disabled={!canAdvance}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {t("topology.protocolWizardNext")}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 disabled:opacity-40 disabled:cursor-not-allowed focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";

function Field({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
        {label}
      </label>
      {children}
      {help && <p className="text-[11px] text-slate-500 dark:text-slate-400">{help}</p>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
      <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        {title}
      </h4>
      {children}
    </div>
  );
}
