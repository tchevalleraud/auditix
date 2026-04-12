"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Loader2,
  ArrowLeft,
  ToggleLeft,
  ToggleRight,
  Save,
  CheckCircle2,
  ClipboardCheck,
  Database,
  Filter,
  Trash2,
  Ban,
  Package,
  FileText,
  Play,
  Search,
  Server,
  ChevronDown,
  AlertCircle,
  CheckCircle,
  Hash,
  Terminal,
  Plus,
  X,
  GitBranch,
  FolderOpen,
  HelpCircle,
  Rows3,
  Pencil,
  Copy,
} from "lucide-react";

interface DataSource {
  name: string;
  type: "collection" | "ssh";
  command: string;
  tag?: string | null;
  regex?: string | null;
  resultMode?: "capture" | "match" | "count" | null;
  valueMap?: { group: number; label: string }[] | null;
  keyGroup?: number | null;
  multiRow?: boolean;
}

interface RuleDetail {
  id: number;
  identifier: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  dataSources: DataSource[];
  conditionTree: ConditionTree | null;
  multiRowMessages: Record<string, string> | null;
  folderId: number | null;
  createdAt: string;
}

interface ConditionTree { blocks: ConditionBlock[]; }
interface ConditionBlock {
  type: "if" | "else_if" | "else";
  logic: "and" | "or";
  conditions: ConditionItem[];
  children: ConditionBlock[];
  result: ConditionResult | null;
}
interface ConditionItem {
  type: "source" | "inventory";
  // Source fields
  source?: string;
  field?: string;
  // Inventory fields
  inventoryCategoryId?: number | null;
  inventoryKey?: string;
  inventoryColumn?: string;
  // Common
  operator: string;
  value: string | null;
  nodeId?: number | null;
  nodeTagId?: number | null;
  nodeManufacturerId?: number | null;
  nodeModelId?: number | null;
}
interface ConditionResult {
  status: "compliant" | "non_compliant" | "error" | "not_applicable";
  message: string;
  severity?: "info" | "low" | "medium" | "high" | "critical";
  recommendation?: string;
}

interface NodeTagItem { id: number; name: string; color: string; }
interface CategoryItem { id: number; name: string; keyLabel: string | null; }
interface InventoryStructure {
  categoryId: number | null;
  categoryName: string;
  entries: { key: string; columns: string[] }[];
}
interface NodeItem { id: number; name: string | null; ipAddress: string; hostname: string | null; manufacturer: { id: number; name: string; logo: string | null } | null; model: { id: number; name: string } | null; }
interface FolderOption { id: number; name: string; depth: number; }

const tabKeys = ["general", "datasource", "conditions"] as const;
type TabKey = (typeof tabKeys)[number];

const blockColors: Record<string, { border: string; bg: string; badge: string }> = {
  if: { border: "border-l-blue-500", bg: "bg-blue-50/50 dark:bg-blue-500/5", badge: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" },
  else_if: { border: "border-l-amber-500", bg: "bg-amber-50/50 dark:bg-amber-500/5", badge: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" },
  else: { border: "border-l-slate-400", bg: "bg-slate-50/50 dark:bg-slate-500/5", badge: "bg-slate-200 text-slate-600 dark:bg-slate-600/30 dark:text-slate-300" },
};

const statusColors: Record<string, string> = {
  compliant: "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30",
  non_compliant: "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30",
  error: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30",
  not_applicable: "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-600/20 dark:text-slate-300 dark:border-slate-500/30",
};

const severityColors: Record<string, string> = {
  info: "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30",
  low: "bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/30",
  medium: "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30",
  high: "bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30",
  critical: "bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30",
};

interface BlockListProps {
  blocks: ConditionBlock[];
  parentPath: number[];
  depth: number;
  t: (key: string) => string;
  operators: { key: string; noValue: boolean }[];
  statuses: { key: ConditionResult["status"]; color: string }[];
  severities: { key: NonNullable<ConditionResult["severity"]>; color: string }[];
  sourceFieldOptions: { source: string; field: string; label: string }[];
  categories: CategoryItem[];
  inventoryStructure: InventoryStructure[];
  nodes: NodeItem[];
  nodeTags: NodeTagItem[];
  inputCls: string;
  makeEmptyCondition: () => ConditionItem;
  onUpdate: (path: number[], updater: (b: ConditionBlock) => ConditionBlock) => void;
  onRemove: (path: number[]) => void;
  onAddSibling: (parentPath: number[], type: "else_if" | "else") => void;
  onAddNestedIf: (path: number[]) => void;
  onReorder: (parentPath: number[], fromIdx: number, toIdx: number) => void;
  onDuplicate: (path: number[]) => void;
}

function ConditionBlockList({ blocks, parentPath, depth, t, operators, statuses, severities, sourceFieldOptions, categories, inventoryStructure, nodes, nodeTags, inputCls, makeEmptyCondition, onUpdate, onRemove, onAddSibling, onAddNestedIf, onReorder, onDuplicate }: BlockListProps) {
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
  const hasElse = blocks.some((b) => b.type === "else");
  const smallInput = "rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition-colors";
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  // Track which condition/result is being edited
  const [editingCond, setEditingCond] = useState<string | null>(null);
  const [editingResult, setEditingResult] = useState<string | null>(null);

  // Build a one-line summary for a condition
  const condSummary = (cond: ConditionItem): string => {
    const parts: string[] = [];
    if (cond.nodeId) {
      const n = nodes.find((nd) => nd.id === cond.nodeId);
      parts.push(n ? (n.name || n.hostname || n.ipAddress) : `#${cond.nodeId}`);
    }
    const ct = cond.type || "source";
    if (ct === "source") {
      parts.push(`${cond.source || "?"}.${ cond.field || "$value"}`);
    } else {
      const cat = inventoryStructure.find((c) => c.categoryId === cond.inventoryCategoryId);
      parts.push(`${cat?.categoryName || "?"} / ${cond.inventoryKey || "?"}`);
      if (cond.inventoryColumn && cond.inventoryColumn !== "Value#1") parts.push(`[${cond.inventoryColumn}]`);
    }
    const opLabel = cond.operator.replace(/_/g, " ");
    parts.push(opLabel);
    if (cond.value !== null && cond.value !== undefined && !["exists", "not_exists", "is_empty", "is_not_empty"].includes(cond.operator)) {
      parts.push(`"${cond.value}"`);
    }
    return parts.join("  ");
  };

  return (
    <div className="space-y-2">
      {blocks.map((block, bIdx) => {
        const path = [...parentPath, bIdx];
        const colors = blockColors[block.type] || blockColors.if;
        const noValueOps = new Set(operators.filter((o) => o.noValue).map((o) => o.key));

        return (
          <div
            key={bIdx}
            className={`border-l-4 ${colors.border} rounded-lg border border-slate-200 dark:border-slate-700 ${colors.bg} ${dragOverIdx === bIdx && dragIdx !== bIdx ? "ring-2 ring-blue-400" : ""}`}
            draggable
            onDragStart={(e) => { setDragIdx(bIdx); e.dataTransfer.effectAllowed = "move"; }}
            onDragOver={(e) => { e.preventDefault(); setDragOverIdx(bIdx); }}
            onDragLeave={() => setDragOverIdx(null)}
            onDrop={(e) => { e.preventDefault(); setDragOverIdx(null); if (dragIdx !== null && dragIdx !== bIdx) onReorder(parentPath, dragIdx, bIdx); setDragIdx(null); }}
            onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
          >
            {/* Block header */}
            <div className="flex items-center justify-between px-4 py-2.5 cursor-grab active:cursor-grabbing">
              <div className="flex items-center gap-2">
                <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase ${colors.badge}`}>
                  {t(`compliance_rules.block${block.type === "else_if" ? "ElseIf" : block.type.charAt(0).toUpperCase() + block.type.slice(1)}`)}
                </span>
                {block.type !== "else" && block.conditions.length > 1 && (
                  <button
                    onClick={() => onUpdate(path, (b) => ({ ...b, logic: b.logic === "and" ? "or" : "and" }))}
                    className={`px-2 py-0.5 rounded text-xs font-semibold cursor-pointer transition-colors ${block.logic === "and" ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300" : "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300"}`}
                  >
                    {t(`compliance_rules.logic${block.logic === "and" ? "And" : "Or"}`)}
                  </button>
                )}
              </div>
              <div className="flex items-center gap-1">
                {block.type !== "else" && (
                  <button
                    onClick={() => { onUpdate(path, (b) => ({ ...b, conditions: [...b.conditions, makeEmptyCondition()] })); setEditingCond(`${bIdx}-${block.conditions.length}`); }}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                    title={t("compliance_rules.addConditionRow")}
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                )}
                {!block.children.length && block.result && (
                  <button
                    onClick={() => onAddNestedIf(path)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                    title={t("compliance_rules.addNestedIf")}
                  >
                    <GitBranch className="h-3 w-3" />
                  </button>
                )}
                {(block.type === "if" || block.type === "else_if") && (
                  <button
                    onClick={() => onDuplicate(path)}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors"
                    title={t("compliance_rules.duplicateBlock")}
                  >
                    <Copy className="h-3 w-3" />
                  </button>
                )}
                <button
                  onClick={() => onRemove(path)}
                  className="flex items-center gap-1 px-2 py-1 rounded text-xs text-red-500 hover:bg-red-100/50 dark:hover:bg-red-500/10 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>

            {/* Conditions */}
            {block.type !== "else" && (
              <div className="px-4 pb-3 space-y-2">
                {block.conditions.map((cond, cIdx) => {
                  const condType = cond.type || "source";
                  const condKey = `${bIdx}-${cIdx}`;
                  const isEditing = editingCond === condKey;
                  const updateCond = (patch: Partial<ConditionItem>) => onUpdate(path, (b) => { const cs = [...b.conditions]; cs[cIdx] = { ...cs[cIdx], ...patch }; return { ...b, conditions: cs }; });
                  const invKeys = condType === "inventory" ? getInventoryKeys(cond.inventoryCategoryId) : [];
                  const invCols = condType === "inventory" ? getInventoryColumns(cond.inventoryCategoryId, cond.inventoryKey) : [];

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
                        {cond.nodeId && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:text-blue-400 shrink-0">
                            <Server className="h-2.5 w-2.5" />
                            {(() => { const n = nodes.find((nd) => nd.id === cond.nodeId); return n ? (n.name || n.hostname || n.ipAddress) : `#${cond.nodeId}`; })()}
                          </span>
                        )}
                        {cond.nodeTagId && (
                          <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0" style={{ backgroundColor: `${nodeTags.find((tg) => tg.id === cond.nodeTagId)?.color || "#6b7280"}20`, color: nodeTags.find((tg) => tg.id === cond.nodeTagId)?.color || "#6b7280" }}>
                            {nodeTags.find((tg) => tg.id === cond.nodeTagId)?.name || `tag#${cond.nodeTagId}`}
                          </span>
                        )}
                        {cond.nodeManufacturerId && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-orange-50 dark:bg-orange-500/10 px-2 py-0.5 text-[10px] font-semibold text-orange-600 dark:text-orange-400 shrink-0">
                            {nodes.find((n) => n.manufacturer?.id === cond.nodeManufacturerId)?.manufacturer?.name || `mfr#${cond.nodeManufacturerId}`}
                          </span>
                        )}
                        {cond.nodeModelId && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-cyan-50 dark:bg-cyan-500/10 px-2 py-0.5 text-[10px] font-semibold text-cyan-600 dark:text-cyan-400 shrink-0">
                            {nodes.find((n) => n.model?.id === cond.nodeModelId)?.model?.name || `model#${cond.nodeModelId}`}
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${condType === "source" ? "bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400" : "bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"}`}>
                          {condType === "source" ? "SRC" : "INV"}
                        </span>
                        <span className="text-xs font-mono text-slate-700 dark:text-slate-300 truncate">
                          {condType === "source"
                            ? `${cond.source || "?"}.${cond.field || "$value"}`
                            : `${inventoryStructure.find((c) => c.categoryId === cond.inventoryCategoryId)?.categoryName || "?"} / ${cond.inventoryKey || "?"}`}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-400 uppercase shrink-0">{cond.operator.replace(/_/g, " ")}</span>
                        {cond.value !== null && cond.value !== undefined && !noValueOps.has(cond.operator) && (
                          <span className="text-xs font-mono text-emerald-700 dark:text-emerald-400 truncate">&quot;{cond.value}&quot;</span>
                        )}
                        <div className="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                          <Pencil className="h-3 w-3 text-slate-400" />
                          {block.conditions.length > 1 && (
                            <button onClick={(e) => { e.stopPropagation(); onUpdate(path, (b) => ({ ...b, conditions: b.conditions.filter((_, i) => i !== cIdx) })); }} className="p-0.5 rounded text-slate-400 hover:text-red-500 transition-colors"><X className="h-3 w-3" /></button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Expanded edit view */}
                    {isEditing && (
                      <div className="rounded-lg border-2 border-blue-300 dark:border-blue-500/40 bg-white dark:bg-slate-900 p-3 space-y-2.5">
                        {/* Row 1: Logic + Node filter + Data type */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {cIdx > 0 && (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase shrink-0 ${block.logic === "and" ? "text-indigo-500 bg-indigo-50 dark:bg-indigo-500/10" : "text-violet-500 bg-violet-50 dark:bg-violet-500/10"}`}>
                              {t(`compliance_rules.logic${block.logic === "and" ? "And" : "Or"}`)}
                            </span>
                          )}
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Node</span>
                            {(() => {
                              const currentVal = cond.nodeModelId ? `model:${cond.nodeModelId}` : cond.nodeManufacturerId ? `mfr:${cond.nodeManufacturerId}` : cond.nodeTagId ? `tag:${cond.nodeTagId}` : cond.nodeId ? `node:${cond.nodeId}` : "";
                              const uniqueMfrs = [...new Map(nodes.filter((n) => n.manufacturer).map((n) => [n.manufacturer!.id, n.manufacturer!])).values()];
                              const uniqueModels = [...new Map(nodes.filter((n) => n.model).map((n) => [n.model!.id, n.model!])).values()];
                              return (
                                <select
                                  value={currentVal}
                                  onChange={(e) => {
                                    const v = e.target.value;
                                    const reset = { nodeId: null, nodeTagId: null, nodeManufacturerId: null, nodeModelId: null };
                                    if (!v) updateCond(reset);
                                    else if (v.startsWith("tag:")) updateCond({ ...reset, nodeTagId: Number(v.slice(4)) });
                                    else if (v.startsWith("mfr:")) updateCond({ ...reset, nodeManufacturerId: Number(v.slice(4)) });
                                    else if (v.startsWith("model:")) updateCond({ ...reset, nodeModelId: Number(v.slice(6)) });
                                    else if (v.startsWith("node:")) updateCond({ ...reset, nodeId: Number(v.slice(5)) });
                                  }}
                                  className={`${smallInput} max-w-[220px] ${currentVal ? "!border-blue-400 dark:!border-blue-500" : ""}`}
                                >
                                  <option value="">{t("compliance_rules.allNodes")}</option>
                                  {nodeTags.length > 0 && <optgroup label={t("compliance_rules.filterByTag")}>{nodeTags.map((tg) => <option key={`tag:${tg.id}`} value={`tag:${tg.id}`}>{tg.name}</option>)}</optgroup>}
                                  {uniqueMfrs.length > 0 && <optgroup label={t("compliance_rules.filterByManufacturer")}>{uniqueMfrs.map((m) => <option key={`mfr:${m.id}`} value={`mfr:${m.id}`}>{m.name}</option>)}</optgroup>}
                                  {uniqueModels.length > 0 && <optgroup label={t("compliance_rules.filterByModel")}>{uniqueModels.map((m) => <option key={`model:${m.id}`} value={`model:${m.id}`}>{m.name}</option>)}</optgroup>}
                                  <optgroup label={t("compliance_rules.filterByNode")}>{nodes.map((n) => <option key={`node:${n.id}`} value={`node:${n.id}`}>{n.name || n.hostname || n.ipAddress}</option>)}</optgroup>
                                </select>
                              );
                            })()}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Type</span>
                            <select value={condType} onChange={(e) => { const nt = e.target.value as "source" | "inventory"; if (nt === "inventory") updateCond({ type: "inventory", inventoryCategoryId: inventoryStructure[0]?.categoryId || null, inventoryKey: "", inventoryColumn: "Value#1", source: undefined, field: undefined }); else updateCond({ type: "source", source: sourceFieldOptions[0]?.source || "", field: sourceFieldOptions[0]?.field || "$value", inventoryCategoryId: undefined, inventoryKey: undefined, inventoryColumn: undefined }); }} className={`${smallInput} w-[110px]`}>
                              <option value="source">{t("compliance_rules.conditionTypeSource")}</option>
                              <option value="inventory">{t("compliance_rules.conditionTypeInventory")}</option>
                            </select>
                          </div>
                        </div>

                        {/* Row 2: Data source details */}
                        <div className="flex items-center gap-2 flex-wrap">
                          {condType === "source" && (
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Var</span>
                              <select value={`${cond.source || ""}.${cond.field || "$value"}`} onChange={(e) => { const [s, ...fParts] = e.target.value.split("."); updateCond({ source: s, field: fParts.join(".") }); }} className={`${smallInput} min-w-[160px] font-mono`}>
                                {sourceFieldOptions.length === 0 && <option value="">--</option>}
                                {sourceFieldOptions.map((o) => <option key={o.label} value={`${o.source}.${o.field}`}>{o.label}</option>)}
                              </select>
                            </div>
                          )}
                          {condType === "inventory" && (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Cat.</span>
                                <select value={cond.inventoryCategoryId ?? ""} onChange={(e) => updateCond({ inventoryCategoryId: e.target.value ? Number(e.target.value) : null, inventoryKey: "", inventoryColumn: "Value#1" })} className={`${smallInput} max-w-[160px]`}>
                                  <option value="">--</option>
                                  {inventoryStructure.map((c) => <option key={c.categoryId ?? c.categoryName} value={c.categoryId ?? ""}>{c.categoryName}</option>)}
                                </select>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Cle</span>
                                <select value={cond.inventoryKey || ""} onChange={(e) => updateCond({ inventoryKey: e.target.value, inventoryColumn: "Value#1" })} className={`${smallInput} max-w-[160px] font-mono`}>
                                  <option value="">--</option>
                                  {invKeys.map((k) => <option key={k} value={k}>{k}</option>)}
                                </select>
                              </div>
                              {invCols.length > 1 && (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Col.</span>
                                  <select value={cond.inventoryColumn || "Value#1"} onChange={(e) => updateCond({ inventoryColumn: e.target.value })} className={`${smallInput} max-w-[120px] font-mono`}>
                                    {invCols.map((c) => <option key={c} value={c}>{c}</option>)}
                                  </select>
                                </div>
                              )}
                            </>
                          )}
                        </div>

                        {/* Row 3: Operator + Value */}
                        <div className="flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-slate-400 uppercase w-10 shrink-0">Test</span>
                          <select value={cond.operator} onChange={(e) => updateCond({ operator: e.target.value, value: noValueOps.has(e.target.value) ? null : cond.value })} className={`${smallInput} min-w-[140px]`}>
                            {operators.map((o) => <option key={o.key} value={o.key}>{t(`compliance_rules.operator_${o.key}`)}</option>)}
                          </select>
                          {!noValueOps.has(cond.operator) && (
                            <input type="text" value={cond.value ?? ""} onChange={(e) => updateCond({ value: e.target.value })} placeholder="..." className={`${smallInput} flex-1 font-mono`} />
                          )}
                        </div>

                        {/* Close button */}
                        <div className="flex items-center justify-between pt-1">
                          {block.conditions.length > 1 && (
                            <button onClick={() => { setEditingCond(null); onUpdate(path, (b) => ({ ...b, conditions: b.conditions.filter((_, i) => i !== cIdx) })); }} className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600 transition-colors">
                              <Trash2 className="h-3 w-3" />
                              {t("common.delete")}
                            </button>
                          )}
                          <button onClick={() => setEditingCond(null)} className="ml-auto flex items-center gap-1 rounded-md bg-slate-900 dark:bg-white px-3 py-1 text-[11px] font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                            <CheckCircle2 className="h-3 w-3" />
                            OK
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            )}

            {/* Nested children */}
            {block.children.length > 0 && (
              <div className="px-4 pb-3">
                <ConditionBlockList
                  blocks={block.children}
                  parentPath={path}
                  depth={depth + 1}
                  t={t}
                  operators={operators}
                  statuses={statuses}
                  severities={severities}
                  sourceFieldOptions={sourceFieldOptions}
                  categories={categories}
                  inventoryStructure={inventoryStructure}
                  nodes={nodes}
                  nodeTags={nodeTags}
                  inputCls={inputCls}
                  makeEmptyCondition={makeEmptyCondition}
                  onUpdate={onUpdate}
                  onRemove={(childPath) => {
                    onUpdate(path, (b) => {
                      const newChildren = b.children.filter((_, i) => i !== childPath[childPath.length - 1]);
                      if (newChildren.length === 0) {
                        return { ...b, children: [], result: { status: "compliant", message: "" } };
                      }
                      return { ...b, children: newChildren };
                    });
                  }}
                  onAddSibling={(_, type) => {
                    onUpdate(path, (b) => {
                      const newBlock: ConditionBlock = {
                        type,
                        logic: "and",
                        conditions: type === "else" ? [] : [makeEmptyCondition()],
                        children: [],
                        result: { status: "compliant", message: "" },
                      };
                      return { ...b, children: [...b.children, newBlock] };
                    });
                  }}
                  onAddNestedIf={(childPath) => {
                    onUpdate(childPath, (b) => {
                      const newIf: ConditionBlock = {
                        type: "if",
                        logic: "and",
                        conditions: [makeEmptyCondition()],
                        children: [],
                        result: { status: "compliant", message: "" },
                      };
                      return { ...b, children: [...b.children, newIf], result: null };
                    });
                  }}
                  onReorder={onReorder}
                  onDuplicate={onDuplicate}
                />
              </div>
            )}

            {/* Result (terminal block) */}
            {block.result && (() => {
              const resultKey = path.join("-");
              const isEditingResult = editingResult === resultKey;
              const st = block.result.status;
              const sev = block.result.severity;
              const msg = block.result.message;

              return isEditingResult ? (
                <div className="mx-4 mb-3 p-3 rounded-lg border-2 border-blue-300 dark:border-blue-500/40 bg-white dark:bg-slate-900 space-y-3">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {statuses.map((s) => (
                      <button
                        key={s.key}
                        onClick={() => onUpdate(path, (b) => ({
                          ...b,
                          result: { ...b.result!, status: s.key, severity: s.key === "non_compliant" ? (b.result?.severity || "medium") : undefined },
                        }))}
                        className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${st === s.key ? statusColors[s.key] : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-slate-300 dark:hover:border-slate-600"}`}
                      >
                        {t(`compliance_rules.status_${s.key}`)}
                      </button>
                    ))}
                  </div>

                  {st === "non_compliant" && (
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-xs text-slate-500 dark:text-slate-400 mr-1">{t("compliance_rules.resultSeverity")}:</span>
                      {severities.map((s) => (
                        <button
                          key={s.key}
                          onClick={() => onUpdate(path, (b) => ({ ...b, result: { ...b.result!, severity: s.key } }))}
                          className={`px-2 py-0.5 rounded text-xs font-medium border transition-colors ${sev === s.key ? severityColors[s.key] : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:border-slate-300 dark:hover:border-slate-600"}`}
                        >
                          {t(`compliance_rules.severity_${s.key}`)}
                        </button>
                      ))}
                    </div>
                  )}

                  <input
                    type="text"
                    value={msg}
                    onChange={(e) => onUpdate(path, (b) => ({ ...b, result: { ...b.result!, message: e.target.value } }))}
                    placeholder={t("compliance_rules.resultMessagePlaceholder")}
                    className={`${smallInput} w-full`}
                  />

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-semibold text-slate-400 uppercase">{t("compliance_rules.recommendation")}</label>
                    <textarea
                      value={block.result.recommendation || ""}
                      onChange={(e) => onUpdate(path, (b) => ({ ...b, result: { ...b.result!, recommendation: e.target.value || undefined } }))}
                      placeholder={t("compliance_rules.recommendationPlaceholder")}
                      rows={3}
                      className={`${smallInput} w-full font-mono text-xs resize-none`}
                    />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{t("compliance_rules.recommendationHelp")}</p>
                  </div>

                  <div className="flex justify-end">
                    <button onClick={() => setEditingResult(null)} className="flex items-center gap-1 rounded-md bg-slate-900 dark:bg-white px-3 py-1 text-[11px] font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                      <CheckCircle2 className="h-3 w-3" />
                      OK
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="mx-4 mb-3 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 transition-colors group space-y-1"
                  onClick={() => setEditingResult(resultKey)}
                >
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-md text-[11px] font-semibold border shrink-0 ${statusColors[st] || "border-slate-200 text-slate-400"}`}>
                      {t(`compliance_rules.status_${st}`)}
                    </span>
                    {st === "non_compliant" && sev && (
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border shrink-0 ${severityColors[sev] || ""}`}>
                        {t(`compliance_rules.severity_${sev}`)}
                      </span>
                    )}
                    {msg ? (
                      <span className="text-xs text-slate-600 dark:text-slate-400 truncate">{msg}</span>
                    ) : (
                      <span className="text-xs text-slate-400 dark:text-slate-500 italic">{t("compliance_rules.resultMessagePlaceholder")}</span>
                    )}
                    <Pencil className="h-3 w-3 text-slate-400 ml-auto opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                  {block.result.recommendation && (
                    <div className="flex items-start gap-1.5 pl-1">
                      <FileText className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400 truncate">{block.result.recommendation.split("\n")[0]}{block.result.recommendation.includes("\n") ? " ..." : ""}</span>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })}

      {/* Add ELSE IF / ELSE buttons */}
      {blocks.length > 0 && (
        <div className="flex items-center gap-2 pl-2">
          <button
            onClick={() => onAddSibling(parentPath, "else_if")}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 border border-dashed border-slate-300 dark:border-slate-600 transition-colors"
          >
            <Plus className="h-3 w-3" />
            {t("compliance_rules.addElseIf")}
          </button>
          {!hasElse && (
            <button
              onClick={() => onAddSibling(parentPath, "else")}
              className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700/50 border border-dashed border-slate-300 dark:border-slate-600 transition-colors"
            >
              <Plus className="h-3 w-3" />
              {t("compliance_rules.addElse")}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function ComplianceRuleEditPage() {
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const { current } = useAppContext();
  const ruleId = params.id as string;

  const [rule, setRule] = useState<RuleDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  // Edit fields
  const [identifier, setIdentifier] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [folders, setFolders] = useState<FolderOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Data sources
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [editingSourceIdx, setEditingSourceIdx] = useState<number | null>(null);
  const [savingSource, setSavingSource] = useState(false);
  const [savedSource, setSavedSource] = useState(false);
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [inventoryStructure, setInventoryStructure] = useState<InventoryStructure[]>([]);
  const [nodeTags, setNodeTags] = useState<NodeTagItem[]>([]);

  // Test
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [testNodeId, setTestNodeId] = useState<number | null>(null);
  const [testNodeSearch, setTestNodeSearch] = useState("");
  const [showNodeDropdown, setShowNodeDropdown] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<Record<string, unknown> | null>(null);

  // Conditions
  const [conditionTree, setConditionTree] = useState<ConditionTree | null>(null);
  const [savingConditions, setSavingConditions] = useState(false);
  const [savedConditions, setSavedConditions] = useState(false);

  // Evaluate
  const [showEvalModal, setShowEvalModal] = useState(false);
  const [evalNodeSearch, setEvalNodeSearch] = useState("");
  const [evaluating, setEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<Record<string, unknown> | null>(null);

  // Multi-row messages
  const [multiRowMessages, setMultiRowMessages] = useState<Record<string, string>>({});
  const [showMultiRowModal, setShowMultiRowModal] = useState(false);
  const [savingMultiRow, setSavingMultiRow] = useState(false);

  // Help
  const [showConditionsHelp, setShowConditionsHelp] = useState(false);

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const loadRule = useCallback(async () => {
    const res = await fetch(`/api/compliance-rules/${ruleId}`);
    if (res.ok) {
      const data: RuleDetail = await res.json();
      setRule(data);
      setIdentifier(data.identifier || "");
      setName(data.name);
      setDescription(data.description || "");
      setEnabled(data.enabled);
      setFolderId(data.folderId);
      setDataSources(data.dataSources || []);
      setConditionTree(data.conditionTree || null);
      setMultiRowMessages(data.multiRowMessages || {});
    }
    setLoading(false);
  }, [ruleId]);

  const loadCategories = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/inventory-categories?context=${current.id}`);
    if (res.ok) setCategories(await res.json());
  }, [current]);

  const loadInventoryStructure = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/inventory-categories/structure?context=${current.id}`);
    if (res.ok) setInventoryStructure(await res.json());
  }, [current]);

  const loadNodes = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/nodes?context=${current.id}`);
    if (res.ok) setNodes(await res.json());
  }, [current]);

  const loadFolders = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/compliance-rules/tree?context=${current.id}`);
    if (!res.ok) return;
    const tree = await res.json();
    const flat: FolderOption[] = [];
    const flatten = (folders: { id: number; name: string; children: unknown[] }[], depth: number) => {
      for (const f of folders) {
        flat.push({ id: f.id, name: f.name, depth });
        if (f.children) flatten(f.children as typeof folders, depth + 1);
      }
    };
    flatten(tree.folders || [], 0);
    setFolders(flat);
  }, [current]);

  useEffect(() => { loadRule(); }, [loadRule]);

  useEffect(() => {
    loadFolders();
  }, [loadFolders]);

  useEffect(() => {
    if (activeTab === "datasource" || activeTab === "conditions") {
      loadNodes();
    }
    if (activeTab === "datasource") {
      loadCategories();
    }
    if (activeTab === "conditions") {
      loadInventoryStructure();
      if (current) fetch(`/api/node-tags?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setNodeTags);
    }
  }, [activeTab, loadCategories, loadNodes, loadInventoryStructure]);

  const saveGeneral = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/compliance-rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: identifier.trim() || null, name: name.trim(), description: description.trim() || null, enabled, folderId }),
      });
      if (res.ok) {
        const data = await res.json();
        setRule(data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally { setSaving(false); }
  };

  const saveSource = async () => {
    setSavingSource(true);
    try {
      const res = await fetch(`/api/compliance-rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataSources }),
      });
      if (res.ok) {
        const data = await res.json();
        setRule(data);
        setEditingSourceIdx(null);
        setSavedSource(true);
        setTimeout(() => setSavedSource(false), 2000);
      }
    } finally { setSavingSource(false); }
  };

  const runTest = async () => {
    if (!testNodeId) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`/api/compliance-rules/${ruleId}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId: testNodeId }),
      });
      setTestResult(await res.json());
    } finally { setTesting(false); }
  };

  const handleDelete = async () => {
    await fetch(`/api/compliance-rules/${ruleId}`, { method: "DELETE" });
    router.push("/compliance/rules");
  };

  const saveConditions = async () => {
    setSavingConditions(true);
    try {
      const res = await fetch(`/api/compliance-rules/${ruleId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conditionTree }),
      });
      if (res.ok) {
        const data = await res.json();
        setRule(data);
        setSavedConditions(true);
        setTimeout(() => setSavedConditions(false), 2000);
      }
    } finally { setSavingConditions(false); }
  };

  const [debugMode, setDebugMode] = useState(false);
  const runEvaluate = async (nodeId: number, debug = false) => {
    setEvaluating(true);
    setEvalResult(null);
    setDebugMode(debug);
    try {
      const res = await fetch(`/api/compliance-rules/${ruleId}/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeId, debug }),
      });
      setEvalResult(await res.json());
    } finally { setEvaluating(false); }
  };

  const filteredEvalNodes = nodes.filter((n) => {
    const q = evalNodeSearch.toLowerCase();
    return !q || (n.name && n.name.toLowerCase().includes(q)) || n.ipAddress.includes(q) || (n.hostname && n.hostname.toLowerCase().includes(q));
  });

  const operators = [
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

  const statuses: { key: ConditionResult["status"]; color: string }[] = [
    { key: "compliant", color: "emerald" },
    { key: "non_compliant", color: "red" },
    { key: "error", color: "amber" },
    { key: "not_applicable", color: "slate" },
  ];

  const severities: { key: NonNullable<ConditionResult["severity"]>; color: string }[] = [
    { key: "info", color: "blue" },
    { key: "low", color: "sky" },
    { key: "medium", color: "amber" },
    { key: "high", color: "orange" },
    { key: "critical", color: "red" },
  ];

  // Build available source fields for conditions from dataSources
  const sourceFieldOptions = useMemo(() => {
    const options: { source: string; field: string; label: string }[] = [];
    for (const src of dataSources) {
      options.push({ source: src.name, field: "$value", label: `${src.name}.$value` });
      if (src.resultMode === "match") {
        options.push({ source: src.name, field: "$match", label: `${src.name}.$match` });
      }
      if (src.resultMode === "count" || src.resultMode === "capture") {
        options.push({ source: src.name, field: "$count", label: `${src.name}.$count` });
      }
      if (src.resultMode === "capture" && src.valueMap) {
        for (const vm of src.valueMap) {
          options.push({ source: src.name, field: vm.label, label: `${src.name}.${vm.label}` });
        }
        if (src.keyGroup) {
          options.push({ source: src.name, field: "$key", label: `${src.name}.$key` });
        }
      }
    }
    return options;
  }, [dataSources]);

  const makeEmptyCondition = (): ConditionItem => {
    if (sourceFieldOptions.length > 0) {
      return { type: "source", source: sourceFieldOptions[0].source, field: sourceFieldOptions[0].field, operator: "equals", value: "" };
    }
    return { type: "inventory", inventoryCategoryId: null, inventoryKey: "", inventoryColumn: "Value#1", operator: "equals", value: "" };
  };

  const makeEmptyBlock = (type: ConditionBlock["type"]): ConditionBlock => ({
    type,
    logic: "and",
    conditions: type === "else" ? [] : [makeEmptyCondition()],
    children: [],
    result: { status: "compliant", message: "" },
  });

  const cloneTree = (tree: ConditionTree): ConditionTree => JSON.parse(JSON.stringify(tree));

  const updateBlockAtPath = (tree: ConditionTree, path: number[], updater: (b: ConditionBlock) => ConditionBlock): ConditionTree => {
    const t2 = cloneTree(tree);
    let blocks = t2.blocks;
    for (let i = 0; i < path.length - 1; i++) blocks = blocks[path[i]].children;
    blocks[path[path.length - 1]] = updater(blocks[path[path.length - 1]]);
    return t2;
  };

  const addBlockAtPath = (tree: ConditionTree, parentPath: number[], type: "else_if" | "else"): ConditionTree => {
    const t2 = cloneTree(tree);
    let blocks = t2.blocks;
    for (const idx of parentPath) blocks = blocks[idx].children;
    blocks.push(makeEmptyBlock(type));
    return t2;
  };

  const removeBlockAtPath = (tree: ConditionTree, path: number[]): ConditionTree => {
    const t2 = cloneTree(tree);
    let blocks = t2.blocks;
    for (let i = 0; i < path.length - 1; i++) blocks = blocks[path[i]].children;
    blocks.splice(path[path.length - 1], 1);
    return t2;
  };

  const addNestedIfAtPath = (tree: ConditionTree, path: number[]): ConditionTree => {
    const t2 = cloneTree(tree);
    let blocks = t2.blocks;
    for (let i = 0; i < path.length - 1; i++) blocks = blocks[path[i]].children;
    const block = blocks[path[path.length - 1]];
    block.children.push(makeEmptyBlock("if"));
    block.result = null;
    return t2;
  };

  const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
  const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300";

  const tabs = [
    { key: "general" as TabKey, label: t("compliance_rules.tabGeneral"), icon: <ClipboardCheck className="h-4 w-4" /> },
    { key: "datasource" as TabKey, label: t("compliance_rules.tabDatasource"), icon: <Database className="h-4 w-4" /> },
    { key: "conditions" as TabKey, label: t("compliance_rules.tabConditions"), icon: <Filter className="h-4 w-4" /> },
  ];

  const filteredNodes = nodes.filter((n) => {
    const q = testNodeSearch.toLowerCase();
    return !q || (n.name && n.name.toLowerCase().includes(q)) || n.ipAddress.includes(q) || (n.hostname && n.hostname.toLowerCase().includes(q));
  });
  const selectedNode = nodes.find((n) => n.id === testNodeId);

  if (loading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" /></div>;
  }
  if (!rule) {
    return <div className="flex items-center justify-center py-20"><p className="text-sm text-slate-500">{t("common.noResult")}</p></div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/compliance/rules")} className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{rule.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {t("compliance_rules.editRule")}
              {rule.description && <span> | {rule.description}</span>}
            </p>
          </div>
        </div>
        {(saved || savedSource || savedConditions) && (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            {t("compliance_rules.saved")}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 shrink-0">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === tab.key ? "border-slate-900 dark:border-white text-slate-900 dark:text-white" : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600"}`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* General tab */}
      {activeTab === "general" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className={labelCls}>{t("compliance_rules.identifier")}</label>
                <input type="text" value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder={t("compliance_rules.identifierPlaceholder")} className={`${inputCls} font-mono`} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>{t("compliance_rules.name")}</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("compliance_rules.namePlaceholder")} className={inputCls} />
              </div>
              <div className="space-y-1.5">
                <label className={labelCls}>{t("compliance_rules.description")}</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder={t("compliance_rules.descriptionPlaceholder")} className={`${inputCls} resize-none`} />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <button type="button" onClick={() => setEnabled(!enabled)}>
                  {enabled ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                </button>
                <span className="text-sm text-slate-700 dark:text-slate-300">{enabled ? t("compliance_rules.enabled") : t("compliance_rules.disabled")}</span>
              </label>
              <div className="space-y-1.5">
                <label className={labelCls}>
                  <span className="flex items-center gap-2"><FolderOpen className="h-4 w-4" />{t("compliance_rules.folder")}</span>
                </label>
                <select
                  value={folderId ?? ""}
                  onChange={(e) => setFolderId(e.target.value ? Number(e.target.value) : null)}
                  className={inputCls}
                >
                  <option value="">{t("compliance_rules.noFolder")}</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {"—".repeat(f.depth)} {f.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t("compliance_rules.folderHelp")}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
              <button onClick={saveGeneral} disabled={saving || !name.trim()} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("common.save")}
              </button>
            </div>
          </div>
          <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-6 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_rules.cloneRule")}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("compliance_rules.cloneRuleDesc")}</p>
                </div>
                <button
                  onClick={async () => {
                    const res = await fetch(`/api/compliance-rules/${ruleId}/clone`, { method: "POST" });
                    if (res.ok) {
                      const cloned = await res.json();
                      window.location.href = `/compliance/rules/${cloned.id}`;
                    }
                  }}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Copy className="h-4 w-4" />
                  {t("compliance_rules.cloneRule")}
                </button>
              </div>
            </div>
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">{t("compliance_rules.dangerZone")}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("compliance_rules.dangerZoneDesc")}</p>
                </div>
                <button onClick={() => setDeleteConfirm(true)} className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                  <Trash2 className="h-4 w-4" />
                  {t("common.delete")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Data source tab */}
      {activeTab === "datasource" && (
        <div className="space-y-6">
          {/* Info banner */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 px-4 py-3 text-xs text-blue-700 dark:text-blue-300">
            {t("compliance_rules.inventoryHint")}
          </div>

          {/* Sources list */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_rules.dataSources")}</h3>
                <button
                  onClick={() => {
                    setDataSources([...dataSources, { name: "", type: "collection", command: "", regex: "", resultMode: "capture" }]);
                    setEditingSourceIdx(dataSources.length);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  {t("compliance_rules.addSource")}
                </button>
              </div>

              {dataSources.length === 0 && (
                <div className="text-center py-8">
                  <Database className="h-8 w-8 text-slate-300 dark:text-slate-600 mx-auto mb-2" />
                  <p className="text-sm text-slate-400 dark:text-slate-500">{t("compliance_rules.noSources")}</p>
                </div>
              )}

              {dataSources.map((src, idx) => (
                <div key={idx} className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                  {/* Source header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${src.type === "ssh" ? "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300" : "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"}`}>
                        {src.type}
                      </span>
                      {src.multiRow && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300">
                          {t("compliance.multiRow")}
                        </span>
                      )}
                      <span className="text-sm font-mono font-semibold text-slate-900 dark:text-slate-100">{src.name || "(sans nom)"}</span>
                      {src.command && <span className="text-xs text-slate-400 dark:text-slate-500 truncate max-w-[300px]">{src.command}</span>}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditingSourceIdx(editingSourceIdx === idx ? null : idx)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                        <Pencil className="h-3.5 w-3.5 text-slate-400" />
                      </button>
                      <button onClick={() => { setDataSources(dataSources.filter((_, i) => i !== idx)); if (editingSourceIdx === idx) setEditingSourceIdx(null); }} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                        <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
                      </button>
                    </div>
                  </div>

                  {/* Source edit form */}
                  {editingSourceIdx === idx && (
                    <div className="p-4 space-y-4 border-t border-slate-200 dark:border-slate-700">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className={labelCls}>{t("compliance_rules.sourceName")}</label>
                          <input type="text" value={src.name} onChange={(e) => { const ns = [...dataSources]; ns[idx] = { ...ns[idx], name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") }; setDataSources(ns); }} placeholder={t("compliance_rules.sourceNamePlaceholder")} className={`${inputCls} font-mono`} />
                        </div>
                        <div className="space-y-1.5">
                          <label className={labelCls}>{t("compliance_rules.sourceType")}</label>
                          <div className="flex gap-2">
                            {(["collection", "ssh"] as const).map((tp) => (
                              <button key={tp} onClick={() => { const ns = [...dataSources]; ns[idx] = { ...ns[idx], type: tp }; setDataSources(ns); }}
                                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${src.type === tp ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                                {tp === "collection" ? "Collection" : "SSH"}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>{t("compliance_rules.command")}</label>
                        <input type="text" value={src.command} onChange={(e) => { const ns = [...dataSources]; ns[idx] = { ...ns[idx], command: e.target.value }; setDataSources(ns); }} placeholder="show hostname" className={`${inputCls} font-mono`} />
                      </div>
                      {src.type === "collection" && (
                        <div className="space-y-1.5">
                          <label className={labelCls}>Tag</label>
                          <input type="text" value={src.tag || ""} onChange={(e) => { const ns = [...dataSources]; ns[idx] = { ...ns[idx], tag: e.target.value || null }; setDataSources(ns); }} placeholder="latest" className={inputCls} />
                        </div>
                      )}
                      <div className="space-y-1.5">
                        <label className={labelCls}>Regex</label>
                        <input type="text" value={src.regex || ""} onChange={(e) => { const ns = [...dataSources]; ns[idx] = { ...ns[idx], regex: e.target.value || null }; setDataSources(ns); }} placeholder="^(.+)$" className={`${inputCls} font-mono`} />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelCls}>{t("compliance_rules.resultMode")}</label>
                        <div className="flex gap-2">
                          {(["capture", "match", "count"] as const).map((rm) => (
                            <button key={rm} onClick={() => { const ns = [...dataSources]; ns[idx] = { ...ns[idx], resultMode: rm }; setDataSources(ns); }}
                              className={`flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${src.resultMode === rm ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                              {rm}
                            </button>
                          ))}
                        </div>
                      </div>
                      {src.resultMode === "capture" && src.regex && (() => {
                        let gc = 0, esc2 = false, inCC2 = false;
                        for (let i = 0; i < (src.regex || "").length; i++) {
                          const ch = (src.regex || "")[i];
                          if (esc2) { esc2 = false; continue; }
                          if (ch === "\\") { esc2 = true; continue; }
                          if (ch === "[") { inCC2 = true; continue; }
                          if (ch === "]") { inCC2 = false; continue; }
                          if (inCC2) continue;
                          if (ch === "(" && (src.regex || "")[i + 1] !== "?") gc++;
                        }
                        if (gc === 0) return null;
                        const vm = src.valueMap || [];
                        return (
                          <div className="space-y-1.5">
                            <label className={labelCls}>{t("compliance_rules.captureGroups")} ({gc})</label>
                            <div className="rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                              {Array.from({ length: gc }, (_, gi) => {
                                const existing = vm.find((v) => v.group === gi + 1);
                                const isKey = src.keyGroup === gi + 1;
                                return (
                                  <div key={gi} className="flex items-center gap-3 px-3 py-2">
                                    <span className="text-xs text-slate-400 font-mono w-6">${gi + 1}</span>
                                    <input
                                      type="radio"
                                      name={`keygroup-${idx}`}
                                      checked={isKey}
                                      onChange={() => { const ns = [...dataSources]; ns[idx] = { ...ns[idx], keyGroup: isKey ? null : gi + 1 }; setDataSources(ns); }}
                                      className="h-3.5 w-3.5"
                                      title="Key"
                                    />
                                    <span className="text-[10px] text-slate-400 w-6">{isKey ? "Key" : ""}</span>
                                    <input
                                      type="text"
                                      value={existing?.label || ""}
                                      onChange={(e) => {
                                        const ns = [...dataSources];
                                        const newVm = [...(ns[idx].valueMap || [])];
                                        const eidx = newVm.findIndex((v) => v.group === gi + 1);
                                        if (eidx >= 0) newVm[eidx] = { ...newVm[eidx], label: e.target.value };
                                        else newVm.push({ group: gi + 1, label: e.target.value });
                                        ns[idx] = { ...ns[idx], valueMap: newVm };
                                        setDataSources(ns);
                                      }}
                                      placeholder={`Value#${gi + 1}`}
                                      className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs text-slate-900 dark:text-slate-100 font-mono"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })()}
                      {/* Multi-row toggle */}
                      {src.resultMode === "capture" && src.valueMap && src.valueMap.length > 0 && (
                        <div className="space-y-1.5">
                          <label className={labelCls}>{t("compliance.multiRow")}</label>
                          <div className="flex gap-2">
                            {([false, true] as const).map((val) => (
                              <button key={String(val)} onClick={() => { const ns = [...dataSources]; ns[idx] = { ...ns[idx], multiRow: val }; setDataSources(ns); }}
                                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${(src.multiRow ?? false) === val ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"}`}>
                                {val ? t("compliance.multiRowYes") : t("compliance.multiRowNo")}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {/* Save button */}
              <div className="flex items-center justify-end gap-2 pt-2">
                {savedSource && <span className="text-xs text-emerald-600 dark:text-emerald-400">{t("common.saved")}</span>}
                <button onClick={saveSource} disabled={savingSource} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                  {savingSource && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("common.save")}
                </button>
              </div>
            </div>
          </div>

          {/* Test section */}
          {dataSources.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="p-6 space-y-4">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_rules.testTitle")}</h3>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <button onClick={() => setShowNodeDropdown(!showNodeDropdown)} className={`${inputCls} flex items-center justify-between text-left`}>
                      <span className={selectedNode ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}>
                        {selectedNode ? `${selectedNode.name || selectedNode.hostname || selectedNode.ipAddress}${(selectedNode.name || selectedNode.hostname) ? ` — ${selectedNode.ipAddress}` : ""}` : t("compliance_rules.testSelectNode")}
                      </span>
                      <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                    </button>
                    {showNodeDropdown && (
                      <div className="absolute z-20 mt-1 w-full max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg">
                        <div className="p-2">
                          <div className="relative">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                            <input type="text" value={testNodeSearch} onChange={(e) => setTestNodeSearch(e.target.value)} placeholder={t("compliance_rules.testSearchNode")} className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 pl-8 pr-3 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none" />
                          </div>
                        </div>
                        {filteredNodes.slice(0, 20).map((n) => (
                          <button key={n.id} onClick={() => { setTestNodeId(n.id); setShowNodeDropdown(false); setTestNodeSearch(""); }} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                            <Server className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{n.name || n.hostname || n.ipAddress}</span>
                            {(n.name || n.hostname) && <span className="text-xs text-slate-400 truncate">{n.ipAddress}</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button onClick={runTest} disabled={!testNodeId || testing} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors shrink-0">
                    {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                    {t("compliance_rules.testExecute")}
                  </button>
                </div>
                {testResult && (
                  <div className="space-y-3">
                    {!(testResult as Record<string, unknown>).success ? (
                      <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5">
                        <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-sm text-red-700 dark:text-red-400">{String((testResult as Record<string, unknown>).error)}</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-4 w-4 text-emerald-500" />
                          <span className="text-sm font-medium text-emerald-700 dark:text-emerald-400">{t("compliance_rules.testSuccess")}</span>
                        </div>
                        {!!(testResult as Record<string, unknown>).fields && (() => {
                          const fields = (testResult as Record<string, unknown>).fields as Record<string, unknown>;
                          // Detect $rows for multi-row table display
                          const rowEntries = Object.entries(fields).filter(([k]) => k.endsWith(".$rows"));
                          const scalarFields = Object.entries(fields).filter(([k, v]) => !Array.isArray(v));

                          return (
                            <div className="space-y-3">
                              {/* Multi-row tables */}
                              {rowEntries.map(([k, v]) => {
                                const srcName = k.replace(".$rows", "");
                                const rows = v as Record<string, string>[];
                                if (!rows.length) return null;
                                const cols = Object.keys(rows[0]).filter((c) => c !== "_key");
                                return (
                                  <div key={k}>
                                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1">{srcName} — {rows.length} {t("compliance.rows")}</p>
                                    <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-x-auto">
                                      <table className="w-full text-sm">
                                        <thead><tr className="bg-slate-50 dark:bg-slate-800/50">
                                          {rows[0]._key !== undefined && <th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Key</th>}
                                          {cols.map((c) => <th key={c} className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{c}</th>)}
                                        </tr></thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                          {rows.map((row, ri) => (
                                            <tr key={ri}>
                                              {row._key !== undefined && <td className="px-3 py-2 font-mono text-xs font-semibold text-blue-600 dark:text-blue-400">{row._key}</td>}
                                              {cols.map((c) => <td key={c} className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300">{row[c] ?? ""}</td>)}
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                );
                              })}
                              {/* Scalar fields */}
                              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead><tr className="bg-slate-50 dark:bg-slate-800/50"><th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">Variable</th><th className="px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">{t("compliance_rules.fieldValue")}</th></tr></thead>
                                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {scalarFields.map(([k, v]) => (
                                      <tr key={k}><td className="px-3 py-2 font-mono text-xs text-blue-600 dark:text-blue-400">{k}</td><td className="px-3 py-2 font-mono text-xs text-slate-700 dark:text-slate-300 max-w-md truncate">{String(v ?? "null")}</td></tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Conditions tab */}
      {activeTab === "conditions" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_rules.conditionsEditor")}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("compliance_rules.conditionsHelp")}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowConditionsHelp(true)}
                    className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    title={t("compliance_rules.conditionsHelpTitle")}
                  >
                    <HelpCircle className="h-4 w-4" />
                  </button>
                  {dataSources.some((s) => s.multiRow) && (
                    <button
                      onClick={() => setShowMultiRowModal(true)}
                      className="flex items-center gap-2 rounded-lg border border-amber-300 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-2.5 text-sm font-medium text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors"
                    >
                      {t("compliance_rules.multiRowTitle")}
                    </button>
                  )}
                  {conditionTree && (
                    <button
                      onClick={() => { setShowEvalModal(true); setEvalResult(null); setEvalNodeSearch(""); }}
                      className="flex items-center gap-2 rounded-lg bg-indigo-600 dark:bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 dark:hover:bg-indigo-600 transition-colors"
                    >
                      <Play className="h-4 w-4" />
                      {t("compliance_rules.evaluateRule")}
                    </button>
                  )}
                  {conditionTree && (
                    <button
                      onClick={async () => {
                        setConditionTree(null);
                        setSavingConditions(true);
                        try {
                          const res = await fetch(`/api/compliance-rules/${ruleId}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ conditionTree: null }),
                          });
                          if (res.ok) {
                            setRule(await res.json());
                            setSavedConditions(true);
                            setTimeout(() => setSavedConditions(false), 2000);
                          }
                        } finally { setSavingConditions(false); }
                      }}
                      className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 px-3 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      {t("compliance_rules.removeAllConditions")}
                    </button>
                  )}
                  {conditionTree && (
                    <button onClick={saveConditions} disabled={savingConditions} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                      {savingConditions ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {t("common.save")}
                    </button>
                  )}
                </div>
              </div>

              {!conditionTree ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                    <Filter className="h-5 w-5 text-slate-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("compliance_rules.conditionsNotApplied")}</p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{t("compliance_rules.conditionsNotAppliedDesc")}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setConditionTree({ blocks: [makeEmptyBlock("if")] })}
                    className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                    {t("compliance_rules.addCondition")}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <ConditionBlockList
                    blocks={conditionTree.blocks}
                    parentPath={[]}
                    depth={0}
                    t={t}
                    operators={operators}
                    statuses={statuses}
                    severities={severities}
                    sourceFieldOptions={sourceFieldOptions}
                    categories={categories}
                    inventoryStructure={inventoryStructure}
                    nodes={nodes}
                    nodeTags={nodeTags}
                    inputCls={inputCls}
                    makeEmptyCondition={makeEmptyCondition}
                    onUpdate={(path, updater) => setConditionTree((prev) => prev ? updateBlockAtPath(prev, path, updater) : prev)}
                    onRemove={(path) => {
                      setConditionTree((prev) => {
                        if (!prev) return prev;
                        const t2 = removeBlockAtPath(prev, path);
                        if (t2.blocks.length === 0) return null;
                        return t2;
                      });
                    }}
                    onAddSibling={(parentPath, type) => setConditionTree((prev) => prev ? addBlockAtPath(prev, parentPath, type) : prev)}
                    onAddNestedIf={(path) => setConditionTree((prev) => prev ? addNestedIfAtPath(prev, path) : prev)}
                    onReorder={(parentPath, fromIdx, toIdx) => {
                      setConditionTree((prev) => {
                        if (!prev) return prev;
                        const t2 = JSON.parse(JSON.stringify(prev)) as ConditionTree;
                        let blocks = t2.blocks;
                        for (const idx of parentPath) blocks = blocks[idx].children;
                        const [moved] = blocks.splice(fromIdx, 1);
                        blocks.splice(toIdx, 0, moved);
                        blocks.forEach((b, i) => {
                          if (i === 0) b.type = "if";
                          else if (b.type === "if") b.type = "else_if";
                        });
                        return t2;
                      });
                    }}
                    onDuplicate={(path) => {
                      setConditionTree((prev) => {
                        if (!prev) return prev;
                        const t2 = JSON.parse(JSON.stringify(prev)) as ConditionTree;
                        let blocks = t2.blocks;
                        for (let i = 0; i < path.length - 1; i++) blocks = blocks[path[i]].children;
                        const idx = path[path.length - 1];
                        const clone = JSON.parse(JSON.stringify(blocks[idx])) as ConditionBlock;
                        clone.type = "else_if";
                        // Clear nodeId on cloned conditions so user can reassign
                        clone.conditions.forEach((c) => { c.nodeId = null; });
                        blocks.splice(idx + 1, 0, clone);
                        return t2;
                      });
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Multi-row messages modal */}
      {showMultiRowModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_rules.multiRowTitle")}</h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("compliance_rules.multiRowDesc")}</p>
              </div>
              <button onClick={() => setShowMultiRowModal(false)} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4">
              {(["compliant", "non_compliant", "error", "not_applicable"] as const).map((status) => (
                <div key={status} className={`p-4 rounded-lg border ${statusColors[status]}`}>
                  <label className="flex items-center gap-2 text-sm font-medium mb-2">
                    {status === "compliant" && <CheckCircle className="h-4 w-4 text-emerald-500" />}
                    {status === "non_compliant" && <AlertCircle className="h-4 w-4 text-red-500" />}
                    {status === "error" && <AlertCircle className="h-4 w-4 text-amber-500" />}
                    {status === "not_applicable" && <Filter className="h-4 w-4 text-slate-400" />}
                    {t(`compliance_rules.status_${status}`)}
                  </label>
                  <input
                    type="text"
                    value={multiRowMessages[status] || ""}
                    onChange={(e) => setMultiRowMessages((prev) => ({ ...prev, [status]: e.target.value }))}
                    placeholder={t("compliance_rules.multiRowMsgPlaceholder")}
                    className={inputCls}
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => setShowMultiRowModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                disabled={savingMultiRow}
                onClick={async () => {
                  setSavingMultiRow(true);
                  try {
                    const cleaned: Record<string, string> = {};
                    for (const [k, v] of Object.entries(multiRowMessages)) {
                      if (v.trim()) cleaned[k] = v.trim();
                    }
                    const res = await fetch(`/api/compliance-rules/${ruleId}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ multiRowMessages: Object.keys(cleaned).length > 0 ? cleaned : null }),
                    });
                    if (res.ok) {
                      setRule(await res.json());
                      setSavedConditions(true);
                      setTimeout(() => setSavedConditions(false), 2000);
                      setShowMultiRowModal(false);
                    }
                  } finally { setSavingMultiRow(false); }
                }}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {savingMultiRow ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("common.save")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Conditions help modal */}
      {showConditionsHelp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-xl p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_rules.conditionsHelpTitle")}</h3>
              <button onClick={() => setShowConditionsHelp(false)} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 text-sm text-slate-600 dark:text-slate-300">
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("compliance_rules.helpBlocksTitle")}</h4>
                <p>{t("compliance_rules.helpBlocksDesc")}</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("compliance_rules.helpLogicTitle")}</h4>
                <p>{t("compliance_rules.helpLogicDesc")}</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("compliance_rules.helpNestingTitle")}</h4>
                <p>{t("compliance_rules.helpNestingDesc")}</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("compliance_rules.helpResultTitle")}</h4>
                <p>{t("compliance_rules.helpResultDesc")}</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("compliance_rules.helpMultiRowTitle")}</h4>
                <p>{t("compliance_rules.helpMultiRowDesc")}</p>
              </div>
              <div>
                <h4 className="font-semibold text-slate-900 dark:text-slate-100 mb-1">{t("compliance_rules.helpSeverityTitle")}</h4>
                <p>{t("compliance_rules.helpSeverityDesc")}</p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button onClick={() => setShowConditionsHelp(false)} className="rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                {t("common.close")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Evaluate modal */}
      {showEvalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className={`bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full p-6 space-y-4 max-h-[90vh] overflow-y-auto ${debugMode ? "max-w-5xl" : "max-w-2xl"}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_rules.evaluateRule")}</h3>
              <button onClick={() => setShowEvalModal(false)} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>

            {!evalResult ? (
              <div className="space-y-3">
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("compliance_rules.evaluateSelectNode")}</p>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="text"
                    value={evalNodeSearch}
                    onChange={(e) => setEvalNodeSearch(e.target.value)}
                    placeholder={t("compliance_rules.testSearchNode")}
                    className={`${inputCls} pl-9`}
                  />
                </div>
                <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredEvalNodes.length === 0 ? (
                    <div className="px-3 py-6 text-center text-sm text-slate-400">{t("compliance_rules.testNoNodes")}</div>
                  ) : (
                    filteredEvalNodes.slice(0, 30).map((n) => (
                      <div key={n.id} className="flex items-center gap-1 px-2 py-1.5">
                        <button
                          onClick={() => runEvaluate(n.id, false)}
                          disabled={evaluating}
                          className="flex-1 flex items-center gap-3 px-2 py-1.5 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                        >
                          {n.manufacturer?.logo ? (
                            <img src={`/api/logos/${n.manufacturer.logo}`} alt={n.manufacturer.name} className="h-5 w-5 object-contain shrink-0" />
                          ) : (
                            <Server className="h-4 w-4 text-slate-400 shrink-0" />
                          )}
                          <div className="text-left min-w-0">
                            <p className="font-medium truncate">{n.name || n.hostname || n.ipAddress}</p>
                            {(n.name || n.hostname) && <p className="text-xs text-slate-400 truncate">{n.ipAddress}</p>}
                          </div>
                          {evaluating && <Loader2 className="h-4 w-4 animate-spin text-slate-400 ml-auto shrink-0" />}
                        </button>
                        <button
                          onClick={() => runEvaluate(n.id, true)}
                          disabled={evaluating}
                          title={t("compliance.debug")}
                          className="shrink-0 px-2 py-1.5 rounded-lg text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors disabled:opacity-50"
                        >
                          Debug
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {!(evalResult as Record<string, unknown>).success ? (
                  <div className="flex items-start gap-3 p-4 rounded-lg border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5">
                    <AlertCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700 dark:text-red-400">{String((evalResult as Record<string, unknown>).error)}</p>
                  </div>
                ) : (() => {
                  const er = evalResult as Record<string, unknown>;
                  const nodeInfo = er.node as Record<string, unknown> | undefined;
                  const evaluation = er.evaluation as Record<string, unknown> | null;
                  const status = evaluation?.status as string | undefined;
                  const severity = evaluation?.severity as string | undefined;
                  const message = evaluation?.message as string | undefined;

                  const renderEvalBadge = (ev: Record<string, unknown> | null) => {
                    if (!ev) return <span className="text-xs text-slate-400">—</span>;
                    const s = ev.status as string;
                    const sev = ev.severity as string | undefined;
                    return (
                      <div className="flex items-center gap-1.5">
                        {s === "compliant" && <CheckCircle className="h-3.5 w-3.5 text-emerald-500" />}
                        {s === "non_compliant" && <AlertCircle className="h-3.5 w-3.5 text-red-500" />}
                        {s === "error" && <AlertCircle className="h-3.5 w-3.5 text-amber-500" />}
                        {s === "not_applicable" && <Filter className="h-3.5 w-3.5 text-slate-400" />}
                        <span className="text-xs font-medium">{t(`compliance_rules.status_${s}`)}</span>
                        {sev && <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${severityColors[sev] || ""}`}>{t(`compliance_rules.severity_${sev}`)}</span>}
                      </div>
                    );
                  };

                  return (
                    <div className="space-y-3">
                      {/* Node info */}
                      {nodeInfo && (
                        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                          <Server className="h-4 w-4" />
                          <span>{String(nodeInfo.name)}</span>
                          <span className="text-xs">({String(nodeInfo.ipAddress)})</span>
                        </div>
                      )}

                      {/* Aggregated result */}
                      {evaluation ? (
                        <div className={`p-4 rounded-lg border ${statusColors[status || ""] || "border-slate-200 dark:border-slate-700"}`}>
                          <div className="flex items-center gap-2 mb-2">
                            {status === "compliant" && <CheckCircle className="h-5 w-5 text-emerald-500" />}
                            {status === "non_compliant" && <AlertCircle className="h-5 w-5 text-red-500" />}
                            {status === "error" && <AlertCircle className="h-5 w-5 text-amber-500" />}
                            {status === "not_applicable" && <Filter className="h-5 w-5 text-slate-400" />}
                            <span className="text-sm font-semibold">{t(`compliance_rules.status_${status}`)}</span>
                            {severity && (
                              <span className={`px-2 py-0.5 rounded text-xs font-medium border ${severityColors[severity] || ""}`}>
                                {t(`compliance_rules.severity_${severity}`)}
                              </span>
                            )}
                          </div>
                          {message && <p className="text-sm text-slate-600 dark:text-slate-300 whitespace-pre-line">{message}</p>}
                          {/* Multi-row per-line results */}
                          {(evaluation.multiRowResults as { key: string | number; evaluation: Record<string, unknown> }[] | undefined)?.map((rr, ri) => {
                            const rs = rr.evaluation?.status as string;
                            const rm = rr.evaluation?.message as string | undefined;
                            return (
                              <div key={ri} className={`mt-2 flex items-start gap-2 rounded-lg px-3 py-2 border text-xs ${
                                rs === "compliant" ? "border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/5"
                                : rs === "non_compliant" ? "border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5"
                                : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                              }`}>
                                {rs === "compliant" ? <CheckCircle className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" /> : <AlertCircle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />}
                                <div>
                                  <span className="font-semibold text-slate-700 dark:text-slate-200">[{String(rr.key)}]</span>
                                  <span className="ml-1.5 text-slate-500 dark:text-slate-400">{t(`compliance_rules.status_${rs}`)}</span>
                                  {rm && <span className="ml-1.5 text-slate-600 dark:text-slate-300">— {rm}</span>}
                                </div>
                              </div>
                            );
                          })}
                          {(evaluation.recommendation as string | undefined) && (
                            <div className="mt-3 rounded-lg border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5 overflow-hidden">
                              <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-amber-200 dark:border-amber-500/20">
                                <FileText className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                                <span className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">{t("compliance_rules.recommendation")}</span>
                              </div>
                              <pre className="px-3 py-2 text-xs font-mono text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{String(evaluation.recommendation)}</pre>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                          <AlertCircle className="h-5 w-5 text-slate-400" />
                          <p className="text-sm text-slate-500 dark:text-slate-400">{t("compliance_rules.evaluateNoMatch")}</p>
                        </div>
                      )}

                    </div>
                  );
                })()}

                {/* Debug trace */}
                {debugMode && !!(evalResult as Record<string, unknown>)?.debug && (() => {
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const dbg = (evalResult as Record<string, unknown>).debug as any;
                  const isMultiRow = dbg.multiRow === true;

                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  const renderBlockTrace = (blocks: any[], depth = 0): React.ReactNode => (
                    <>
                      {blocks.map((block, bi) => (
                        <div key={bi} className={`rounded-lg border overflow-hidden ${block.skipped ? "border-slate-100 dark:border-slate-800 opacity-40" : "border-slate-200 dark:border-slate-700"}`}>
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 dark:bg-slate-800/50">
                            <span className="text-[10px] font-bold uppercase text-slate-400">{block.type}</span>
                            {block.type !== "else" && <span className="text-[10px] text-slate-500">({block.logic})</span>}
                            {block.skipped ? (
                              <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-400 dark:bg-slate-700 dark:text-slate-500">SKIPPED</span>
                            ) : block.executed ? (
                              <span className="ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300">EXECUTED</span>
                            ) : (
                              <span className={`ml-auto px-1.5 py-0.5 rounded text-[9px] font-bold ${block.blockResult ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300" : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"}`}>
                                {block.blockResult ? "MATCH" : "NO MATCH"}
                              </span>
                            )}
                          </div>
                          {!block.skipped && block.conditions?.map((cond: any, ci: number) => (
                            <div key={ci} className="border-t border-slate-100 dark:border-slate-800 px-3 py-1.5 flex items-center gap-2">
                              <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${cond.result ? "bg-emerald-500" : "bg-red-500"}`} />
                              <span className="text-[11px] font-mono text-slate-600 dark:text-slate-300">
                                {cond.condition.source}.{cond.condition.field}
                              </span>
                              <span className="text-[10px] text-slate-400">{cond.condition.operator}</span>
                              <span className="text-[11px] font-mono text-blue-600 dark:text-blue-400">&quot;{cond.condition.value}&quot;</span>
                              <span className="text-[10px] text-slate-400">→</span>
                              <span className="text-[11px] font-mono text-slate-500">&quot;{String(cond.details[0]?.value ?? "null")}&quot;</span>
                              <span className={`ml-auto text-[9px] font-bold ${cond.result ? "text-emerald-600" : "text-red-600"}`}>
                                {cond.result ? "✓" : "✗"}
                              </span>
                            </div>
                          ))}
                          {/* Nested children blocks */}
                          {block.children && block.children.length > 0 && (
                            <div className="border-t border-slate-200 dark:border-slate-700 pl-4 pr-2 py-2 space-y-2 bg-slate-50/50 dark:bg-slate-800/30 border-l-2 border-l-blue-300 dark:border-l-blue-600 ml-2 mr-2 mb-2 mt-1 rounded">
                              {renderBlockTrace(block.children, depth + 1)}
                            </div>
                          )}
                        </div>
                      ))}
                    </>
                  );

                  return (
                    <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                      {/* Source fields collected from data sources */}
                      {dbg.fields && (
                        <div>
                          <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">{t("compliance.sourceFields")}</h4>
                          <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                              {Object.entries(dbg.fields as Record<string, unknown>)
                                .filter(([k]) => !k.endsWith(".$rows") && !k.startsWith("_"))
                                .map(([key, val]) => (
                                  <div key={key} className="flex items-center gap-2 px-3 py-1 text-[11px]">
                                    <span className="font-mono font-medium text-slate-600 dark:text-slate-300 min-w-0 shrink-0">{key}</span>
                                    <span className="text-slate-300 dark:text-slate-600">=</span>
                                    <span className="font-mono text-slate-500 dark:text-slate-400 truncate">
                                      {val === null ? <span className="italic text-slate-400">null</span> : typeof val === "boolean" ? String(val) : String(val).length > 120 ? String(val).slice(0, 120) + "…" : String(val)}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </div>
                      )}

                      <h4 className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">{t("compliance.debugTrace")}</h4>

                      {isMultiRow ? (
                        <div className="space-y-4">
                          {(dbg.rowTraces as { key: string | number; rowData: Record<string, string>; evaluation: Record<string, unknown>; blocks: typeof dbg.trace }[]).map((row, ri) => {
                            const st = row.evaluation?.status as string;
                            return (
                              <div key={ri} className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
                                <div className="flex items-center gap-2 px-4 py-2 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                                  <span className="text-xs font-bold text-slate-900 dark:text-slate-100">Row: {String(row.key)}</span>
                                  <span className="text-[10px] text-slate-400 font-mono">{Object.entries(row.rowData).map(([k, v]) => `${k}=${v}`).join(", ")}</span>
                                  <span className={`ml-auto px-2 py-0.5 rounded text-[10px] font-bold ${
                                    st === "compliant" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                                    : st === "non_compliant" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"
                                    : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                                  }`}>
                                    {st?.toUpperCase().replace("_", " ") ?? "N/A"}
                                  </span>
                                </div>
                                <div className="p-3 space-y-2">
                                  {renderBlockTrace(row.blocks)}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {renderBlockTrace(dbg.trace ?? [])}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    onClick={() => setEvalResult(null)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    {t("compliance_rules.evaluateAnother")}
                  </button>
                  <button
                    onClick={() => setShowEvalModal(false)}
                    className="rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
                  >
                    {t("common.cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">{t("compliance_rules.confirmDelete", { name: rule.name })}</p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteConfirm(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">{t("common.cancel")}</button>
              <button onClick={handleDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">{t("common.delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
