"use client";

import { useState } from "react";
import { Plus, X, GripVertical, ChevronDown, ChevronRight } from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────

export interface MatchCondition {
  field: string;
  inventoryCategoryId?: number | null;
  inventoryKey?: string;
  inventoryColumn?: string;
  operator: string;
  value: string | null;
}

export interface MatchBlock {
  type: "if" | "else_if" | "else";
  logic: "and" | "or";
  conditions: MatchCondition[];
  result: "include" | "exclude";
}

export interface MatchRulesData {
  blocks: MatchBlock[];
}

export interface InventoryStructure {
  categoryId: number | null;
  categoryName: string;
  entries: { key: string; columns: string[] }[];
}

interface Props {
  blocks: MatchBlock[];
  onChange: (blocks: MatchBlock[]) => void;
  inventoryStructure: InventoryStructure[];
  t: (key: string, vars?: Record<string, string>) => string;
}

// ─── Constants ───────────────────────────────────────────────────

const blockColors: Record<string, { border: string; bg: string; badge: string }> = {
  if: { border: "border-l-blue-500", bg: "bg-blue-50/50 dark:bg-blue-500/5", badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  else_if: { border: "border-l-amber-500", bg: "bg-amber-50/50 dark:bg-amber-500/5", badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  else: { border: "border-l-slate-400", bg: "bg-slate-50/50 dark:bg-slate-500/5", badge: "bg-slate-200 text-slate-600 dark:bg-slate-600/30 dark:text-slate-300" },
};

const fieldOptions = [
  "name", "hostname", "ipAddress", "discoveredModel", "discoveredVersion",
  "productModel", "manufacturer", "model", "tag", "inventory",
] as const;

const operators: { key: string; noValue: boolean }[] = [
  { key: "equals", noValue: false },
  { key: "not_equals", noValue: false },
  { key: "contains", noValue: false },
  { key: "not_contains", noValue: false },
  { key: "matches", noValue: false },
  { key: "greater_than", noValue: false },
  { key: "less_than", noValue: false },
  { key: "exists", noValue: true },
  { key: "not_exists", noValue: true },
  { key: "is_empty", noValue: true },
  { key: "is_not_empty", noValue: true },
];

const noValueOps = new Set(operators.filter((o) => o.noValue).map((o) => o.key));

const smallInput = "rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition-colors";

function makeEmptyCondition(): MatchCondition {
  return { field: "name", operator: "equals", value: "" };
}

// ─── Component ───────────────────────────────────────────────────

export default function MatchRuleEditor({ blocks, onChange, inventoryStructure, t }: Props) {
  const [editingCond, setEditingCond] = useState<string | null>(null);
  const [collapsedBlocks, setCollapsedBlocks] = useState<Set<number>>(new Set());
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const hasElse = blocks.some((b) => b.type === "else");
  const hasIf = blocks.some((b) => b.type === "if");

  const updateBlock = (idx: number, updater: (b: MatchBlock) => MatchBlock) => {
    const next = [...blocks];
    next[idx] = updater(next[idx]);
    onChange(next);
  };

  const removeBlock = (idx: number) => {
    onChange(blocks.filter((_, i) => i !== idx));
  };

  const addBlock = (type: "if" | "else_if" | "else") => {
    const newBlock: MatchBlock = {
      type,
      logic: "and",
      conditions: type === "else" ? [] : [makeEmptyCondition()],
      result: "include",
    };
    onChange([...blocks, newBlock]);
    if (type !== "else") {
      setEditingCond(`${blocks.length}-0`);
    }
  };

  const reorder = (fromIdx: number, toIdx: number) => {
    const next = [...blocks];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onChange(next);
  };

  const toggleCollapse = (idx: number) => {
    setCollapsedBlocks((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  const getInventoryKeys = (catId: number | null | undefined): string[] => {
    if (!catId) return [];
    const cat = inventoryStructure.find((c) => c.categoryId === catId);
    return cat ? cat.entries.map((e) => e.key) : [];
  };

  const getInventoryColumns = (catId: number | null | undefined, key: string | undefined): string[] => {
    if (!catId || !key) return [];
    const cat = inventoryStructure.find((c) => c.categoryId === catId);
    const entry = cat?.entries.find((e) => e.key === key);
    return entry ? entry.columns : [];
  };

  const fieldLabel = (field: string): string => {
    const key = `compliance_policies.autoMatchField${field.charAt(0).toUpperCase() + field.slice(1)}`;
    return t(key);
  };

  const condSummary = (cond: MatchCondition): string => {
    const parts: string[] = [];
    if (cond.field === "inventory") {
      const cat = inventoryStructure.find((c) => c.categoryId === cond.inventoryCategoryId);
      parts.push(`${cat?.categoryName || "?"} / ${cond.inventoryKey || "?"}`);
      if (cond.inventoryColumn && cond.inventoryColumn !== "Value#1") parts.push(`[${cond.inventoryColumn}]`);
    } else {
      parts.push(fieldLabel(cond.field));
    }
    const opLabel = t(`compliance_rules.operator_${cond.operator}`);
    parts.push(opLabel);
    if (cond.value !== null && cond.value !== undefined && !noValueOps.has(cond.operator)) {
      parts.push(`"${cond.value}"`);
    }
    return parts.join("  ");
  };

  return (
    <div className="space-y-2">
      {blocks.map((block, bIdx) => {
        const colors = blockColors[block.type] || blockColors.if;
        const isCollapsed = collapsedBlocks.has(bIdx);

        return (
          <div
            key={bIdx}
            className={`border-l-4 ${colors.border} rounded-lg border border-slate-200 dark:border-slate-700 ${colors.bg} ${dragOverIdx === bIdx && dragIdx !== bIdx ? "ring-2 ring-blue-400" : ""}`}
            draggable
            onDragStart={(e) => { setDragIdx(bIdx); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); setDragOverIdx(bIdx); }}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={(e) => { e.preventDefault(); setDragOverIdx(null); if (dragIdx !== null && dragIdx !== bIdx) reorder(dragIdx, bIdx); setDragIdx(null); }}
            onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
          >
            {/* Block header */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <div className="flex items-center gap-2">
                <GripVertical className="h-3.5 w-3.5 text-slate-400 cursor-grab active:cursor-grabbing" />
                <button onClick={() => toggleCollapse(bIdx)} className="p-0.5">
                  {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 text-slate-400" /> : <ChevronDown className="h-3.5 w-3.5 text-slate-400" />}
                </button>
                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${colors.badge}`}>
                  {block.type === "if" ? t("compliance_rules.blockIf") : block.type === "else_if" ? t("compliance_rules.blockElseIf") : t("compliance_rules.blockElse")}
                </span>
                {block.type !== "else" && block.conditions.length > 1 && (
                  <button
                    onClick={() => updateBlock(bIdx, (b) => ({ ...b, logic: b.logic === "and" ? "or" : "and" }))}
                    className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer transition-colors ${block.logic === "and" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300" : "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"}`}
                  >
                    {t(`compliance_rules.logic${block.logic === "and" ? "And" : "Or"}`)}
                  </button>
                )}
                {isCollapsed && block.type !== "else" && block.conditions.length > 0 && (
                  <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-md">
                    {block.conditions.map((c) => condSummary(c)).join(` ${block.logic === "and" ? "&&" : "||"} `)}
                  </span>
                )}
                {/* Result badge always visible */}
                <span className={`ml-2 px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${block.result === "include" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"}`}>
                  {block.result === "include" ? t("compliance_policies.autoMatchResultInclude") : t("compliance_policies.autoMatchResultExclude")}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {block.type !== "else" && (
                  <button
                    onClick={() => { updateBlock(bIdx, (b) => ({ ...b, conditions: [...b.conditions, makeEmptyCondition()] })); setEditingCond(`${bIdx}-${block.conditions.length}`); }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                    title={t("compliance_policies.autoMatchAddCondition")}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={() => removeBlock(bIdx)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-500 hover:bg-red-100/50 dark:hover:bg-red-500/10 transition-colors"
                  title={t("compliance_policies.autoMatchRemoveBlock")}
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Conditions + Result (collapsed = hidden) */}
            {!isCollapsed && (
              <div className="px-4 pb-3 space-y-2">
                {/* Conditions */}
                {block.type !== "else" && block.conditions.map((cond, cIdx) => {
                  const condKey = `${bIdx}-${cIdx}`;
                  const isEditing = editingCond === condKey;
                  const updateCond = (patch: Partial<MatchCondition>) =>
                    updateBlock(bIdx, (b) => {
                      const cs = [...b.conditions];
                      cs[cIdx] = { ...cs[cIdx], ...patch };
                      return { ...b, conditions: cs };
                    });
                  const invKeys = cond.field === "inventory" ? getInventoryKeys(cond.inventoryCategoryId) : [];
                  const invCols = cond.field === "inventory" ? getInventoryColumns(cond.inventoryCategoryId, cond.inventoryKey) : [];

                  return (
                    <div key={cIdx}>
                      {/* Compact view */}
                      {!isEditing && (
                        <div
                          className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors group"
                          onClick={() => setEditingCond(condKey)}
                        >
                          {cIdx > 0 && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${block.logic === "and" ? "text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10" : "text-violet-500 bg-violet-50 dark:bg-violet-500/10"}`}>
                              {t(`compliance_rules.logic${block.logic === "and" ? "And" : "Or"}`)}
                            </span>
                          )}
                          <span className="text-xs text-slate-600 dark:text-slate-300 truncate">{condSummary(cond)}</span>
                          <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateBlock(bIdx, (b) => ({ ...b, conditions: b.conditions.filter((_, i) => i !== cIdx) }));
                              }}
                              className="p-0.5 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                              title={t("compliance_policies.autoMatchRemoveCondition")}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Edit view */}
                      {isEditing && (
                        <div className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-3 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Field selector */}
                            <select
                              value={cond.field}
                              onChange={(e) => {
                                const newField = e.target.value;
                                const patch: Partial<MatchCondition> = { field: newField };
                                if (newField !== "inventory") {
                                  patch.inventoryCategoryId = undefined;
                                  patch.inventoryKey = undefined;
                                  patch.inventoryColumn = undefined;
                                }
                                updateCond(patch);
                              }}
                              className={`${smallInput} w-auto`}
                            >
                              {fieldOptions.map((f) => (
                                <option key={f} value={f}>{fieldLabel(f)}</option>
                              ))}
                            </select>

                            {/* Inventory sub-fields */}
                            {cond.field === "inventory" && (
                              <>
                                <select
                                  value={cond.inventoryCategoryId ?? ""}
                                  onChange={(e) => updateCond({ inventoryCategoryId: e.target.value ? Number(e.target.value) : null, inventoryKey: undefined, inventoryColumn: undefined })}
                                  className={`${smallInput} w-auto`}
                                >
                                  <option value="">{t("compliance_policies.autoMatchInventoryCategory")}</option>
                                  {inventoryStructure.map((c) => (
                                    <option key={c.categoryId ?? c.categoryName} value={c.categoryId ?? ""}>{c.categoryName}</option>
                                  ))}
                                </select>
                                {invKeys.length > 0 && (
                                  <select
                                    value={cond.inventoryKey ?? ""}
                                    onChange={(e) => updateCond({ inventoryKey: e.target.value || undefined, inventoryColumn: undefined })}
                                    className={`${smallInput} w-auto`}
                                  >
                                    <option value="">{t("compliance_policies.autoMatchInventoryKey")}</option>
                                    {invKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                                  </select>
                                )}
                                {invCols.length > 0 && (
                                  <select
                                    value={cond.inventoryColumn ?? ""}
                                    onChange={(e) => updateCond({ inventoryColumn: e.target.value || undefined })}
                                    className={`${smallInput} w-auto`}
                                  >
                                    <option value="">{t("compliance_policies.autoMatchInventoryColumn")}</option>
                                    {invCols.map((c) => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                )}
                              </>
                            )}

                            {/* Operator */}
                            <select
                              value={cond.operator}
                              onChange={(e) => updateCond({ operator: e.target.value })}
                              className={`${smallInput} w-auto`}
                            >
                              {operators.map((op) => (
                                <option key={op.key} value={op.key}>{t(`compliance_rules.operator_${op.key}`)}</option>
                              ))}
                            </select>

                            {/* Value */}
                            {!noValueOps.has(cond.operator) && (
                              <input
                                type="text"
                                value={cond.value ?? ""}
                                onChange={(e) => updateCond({ value: e.target.value })}
                                placeholder={t("compliance_rules.fieldValue")}
                                className={`${smallInput} flex-1 min-w-[120px]`}
                              />
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                updateBlock(bIdx, (b) => ({ ...b, conditions: b.conditions.filter((_, i) => i !== cIdx) }));
                                setEditingCond(null);
                              }}
                              className="text-xs text-red-500 hover:text-red-700 transition-colors"
                            >
                              {t("compliance_policies.autoMatchRemoveCondition")}
                            </button>
                            <button
                              onClick={() => setEditingCond(null)}
                              className="px-3 py-1 rounded text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                              OK
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Result selector */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("compliance_policies.autoMatchResult")} :</span>
                  <select
                    value={block.result}
                    onChange={(e) => updateBlock(bIdx, (b) => ({ ...b, result: e.target.value as "include" | "exclude" }))}
                    className={`${smallInput} w-auto`}
                  >
                    <option value="include">{t("compliance_policies.autoMatchResultInclude")}</option>
                    <option value="exclude">{t("compliance_policies.autoMatchResultExclude")}</option>
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add block buttons */}
      <div className="flex items-center gap-2 pt-1">
        {!hasIf && (
          <button
            onClick={() => addBlock("if")}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <Plus className="h-3 w-3" />
            {t("compliance_policies.autoMatchAddIf")}
          </button>
        )}
        {hasIf && !hasElse && (
          <>
            <button
              onClick={() => addBlock("else_if")}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <Plus className="h-3 w-3" />
              {t("compliance_policies.autoMatchAddElseIf")}
            </button>
            <button
              onClick={() => addBlock("else")}
              className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            >
              <Plus className="h-3 w-3" />
              {t("compliance_policies.autoMatchAddElse")}
            </button>
          </>
        )}
        {hasIf && hasElse && (
          <button
            onClick={() => {
              // Insert else_if before the else block
              const elseIdx = blocks.findIndex((b) => b.type === "else");
              const newBlock: MatchBlock = { type: "else_if", logic: "and", conditions: [makeEmptyCondition()], result: "include" };
              const next = [...blocks];
              next.splice(elseIdx, 0, newBlock);
              onChange(next);
              setEditingCond(`${elseIdx}-0`);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-3 py-2 text-xs font-medium text-slate-500 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
          >
            <Plus className="h-3 w-3" />
            {t("compliance_policies.autoMatchAddElseIf")}
          </button>
        )}
      </div>
    </div>
  );
}
