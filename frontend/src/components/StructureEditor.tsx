"use client";

import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  Plus,
  Trash2,
  GripVertical,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronDown as ChevronDownIcon,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignJustify,
  Bold,
  Italic,
  List,
  ListOrdered,
  FileText,
  FileDown,
  ImageIcon,
  Upload,
  X,
  ToggleLeft,
  ToggleRight,
  Loader2,
  Table2,
  Server,
  Search,
  Pencil,
  ListChecks,
  ClipboardList,
  TerminalSquare,
  Underline as UnderlineIcon,
  Strikethrough,
  Superscript,
  Subscript,
  Paintbrush,
  Palette,
  IndentIncrease,
  Network,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Lightbulb,
} from "lucide-react";
import { useAppContext } from "@/components/ContextProvider";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import UnderlineExt from "@tiptap/extension-underline";
import SubscriptExt from "@tiptap/extension-subscript";
import SuperscriptExt from "@tiptap/extension-superscript";
import { TextStyle, Color } from "@tiptap/extension-text-style";
import { Highlight } from "@tiptap/extension-highlight";
import ViewportFrameSelector from "@/components/topology/ViewportFrameSelector";

// --- Block types ---

export interface HeadingBlock {
  id: string;
  type: "heading";
  level: number;
  content: string;
  pageBreakBefore: boolean;
}

export interface ParagraphBlock {
  id: string;
  type: "paragraph";
  content: string;
  align: "left" | "center" | "right" | "justify";
}

export interface ImageBlock {
  id: string;
  type: "image";
  filename: string;
  url: string;
  width: number;
  showCaption: boolean;
  caption: string;
}

export interface TableCell {
  value: string;
  bold?: boolean;
  italic?: boolean;
  size?: number;
}

export interface TableBlock {
  id: string;
  type: "table";
  headers: (string | TableCell)[];
  rows: (string | TableCell)[][];
  showHeader: boolean;
  columnAligns: ("left" | "center" | "right")[];
  columnWidths: number[];
  columnVAligns?: ("top" | "middle" | "bottom")[];
}

export interface InventoryTableColumn {
  id: string;
  category: string;
  entryKey: string;
  colLabel: string;
  label?: string;
  headerLabel?: string;
  align?: "left" | "center" | "right";
  valign?: "top" | "middle" | "bottom";
}

export interface InventoryStyleRule {
  id: string;
  columnId: string; // column id or "__hostname__"
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "not_contains";
  value: string;
  textColor?: string;
  bgColor?: string;
  highlightColor?: string;
  bold?: boolean;
  italic?: boolean;
}

export type InventoryNodeRuleType =
  | "tag"
  | "discoveredVersion"
  | "manufacturer"
  | "model"
  | "productModel"
  | "hostname"
  | "inventory";

export type InventoryNodeRuleOperator =
  | "eq"
  | "neq"
  | "contains"
  | "not_contains"
  | "starts_with"
  | "ends_with";

export interface InventoryNodeRule {
  id: string;
  type: InventoryNodeRuleType;
  operator: InventoryNodeRuleOperator;
  value?: string;
  tagId?: number;
  category?: string;
  entryKey?: string;
  colLabel?: string;
}

export interface InventoryTableBlock {
  id: string;
  type: "inventory_table";
  mode?: "multi_node_columns" | "single_node_full";
  columns: InventoryTableColumn[];
  nodeIds: number[];
  nodeRules?: InventoryNodeRule[];
  nodeRulesMatch?: "all" | "any";
  singleNodeId?: number | null;
  singleCategory?: string | null;
  showHeader: boolean;
  hostnameHeaderLabel?: string;
  hostnameAlign?: "left" | "center" | "right";
  hostnameVAlign?: "top" | "middle" | "bottom";
  fontSize?: number;
  styleRules?: InventoryStyleRule[];
}

export interface CliStyleRule {
  id: string;
  pattern: string; // regex pattern
  operator: "matches" | "not_matches" | "contains" | "not_contains" | "eq" | "neq";
  textColor?: string;
  bgColor?: string;
  highlightColor?: string;
  highlightMode?: "line" | "match"; // "line" = whole line, "match" = only matched text
  bold?: boolean;
  italic?: boolean;
}

export interface CliConditionalRule {
  id: string;
  pattern: string;
  operator: "matches" | "not_matches" | "contains" | "not_contains";
  action: "show" | "hide";
}

export interface CliCommandBlock {
  id: string;
  type: "cli_command";
  commandName: string; // the command to display/run, e.g. "show sys-info"
  command: string; // the output content (static mode) or resolved output
  dataSource: "none" | "local" | "remote";
  nodeIds: number[];
  tagIds: number[];
  lineFilter?: string;
  showEllipsis: boolean;
  fontSize?: number;
  styleRules?: CliStyleRule[];
  conditionalRules?: CliConditionalRule[];
}

export interface EquipmentCategory {
  id: string;
  name: string;
  nodeIds: number[];
  style?: { bold?: boolean; italic?: boolean; size?: number; color?: string };
}

export interface EquipmentListBlock {
  id: string;
  type: "equipment_list";
  title: string;
  titleStyle?: { bold?: boolean; italic?: boolean; size?: number; color?: string };
  categoryStyle?: { bold?: boolean; italic?: boolean; size?: number; color?: string };
  categories: EquipmentCategory[];
  nodeDisplayField: "name" | "hostname" | "ipAddress";
  nodeColor?: string;
  showCount?: boolean;
  indent?: number;
  categoryIndent?: number;
  pageBreakBefore?: boolean;
}

export interface ActionItem {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  details: string;
}

export interface ActionListBlock {
  id: string;
  type: "action_list";
  title: string;
  actions: ActionItem[];
  showPriorityBadge?: boolean;
  pageBreakBefore?: boolean;
}

export interface CommandListBlock {
  id: string;
  type: "command_list";
  manufacturerId: number | null;
  modelId: number | null;
  pageBreakBefore?: boolean;
  style?: {
    fontSize: number;
  };
}

export interface TopologyBlock {
  id: string;
  type: "topology";
  topologyMapId: number | null;
  width: number;
  protocol: string;
  showLegend: boolean;
  showLabels: boolean;
  showMonitoring: boolean;
  showCompliance: boolean;
  caption: string;
  pageBreakBefore?: boolean;
  viewportFrame?: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
}

export interface ComplianceMatrixBlock {
  id: string;
  type: "compliance_matrix";
  policyId: number | null;
  showRuleId: boolean;
  showTotal: boolean;
  pageBreakBefore?: boolean;
  fontSize?: number;
}

export interface RuleNonCompliantBlock {
  id: string;
  type: "rule_non_compliant";
  policyId: number | null;
  ruleId: number | null;
  showRuleDescription: boolean;
  showSeverity: boolean;
  showMessage: boolean;
  pageBreakBefore?: boolean;
  fontSize?: number;
  columns?: InventoryTableColumn[];
  nodeIds?: number[];
  nodeRules?: InventoryNodeRule[];
  nodeRulesMatch?: "all" | "any";
}

export interface RuleNodesTableBlock {
  id: string;
  type: "rule_nodes_table";
  policyId: number | null;
  ruleId: number | null;
  showRuleDescription: boolean;
  showMessage: boolean;
  pageBreakBefore?: boolean;
  fontSize?: number;
  columns?: InventoryTableColumn[];
  nodeIds?: number[];
  nodeRules?: InventoryNodeRule[];
  nodeRulesMatch?: "all" | "any";
}

export interface RuleRecommendationBlock {
  id: string;
  type: "rule_recommendation";
  policyId: number | null;
  ruleId: number | null;
  nodeId: number | null;
  source?: "static" | "dynamic";
  displayMode: "text" | "cli";
  recommendation: string;
  showHeader: boolean;
  pageBreakBefore?: boolean;
  fontSize?: number;
}

function normalizeCell(cell: string | TableCell): TableCell {
  if (typeof cell === "string") return { value: cell };
  return cell;
}

export type ReportBlock = HeadingBlock | ParagraphBlock | ImageBlock | TableBlock | InventoryTableBlock | CliCommandBlock | EquipmentListBlock | ActionListBlock | CommandListBlock | TopologyBlock | ComplianceMatrixBlock | RuleNonCompliantBlock | RuleNodesTableBlock | RuleRecommendationBlock;

interface ReportNodeRef {
  id: number;
  ipAddress: string;
  name: string | null;
  hostname: string | null;
}

interface Props {
  blocks: ReportBlock[];
  onChange: (blocks: ReportBlock[]) => void;
  t: (key: string, params?: Record<string, string>) => string;
  reportType?: "general" | "node";
  reportNodes?: ReportNodeRef[];
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// Compute visual depth for each block based on heading hierarchy
function computeDepths(blocks: ReportBlock[]): number[] {
  const depths: number[] = [];
  let lastHeadingLevel = 0;
  for (const block of blocks) {
    if (block.type === "heading") {
      lastHeadingLevel = block.level;
      depths.push(block.level - 1);
    } else {
      depths.push(lastHeadingLevel);
    }
  }
  return depths;
}

const DEPTH_COLORS = [
  "border-slate-300 dark:border-slate-600",
  "border-blue-400 dark:border-blue-600",
  "border-indigo-400 dark:border-indigo-600",
  "border-violet-400 dark:border-violet-600",
  "border-purple-400 dark:border-purple-600",
  "border-fuchsia-400 dark:border-fuchsia-600",
];

const inputClass =
  "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";

const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

export default function StructureEditor({ blocks, onChange, t, reportType, reportNodes }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [insertMenuIdx, setInsertMenuIdx] = useState<number | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);

  const depths = computeDepths(blocks);

  const updateBlock = useCallback(
    (id: string, patch: Partial<ReportBlock>) => {
      onChange(blocks.map((b) => (b.id === id ? { ...b, ...patch } as ReportBlock : b)));
    },
    [blocks, onChange]
  );

  const insertBlock = (type: ReportBlock["type"], atIndex: number) => {
    const id = uid();
    let block: ReportBlock;
    if (type === "heading") {
      block = { id, type: "heading", level: 1, content: "", pageBreakBefore: false };
    } else if (type === "image") {
      block = { id, type: "image", filename: "", url: "", width: 100, showCaption: false, caption: "" };
    } else if (type === "table") {
      block = { id, type: "table", headers: [{ value: "" }, { value: "" }], rows: [[{ value: "" }, { value: "" }]], showHeader: true, columnAligns: ["left", "left"], columnWidths: [50, 50] };
    } else if (type === "inventory_table") {
      block = { id, type: "inventory_table", mode: "multi_node_columns", columns: [], nodeIds: [], nodeRules: [], nodeRulesMatch: "any", showHeader: true };
    } else if (type === "cli_command") {
      block = { id, type: "cli_command", commandName: "", command: "", dataSource: "none", nodeIds: [], tagIds: [], showEllipsis: true };
    } else if (type === "equipment_list") {
      block = { id, type: "equipment_list", title: "", categories: [], nodeDisplayField: "name", nodeColor: "#7c3aed", showCount: true, titleStyle: { bold: true, size: 13, color: "#1e293b" }, categoryStyle: { bold: false, size: 11, color: "#1e293b" } } as EquipmentListBlock;
    } else if (type === "action_list") {
      block = { id, type: "action_list", title: "", actions: [], showPriorityBadge: true };
    } else if (type === "command_list") {
      block = { id, type: "command_list", manufacturerId: null, modelId: null, style: { fontSize: 9 } };
    } else if (type === "topology") {
      block = { id, type: "topology", topologyMapId: null, width: 100, protocol: "", showLegend: true, showLabels: true, showMonitoring: false, showCompliance: false, caption: "", pageBreakBefore: false };
    } else if (type === "compliance_matrix") {
      block = { id, type: "compliance_matrix", policyId: null, showRuleId: true, showTotal: true, pageBreakBefore: false };
    } else if (type === "rule_non_compliant") {
      block = { id, type: "rule_non_compliant", policyId: null, ruleId: null, showRuleDescription: true, showSeverity: true, showMessage: true, pageBreakBefore: false, columns: [], nodeIds: [], nodeRules: [], nodeRulesMatch: "any" };
    } else if (type === "rule_nodes_table") {
      block = { id, type: "rule_nodes_table", policyId: null, ruleId: null, showRuleDescription: true, showMessage: false, pageBreakBefore: false, columns: [], nodeIds: [], nodeRules: [], nodeRulesMatch: "any" };
    } else if (type === "rule_recommendation") {
      block = { id, type: "rule_recommendation", policyId: null, ruleId: null, nodeId: null, source: "static", displayMode: "text", recommendation: "", showHeader: true, pageBreakBefore: false };
    } else {
      block = { id, type: "paragraph", content: "", align: "left" };
    }
    const arr = [...blocks];
    arr.splice(atIndex, 0, block);
    onChange(arr);
    setEditingId(id);
    setInsertMenuIdx(null);
  };

  const addBlock = (type: ReportBlock["type"]) => {
    insertBlock(type, blocks.length);
  };

  const deleteBlock = (id: string) => {
    const block = blocks.find((b) => b.id === id);
    if (block?.type === "image" && block.filename) {
      fetch(`/api/block-images/${block.filename}`, { method: "DELETE" }).catch(() => {});
    }
    onChange(blocks.filter((b) => b.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const moveBlock = (idx: number, dir: -1 | 1) => {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= blocks.length) return;
    const arr = [...blocks];
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    onChange(arr);
  };

  // Drag & drop
  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => { e.preventDefault(); setDragOverIdx(idx); };
  const handleDrop = (idx: number) => {
    if (dragIdx !== null && dragIdx !== idx) {
      const arr = [...blocks];
      const [moved] = arr.splice(dragIdx, 1);
      arr.splice(idx, 0, moved);
      onChange(arr);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };
  const handleDragEnd = () => { setDragIdx(null); setDragOverIdx(null); };

  // Close modal on Escape
  useEffect(() => {
    if (!editingId) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setEditingId(null); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [editingId]);

  // Close add menu on outside click
  useEffect(() => {
    if (!addMenuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) setAddMenuOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [addMenuOpen]);

  const editingBlock = editingId ? blocks.find((b) => b.id === editingId) : null;

  const getBlockPreview = (block: ReportBlock) => {
    if (block.type === "heading") {
      return block.content || <span className="italic text-slate-400">{t("structure.untitledHeading")}</span>;
    }
    if (block.type === "image") {
      if (block.filename) {
        return block.caption || <span className="italic text-slate-400">{t("structure.imageUploaded")}</span>;
      }
      return <span className="italic text-slate-400">{t("structure.noImage")}</span>;
    }
    if (block.type === "table") {
      const cols = block.headers.length;
      const rows = block.rows.length;
      return <span className="text-slate-500">{t("structure.tableSize", { cols: String(cols), rows: String(rows) })}</span>;
    }
    if (block.type === "inventory_table") {
      if (block.mode === "single_node_full") {
        return <span className="text-slate-500">{t("structure.invModeSingleTitle")}{block.singleCategory ? ` — ${block.singleCategory}` : ""}</span>;
      }
      const cols = block.columns.length;
      const ruleCount = (block.nodeRules ?? []).length;
      const nodes = block.nodeIds.length + (ruleCount > 0 ? ruleCount : 0);
      return <span className="text-slate-500">{t("structure.inventorySize", { cols: String(cols + 1), nodes: String(nodes) })}{ruleCount > 0 ? ` (+${t("structure.invAutoRulesAdd").toLowerCase()})` : ""}</span>;
    }
    if (block.type === "cli_command") {
      const source = block.dataSource || "none";
      const sourceLabel = source === "none" ? t("structure.cliSourceNone") : source === "local" ? t("structure.cliSourceLocal") : t("structure.cliSourceRemote");
      const cmdName = block.commandName || block.command?.split("\n")[0]?.substring(0, 40);
      if (cmdName) {
        const nodeCount = (block.nodeIds || []).length + (block.tagIds || []).length;
        return <span className="text-slate-500 font-mono text-xs">{sourceLabel}{source !== "none" ? ` (${nodeCount})` : ""} &mdash; {cmdName}</span>;
      }
      return <span className="italic text-slate-400">{t("structure.emptyCliCommand")}</span>;
    }
    if (block.type === "equipment_list") {
      if (block.title) {
        const total = block.categories.reduce((s, c) => s + c.nodeIds.length, 0);
        return <span className="text-slate-500">{block.title} — {block.categories.length} cat. ({total} nodes)</span>;
      }
      return <span className="italic text-slate-400">{t("structure.emptyEquipmentList")}</span>;
    }
    if (block.type === "action_list") {
      if (block.actions.length > 0) {
        return <span className="text-slate-500">{block.title || t("structure.actionList")} — {block.actions.length} action{block.actions.length > 1 ? "s" : ""}</span>;
      }
      return <span className="italic text-slate-400">{t("structure.emptyActionList")}</span>;
    }

    if (block.type === "command_list") {
      if (block.modelId) {
        return <span className="text-slate-500 font-mono text-xs">{t("structure.commandList")} — model #{block.modelId}</span>;
      }
      return <span className="italic text-slate-400">{t("structure.emptyCommandList")}</span>;
    }
    if (block.type === "topology") {
      if (block.topologyMapId) {
        return <span className="text-slate-500 text-xs">{t("structure.topologyBlock")} — #{block.topologyMapId}{block.protocol ? ` (${block.protocol.toUpperCase()})` : ""}</span>;
      }
      return <span className="italic text-slate-400">{t("structure.emptyTopology")}</span>;
    }
    if (block.type === "compliance_matrix") {
      if (block.policyId) {
        return <span className="text-slate-500 text-xs">{t("structure.complianceMatrix")} — policy #{block.policyId}</span>;
      }
      return <span className="italic text-slate-400">{t("structure.emptyComplianceMatrix")}</span>;
    }
    if (block.type === "rule_non_compliant") {
      if (block.ruleId) {
        return <span className="text-slate-500 text-xs">{t("structure.ruleNonCompliant")} — rule #{block.ruleId}</span>;
      }
      return <span className="italic text-slate-400">{t("structure.emptyRuleNonCompliant")}</span>;
    }
    if (block.type === "rule_nodes_table") {
      if (block.ruleId) {
        return <span className="text-slate-500 text-xs">{t("structure.ruleNodesTable")} — rule #{block.ruleId}</span>;
      }
      return <span className="italic text-slate-400">{t("structure.emptyRuleNodesTable")}</span>;
    }
    if (block.type === "rule_recommendation") {
      if (block.ruleId && block.nodeId) {
        const src = (block.source ?? "static") === "dynamic" ? "DYN" : "STA";
        return <span className="text-slate-500 text-xs">{t("structure.ruleRecommendation")} — rule #{block.ruleId} / device #{block.nodeId} ({src} / {block.displayMode === "cli" ? "CLI" : "TXT"})</span>;
      }
      return <span className="italic text-slate-400">{t("structure.emptyRuleRecommendation")}</span>;
    }
    // paragraph
    return block.content
      ? block.content.replace(/<[^>]*>/g, "").substring(0, 60) || <span className="italic text-slate-400">{t("structure.emptyParagraph")}</span>
      : <span className="italic text-slate-400">{t("structure.emptyParagraph")}</span>;
  };

  const getBlockBadge = (block: ReportBlock) => {
    if (block.type === "heading") {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-indigo-100 dark:bg-indigo-500/15 px-2 py-0.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
          H{block.level}
        </span>
      );
    }
    if (block.type === "image") {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
          <ImageIcon className="h-3 w-3" />
        </span>
      );
    }
    if (block.type === "table") {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-cyan-100 dark:bg-cyan-500/15 px-2 py-0.5 text-[11px] font-bold text-cyan-600 dark:text-cyan-400">
          <Table2 className="h-3 w-3" />
        </span>
      );
    }
    if (block.type === "inventory_table") {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-violet-100 dark:bg-violet-500/15 px-2 py-0.5 text-[11px] font-bold text-violet-600 dark:text-violet-400">
          <Server className="h-3 w-3" />
        </span>
      );
    }
    if (block.type === "cli_command") {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-slate-800 dark:bg-slate-200/10 px-2 py-0.5 text-[11px] font-bold text-green-400 dark:text-green-400 font-mono">
          &gt;_
        </span>
      );
    }
    if (block.type === "equipment_list") {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-purple-100 dark:bg-purple-500/15 px-2 py-0.5 text-[11px] font-bold text-purple-600 dark:text-purple-400">
          <ListChecks className="h-3 w-3" />
        </span>
      );
    }
    if (block.type === "action_list") {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-rose-100 dark:bg-rose-500/15 px-2 py-0.5 text-[11px] font-bold text-rose-600 dark:text-rose-400">
          <ClipboardList className="h-3 w-3" />
        </span>
      );
    }
    if (block.type === "command_list") {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-teal-100 dark:bg-teal-500/15 px-2 py-0.5 text-[11px] font-bold text-teal-600 dark:text-teal-400">
          <TerminalSquare className="h-3 w-3" />
        </span>
      );
    }
    if (block.type === "topology") {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-violet-100 dark:bg-violet-500/15 px-2 py-0.5 text-[11px] font-bold text-violet-600 dark:text-violet-400">
          <Network className="h-3 w-3" />
        </span>
      );
    }
    if (block.type === "compliance_matrix") {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-green-100 dark:bg-green-500/15 px-2 py-0.5 text-[11px] font-bold text-green-600 dark:text-green-400">
          <ShieldCheck className="h-3 w-3" />
        </span>
      );
    }
    if (block.type === "rule_non_compliant") {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-red-100 dark:bg-red-500/15 px-2 py-0.5 text-[11px] font-bold text-red-600 dark:text-red-400">
          <ShieldAlert className="h-3 w-3" />
        </span>
      );
    }
    if (block.type === "rule_nodes_table") {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-sky-100 dark:bg-sky-500/15 px-2 py-0.5 text-[11px] font-bold text-sky-600 dark:text-sky-400">
          <ShieldQuestion className="h-3 w-3" />
        </span>
      );
    }
    if (block.type === "rule_recommendation") {
      return (
        <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-amber-100 dark:bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400">
          <Lightbulb className="h-3 w-3" />
        </span>
      );
    }
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-md bg-emerald-100 dark:bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
        P
      </span>
    );
  };

  return (
    <>
      <div className="flex flex-col h-full min-h-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {t("structure.blocks")}
          </h2>
          <div className="relative" ref={addMenuRef}>
            <button
              onClick={() => setAddMenuOpen(!addMenuOpen)}
              className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("structure.addBlock")}
              <ChevronDownIcon className="h-3.5 w-3.5" />
            </button>
            {addMenuOpen && (
              <div className="absolute right-0 top-full mt-1 z-30 w-52 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg py-1">
                <button onClick={() => { addBlock("heading"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <Type className="h-4 w-4 text-indigo-500" />
                  {t("structure.addHeading")}
                </button>
                <button onClick={() => { addBlock("paragraph"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <AlignLeft className="h-4 w-4 text-emerald-500" />
                  {t("structure.addParagraph")}
                </button>
                <button onClick={() => { addBlock("image"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <ImageIcon className="h-4 w-4 text-amber-500" />
                  {t("structure.addImage")}
                </button>
                <button onClick={() => { addBlock("table"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <Table2 className="h-4 w-4 text-cyan-500" />
                  {t("structure.addTable")}
                </button>
                <button onClick={() => { addBlock("inventory_table"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <Server className="h-4 w-4 text-violet-500" />
                  {t("structure.addInventoryTable")}
                </button>
                <button onClick={() => { addBlock("cli_command"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <span className="inline-flex items-center justify-center h-4 w-4 font-mono text-[10px] font-bold text-green-500">&gt;_</span>
                  {t("structure.addCliCommand")}
                </button>
                <button onClick={() => { addBlock("equipment_list"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <ListChecks className="h-4 w-4 text-purple-500" />
                  {t("structure.addEquipmentList")}
                </button>
                <button onClick={() => { addBlock("action_list"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <ClipboardList className="h-4 w-4 text-rose-500" />
                  {t("structure.addActionList")}
                </button>
                <button onClick={() => { addBlock("command_list"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <TerminalSquare className="h-4 w-4 text-teal-500" />
                  {t("structure.addCommandList")}
                </button>
                <button onClick={() => { addBlock("topology"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <Network className="h-4 w-4 text-violet-500" />
                  {t("structure.addTopology")}
                </button>
                <button onClick={() => { addBlock("compliance_matrix"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <ShieldCheck className="h-4 w-4 text-green-500" />
                  {t("structure.addComplianceMatrix")}
                </button>
                <button onClick={() => { addBlock("rule_non_compliant"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <ShieldAlert className="h-4 w-4 text-red-500" />
                  {t("structure.addRuleNonCompliant")}
                </button>
                <button onClick={() => { addBlock("rule_nodes_table"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <ShieldQuestion className="h-4 w-4 text-sky-500" />
                  {t("structure.addRuleNodesTable")}
                </button>
                <button onClick={() => { addBlock("rule_recommendation"); setAddMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                  <Lightbulb className="h-4 w-4 text-amber-500" />
                  {t("structure.addRuleRecommendation")}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Block list */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {blocks.length === 0 && (
            <div className="p-12 flex flex-col items-center justify-center gap-3 text-slate-400 dark:text-slate-500">
              <FileText className="h-10 w-10" />
              <p className="text-sm">{t("structure.empty")}</p>
            </div>
          )}

          {blocks.length > 0 && (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {blocks.map((block, idx) => {
                const depth = depths[idx];
                const isDragOver = dragOverIdx === idx && dragIdx !== idx;
                const borderColor = DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)];

                return (
                  <div key={block.id}>
                    {/* Insert line before block */}
                    <InsertLine
                      index={idx}
                      activeIndex={insertMenuIdx}
                      onToggle={setInsertMenuIdx}
                      onInsert={insertBlock}
                      t={t}
                    />

                    <div className={`${dragIdx === idx ? "opacity-40" : ""}`}>
                      <div
                        style={{ marginLeft: depth * 16 }}
                        className={`border-l-2 ${depth > 0 ? borderColor : "border-transparent"}`}
                      >
                        {/* Block row */}
                        <div
                          draggable
                          onDragStart={() => handleDragStart(idx)}
                          onDragOver={(e) => handleDragOver(e, idx)}
                          onDrop={() => handleDrop(idx)}
                          onDragEnd={handleDragEnd}
                          className={`group flex items-center gap-2 py-2.5 px-4 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors ${isDragOver ? "ring-1 ring-inset ring-blue-400" : ""}`}
                        >
                          {/* Drag handle */}
                          <div className="shrink-0 cursor-grab text-slate-300 dark:text-slate-600 hover:text-slate-400">
                            <GripVertical className="h-4 w-4" />
                          </div>

                          {/* Badge */}
                          {getBlockBadge(block)}

                          {/* Page break indicator */}
                          {block.type === "heading" && block.pageBreakBefore && (
                            <FileDown className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                          )}

                          {/* Content preview */}
                          <button
                            onClick={() => setEditingId(block.id)}
                            className="flex-1 min-w-0 truncate text-sm text-slate-700 dark:text-slate-300 text-left hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
                          >
                            {getBlockPreview(block)}
                          </button>

                          {/* Actions */}
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                            <button
                              onClick={() => setEditingId(block.id)}
                              className="p-1 rounded-md text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                              title={t("structure.edit")}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => moveBlock(idx, -1)}
                              disabled={idx === 0}
                              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 disabled:opacity-30 transition-colors"
                            >
                              <ChevronUp className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => moveBlock(idx, 1)}
                              disabled={idx === blocks.length - 1}
                              className="p-1 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 disabled:opacity-30 transition-colors"
                            >
                              <ChevronDown className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => deleteBlock(block.id)}
                              className="p-1 rounded-md text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}

              {/* Insert line after last block */}
              <InsertLine
                index={blocks.length}
                activeIndex={insertMenuIdx}
                onToggle={setInsertMenuIdx}
                onInsert={insertBlock}
                t={t}
              />
            </div>
          )}
        </div>
      </div>

      {/* Block edit modal */}
      {editingBlock && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setEditingId(null); }}
        >
          <div
            className="relative flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden"
            style={{ width: "80vw", height: "90vh" }}
          >
            {/* Modal header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
              {getBlockBadge(editingBlock)}
              <span className="flex-1 min-w-0 truncate text-sm font-medium text-slate-700 dark:text-slate-300">
                {getBlockPreview(editingBlock)}
              </span>
              <button
                onClick={() => setEditingId(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal body */}
            <div className={`flex-1 min-h-0 px-6 py-5 ${editingBlock.type === "paragraph" ? "flex flex-col" : "overflow-y-auto"}`}>
              {editingBlock.type === "heading" && (
                <HeadingProperties block={editingBlock} updateBlock={updateBlock} t={t} />
              )}
              {editingBlock.type === "paragraph" && (
                <ParagraphProperties block={editingBlock} updateBlock={updateBlock} t={t} reportType={reportType} reportNodes={reportNodes} />
              )}
              {editingBlock.type === "image" && (
                <ImageProperties block={editingBlock} updateBlock={updateBlock} t={t} />
              )}
              {editingBlock.type === "table" && (
                <TableProperties block={editingBlock} updateBlock={updateBlock} t={t} />
              )}
              {editingBlock.type === "inventory_table" && (
                <InventoryTableProperties block={editingBlock} updateBlock={updateBlock} t={t} reportType={reportType} reportNodes={reportNodes} />
              )}
              {editingBlock.type === "cli_command" && (
                <CliCommandProperties block={editingBlock} updateBlock={updateBlock} t={t} />
              )}
              {editingBlock.type === "equipment_list" && (
                <EquipmentListProperties block={editingBlock} updateBlock={updateBlock} t={t} />
              )}
              {editingBlock.type === "action_list" && (
                <ActionListProperties block={editingBlock} updateBlock={updateBlock} t={t} />
              )}
              {editingBlock.type === "command_list" && (
                <CommandListProperties block={editingBlock} updateBlock={updateBlock} t={t} />
              )}
              {editingBlock.type === "topology" && (
                <TopologyBlockProperties block={editingBlock as TopologyBlock} updateBlock={updateBlock} t={t} />
              )}
              {editingBlock.type === "compliance_matrix" && (
                <ComplianceMatrixProperties block={editingBlock} updateBlock={updateBlock} t={t} />
              )}
              {editingBlock.type === "rule_non_compliant" && (
                <RuleNonCompliantProperties block={editingBlock} updateBlock={updateBlock} t={t} />
              )}
              {editingBlock.type === "rule_nodes_table" && (
                <RuleNodesTableProperties block={editingBlock} updateBlock={updateBlock} t={t} />
              )}
              {editingBlock.type === "rule_recommendation" && (
                <RuleRecommendationProperties block={editingBlock} updateBlock={updateBlock} t={t} />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// --- Insert line between blocks ---
function InsertLine({
  index,
  activeIndex,
  onToggle,
  onInsert,
  t,
}: {
  index: number;
  activeIndex: number | null;
  onToggle: (idx: number | null) => void;
  onInsert: (type: ReportBlock["type"], atIndex: number) => void;
  t: (key: string) => string;
}) {
  const isActive = activeIndex === index;

  return (
    <div className="group/insert relative flex items-center py-0.5 px-4">
      {/* Line */}
      <div className="flex-1 border-t border-dashed border-transparent group-hover/insert:border-slate-300 dark:group-hover/insert:border-slate-600 transition-colors" />

      {/* + button */}
      <button
        onClick={() => onToggle(isActive ? null : index)}
        className={`absolute left-1/2 -translate-x-1/2 flex items-center justify-center h-5 w-5 rounded-full border text-[10px] font-bold transition-all ${
          isActive
            ? "bg-blue-500 border-blue-500 text-white scale-100 opacity-100"
            : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-400 dark:text-slate-500 scale-0 opacity-0 group-hover/insert:scale-100 group-hover/insert:opacity-100"
        }`}
      >
        <Plus className="h-3 w-3" />
      </button>

      {/* Dropdown menu */}
      {isActive && (
        <div className="absolute left-1/2 -translate-x-1/2 top-6 z-20 flex items-center gap-1 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg px-1.5 py-1">
          <button
            onClick={() => onInsert("heading", index)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            <Type className="h-3.5 w-3.5" />
            {t("structure.addHeading")}
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
          <button
            onClick={() => onInsert("paragraph", index)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            <AlignLeft className="h-3.5 w-3.5" />
            {t("structure.addParagraph")}
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
          <button
            onClick={() => onInsert("image", index)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            <ImageIcon className="h-3.5 w-3.5" />
            {t("structure.addImage")}
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
          <button
            onClick={() => onInsert("table", index)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            <Table2 className="h-3.5 w-3.5" />
            {t("structure.addTable")}
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
          <button
            onClick={() => onInsert("inventory_table", index)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            <Server className="h-3.5 w-3.5" />
            {t("structure.addInventoryTable")}
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
          <button
            onClick={() => onInsert("cli_command", index)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            <span className="font-mono text-[10px] font-bold">&gt;_</span>
            {t("structure.addCliCommand")}
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
          <button
            onClick={() => onInsert("equipment_list", index)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            <ListChecks className="h-3.5 w-3.5" />
            {t("structure.addEquipmentList")}
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
          <button
            onClick={() => onInsert("action_list", index)}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
          >
            <ClipboardList className="h-3.5 w-3.5" />
            {t("structure.addActionList")}
          </button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700" />
          <button onClick={() => onInsert("command_list", index)} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap">
            <TerminalSquare className="h-3.5 w-3.5" />
            {t("structure.addCommandList")}
          </button>
          <button onClick={() => onInsert("topology", index)} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap">
            <Network className="h-3.5 w-3.5" />
            {t("structure.addTopology")}
          </button>
          <button onClick={() => onInsert("compliance_matrix", index)} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("structure.addComplianceMatrix")}
          </button>
          <button onClick={() => onInsert("rule_non_compliant", index)} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap">
            <ShieldAlert className="h-3.5 w-3.5" />
            {t("structure.addRuleNonCompliant")}
          </button>
          <button onClick={() => onInsert("rule_nodes_table", index)} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap">
            <ShieldQuestion className="h-3.5 w-3.5" />
            {t("structure.addRuleNodesTable")}
          </button>
          <button onClick={() => onInsert("rule_recommendation", index)} className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors whitespace-nowrap">
            <Lightbulb className="h-3.5 w-3.5" />
            {t("structure.addRuleRecommendation")}
          </button>
        </div>
      )}
    </div>
  );
}

// --- Heading inline properties ---
function HeadingProperties({
  block,
  updateBlock,
  t,
}: {
  block: HeadingBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3">
        <div className="flex-1 space-y-1.5">
          <label className={labelClass}>{t("structure.headingPlaceholder")}</label>
          <input
            type="text"
            value={block.content}
            onChange={(e) => updateBlock(block.id, { content: e.target.value })}
            placeholder={t("structure.headingPlaceholder")}
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>{t("structure.headingLevel")}</label>
          <select
            value={block.level}
            onChange={(e) => updateBlock(block.id, { level: Number(e.target.value) })}
            className={`${inputClass} w-20`}
          >
            {[1, 2, 3, 4, 5, 6].map((l) => (
              <option key={l} value={l}>H{l}</option>
            ))}
          </select>
        </div>
      </div>
      <label className="flex items-center gap-2.5 cursor-pointer">
        <input
          type="checkbox"
          checked={block.pageBreakBefore}
          onChange={() => updateBlock(block.id, { pageBreakBefore: !block.pageBreakBefore })}
          className="rounded border-slate-300 dark:border-slate-600 text-blue-500 focus:ring-blue-500/20 h-4 w-4"
        />
        <span className="text-sm text-slate-600 dark:text-slate-400">{t("structure.pageBreakBefore")}</span>
      </label>
    </div>
  );
}

// --- Paragraph inline properties (TipTap WYSIWYG) ---
interface InvStructure {
  categoryId: number | null;
  categoryName: string;
  entries: { key: string; columns: string[] }[];
}

function ParagraphProperties({
  block,
  updateBlock,
  t,
  reportType,
  reportNodes,
}: {
  block: ParagraphBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
  reportType?: "general" | "node";
  reportNodes?: ReportNodeRef[];
}) {
  const { current } = useAppContext();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);

  // Autocomplete state
  const [acOpen, setAcOpen] = useState(false);
  const [acPos, setAcPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [acStep, setAcStep] = useState<"root" | "node" | "category" | "key" | "column" | "fn" | "fn_param">("root");
  const [acNode, setAcNode] = useState<string | null>(null);
  const [acCategory, setAcCategory] = useState<string | null>(null);
  const [acKey, setAcKey] = useState<string | null>(null);
  const [acFilter, setAcFilter] = useState("");
  const [invStructure, setInvStructure] = useState<InvStructure[]>([]);
  // Function params state
  const [acFn, setAcFn] = useState<string | null>(null);
  const [acFnArgs, setAcFnArgs] = useState<string[]>([]);

  // Available functions
  const fnDefs = useMemo(() => [
    { id: "countByManufacturer", label: "Compter par fabricant", desc: "Nombre d'equipements d'un fabricant", params: ["Fabricant"], group: "Noeuds" },
    { id: "countByModel", label: "Compter par modele", desc: "Nombre d'equipements d'un modele", params: ["Modele"], group: "Noeuds" },
    { id: "countByTag", label: "Compter par tag", desc: "Nombre d'equipements avec un tag", params: ["Tag"], group: "Noeuds" },
    { id: "countWhere", label: "Compter si inventaire", desc: "Nombre d'equipements ou inventaire matche", params: ["Categorie", "Cle", "Operateur", "Valeur"], group: "Inventaire" },
    { id: "listWhere", label: "Lister si inventaire", desc: "Noms d'equipements ou inventaire matche", params: ["Categorie", "Cle", "Operateur", "Valeur"], group: "Inventaire" },
    { id: "collectionCommands", label: "Nombre de commandes", desc: "Nombre de commandes de la collecte", params: ["Noeud ou Tag", "Tag collecte"], group: "Collecte" },
    { id: "collectionFiles", label: "Nombre de fichiers", desc: "Nombre de fichiers de la collecte", params: ["Noeud ou Tag", "Tag collecte"], group: "Collecte" },
    { id: "collectionWorker", label: "Worker", desc: "Nom du worker qui a fait la collecte", params: ["Noeud ou Tag", "Tag collecte"], group: "Collecte" },
    { id: "collectionDate", label: "Date de collecte", desc: "Date de la collecte", params: ["Noeud ou Tag", "Tag collecte", "Format"], group: "Collecte" },
  ], []);

  const fnOperators = ["=", "!=", "<", ">", "<=", ">=", "contains"];

  useEffect(() => {
    if (!current) return;
    fetch(`/api/inventory-categories/structure?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setInvStructure);
  }, [current]);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, blockquote: false, horizontalRule: false }),
      TextAlign.configure({ types: ["paragraph"] }),
      UnderlineExt,
      SubscriptExt,
      SuperscriptExt,
      TextStyle,
      Color,
      Highlight.configure({ multicolor: true }),
    ],
    content: block.content || "<p></p>",
    onUpdate: ({ editor: ed }) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        updateBlock(block.id, { content: ed.getHTML() });
      }, 400);

      // Detect {{ trigger
      const { from } = ed.state.selection;
      const textBefore = ed.state.doc.textBetween(Math.max(0, from - 2), from);
      if (textBefore === "{{") {
        // Get cursor position for popup
        const coords = ed.view.coordsAtPos(from);
        const containerRect = editorContainerRef.current?.getBoundingClientRect();
        if (containerRect) {
          setAcPos({ top: coords.bottom - containerRect.top + 4, left: coords.left - containerRect.left });
        }
        setAcFilter("");
        setAcStep("root");
        setAcNode(null);
        setAcCategory(null);
        setAcKey(null);
        setAcFn(null);
        setAcFnArgs([]);
        setAcOpen(true);
      }
    },
    editorProps: {
      attributes: { class: "prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[80px] px-3.5 py-2.5 text-sm" },
      handleKeyDown: (_view, event) => {
        if (acOpen && event.key === "Escape") { setAcOpen(false); return true; }
        return false;
      },
    },
  });

  const insertVariable = (variable: string) => {
    if (!editor) return;
    editor.chain().focus().insertContent(variable + "}}").run();
    setAcOpen(false);
  };

  const acGoVariable = () => {
    setAcFilter("");
    if (reportType === "node") {
      setAcStep("category");
    } else {
      setAcStep("node");
    }
  };

  const selectNode = (ip: string) => { setAcNode(ip); setAcStep("category"); setAcFilter(""); };

  const selectCategory = (cat: string) => { setAcCategory(cat); setAcStep("key"); setAcFilter(""); };

  const selectKey = (key: string, columns: string[]) => {
    if (columns.length <= 1) {
      const prefix = reportType === "node" ? "node." : `node["${acNode}"].`;
      insertVariable(`${prefix}${acCategory}.${key}`);
    } else {
      setAcKey(key);
      setAcStep("column");
      setAcFilter("");
    }
  };

  const selectColumn = (col: string) => {
    const prefix = reportType === "node" ? "node." : `node["${acNode}"].`;
    insertVariable(`${prefix}${acCategory}.${acKey}.${col}`);
  };

  const selectFn = (fnId: string) => {
    const def = fnDefs.find((f) => f.id === fnId);
    if (!def) return;
    setAcFn(fnId);
    setAcFnArgs([]);
    setAcStep("fn_param");
    setAcFilter("");
  };

  const submitFnArg = (value: string) => {
    const def = fnDefs.find((f) => f.id === acFn);
    if (!def) return;
    const newArgs = [...acFnArgs, value];
    if (newArgs.length >= def.params.length) {
      // All params collected — insert function
      const argsStr = newArgs.map((a) => `"${a}"`).join(", ");
      insertVariable(`fn:${acFn}(${argsStr})`);
    } else {
      setAcFnArgs(newArgs);
      setAcFilter("");
    }
  };

  // Build filtered suggestions
  const suggestions = useMemo(() => {
    const q = acFilter.toLowerCase();
    if (acStep === "root") {
      return [
        { id: "_var", label: "Variable d'inventaire", sub: "Valeur d'un noeud", icon: "var" },
        { id: "_fn", label: "Fonction", sub: "Comptage, liste filtree...", icon: "fn" },
      ];
    }
    if (acStep === "node") {
      return (reportNodes || []).filter((n) => {
        const label = n.name || n.hostname || n.ipAddress;
        return !q || label.toLowerCase().includes(q) || n.ipAddress.includes(q);
      }).map((n) => ({ id: n.ipAddress, label: n.name || n.hostname || n.ipAddress, sub: n.ipAddress }));
    }
    if (acStep === "category") {
      return invStructure.filter((c) => !q || c.categoryName.toLowerCase().includes(q)).map((c) => ({ id: c.categoryName, label: c.categoryName, sub: `${c.entries.length} cle(s)` }));
    }
    if (acStep === "key") {
      const cat = invStructure.find((c) => c.categoryName === acCategory);
      return (cat?.entries || []).filter((e) => !q || e.key.toLowerCase().includes(q)).map((e) => ({ id: e.key, label: e.key, sub: e.columns.join(", "), columns: e.columns }));
    }
    if (acStep === "column") {
      const cat = invStructure.find((c) => c.categoryName === acCategory);
      const entry = cat?.entries.find((e) => e.key === acKey);
      return (entry?.columns || []).filter((c) => !q || c.toLowerCase().includes(q)).map((c) => ({ id: c, label: c, sub: "" }));
    }
    if (acStep === "fn") {
      return fnDefs.filter((f) => !q || f.label.toLowerCase().includes(q) || f.id.toLowerCase().includes(q)).map((f) => ({ id: f.id, label: f.label, sub: f.desc, group: f.group }));
    }
    if (acStep === "fn_param") {
      const def = fnDefs.find((f) => f.id === acFn);
      if (!def) return [];
      const paramIdx = acFnArgs.length;
      const paramName = def.params[paramIdx];
      // Provide contextual suggestions for known param types
      if (paramName === "Fabricant") {
        const mfrs = [...new Set((reportNodes || []).map((n) => n.name).filter(Boolean))]; // fallback
        // Can't easily get manufacturers from reportNodes — let user type
        return [];
      }
      if (paramName === "Categorie") {
        return invStructure.filter((c) => !q || c.categoryName.toLowerCase().includes(q)).map((c) => ({ id: c.categoryName, label: c.categoryName, sub: "" }));
      }
      if (paramName === "Cle") {
        const cat = invStructure.find((c) => c.categoryName === acFnArgs[0]);
        return (cat?.entries || []).filter((e) => !q || e.key.toLowerCase().includes(q)).map((e) => ({ id: e.key, label: e.key, sub: "" }));
      }
      if (paramName === "Operateur") {
        return fnOperators.filter((o) => !q || o.includes(q)).map((o) => ({ id: o, label: o, sub: { "=": "egal", "!=": "different", "<": "inferieur", ">": "superieur", "<=": "inf. ou egal", ">=": "sup. ou egal", "contains": "contient" }[o] || "" }));
      }
      if (paramName === "Noeud ou Tag") {
        const items: { id: string; label: string; sub: string }[] = [];
        (reportNodes || []).filter((n) => { const l = n.name || n.hostname || n.ipAddress; return !q || l.toLowerCase().includes(q) || n.ipAddress.includes(q); })
          .forEach((n) => items.push({ id: `node:${n.ipAddress}`, label: n.name || n.hostname || n.ipAddress, sub: n.ipAddress }));
        return items;
      }
      if (paramName === "Tag collecte") {
        return [
          { id: "latest", label: "latest", sub: "Derniere collecte" },
        ];
      }
      if (paramName === "Format") {
        return [
          { id: "Y-m-d H:i:s", label: "2026-04-06 14:30:00", sub: "Y-m-d H:i:s" },
          { id: "d/m/Y H:i", label: "06/04/2026 14:30", sub: "d/m/Y H:i" },
          { id: "d/m/Y", label: "06/04/2026", sub: "d/m/Y" },
          { id: "Y-m-d", label: "2026-04-06", sub: "Y-m-d" },
          { id: "d M Y", label: "06 Apr 2026", sub: "d M Y" },
          { id: "H:i:s", label: "14:30:00", sub: "H:i:s" },
          { id: "H:i", label: "14:30", sub: "H:i" },
        ].filter((f) => !q || f.label.toLowerCase().includes(q) || f.sub.toLowerCase().includes(q));
      }
      return []; // "Valeur", "Tag", "Modele", "Fabricant" — free text input
    }
    return [];
  }, [acStep, acFilter, acNode, acCategory, acKey, acFn, acFnArgs, invStructure, reportNodes, reportType, fnDefs]);

  if (!editor) return null;

  const btnClass = (active: boolean) =>
    `p-1.5 rounded-md transition-colors ${active ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`;

  const stepLabels: Record<string, string> = { root: "Type", node: "Noeud", category: "Categorie", key: "Cle", column: "Colonne", fn: "Fonction", fn_param: fnDefs.find((f) => f.id === acFn)?.params[acFnArgs.length] || "Parametre" };

  return (
    <div className="flex flex-col flex-1 min-h-0 gap-1.5">
      <label className={labelClass}>{t("structure.content")}</label>
      <div ref={editorContainerRef} className="relative flex flex-col flex-1 min-h-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0 flex-wrap">
          {/* Alignment */}
          {([
            { val: "left" as const, Icon: AlignLeft },
            { val: "center" as const, Icon: AlignCenter },
            { val: "right" as const, Icon: AlignRight },
            { val: "justify" as const, Icon: AlignJustify },
          ]).map(({ val, Icon }) => (
            <button key={val} type="button" onClick={() => { editor.chain().focus().setTextAlign(val).run(); updateBlock(block.id, { align: val }); }} className={btnClass(editor.isActive({ textAlign: val }))}>
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
          {/* Text style */}
          <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btnClass(editor.isActive("bold"))} title={t("structure.bold")}><Bold className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btnClass(editor.isActive("italic"))} title={t("structure.italic")}><Italic className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btnClass(editor.isActive("underline"))} title={t("structure.underline")}><UnderlineIcon className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btnClass(editor.isActive("strike"))} title={t("structure.strikethrough")}><Strikethrough className="h-3.5 w-3.5" /></button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
          {/* Superscript / Subscript */}
          <button type="button" onClick={() => editor.chain().focus().toggleSuperscript().run()} className={btnClass(editor.isActive("superscript"))} title={t("structure.superscript")}><Superscript className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => editor.chain().focus().toggleSubscript().run()} className={btnClass(editor.isActive("subscript"))} title={t("structure.subscript")}><Subscript className="h-3.5 w-3.5" /></button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
          {/* Text color */}
          <div className="relative flex items-center">
            <Palette className="h-3.5 w-3.5 text-slate-400 absolute left-1.5 pointer-events-none" />
            <input type="color" value={editor.getAttributes("textStyle").color || "#000000"} onChange={(e) => editor.chain().focus().setColor(e.target.value).run()} className="w-7 h-7 rounded cursor-pointer opacity-0 absolute inset-0" title={t("structure.textColor")} />
            <div className="w-7 h-7 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center">
              <Palette className="h-3.5 w-3.5" style={{ color: editor.getAttributes("textStyle").color || "#64748b" }} />
            </div>
          </div>
          {/* Highlight */}
          <div className="relative flex items-center">
            <input type="color" value={editor.getAttributes("highlight").color || "#fef08a"} onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()} className="w-7 h-7 rounded cursor-pointer opacity-0 absolute inset-0" title={t("structure.highlight")} />
            <div className={`w-7 h-7 rounded border border-slate-200 dark:border-slate-700 flex items-center justify-center ${editor.isActive("highlight") ? "bg-yellow-100 dark:bg-yellow-500/20" : ""}`}>
              <Paintbrush className="h-3.5 w-3.5 text-amber-500" />
            </div>
          </div>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
          {/* Tab / Indent */}
          <button type="button" onClick={() => editor.chain().focus().insertContent("&emsp;&emsp;").run()} className={btnClass(false)} title={t("structure.tab")}><IndentIncrease className="h-3.5 w-3.5" /></button>
          <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
          {/* Lists */}
          <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btnClass(editor.isActive("bulletList"))} title={t("structure.bulletList")}><List className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btnClass(editor.isActive("orderedList"))} title={t("structure.numberedList")}><ListOrdered className="h-3.5 w-3.5" /></button>
        </div>
        {/* Editor */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <EditorContent editor={editor} />
        </div>

        {/* Autocomplete popup */}
        {acOpen && (
          <div
            className="absolute z-50 w-96 max-h-72 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl overflow-hidden"
            style={{ top: acPos.top, left: Math.min(acPos.left, 300) }}
          >
            {/* Header with breadcrumb */}
            <div className="flex items-center gap-1 px-3 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex-wrap">
              <span className="text-[10px] font-bold text-blue-600 dark:text-blue-400">{"{{"}</span>
              {acStep !== "root" && (
                <button onClick={() => { setAcStep("root"); setAcFilter(""); setAcFn(null); setAcFnArgs([]); }} className="text-[10px] text-slate-400 hover:text-slate-600">...</button>
              )}
              {acStep !== "root" && acStep !== "fn" && acStep !== "fn_param" && acStep !== "node" && reportType !== "node" && acNode && (
                <>
                  <span className="text-[10px] text-slate-300">.</span>
                  <button onClick={() => { setAcStep("node"); setAcFilter(""); }} className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">{acNode}</button>
                </>
              )}
              {(acStep === "key" || acStep === "column") && acCategory && (
                <>
                  <span className="text-[10px] text-slate-300">.</span>
                  <button onClick={() => { setAcStep("category"); setAcFilter(""); }} className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">{acCategory}</button>
                </>
              )}
              {acStep === "column" && acKey && (
                <>
                  <span className="text-[10px] text-slate-300">.</span>
                  <button onClick={() => { setAcStep("key"); setAcFilter(""); }} className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">{acKey}</button>
                </>
              )}
              {acStep === "fn_param" && acFn && (
                <>
                  <span className="text-[10px] text-slate-300">.</span>
                  <button onClick={() => { setAcStep("fn"); setAcFilter(""); setAcFnArgs([]); }} className="text-[10px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">{acFn}</button>
                  {acFnArgs.map((a, i) => (
                    <span key={i} className="text-[10px] text-slate-400">(&quot;{a}&quot;)</span>
                  ))}
                </>
              )}
              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400 ml-0.5">{stepLabels[acStep]}</span>
              <button onClick={() => setAcOpen(false)} className="ml-auto p-0.5 text-slate-400 hover:text-slate-600"><X className="h-3 w-3" /></button>
            </div>
            {/* Search */}
            <div className="px-2 py-1.5 border-b border-slate-100 dark:border-slate-800">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400" />
                <input
                  type="text"
                  value={acFilter}
                  onChange={(e) => setAcFilter(e.target.value)}
                  placeholder={`Filtrer...`}
                  className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1 pl-7 pr-2 text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none"
                  autoFocus
                  onKeyDown={(e) => { if (e.key === "Escape") setAcOpen(false); }}
                />
              </div>
            </div>
            {/* Suggestions */}
            <div className="max-h-44 overflow-y-auto">
              {suggestions.length === 0 && acStep !== "fn_param" && (
                <div className="px-3 py-4 text-center text-xs text-slate-400">Aucun resultat</div>
              )}
              {suggestions.map((s, sIdx) => (<>
                {acStep === "fn" && (s as { group?: string }).group && (sIdx === 0 || (suggestions[sIdx - 1] as { group?: string }).group !== (s as { group?: string }).group) && (
                  <div className="px-3 py-1 text-[9px] font-bold text-slate-400 uppercase tracking-wider bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800">{(s as { group?: string }).group}</div>
                )}
                <button
                  key={s.id}
                  onClick={() => {
                    if (acStep === "root") {
                      if (s.id === "_var") acGoVariable();
                      else if (s.id === "_fn") { setAcStep("fn"); setAcFilter(""); }
                    }
                    else if (acStep === "node") selectNode(s.id);
                    else if (acStep === "category") selectCategory(s.id);
                    else if (acStep === "key") selectKey(s.id, (s as { columns?: string[] }).columns || []);
                    else if (acStep === "column") selectColumn(s.id);
                    else if (acStep === "fn") selectFn(s.id);
                    else if (acStep === "fn_param") submitFnArg(s.id);
                  }}
                  className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
                >
                  <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">{s.label}</span>
                  {s.sub && <span className="text-[10px] text-slate-400 shrink-0 ml-2">{s.sub}</span>}
                </button>
              </>))}
              {/* Free text input for fn params without suggestions */}
              {acStep === "fn_param" && suggestions.length === 0 && (
                <div className="px-3 py-2">
                  <div className="text-[10px] text-slate-400 mb-1">{fnDefs.find((f) => f.id === acFn)?.params[acFnArgs.length] || "Valeur"}</div>
                  <form onSubmit={(e) => { e.preventDefault(); if (acFilter.trim()) submitFnArg(acFilter.trim()); }}>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={acFilter}
                        onChange={(e) => setAcFilter(e.target.value)}
                        placeholder="Saisir la valeur..."
                        className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs focus:outline-none"
                        autoFocus
                      />
                      <button type="submit" className="rounded bg-slate-900 dark:bg-white px-2 py-1 text-[10px] font-medium text-white dark:text-slate-900">OK</button>
                    </div>
                  </form>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// --- Image inline properties ---
function ImageProperties({
  block,
  updateBlock,
  t,
}: {
  block: ImageBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const res = await fetch("/api/block-images", { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        updateBlock(block.id, { filename: data.filename, url: data.url });
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleRemove = async () => {
    if (block.filename) {
      await fetch(`/api/block-images/${block.filename}`, { method: "DELETE" }).catch(() => {});
    }
    updateBlock(block.id, { filename: "", url: "" });
  };

  return (
    <div className="space-y-4">
      {/* Upload / Preview */}
      <div className="space-y-1.5">
        <label className={labelClass}>{t("structure.image")}</label>
        {block.url ? (
          <div className="relative rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3">
            <img
              src={block.url}
              alt={block.caption || ""}
              className="max-h-[160px] mx-auto rounded object-contain"
            />
            <button
              onClick={handleRemove}
              className="absolute top-2 right-2 p-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-red-500 hover:border-red-300 dark:hover:border-red-500/30 transition-colors shadow-sm"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 py-8 text-slate-400 dark:text-slate-500 hover:border-slate-400 dark:hover:border-slate-500 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
          >
            {uploading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <Upload className="h-6 w-6" />
            )}
            <span className="text-sm">{uploading ? t("structure.uploading") : t("structure.uploadImage")}</span>
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.svg"
          onChange={handleUpload}
          className="hidden"
        />
      </div>

      {/* Width */}
      <div className="space-y-1.5">
        <label className={labelClass}>{t("structure.imageWidth")}</label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={10}
            max={100}
            step={5}
            value={block.width}
            onChange={(e) => updateBlock(block.id, { width: Number(e.target.value) })}
            className="flex-1 accent-slate-900 dark:accent-white"
          />
          <span className="text-sm font-medium text-slate-700 dark:text-slate-300 w-12 text-right">{block.width}%</span>
        </div>
      </div>

      {/* Caption toggle + input */}
      <div className="space-y-3">
        <label className="flex items-center gap-2.5 cursor-pointer">
          <button type="button" onClick={() => updateBlock(block.id, { showCaption: !block.showCaption })}>
            {block.showCaption ? (
              <ToggleRight className="h-5 w-5 text-emerald-500" />
            ) : (
              <ToggleLeft className="h-5 w-5 text-slate-400" />
            )}
          </button>
          <span className="text-sm text-slate-600 dark:text-slate-400">{t("structure.showCaption")}</span>
        </label>
        {block.showCaption && (
          <div className="space-y-1.5">
            <label className={labelClass}>{t("structure.caption")}</label>
            <input
              type="text"
              value={block.caption}
              onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
              placeholder={t("structure.captionPlaceholder")}
              className={inputClass}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// --- ContentEditable cell editor ---
function CellEditor({
  html,
  onChange,
  className,
  style,
  placeholder,
  onFocusCb,
  onBlurCb,
  onSelectionChange,
  editorRef,
}: {
  html: string;
  onChange: (html: string) => void;
  className: string;
  style?: React.CSSProperties;
  placeholder?: string;
  onFocusCb: () => void;
  onBlurCb: () => void;
  onSelectionChange?: () => void;
  editorRef?: (el: HTMLDivElement | null) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const lastHtml = useRef("");

  useEffect(() => {
    if (ref.current && html !== lastHtml.current) {
      // Safely set content: use textContent for plain text, innerHTML for HTML
      if (/<[a-z/][\s\S]*>/i.test(html)) {
        ref.current.innerHTML = html;
      } else {
        ref.current.textContent = html;
      }
      lastHtml.current = html;
    }
  }, [html]);

  return (
    <div
      ref={(el) => { ref.current = el; editorRef?.(el); }}
      contentEditable
      suppressContentEditableWarning
      className={className}
      style={style}
      data-placeholder={placeholder}
      onInput={() => {
        if (ref.current) {
          const h = ref.current.innerHTML;
          lastHtml.current = h;
          onChange(h);
        }
      }}
      onFocus={onFocusCb}
      onBlur={onBlurCb}
      onKeyUp={onSelectionChange}
      onMouseUp={onSelectionChange}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          document.execCommand("insertLineBreak");
        }
      }}
      onPaste={(e) => {
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain");
        document.execCommand("insertText", false, text);
      }}
    />
  );
}

// --- Vertical alignment icon indicator ---
function VAlignIcon({ type }: { type: "top" | "middle" | "bottom" }) {
  return (
    <span className="flex flex-col justify-between w-2.5 h-3">
      <span className={`h-[2px] rounded-full ${type === "top" ? "bg-current" : "bg-current/25"}`} />
      <span className={`h-[2px] rounded-full ${type === "middle" ? "bg-current" : "bg-current/25"}`} />
      <span className={`h-[2px] rounded-full ${type === "bottom" ? "bg-current" : "bg-current/25"}`} />
    </span>
  );
}

// --- Table inline properties ---
function TableProperties({
  block,
  updateBlock,
  t,
}: {
  block: TableBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const colCount = block.headers.length;
  const [activeCell, setActiveCell] = useState<{ row: number; col: number } | null>(null);
  const [, setFormatTick] = useState(0);
  const cellRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const popoverInputFocused = useRef(false);

  const aligns: ("left" | "center" | "right")[] = block.columnAligns?.length === colCount
    ? block.columnAligns
    : Array(colCount).fill("left");
  const widths: number[] = block.columnWidths?.length === colCount
    ? block.columnWidths
    : Array(colCount).fill(Math.round(100 / colCount));
  const vAligns: ("top" | "middle" | "bottom")[] = block.columnVAligns?.length === colCount
    ? block.columnVAligns
    : Array(colCount).fill("middle");
  const totalWidth = widths.reduce((a, b) => a + b, 0);

  // Migrate legacy cell-level bold/italic to inline HTML on mount
  useEffect(() => {
    let needsUpdate = false;
    const migrate = (cell: string | TableCell): TableCell => {
      const c = normalizeCell(cell);
      if (c.bold || c.italic) {
        needsUpdate = true;
        let v = c.value;
        if (c.italic) v = `<i>${v}</i>`;
        if (c.bold) v = `<b>${v}</b>`;
        return { value: v, size: c.size };
      }
      return c;
    };
    const migratedHeaders = block.headers.map(migrate);
    const migratedRows = block.rows.map((r) => r.map(migrate));
    if (needsUpdate) {
      updateBlock(block.id, { headers: migratedHeaders, rows: migratedRows });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const getCellKey = (row: number, col: number) => `${row}-${col}`;

  const handleCellRef = (row: number, col: number) => (el: HTMLDivElement | null) => {
    const key = getCellKey(row, col);
    if (el) cellRefs.current.set(key, el);
    else cellRefs.current.delete(key);
  };

  const getCellData = (row: number, col: number): TableCell => {
    const raw = row === -1 ? block.headers[col] : block.rows[row]?.[col];
    return normalizeCell(raw ?? "");
  };

  const updateCellData = (row: number, col: number, patch: Partial<TableCell>) => {
    if (row === -1) {
      const headers = block.headers.map((h, i) => i === col ? { ...normalizeCell(h), ...patch } : h);
      updateBlock(block.id, { headers });
    } else {
      const rows = block.rows.map((r, ri) =>
        ri === row ? r.map((c, ci) => ci === col ? { ...normalizeCell(c), ...patch } : c) : r
      );
      updateBlock(block.id, { rows });
    }
  };

  const updateAlign = (colIdx: number, align: "left" | "center" | "right") => {
    const newAligns = [...aligns];
    newAligns[colIdx] = align;
    updateBlock(block.id, { columnAligns: newAligns });
  };

  const updateVAlign = (colIdx: number, valign: "top" | "middle" | "bottom") => {
    const newVAligns = [...vAligns];
    newVAligns[colIdx] = valign;
    updateBlock(block.id, { columnVAligns: newVAligns });
  };

  const updateWidth = (colIdx: number, value: number) => {
    const newWidths = [...widths];
    newWidths[colIdx] = value;
    updateBlock(block.id, { columnWidths: newWidths });
  };

  const applyFormat = (command: string) => {
    document.execCommand(command, false);
    // Sync HTML back from the focused contentEditable
    if (activeCell) {
      const el = cellRefs.current.get(getCellKey(activeCell.row, activeCell.col));
      if (el) updateCellData(activeCell.row, activeCell.col, { value: el.innerHTML });
    }
    setFormatTick((n) => n + 1);
  };

  const handleSelectionChange = () => setFormatTick((n) => n + 1);

  const addRow = () => {
    updateBlock(block.id, { rows: [...block.rows, Array(colCount).fill({ value: "" })] });
  };

  const removeRow = (rowIdx: number) => {
    if (block.rows.length <= 1) return;
    updateBlock(block.id, { rows: block.rows.filter((_, i) => i !== rowIdx) });
  };

  const addColumn = () => {
    const newCount = colCount + 1;
    const equalW = Math.round(100 / newCount);
    updateBlock(block.id, {
      headers: [...block.headers, { value: "" }],
      rows: block.rows.map((r) => [...r, { value: "" }]),
      columnAligns: [...aligns, "left"],
      columnWidths: Array(newCount).fill(equalW),
      columnVAligns: [...vAligns, "middle"],
    });
  };

  const removeColumn = (colIdx: number) => {
    if (colCount <= 1) return;
    const removedW = widths[colIdx];
    const newWidths = widths.filter((_, i) => i !== colIdx);
    const share = Math.round(removedW / newWidths.length);
    const redistributed = newWidths.map((w, i) => i === 0 ? w + removedW - share * (newWidths.length - 1) : w + share);
    updateBlock(block.id, {
      headers: block.headers.filter((_, i) => i !== colIdx),
      rows: block.rows.map((r) => r.filter((_, i) => i !== colIdx)),
      columnAligns: aligns.filter((_, i) => i !== colIdx),
      columnWidths: redistributed,
      columnVAligns: vAligns.filter((_, i) => i !== colIdx),
    });
    if (activeCell?.col === colIdx) setActiveCell(null);
  };

  const moveColumn = (colIdx: number, dir: -1 | 1) => {
    const target = colIdx + dir;
    if (target < 0 || target >= colCount) return;
    const swap = <T,>(arr: T[]): T[] => { const a = [...arr]; [a[colIdx], a[target]] = [a[target], a[colIdx]]; return a; };
    updateBlock(block.id, {
      headers: swap(block.headers),
      rows: block.rows.map((r) => swap(r)),
      columnAligns: swap(aligns),
      columnWidths: swap(widths),
      columnVAligns: swap(vAligns),
    });
    setActiveCell((prev) => prev ? { ...prev, col: target } : null);
  };

  const moveRow = (rowIdx: number, dir: -1 | 1) => {
    const target = rowIdx + dir;
    if (target < 0 || target >= block.rows.length) return;
    const newRows = [...block.rows];
    [newRows[rowIdx], newRows[target]] = [newRows[target], newRows[rowIdx]];
    updateBlock(block.id, { rows: newRows });
  };

  const baseCellClass =
    "w-full h-full min-h-[32px] px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400/40";
  const baseHeaderCellClass =
    "w-full h-full min-h-[32px] px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-inset focus:ring-blue-400/40";
  const tdClass = "border-r border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900";
  const thClass = "border-r border-b border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800";

  const popoverBtnClass = (active: boolean) =>
    `p-1 rounded transition-colors ${
      active
        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
        : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
    }`;

  // Popover content for a cell
  const renderPopover = (row: number, col: number) => {
    const cell = getCellData(row, col);
    const isHeader = row === -1;
    const isBold = typeof document !== "undefined" && document.queryCommandState("bold");
    const isItalic = typeof document !== "undefined" && document.queryCommandState("italic");

    return (
      <div
        className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-30 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg p-2 flex items-center gap-1"
        onMouseDown={(e) => { if (!(e.target instanceof HTMLInputElement)) e.preventDefault(); }}
      >
        {/* Column settings (header only) */}
        {isHeader && (
          <>
            {colCount > 1 && (
              <>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => moveColumn(col, -1)} disabled={col === 0} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors">
                  <ChevronLeft className="h-3 w-3" />
                </button>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => moveColumn(col, 1)} disabled={col === colCount - 1} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-30 transition-colors">
                  <ChevronRight className="h-3 w-3" />
                </button>
                <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />
              </>
            )}
            <div className="flex items-center gap-0.5 pr-1">
              <input
                type="number"
                min={5}
                max={95}
                value={widths[col]}
                onChange={(e) => updateWidth(col, Math.max(5, Math.min(95, Number(e.target.value) || 5)))}
                onFocus={() => { popoverInputFocused.current = true; }}
                onBlur={() => { popoverInputFocused.current = false; setTimeout(() => { if (!popoverInputFocused.current) setActiveCell(null); }, 150); }}
                className="w-11 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-1 py-0.5 text-[11px] text-center text-slate-900 dark:text-slate-100 focus:outline-none"
              />
              <span className="text-[10px] text-slate-400">%</span>
            </div>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />
            {/* Horizontal alignment */}
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => updateAlign(col, "left")} className={popoverBtnClass(aligns[col] === "left")}>
              <AlignLeft className="h-3 w-3" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => updateAlign(col, "center")} className={popoverBtnClass(aligns[col] === "center")}>
              <AlignCenter className="h-3 w-3" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => updateAlign(col, "right")} className={popoverBtnClass(aligns[col] === "right")}>
              <AlignRight className="h-3 w-3" />
            </button>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />
            {/* Vertical alignment */}
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => updateVAlign(col, "top")} className={popoverBtnClass(vAligns[col] === "top")} title={t("structure.alignTop")}>
              <VAlignIcon type="top" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => updateVAlign(col, "middle")} className={popoverBtnClass(vAligns[col] === "middle")} title={t("structure.alignMiddle")}>
              <VAlignIcon type="middle" />
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => updateVAlign(col, "bottom")} className={popoverBtnClass(vAligns[col] === "bottom")} title={t("structure.alignBottom")}>
              <VAlignIcon type="bottom" />
            </button>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />
          </>
        )}
        {/* Inline formatting */}
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat("bold")} className={popoverBtnClass(isBold)}>
          <Bold className="h-3 w-3" />
        </button>
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => applyFormat("italic")} className={popoverBtnClass(isItalic)}>
          <Italic className="h-3 w-3" />
        </button>
        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />
        <input
          type="number"
          min={6}
          max={24}
          value={cell.size || ""}
          placeholder="—"
          onChange={(e) => updateCellData(row, col, { size: e.target.value ? Number(e.target.value) : undefined })}
          onFocus={() => { popoverInputFocused.current = true; }}
          onBlur={() => { popoverInputFocused.current = false; setTimeout(() => { if (!popoverInputFocused.current) setActiveCell(null); }, 150); }}
          className="w-10 rounded border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-900 px-1 py-0.5 text-[11px] text-center text-slate-900 dark:text-slate-100 focus:outline-none"
          title={t("structure.fontSize")}
        />
        <span className="text-[10px] text-slate-400">pt</span>

        {/* Remove column button on header */}
        {isHeader && colCount > 1 && (
          <>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700" />
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => removeColumn(col)}
              className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              title={t("structure.removeColumn")}
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </>
        )}
      </div>
    );
  };

  const cellStyle = (cell: TableCell, col: number): React.CSSProperties => ({
    textAlign: aligns[col],
    fontSize: cell.size ? `${cell.size}px` : undefined,
  });

  return (
    <div className="space-y-4">
      {/* Show header toggle */}
      <label className="flex items-center gap-2.5 cursor-pointer">
        <button type="button" onClick={() => updateBlock(block.id, { showHeader: !block.showHeader })}>
          {block.showHeader ? (
            <ToggleRight className="h-5 w-5 text-emerald-500" />
          ) : (
            <ToggleLeft className="h-5 w-5 text-slate-400" />
          )}
        </button>
        <span className="text-sm text-slate-600 dark:text-slate-400">{t("structure.showTableHeader")}</span>
      </label>

      {totalWidth !== 100 && (
        <p className="text-xs text-amber-600 dark:text-amber-400">
          {t("structure.widthTotal", { total: String(totalWidth) })}
        </p>
      )}

      {/* Table editor */}
      <div className="space-y-1.5">
        <label className={labelClass}>{t("structure.tableData")}</label>
        <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-visible">
          <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "28px" }} />
              {widths.map((w, ci) => (
                <col key={ci} style={{ width: `${(w / totalWidth) * 100}%` }} />
              ))}
              <col style={{ width: "32px" }} />
            </colgroup>
            {/* Header row */}
            {block.showHeader && (
              <thead>
                <tr>
                  <th className="p-0" />
                  {block.headers.map((h, ci) => {
                    const cell = normalizeCell(h);
                    const isActive = activeCell?.row === -1 && activeCell?.col === ci;
                    return (
                      <th key={ci} className={`relative p-0 ${thClass}`} style={{ verticalAlign: vAligns[ci] }}>
                        <CellEditor
                          html={cell.value}
                          onChange={(html) => updateCellData(-1, ci, { value: html })}
                          className={baseHeaderCellClass}
                          style={cellStyle(cell, ci)}
                          placeholder={t("structure.headerPlaceholder")}
                          onFocusCb={() => setActiveCell({ row: -1, col: ci })}
                          onBlurCb={() => setTimeout(() => { if (popoverInputFocused.current) return; setActiveCell((prev) => prev?.row === -1 && prev?.col === ci ? null : prev); }, 150)}
                          onSelectionChange={handleSelectionChange}
                          editorRef={handleCellRef(-1, ci)}
                        />
                        {isActive && renderPopover(-1, ci)}
                      </th>
                    );
                  })}
                  <th className="p-0" />
                </tr>
              </thead>
            )}
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri} className="group/row">
                  <td className="p-0 align-middle">
                    {block.rows.length > 1 && (
                      <div className="flex flex-col items-center opacity-0 group-hover/row:opacity-100 transition-opacity">
                        <button
                          onClick={() => moveRow(ri, -1)}
                          disabled={ri === 0}
                          className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 transition-colors"
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          onClick={() => moveRow(ri, 1)}
                          disabled={ri === block.rows.length - 1}
                          className="p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 disabled:opacity-30 transition-colors"
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                    )}
                  </td>
                  {row.map((rawCell, ci) => {
                    const cell = normalizeCell(rawCell);
                    const isActive = activeCell?.row === ri && activeCell?.col === ci;
                    return (
                      <td key={ci} className={`relative p-0 ${tdClass}`} style={{ verticalAlign: vAligns[ci] }}>
                        <CellEditor
                          html={cell.value}
                          onChange={(html) => updateCellData(ri, ci, { value: html })}
                          className={baseCellClass}
                          style={cellStyle(cell, ci)}
                          onFocusCb={() => setActiveCell({ row: ri, col: ci })}
                          onBlurCb={() => setTimeout(() => { if (popoverInputFocused.current) return; setActiveCell((prev) => prev?.row === ri && prev?.col === ci ? null : prev); }, 150)}
                          onSelectionChange={handleSelectionChange}
                          editorRef={handleCellRef(ri, ci)}
                        />
                        {isActive && renderPopover(ri, ci)}
                      </td>
                    );
                  })}
                  <td className="p-0 align-middle">
                    {block.rows.length > 1 && (
                      <button
                        onClick={() => removeRow(ri)}
                        className="p-1 text-slate-400 hover:text-red-500 transition-colors"
                        title={t("structure.removeRow")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add row / column buttons */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={addRow}
          className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("structure.addRow")}
        </button>
        <button
          type="button"
          onClick={addColumn}
          className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("structure.addColumn")}
        </button>
      </div>
    </div>
  );
}

// --- Inventory Table inline properties ---

interface InvStructureCategory {
  categoryName: string;
  entries: { key: string; columns: string[] }[];
}

interface NodeItem {
  id: number;
  hostname: string | null;
  name: string | null;
  ipAddress: string;
}

interface InvTagItem { id: number; name: string; color: string; }
interface InvManufacturerItem { id: number; name: string; }
interface InvModelItem { id: number; name: string; manufacturer?: { id: number; name: string } | null; }

function InventoryTableProperties({
  block,
  updateBlock,
  t,
  reportType,
  reportNodes,
}: {
  block: InventoryTableBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
  reportType?: "general" | "node";
  reportNodes?: ReportNodeRef[];
}) {
  const { current } = useAppContext();
  const isNodeReport = reportType === "node";
  const mode = block.mode ?? "multi_node_columns";
  const [tab, setTab] = useState<"columns" | "source" | "equipment" | "style" | "preview">(
    mode === "single_node_full" ? "source" : "columns"
  );

  // Inventory structure for multi-level dropdown
  const [structure, setStructure] = useState<InvStructureCategory[]>([]);
  const [structureLoaded, setStructureLoaded] = useState(false);

  // Nodes
  const [allNodes, setAllNodes] = useState<NodeItem[]>([]);
  const [nodesLoaded, setNodesLoaded] = useState(false);
  const [nodeSearch, setNodeSearch] = useState("");

  // Tags / manufacturers / models for rules
  const [tags, setTags] = useState<InvTagItem[]>([]);
  const [manufacturers, setManufacturers] = useState<InvManufacturerItem[]>([]);
  const [models, setModels] = useState<InvModelItem[]>([]);

  // Rule preview
  const [rulePreview, setRulePreview] = useState<number[]>([]);
  const [rulePreviewLoading, setRulePreviewLoading] = useState(false);

  // Column picker state
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCat, setPickerCat] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState<string | null>(null);

  // Load inventory structure
  useEffect(() => {
    if (!current || structureLoaded) return;
    fetch(`/api/inventory-categories/structure?context=${current.id}`)
      .then((r) => r.json())
      .then((data: InvStructureCategory[]) => { setStructure(data); setStructureLoaded(true); })
      .catch(() => setStructureLoaded(true));
  }, [current, structureLoaded]);

  // Load nodes
  useEffect(() => {
    if (!current || nodesLoaded) return;
    fetch(`/api/nodes?context=${current.id}`)
      .then((r) => r.json())
      .then((data: NodeItem[]) => { setAllNodes(data); setNodesLoaded(true); })
      .catch(() => setNodesLoaded(true));
  }, [current, nodesLoaded]);

  // Load tags / manufacturers / models for rule editor (only in general report mode)
  useEffect(() => {
    if (!current || isNodeReport) return;
    fetch(`/api/node-tags?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setTags).catch(() => {});
    fetch(`/api/manufacturers?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setManufacturers).catch(() => {});
    fetch(`/api/models?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setModels).catch(() => {});
  }, [current, isNodeReport]);

  // Resolve rule preview whenever rules change
  const nodeRules = block.nodeRules ?? [];
  const nodeRulesMatch = block.nodeRulesMatch ?? "any";
  useEffect(() => {
    if (!current || isNodeReport || nodeRules.length === 0) {
      setRulePreview([]);
      return;
    }
    setRulePreviewLoading(true);
    fetch(`/api/nodes/match?context=${current.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: nodeRules, match: nodeRulesMatch }),
    })
      .then((r) => r.ok ? r.json() : { nodeIds: [] })
      .then((data: { nodeIds: number[] }) => setRulePreview(data.nodeIds ?? []))
      .catch(() => setRulePreview([]))
      .finally(() => setRulePreviewLoading(false));
  }, [current, isNodeReport, JSON.stringify(nodeRules), nodeRulesMatch]);

  const selectedNodes = allNodes.filter((n) => block.nodeIds.includes(n.id));
  const ruleMatchedNodes = allNodes.filter((n) => rulePreview.includes(n.id) && !block.nodeIds.includes(n.id));
  const availableNodes = allNodes.filter(
    (n) =>
      !block.nodeIds.includes(n.id) &&
      (nodeSearch === "" ||
        (n.hostname ?? "").toLowerCase().includes(nodeSearch.toLowerCase()) ||
        (n.name ?? "").toLowerCase().includes(nodeSearch.toLowerCase()) ||
        n.ipAddress.includes(nodeSearch))
  );

  const addNode = (id: number) => {
    updateBlock(block.id, { nodeIds: [...block.nodeIds, id] });
  };
  const removeNode = (id: number) => {
    updateBlock(block.id, { nodeIds: block.nodeIds.filter((n) => n !== id) });
  };

  const addColumn = (category: string, entryKey: string, colLabel: string) => {
    const col: InventoryTableColumn = {
      id: uid(),
      category,
      entryKey,
      colLabel,
      label: `${category} > ${entryKey} > ${colLabel}`,
    };
    updateBlock(block.id, { columns: [...block.columns, col] });
    setPickerOpen(false);
    setPickerCat(null);
    setPickerKey(null);
  };

  const removeColumn = (colId: string) => {
    updateBlock(block.id, { columns: block.columns.filter((c) => c.id !== colId) });
  };

  const updateColumnLabel = (colId: string, label: string) => {
    updateBlock(block.id, {
      columns: block.columns.map((c) => (c.id === colId ? { ...c, label } : c)),
    });
  };

  const updateColumnHeaderLabel = (colId: string, headerLabel: string) => {
    updateBlock(block.id, {
      columns: block.columns.map((c) => (c.id === colId ? { ...c, headerLabel } : c)),
    });
  };

  const updateColumnProp = (colId: string, patch: Partial<InventoryTableColumn>) => {
    updateBlock(block.id, {
      columns: block.columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)),
    });
  };

  const moveColumn = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= block.columns.length) return;
    const cols = [...block.columns];
    [cols[idx], cols[target]] = [cols[target], cols[idx]];
    updateBlock(block.id, { columns: cols });
  };

  const tabBtnClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? "border-violet-500 text-violet-600 dark:text-violet-400"
        : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
    }`;

  const alignBtnClass = (active: boolean) =>
    `p-1 rounded transition-colors ${
      active
        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
        : "text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
    }`;

  // Current picker category data
  const pickerCatData = pickerCat ? structure.find((c) => c.categoryName === pickerCat) : null;
  const pickerKeyData = pickerCatData && pickerKey ? pickerCatData.entries.find((e) => e.key === pickerKey) : null;

  const rules = block.styleRules ?? [];

  const addRule = () => {
    const rule: InventoryStyleRule = {
      id: uid(),
      columnId: block.columns[0]?.id ?? "__hostname__",
      operator: "gte",
      value: "",
    };
    updateBlock(block.id, { styleRules: [...rules, rule] });
  };

  const updateRule = (ruleId: string, patch: Partial<InventoryStyleRule>) => {
    updateBlock(block.id, {
      styleRules: rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)),
    });
  };

  const removeRule = (ruleId: string) => {
    updateBlock(block.id, { styleRules: rules.filter((r) => r.id !== ruleId) });
  };

  const moveRule = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= rules.length) return;
    const arr = [...rules];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    updateBlock(block.id, { styleRules: arr });
  };

  const operatorLabels: Record<InventoryStyleRule["operator"], string> = {
    eq: "=",
    neq: "!=",
    gt: ">",
    gte: ">=",
    lt: "<",
    lte: "<=",
    contains: t("structure.ruleContains"),
    not_contains: t("structure.ruleNotContains"),
  };

  // Column options for rule dropdown
  const ruleColumnOptions: { id: string; label: string }[] = [
    { id: "__hostname__", label: block.hostnameHeaderLabel || "Hostname" },
    ...block.columns.map((c) => ({
      id: c.id,
      label: c.headerLabel || c.label || `${c.category} > ${c.entryKey} > ${c.colLabel}`,
    })),
  ];

  // --- Auto-selection rules (multi mode + general report) ---
  const addNodeRule = () => {
    const r: InventoryNodeRule = { id: uid(), type: "tag", operator: "eq" };
    updateBlock(block.id, { nodeRules: [...nodeRules, r] });
  };
  const updateNodeRule = (rid: string, patch: Partial<InventoryNodeRule>) => {
    updateBlock(block.id, {
      nodeRules: nodeRules.map((r) => (r.id === rid ? { ...r, ...patch } : r)),
    });
  };
  const removeNodeRule = (rid: string) => {
    updateBlock(block.id, { nodeRules: nodeRules.filter((r) => r.id !== rid) });
  };

  const ruleTypeOptions: { value: InventoryNodeRuleType; label: string }[] = [
    { value: "tag", label: t("structure.invRuleTypeTag") },
    { value: "discoveredVersion", label: t("structure.invRuleTypeVersion") },
    { value: "manufacturer", label: t("structure.invRuleTypeManufacturer") },
    { value: "model", label: t("structure.invRuleTypeModel") },
    { value: "productModel", label: t("structure.invRuleTypeProductModel") },
    { value: "hostname", label: t("structure.invRuleTypeHostname") },
    { value: "inventory", label: t("structure.invRuleTypeInventory") },
  ];

  const ruleOperatorOptions: { value: InventoryNodeRuleOperator; label: string }[] = [
    { value: "eq", label: "=" },
    { value: "neq", label: "!=" },
    { value: "contains", label: t("structure.ruleContains") },
    { value: "not_contains", label: t("structure.ruleNotContains") },
    { value: "starts_with", label: t("structure.invRuleStartsWith") },
    { value: "ends_with", label: t("structure.invRuleEndsWith") },
  ];

  // Effective node ids = manual + matched (for preview consistency)
  const effectiveNodes = (() => {
    if (mode === "single_node_full") {
      if (isNodeReport && reportNodes && reportNodes.length > 0) {
        return reportNodes.slice(0, 1).map((n) => ({ id: n.id, hostname: n.hostname, name: n.name, ipAddress: n.ipAddress } as NodeItem));
      }
      const sn = block.singleNodeId ? allNodes.find((n) => n.id === block.singleNodeId) : null;
      return sn ? [sn] : [];
    }
    if (isNodeReport && reportNodes && reportNodes.length > 0) {
      return reportNodes.map((n) => ({ id: n.id, hostname: n.hostname, name: n.name, ipAddress: n.ipAddress } as NodeItem));
    }
    const ids = new Set<number>(block.nodeIds);
    rulePreview.forEach((id) => ids.add(id));
    return allNodes.filter((n) => ids.has(n.id));
  })();

  const showColumnsTab = mode === "multi_node_columns";
  const showSingleSourceTab = mode === "single_node_full";
  const showEquipmentTab = mode === "multi_node_columns" && !isNodeReport;

  return (
    <div className="space-y-4">
      {/* Mode banner */}
      <div className="rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 p-3 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-violet-700 dark:text-violet-300 uppercase tracking-wide">{t("structure.invModeTitle")}</span>
          {isNodeReport && (
            <span className="text-[10px] text-violet-600 dark:text-violet-400 italic">{t("structure.invModeNodeReportHint")}</span>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { updateBlock(block.id, { mode: "multi_node_columns" }); setTab("columns"); }}
            className={`flex flex-col gap-1 rounded-md border-2 px-3 py-2 text-left transition-colors ${
              mode === "multi_node_columns"
                ? "border-violet-500 bg-white dark:bg-slate-900"
                : "border-transparent bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900"
            }`}
          >
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{t("structure.invModeMultiTitle")}</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">{t("structure.invModeMultiDesc")}</span>
          </button>
          <button
            type="button"
            onClick={() => { updateBlock(block.id, { mode: "single_node_full" }); setTab("source"); }}
            className={`flex flex-col gap-1 rounded-md border-2 px-3 py-2 text-left transition-colors ${
              mode === "single_node_full"
                ? "border-violet-500 bg-white dark:bg-slate-900"
                : "border-transparent bg-white/50 dark:bg-slate-900/50 hover:bg-white dark:hover:bg-slate-900"
            }`}
          >
            <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">{t("structure.invModeSingleTitle")}</span>
            <span className="text-[10px] text-slate-500 dark:text-slate-400">{t("structure.invModeSingleDesc")}</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        {showColumnsTab && (
          <button type="button" className={tabBtnClass(tab === "columns")} onClick={() => setTab("columns")}>
            {t("structure.inventoryColumns")}
          </button>
        )}
        {showSingleSourceTab && (
          <button type="button" className={tabBtnClass(tab === "source")} onClick={() => setTab("source")}>
            {t("structure.invSourceTab")}
          </button>
        )}
        {showEquipmentTab && (
          <button type="button" className={tabBtnClass(tab === "equipment")} onClick={() => setTab("equipment")}>
            {t("structure.inventoryEquipment")}
            {(block.nodeIds.length > 0 || (nodeRules.length > 0 && rulePreview.length > 0)) && (
              <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-violet-100 dark:bg-violet-500/15 px-1.5 text-[10px] font-bold text-violet-600 dark:text-violet-400">
                {block.nodeIds.length + ruleMatchedNodes.length}
              </span>
            )}
          </button>
        )}
        <button type="button" className={tabBtnClass(tab === "style")} onClick={() => setTab("style")}>
          {t("structure.inventoryStyle")}
        </button>
        <button type="button" className={tabBtnClass(tab === "preview")} onClick={() => setTab("preview")}>
          {t("structure.inventoryPreview")}
        </button>
      </div>

      {/* Columns tab */}
      {tab === "columns" && (
        <div className="space-y-3">
          {/* Hostname column (always first, not removable) */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-violet-600 dark:text-violet-400 uppercase tracking-wide">1</span>
              <span className="flex-1 text-sm font-medium text-slate-700 dark:text-slate-300">Hostname</span>
              <span className="text-[10px] text-slate-400 italic">{t("structure.inventoryFixed")}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={block.hostnameHeaderLabel ?? ""}
                onChange={(e) => updateBlock(block.id, { hostnameHeaderLabel: e.target.value })}
                placeholder={t("structure.inventoryHeaderLabel")}
                className="flex-1 bg-white dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 px-2 py-1 focus:outline-none focus:border-violet-400 placeholder:text-slate-400 dark:placeholder:text-slate-500"
              />
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" onClick={() => updateBlock(block.id, { hostnameAlign: "left" })} className={alignBtnClass((block.hostnameAlign ?? "left") === "left")}><AlignLeft className="h-3 w-3" /></button>
                <button type="button" onClick={() => updateBlock(block.id, { hostnameAlign: "center" })} className={alignBtnClass(block.hostnameAlign === "center")}><AlignCenter className="h-3 w-3" /></button>
                <button type="button" onClick={() => updateBlock(block.id, { hostnameAlign: "right" })} className={alignBtnClass(block.hostnameAlign === "right")}><AlignRight className="h-3 w-3" /></button>
              </div>
              <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 shrink-0" />
              <div className="flex items-center gap-0.5 shrink-0">
                <button type="button" onClick={() => updateBlock(block.id, { hostnameVAlign: "top" })} className={alignBtnClass(block.hostnameVAlign === "top")} title={t("structure.alignTop")}><VAlignIcon type="top" /></button>
                <button type="button" onClick={() => updateBlock(block.id, { hostnameVAlign: "middle" })} className={alignBtnClass((block.hostnameVAlign ?? "middle") === "middle")} title={t("structure.alignMiddle")}><VAlignIcon type="middle" /></button>
                <button type="button" onClick={() => updateBlock(block.id, { hostnameVAlign: "bottom" })} className={alignBtnClass(block.hostnameVAlign === "bottom")} title={t("structure.alignBottom")}><VAlignIcon type="bottom" /></button>
              </div>
            </div>
          </div>

          {/* Defined columns */}
          {block.columns.map((col, idx) => (
            <div key={col.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">{idx + 2}</span>
                <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate" title={`${col.category} > ${col.entryKey} > ${col.colLabel}`}>
                  {col.category} &gt; {col.entryKey} &gt; {col.colLabel}
                </span>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => moveColumn(idx, -1)} disabled={idx === 0} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                    <ChevronUp className="h-3 w-3" />
                  </button>
                  <button onClick={() => moveColumn(idx, 1)} disabled={idx === block.columns.length - 1} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                    <ChevronDown className="h-3 w-3" />
                  </button>
                </div>
                <button onClick={() => removeColumn(col.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={col.headerLabel ?? ""}
                  onChange={(e) => updateColumnHeaderLabel(col.id, e.target.value)}
                  placeholder={col.label || `${col.category} > ${col.entryKey} > ${col.colLabel}`}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 px-2 py-1 focus:outline-none focus:border-violet-400 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                  title={t("structure.inventoryHeaderLabel")}
                />
                <div className="flex items-center gap-0.5 shrink-0">
                  <button type="button" onClick={() => updateColumnProp(col.id, { align: "left" })} className={alignBtnClass((col.align ?? "left") === "left")}><AlignLeft className="h-3 w-3" /></button>
                  <button type="button" onClick={() => updateColumnProp(col.id, { align: "center" })} className={alignBtnClass(col.align === "center")}><AlignCenter className="h-3 w-3" /></button>
                  <button type="button" onClick={() => updateColumnProp(col.id, { align: "right" })} className={alignBtnClass(col.align === "right")}><AlignRight className="h-3 w-3" /></button>
                </div>
                <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 shrink-0" />
                <div className="flex items-center gap-0.5 shrink-0">
                  <button type="button" onClick={() => updateColumnProp(col.id, { valign: "top" })} className={alignBtnClass(col.valign === "top")} title={t("structure.alignTop")}><VAlignIcon type="top" /></button>
                  <button type="button" onClick={() => updateColumnProp(col.id, { valign: "middle" })} className={alignBtnClass((col.valign ?? "middle") === "middle")} title={t("structure.alignMiddle")}><VAlignIcon type="middle" /></button>
                  <button type="button" onClick={() => updateColumnProp(col.id, { valign: "bottom" })} className={alignBtnClass(col.valign === "bottom")} title={t("structure.alignBottom")}><VAlignIcon type="bottom" /></button>
                </div>
              </div>
            </div>
          ))}

          {/* Add column button / picker */}
          {!pickerOpen ? (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              {t("structure.inventoryAddColumn")}
            </button>
          ) : (
            <div className="rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
                  {!pickerCat
                    ? t("structure.inventoryPickCategory")
                    : !pickerKey
                      ? t("structure.inventoryPickKey")
                      : t("structure.inventoryPickValue")}
                </span>
                <button
                  onClick={() => { setPickerOpen(false); setPickerCat(null); setPickerKey(null); }}
                  className="p-0.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Breadcrumb */}
              {pickerCat && (
                <div className="flex items-center gap-1 text-[11px] text-slate-500">
                  <button onClick={() => { setPickerCat(null); setPickerKey(null); }} className="hover:text-violet-600 underline">
                    {t("structure.inventoryCategories")}
                  </button>
                  <ChevronRight className="h-3 w-3" />
                  {pickerKey ? (
                    <>
                      <button onClick={() => setPickerKey(null)} className="hover:text-violet-600 underline">{pickerCat}</button>
                      <ChevronRight className="h-3 w-3" />
                      <span className="text-violet-600 dark:text-violet-400 font-medium">{pickerKey}</span>
                    </>
                  ) : (
                    <span className="text-violet-600 dark:text-violet-400 font-medium">{pickerCat}</span>
                  )}
                </div>
              )}

              {/* Level 1: Categories */}
              {!pickerCat && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {structure.length === 0 && (
                    <p className="text-xs text-slate-400 italic py-2">{t("structure.inventoryNoData")}</p>
                  )}
                  {structure.map((cat) => (
                    <button
                      key={cat.categoryName}
                      onClick={() => setPickerCat(cat.categoryName)}
                      className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-800/30 transition-colors"
                    >
                      {cat.categoryName}
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}

              {/* Level 2: Entry keys */}
              {pickerCat && !pickerKey && pickerCatData && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {pickerCatData.entries.map((entry) => (
                    <button
                      key={entry.key}
                      onClick={() => setPickerKey(entry.key)}
                      className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-800/30 transition-colors"
                    >
                      {entry.key}
                      <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                    </button>
                  ))}
                </div>
              )}

              {/* Level 3: Column labels (values) */}
              {pickerCat && pickerKey && pickerKeyData && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {pickerKeyData.columns.map((col) => (
                    <button
                      key={col}
                      onClick={() => addColumn(pickerCat, pickerKey, col)}
                      className="w-full flex items-center rounded-md px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-800/30 transition-colors"
                    >
                      <Plus className="h-3.5 w-3.5 mr-2 text-violet-500" />
                      {col}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Source tab — single_node_full mode */}
      {tab === "source" && (
        <div className="space-y-4">
          {!isNodeReport && (
            <div className="space-y-1.5">
              <label className={labelClass}>{t("structure.invSourceNode")}</label>
              <select
                value={block.singleNodeId ?? ""}
                onChange={(e) => updateBlock(block.id, { singleNodeId: e.target.value ? Number(e.target.value) : null })}
                className={inputClass}
              >
                <option value="">{t("structure.invSourceNodePlaceholder")}</option>
                {allNodes.map((n) => (
                  <option key={n.id} value={n.id}>
                    {(n.hostname || n.name || n.ipAddress)} ({n.ipAddress})
                  </option>
                ))}
              </select>
            </div>
          )}
          {isNodeReport && reportNodes && reportNodes.length > 0 && (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 flex items-center gap-2">
              <Server className="h-4 w-4 text-violet-500" />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {reportNodes[0].hostname || reportNodes[0].name || reportNodes[0].ipAddress}
              </span>
              <span className="text-[10px] text-slate-400 italic ml-auto">{t("structure.invSourceFromReport")}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className={labelClass}>{t("structure.invSourceCategory")}</label>
            <select
              value={block.singleCategory ?? ""}
              onChange={(e) => updateBlock(block.id, { singleCategory: e.target.value || null })}
              className={inputClass}
            >
              <option value="">{t("structure.invSourceCategoryPlaceholder")}</option>
              {structure.map((c) => (
                <option key={c.categoryName} value={c.categoryName}>{c.categoryName}</option>
              ))}
            </select>
            {structure.length === 0 && structureLoaded && (
              <p className="text-[10px] text-slate-400 italic">{t("structure.inventoryNoData")}</p>
            )}
          </div>

          <p className="text-[10px] text-slate-400">{t("structure.invSourceHint")}</p>
        </div>
      )}

      {/* Equipment tab */}
      {tab === "equipment" && (
        <div className="space-y-3">
          {/* Selected equipment */}
          {selectedNodes.length > 0 && (
            <div className="space-y-1">
              <label className={labelClass}>{t("structure.inventorySelected")}</label>
              <div className="max-h-48 overflow-y-auto space-y-1">
                {selectedNodes.map((node) => (
                  <div
                    key={node.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5"
                  >
                    <Server className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                    <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">
                      {node.hostname || node.name || node.ipAddress}
                    </span>
                    <span className="text-[10px] text-slate-400">{node.ipAddress}</span>
                    <button onClick={() => removeNode(node.id)} className="p-0.5 text-slate-400 hover:text-red-500 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Search + available nodes */}
          <div className="space-y-1.5">
            <label className={labelClass}>{t("structure.inventoryAddEquipment")}</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={nodeSearch}
                onChange={(e) => setNodeSearch(e.target.value)}
                placeholder={t("common.search")}
                className={`${inputClass} pl-8`}
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto space-y-1 rounded-lg border border-slate-200 dark:border-slate-700 p-1.5">
            {!nodesLoaded && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
              </div>
            )}
            {nodesLoaded && availableNodes.length === 0 && (
              <p className="text-xs text-slate-400 italic text-center py-3">{t("common.noResult")}</p>
            )}
            {availableNodes.map((node) => (
              <button
                key={node.id}
                onClick={() => addNode(node.id)}
                className="w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">
                  {node.hostname || node.name || node.ipAddress}
                </span>
                <span className="text-[10px] text-slate-400 shrink-0">{node.ipAddress}</span>
              </button>
            ))}
          </div>

          {/* Auto-selection rules */}
          <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <label className={labelClass}>{t("structure.invAutoRulesTitle")}</label>
                <p className="text-[10px] text-slate-400">{t("structure.invAutoRulesHint")}</p>
              </div>
              <button
                type="button"
                onClick={addNodeRule}
                className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <Plus className="h-3 w-3" />
                {t("structure.invAutoRulesAdd")}
              </button>
            </div>

            {nodeRules.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">{t("structure.invAutoRulesMatch")}</span>
                <select
                  value={nodeRulesMatch}
                  onChange={(e) => updateBlock(block.id, { nodeRulesMatch: e.target.value as "all" | "any" })}
                  className="bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1 focus:outline-none focus:border-violet-400"
                >
                  <option value="any">{t("structure.invAutoRulesAny")}</option>
                  <option value="all">{t("structure.invAutoRulesAll")}</option>
                </select>
              </div>
            )}

            {nodeRules.map((rule) => {
              const isInventory = rule.type === "inventory";
              const isTag = rule.type === "tag";
              const isManufacturer = rule.type === "manufacturer";
              const isModel = rule.type === "model";
              const allowedOps: InventoryNodeRuleOperator[] = isTag || isManufacturer || isModel
                ? ["eq", "neq"]
                : ["eq", "neq", "contains", "not_contains", "starts_with", "ends_with"];
              return (
                <div key={rule.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <select
                      value={rule.type}
                      onChange={(e) => {
                        const t2 = e.target.value as InventoryNodeRuleType;
                        const patch: Partial<InventoryNodeRule> = { type: t2, value: undefined, tagId: undefined, category: undefined, entryKey: undefined, colLabel: undefined };
                        if (t2 === "tag" || t2 === "manufacturer" || t2 === "model") {
                          if (!["eq", "neq"].includes(rule.operator)) patch.operator = "eq";
                        }
                        updateNodeRule(rule.id, patch);
                      }}
                      className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                    >
                      {ruleTypeOptions.map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <select
                      value={rule.operator}
                      onChange={(e) => updateNodeRule(rule.id, { operator: e.target.value as InventoryNodeRuleOperator })}
                      className="shrink-0 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                    >
                      {ruleOperatorOptions.filter((o) => allowedOps.includes(o.value)).map((o) => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => removeNodeRule(rule.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  {/* Type-specific value picker */}
                  {isTag && (
                    <select
                      value={rule.tagId ?? ""}
                      onChange={(e) => updateNodeRule(rule.id, { tagId: e.target.value ? Number(e.target.value) : undefined })}
                      className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                    >
                      <option value="">{t("structure.invAutoRulePickTag")}</option>
                      {tags.map((tg) => (
                        <option key={tg.id} value={tg.id}>{tg.name}</option>
                      ))}
                    </select>
                  )}
                  {isManufacturer && (
                    <select
                      value={rule.value ?? ""}
                      onChange={(e) => updateNodeRule(rule.id, { value: e.target.value || undefined })}
                      className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                    >
                      <option value="">{t("structure.invAutoRulePickManufacturer")}</option>
                      {manufacturers.map((m) => (
                        <option key={m.id} value={String(m.id)}>{m.name}</option>
                      ))}
                    </select>
                  )}
                  {isModel && (
                    <select
                      value={rule.value ?? ""}
                      onChange={(e) => updateNodeRule(rule.id, { value: e.target.value || undefined })}
                      className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                    >
                      <option value="">{t("structure.invAutoRulePickModel")}</option>
                      {models.map((m) => (
                        <option key={m.id} value={String(m.id)}>{m.manufacturer ? `${m.manufacturer.name} — ${m.name}` : m.name}</option>
                      ))}
                    </select>
                  )}
                  {isInventory && (
                    <div className="space-y-2">
                      <select
                        value={rule.category ?? ""}
                        onChange={(e) => updateNodeRule(rule.id, { category: e.target.value || undefined, entryKey: undefined, colLabel: undefined })}
                        className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                      >
                        <option value="">{t("structure.inventoryPickCategory")}</option>
                        {structure.map((c) => (
                          <option key={c.categoryName} value={c.categoryName}>{c.categoryName}</option>
                        ))}
                      </select>
                      {rule.category && (
                        <select
                          value={rule.entryKey ?? ""}
                          onChange={(e) => updateNodeRule(rule.id, { entryKey: e.target.value || undefined, colLabel: undefined })}
                          className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                        >
                          <option value="">{t("structure.inventoryPickKey")}</option>
                          {(structure.find((c) => c.categoryName === rule.category)?.entries ?? []).map((e) => (
                            <option key={e.key} value={e.key}>{e.key}</option>
                          ))}
                        </select>
                      )}
                      {rule.category && rule.entryKey && (
                        <select
                          value={rule.colLabel ?? ""}
                          onChange={(e) => updateNodeRule(rule.id, { colLabel: e.target.value || undefined })}
                          className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                        >
                          <option value="">{t("structure.inventoryPickValue")}</option>
                          {(structure.find((c) => c.categoryName === rule.category)?.entries.find((e) => e.key === rule.entryKey)?.columns ?? []).map((col) => (
                            <option key={col} value={col}>{col}</option>
                          ))}
                        </select>
                      )}
                      <input
                        type="text"
                        value={rule.value ?? ""}
                        onChange={(e) => updateNodeRule(rule.id, { value: e.target.value })}
                        placeholder={t("structure.ruleValue")}
                        className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400 placeholder:text-slate-400"
                      />
                    </div>
                  )}
                  {!isTag && !isManufacturer && !isModel && !isInventory && (
                    <input
                      type="text"
                      value={rule.value ?? ""}
                      onChange={(e) => updateNodeRule(rule.id, { value: e.target.value })}
                      placeholder={t("structure.ruleValue")}
                      className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400 placeholder:text-slate-400"
                    />
                  )}
                </div>
              );
            })}

            {/* Rule preview */}
            {nodeRules.length > 0 && (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2 space-y-1">
                <div className="flex items-center gap-2 text-[11px] text-slate-500">
                  {rulePreviewLoading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Search className="h-3 w-3" />
                  )}
                  <span>{t("structure.invAutoRulesMatched", { count: String(rulePreview.length) })}</span>
                </div>
                {ruleMatchedNodes.length > 0 && (
                  <div className="flex flex-wrap gap-1 pt-1">
                    {ruleMatchedNodes.slice(0, 12).map((n) => (
                      <span key={n.id} className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-700 dark:text-violet-300">
                        <Server className="h-2.5 w-2.5" />
                        {n.hostname || n.name || n.ipAddress}
                      </span>
                    ))}
                    {ruleMatchedNodes.length > 12 && (
                      <span className="text-[10px] text-slate-400">+{ruleMatchedNodes.length - 12}</span>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Style tab */}
      {tab === "style" && (
        <div className="space-y-5">
          {/* Show header toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <button type="button" onClick={() => updateBlock(block.id, { showHeader: !block.showHeader })}>
              {block.showHeader ? (
                <ToggleRight className="h-5 w-5 text-emerald-500" />
              ) : (
                <ToggleLeft className="h-5 w-5 text-slate-400" />
              )}
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-400">{t("structure.showTableHeader")}</span>
          </label>

          {/* Font size */}
          <div className="space-y-1.5">
            <label className={labelClass}>{t("structure.inventoryFontSize")}</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={6}
                max={24}
                value={block.fontSize ?? ""}
                placeholder={t("structure.inventoryFontSizeInherited")}
                onChange={(e) => updateBlock(block.id, { fontSize: e.target.value ? Number(e.target.value) : undefined })}
                className={`${inputClass} w-28`}
              />
              <span className="text-xs text-slate-400">pt</span>
              {block.fontSize && (
                <button
                  type="button"
                  onClick={() => updateBlock(block.id, { fontSize: undefined })}
                  className="text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  {t("structure.inventoryFontSizeReset")}
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400">{t("structure.inventoryFontSizeHint")}</p>
          </div>

          {/* Style rules */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className={labelClass}>{t("structure.ruleTitle")}</label>
              <button
                type="button"
                onClick={addRule}
                className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <Plus className="h-3 w-3" />
                {t("structure.ruleAdd")}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">{t("structure.ruleHint")}</p>

            {rules.length === 0 && (
              <p className="text-xs text-slate-400 italic text-center py-4">{t("structure.ruleEmpty")}</p>
            )}

            {rules.map((rule, ri) => (
              <div key={rule.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
                {/* Rule header with order */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">#{ri + 1}</span>
                  <div className="flex-1" />
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => moveRule(ri, -1)} disabled={ri === 0} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => moveRule(ri, 1)} disabled={ri === rules.length - 1} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <button type="button" onClick={() => removeRule(rule.id)} className="p-0.5 text-slate-400 hover:text-red-500 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Condition row: column + operator + value */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 shrink-0">{t("structure.ruleIf")}</span>
                  <select
                    value={rule.columnId}
                    onChange={(e) => updateRule(rule.id, { columnId: e.target.value })}
                    className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                  >
                    {ruleColumnOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>{opt.label}</option>
                    ))}
                  </select>
                  <select
                    value={rule.operator}
                    onChange={(e) => updateRule(rule.id, { operator: e.target.value as InventoryStyleRule["operator"] })}
                    className="shrink-0 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                  >
                    {(Object.keys(operatorLabels) as InventoryStyleRule["operator"][]).map((op) => (
                      <option key={op} value={op}>{operatorLabels[op]}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={rule.value}
                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                    placeholder={t("structure.ruleValue")}
                    className="w-28 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400 placeholder:text-slate-400"
                  />
                </div>

                {/* Style actions row */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-slate-500 shrink-0">{t("structure.ruleThen")}</span>
                  {/* Bold */}
                  <button
                    type="button"
                    onClick={() => updateRule(rule.id, { bold: !rule.bold })}
                    className={`p-1.5 rounded transition-colors ${rule.bold ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}
                    title="Bold"
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </button>
                  {/* Italic */}
                  <button
                    type="button"
                    onClick={() => updateRule(rule.id, { italic: !rule.italic })}
                    className={`p-1.5 rounded transition-colors ${rule.italic ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}
                    title="Italic"
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </button>
                  {/* Text color */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">{t("structure.ruleTextColor")}</span>
                    <input
                      type="color"
                      value={rule.textColor || "#000000"}
                      onChange={(e) => updateRule(rule.id, { textColor: e.target.value })}
                      className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0"
                    />
                    {rule.textColor && (
                      <button type="button" onClick={() => updateRule(rule.id, { textColor: undefined })} className="text-[10px] text-slate-400 hover:text-slate-600">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {/* Highlight color */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">{t("structure.ruleHighlight")}</span>
                    <input
                      type="color"
                      value={rule.highlightColor || "#ffff00"}
                      onChange={(e) => updateRule(rule.id, { highlightColor: e.target.value })}
                      className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0"
                    />
                    {rule.highlightColor && (
                      <button type="button" onClick={() => updateRule(rule.id, { highlightColor: undefined })} className="text-[10px] text-slate-400 hover:text-slate-600">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {/* Background color */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">{t("structure.ruleBgColor")}</span>
                    <input
                      type="color"
                      value={rule.bgColor || "#ffffff"}
                      onChange={(e) => updateRule(rule.id, { bgColor: e.target.value })}
                      className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0"
                    />
                    {rule.bgColor && (
                      <button type="button" onClick={() => updateRule(rule.id, { bgColor: undefined })} className="text-[10px] text-slate-400 hover:text-slate-600">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Preview tab */}
      {tab === "preview" && (
        <div className="space-y-3">
          {mode === "single_node_full" ? (
            (effectiveNodes.length === 0 || !block.singleCategory) ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400 dark:text-slate-500">
                <Table2 className="h-8 w-8" />
                <p className="text-sm">{t("structure.invSinglePreviewEmpty")}</p>
              </div>
            ) : (
              <>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-auto">
                  {(() => {
                    const cat = structure.find((c) => c.categoryName === block.singleCategory);
                    const colLabels: string[] = [];
                    const rowKeys: string[] = [];
                    if (cat) {
                      cat.entries.forEach((e) => {
                        if (!rowKeys.includes(e.key)) rowKeys.push(e.key);
                        e.columns.forEach((c) => {
                          if (!colLabels.includes(c)) colLabels.push(c);
                        });
                      });
                    }
                    if (rowKeys.length === 0) {
                      return (
                        <p className="px-3 py-4 text-slate-400 italic text-center">{t("structure.invSinglePreviewNoEntries")}</p>
                      );
                    }
                    return (
                      <table className="w-full border-collapse text-sm" style={block.fontSize ? { fontSize: `${block.fontSize}px` } : undefined}>
                        {block.showHeader && (
                          <thead>
                            <tr className="bg-slate-100 dark:bg-slate-800">
                              <th className="border-r border-b border-slate-200 dark:border-slate-700 px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap text-left">
                                {block.hostnameHeaderLabel || t("structure.invSingleColKey")}
                              </th>
                              {colLabels.map((cl, idx) => (
                                <th key={cl} className={`${idx < colLabels.length - 1 ? "border-r" : ""} border-b border-slate-200 dark:border-slate-700 px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap text-left`}>{cl}</th>
                              ))}
                            </tr>
                          </thead>
                        )}
                        <tbody>
                          {rowKeys.map((k, ridx) => (
                            <tr key={k} className={ridx % 2 === 1 ? "bg-slate-50 dark:bg-slate-800/30" : ""}>
                              <td className="border-r border-b border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap">{k}</td>
                              {colLabels.map((cl, idx) => (
                                <td key={cl} className={`${idx < colLabels.length - 1 ? "border-r" : ""} border-b border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-400 italic whitespace-nowrap`}>—</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    );
                  })()}
                </div>
                <p className="text-[10px] text-slate-400 italic">{t("structure.inventoryPreviewNote")}</p>
              </>
            )
          ) : block.columns.length === 0 || effectiveNodes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-400 dark:text-slate-500">
              <Table2 className="h-8 w-8" />
              <p className="text-sm">{t("structure.inventoryPreviewEmpty")}</p>
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-auto">
                <table className="w-full border-collapse text-sm" style={block.fontSize ? { fontSize: `${block.fontSize}px` } : undefined}>
                  {block.showHeader && (
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800">
                        <th className="border-r border-b border-slate-200 dark:border-slate-700 px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap" style={{ textAlign: block.hostnameAlign ?? "left", verticalAlign: block.hostnameVAlign ?? "middle" }}>
                          {block.hostnameHeaderLabel || "Hostname"}
                        </th>
                        {block.columns.map((col) => (
                          <th key={col.id} className="border-r border-b border-slate-200 dark:border-slate-700 px-3 py-2 font-semibold text-slate-700 dark:text-slate-300 whitespace-nowrap" style={{ textAlign: col.align ?? "left", verticalAlign: col.valign ?? "middle" }}>
                            {col.headerLabel || col.label || `${col.category} > ${col.entryKey} > ${col.colLabel}`}
                          </th>
                        ))}
                      </tr>
                    </thead>
                  )}
                  <tbody>
                    {effectiveNodes.map((node, ni) => (
                      <tr key={node.id} className={ni % 2 === 1 ? "bg-slate-50 dark:bg-slate-800/30" : ""}>
                        <td className="border-r border-b border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-700 dark:text-slate-300 font-medium whitespace-nowrap" style={{ textAlign: block.hostnameAlign ?? "left", verticalAlign: block.hostnameVAlign ?? "middle" }}>
                          {node.hostname || node.name || node.ipAddress}
                        </td>
                        {block.columns.map((col) => (
                          <td key={col.id} className="border-r border-b border-slate-200 dark:border-slate-700 px-3 py-2 text-slate-400 italic whitespace-nowrap" style={{ textAlign: col.align ?? "left", verticalAlign: col.valign ?? "middle" }}>
                            —
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-slate-400 italic">{t("structure.inventoryPreviewNote")}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --- CLI Command properties ---
interface TagItem { id: number; name: string; color: string; }

function CliCommandProperties({
  block,
  updateBlock,
  t,
}: {
  block: CliCommandBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const { current } = useAppContext();
  type CliTab = "params" | "data" | "devices" | "style" | "conditional";
  const dataSource = block.dataSource || "none";
  const nodeIds = block.nodeIds || [];
  const tagIds = block.tagIds || [];
  const conditionalRules = block.conditionalRules ?? [];

  const defaultTab: CliTab = "params";
  const [tab, setTab] = useState<CliTab>(defaultTab);
  const [allNodes, setAllNodes] = useState<NodeItem[]>([]);
  const [allTags, setAllTags] = useState<TagItem[]>([]);
  const [nodesLoaded, setNodesLoaded] = useState(false);
  const [tagsLoaded, setTagsLoaded] = useState(false);
  const [nodeSearch, setNodeSearch] = useState("");
  const [nodePickerOpen, setNodePickerOpen] = useState(false);

  // Load nodes
  useEffect(() => {
    if (!current || nodesLoaded) return;
    fetch(`/api/nodes?context=${current.id}`)
      .then((r) => r.json())
      .then((data: NodeItem[]) => { setAllNodes(data); setNodesLoaded(true); })
      .catch(() => setNodesLoaded(true));
  }, [current, nodesLoaded]);

  // Load tags
  useEffect(() => {
    if (!current || tagsLoaded) return;
    fetch(`/api/node-tags?context=${current.id}`)
      .then((r) => r.json())
      .then((data: TagItem[]) => { setAllTags(data); setTagsLoaded(true); })
      .catch(() => setTagsLoaded(true));
  }, [current, tagsLoaded]);

  const selectedNodes = allNodes.filter((n) => nodeIds.includes(n.id));
  const availableNodes = allNodes.filter(
    (n) =>
      !nodeIds.includes(n.id) &&
      (nodeSearch === "" ||
        (n.hostname ?? "").toLowerCase().includes(nodeSearch.toLowerCase()) ||
        (n.name ?? "").toLowerCase().includes(nodeSearch.toLowerCase()) ||
        n.ipAddress.includes(nodeSearch))
  );
  const selectedTags = allTags.filter((tg) => tagIds.includes(tg.id));
  const availableTags = allTags.filter((tg) => !tagIds.includes(tg.id));

  const addNode = (id: number) => updateBlock(block.id, { nodeIds: [...nodeIds, id] });
  const removeNode = (id: number) => updateBlock(block.id, { nodeIds: nodeIds.filter((n) => n !== id) });
  const addTagId = (id: number) => updateBlock(block.id, { tagIds: [...tagIds, id] });
  const removeTagId = (id: number) => updateBlock(block.id, { tagIds: tagIds.filter((t2) => t2 !== id) });

  // Conditional rules
  const addConditional = () => {
    const rule: CliConditionalRule = { id: uid(), pattern: "", operator: "contains", action: "show" };
    updateBlock(block.id, { conditionalRules: [...conditionalRules, rule] });
  };
  const updateConditional = (ruleId: string, patch: Partial<CliConditionalRule>) => {
    updateBlock(block.id, { conditionalRules: conditionalRules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)) });
  };
  const removeConditional = (ruleId: string) => {
    updateBlock(block.id, { conditionalRules: conditionalRules.filter((r) => r.id !== ruleId) });
  };

  const rules = block.styleRules ?? [];

  const addRule = () => {
    const rule: CliStyleRule = { id: uid(), pattern: "", operator: "matches" };
    updateBlock(block.id, { styleRules: [...rules, rule] });
  };

  const updateRule = (ruleId: string, patch: Partial<CliStyleRule>) => {
    updateBlock(block.id, { styleRules: rules.map((r) => (r.id === ruleId ? { ...r, ...patch } : r)) });
  };

  const removeRule = (ruleId: string) => {
    updateBlock(block.id, { styleRules: rules.filter((r) => r.id !== ruleId) });
  };

  const moveRule = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= rules.length) return;
    const arr = [...rules];
    [arr[idx], arr[target]] = [arr[target], arr[idx]];
    updateBlock(block.id, { styleRules: arr });
  };

  const operatorLabels: Record<CliStyleRule["operator"], string> = {
    matches: t("structure.cliRuleMatches"),
    not_matches: t("structure.cliRuleNotMatches"),
    contains: t("structure.ruleContains"),
    not_contains: t("structure.ruleNotContains"),
    eq: "=",
    neq: "!=",
  };

  const condOperatorLabels: Record<CliConditionalRule["operator"], string> = {
    matches: t("structure.cliRuleMatches"),
    not_matches: t("structure.cliRuleNotMatches"),
    contains: t("structure.ruleContains"),
    not_contains: t("structure.ruleNotContains"),
  };

  const tabBtnClass = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? "border-slate-700 dark:border-slate-300 text-slate-700 dark:text-slate-300"
        : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
    }`;

  const alignBtnClass = (active: boolean) =>
    `p-1 rounded transition-colors ${
      active
        ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
        : "text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
    }`;

  const parseLineFilter = (filter: string): Set<number> => {
    const lines = new Set<number>();
    if (!filter.trim()) return lines;
    for (const part of filter.split(",")) {
      const trimmed = part.trim();
      if (trimmed.includes("-")) {
        const [start, end] = trimmed.split("-").map(Number);
        if (!isNaN(start) && !isNaN(end)) {
          for (let i = start; i <= end; i++) lines.add(i);
        }
      } else {
        const n = Number(trimmed);
        if (!isNaN(n)) lines.add(n);
      }
    }
    return lines;
  };

  const commandLines = block.command.split("\n");
  const visibleLines = block.lineFilter ? parseLineFilter(block.lineFilter) : null;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
        <button type="button" className={tabBtnClass(tab === "params")} onClick={() => setTab("params")}>{t("structure.cliParams")}</button>
        {dataSource === "none" && (
          <button type="button" className={tabBtnClass(tab === "data")} onClick={() => setTab("data")}>{t("structure.cliTabData")}</button>
        )}
        {dataSource !== "none" && (
          <button type="button" className={tabBtnClass(tab === "devices")} onClick={() => setTab("devices")}>
            {t("structure.cliTabDevices")}
            {(nodeIds.length > 0 || tagIds.length > 0) && <span className="ml-1 inline-flex items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700 text-[10px] font-bold w-4 h-4">{nodeIds.length + tagIds.length}</span>}
          </button>
        )}
        <button type="button" className={tabBtnClass(tab === "style")} onClick={() => setTab("style")}>{t("structure.inventoryStyle")}</button>
        <button type="button" className={tabBtnClass(tab === "conditional")} onClick={() => setTab("conditional")}>{t("structure.cliTabConditional")}</button>
      </div>

      {/* ===== PARAMS TAB ===== */}
      {tab === "params" && (
        <div className="space-y-4">
          {/* Data source selector */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("structure.cliDataSource")}</label>
            <div className="flex gap-2">
              {(["none", "local", "remote"] as const).map((src) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => updateBlock(block.id, { dataSource: src })}
                  className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                    dataSource === src
                      ? "border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                      : "border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  }`}
                >
                  {src === "none" ? t("structure.cliSourceNone") : src === "local" ? t("structure.cliSourceLocal") : t("structure.cliSourceRemote")}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-400">
              {dataSource === "none" && t("structure.cliSourceNoneDesc")}
              {dataSource === "local" && t("structure.cliSourceLocalDesc")}
              {dataSource === "remote" && t("structure.cliSourceRemoteDesc")}
            </p>
          </div>

          {/* Command name */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("structure.cliCommandNameLabel")}</label>
            <input
              type="text"
              value={block.commandName || ""}
              onChange={(e) => updateBlock(block.id, { commandName: e.target.value })}
              placeholder={t("structure.cliCommandNamePlaceholder")}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 font-mono placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
            />
          </div>
        </div>
      )}

      {/* ===== DATA TAB (static only) ===== */}
      {tab === "data" && dataSource === "none" && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("structure.cliCommandOutput")}</label>
            <textarea
              value={block.command}
              onChange={(e) => updateBlock(block.id, { command: e.target.value })}
              placeholder={t("structure.cliCommandPlaceholder")}
              rows={14}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-900 text-green-400 font-mono text-sm px-4 py-3 focus:outline-none focus:border-slate-500 focus:ring-2 focus:ring-slate-400/20 transition-colors resize-y placeholder:text-slate-600"
              spellCheck={false}
            />
          </div>

          {/* Preview */}
          {block.command && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("structure.cliPreview")}</label>
              <div className="rounded-lg border border-slate-700 bg-slate-900 p-4 font-mono text-sm overflow-x-auto max-h-60 overflow-y-auto" style={block.fontSize ? { fontSize: `${block.fontSize}px` } : undefined}>
                {(() => {
                  const result: React.ReactNode[] = [];
                  let prevVisible = true;
                  commandLines.forEach((line, i) => {
                    const lineNum = i + 1;
                    const isVisible = !visibleLines || visibleLines.has(lineNum);
                    if (isVisible) {
                      result.push(
                        <div key={lineNum} className="flex">
                          <span className="w-8 text-right pr-3 text-slate-600 select-none shrink-0">{lineNum}</span>
                          <span className="text-green-400 whitespace-pre">{line || " "}</span>
                        </div>
                      );
                      prevVisible = true;
                    } else if (prevVisible && block.showEllipsis) {
                      result.push(
                        <div key={`ellipsis-${lineNum}`} className="flex">
                          <span className="w-8 text-right pr-3 text-slate-600 select-none shrink-0"></span>
                          <span className="text-slate-500 italic">[...]</span>
                        </div>
                      );
                      prevVisible = false;
                    }
                  });
                  return result;
                })()}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===== DEVICES TAB (local/remote) ===== */}
      {tab === "devices" && dataSource !== "none" && (
        <div className="space-y-5">
          {/* By tag */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("structure.cliByTag")}</label>
            <div className="flex flex-wrap gap-1.5">
              {selectedTags.map((tg) => (
                <span key={tg.id} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium" style={{ backgroundColor: tg.color + "20", color: tg.color }}>
                  {tg.name}
                  <button onClick={() => removeTagId(tg.id)} className="ml-0.5 hover:opacity-70 transition-opacity"><X className="h-3 w-3" /></button>
                </span>
              ))}
              {availableTags.length > 0 && (
                <select
                  value=""
                  onChange={(e) => { if (e.target.value) addTagId(Number(e.target.value)); }}
                  className="rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-transparent px-2 py-1 text-xs text-slate-500 dark:text-slate-400 cursor-pointer focus:outline-none"
                >
                  <option value="">{t("structure.cliAddTag")}</option>
                  {availableTags.map((tg) => (
                    <option key={tg.id} value={tg.id}>{tg.name}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          {/* By device */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("structure.cliByDevice")}</label>
            {selectedNodes.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {selectedNodes.map((node) => (
                  <span key={node.id} className="inline-flex items-center gap-1 rounded-md bg-slate-100 dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <Server className="h-3 w-3 text-slate-400" />
                    {node.hostname || node.name || node.ipAddress}
                    <button onClick={() => removeNode(node.id)} className="ml-0.5 text-slate-400 hover:text-red-500 transition-colors"><X className="h-3 w-3" /></button>
                  </span>
                ))}
              </div>
            )}
            <div className="relative">
              <Search className="h-4 w-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={nodeSearch}
                onChange={(e) => { setNodeSearch(e.target.value); setNodePickerOpen(true); }}
                onFocus={() => setNodePickerOpen(true)}
                placeholder={t("structure.cliSearchDevices")}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-9 pr-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
              />
              {nodePickerOpen && availableNodes.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 z-20 max-h-48 overflow-y-auto rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg py-1">
                  {availableNodes.slice(0, 30).map((node) => (
                    <button
                      key={node.id}
                      onClick={() => { addNode(node.id); setNodeSearch(""); setNodePickerOpen(false); }}
                      className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                    >
                      <Server className="h-3.5 w-3.5 text-slate-400" />
                      <span className="font-medium">{node.hostname || node.name || node.ipAddress}</span>
                      {node.hostname && <span className="text-xs text-slate-400">{node.ipAddress}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ===== STYLE TAB ===== */}
      {tab === "style" && (
        <div className="space-y-5">
          {/* Line filter */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("structure.cliLineFilter")}</label>
            <input
              type="text"
              value={block.lineFilter ?? ""}
              onChange={(e) => updateBlock(block.id, { lineFilter: e.target.value || undefined })}
              placeholder={t("structure.cliLineFilterPlaceholder")}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 font-mono placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
            />
            <p className="text-[10px] text-slate-400">{t("structure.cliLineFilterHint")}</p>
          </div>

          {/* Show ellipsis toggle */}
          <label className="flex items-center gap-2.5 cursor-pointer">
            <button type="button" onClick={() => updateBlock(block.id, { showEllipsis: !block.showEllipsis })}>
              {block.showEllipsis ? (
                <ToggleRight className="h-5 w-5 text-emerald-500" />
              ) : (
                <ToggleLeft className="h-5 w-5 text-slate-400" />
              )}
            </button>
            <span className="text-sm text-slate-600 dark:text-slate-400">{t("structure.cliShowEllipsis")}</span>
          </label>

          {/* Font size */}
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("structure.inventoryFontSize")}</label>
            <div className="flex items-center gap-3">
              <input
                type="number"
                min={6}
                max={24}
                value={block.fontSize ?? ""}
                placeholder={t("structure.inventoryFontSizeInherited")}
                onChange={(e) => updateBlock(block.id, { fontSize: e.target.value ? Number(e.target.value) : undefined })}
                className="w-28 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
              />
              <span className="text-xs text-slate-400">pt</span>
              {block.fontSize && (
                <button
                  type="button"
                  onClick={() => updateBlock(block.id, { fontSize: undefined })}
                  className="text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  {t("structure.inventoryFontSizeReset")}
                </button>
              )}
            </div>
            <p className="text-[10px] text-slate-400">{t("structure.cliFontSizeHint")}</p>
          </div>

          {/* Style rules */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("structure.ruleTitle")}</label>
              <button
                type="button"
                onClick={addRule}
                className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                <Plus className="h-3 w-3" />
                {t("structure.ruleAdd")}
              </button>
            </div>
            <p className="text-[10px] text-slate-400">{t("structure.cliRuleHint")}</p>

            {rules.length === 0 && (
              <p className="text-xs text-slate-400 italic text-center py-4">{t("structure.ruleEmpty")}</p>
            )}

            {rules.map((rule, ri) => (
              <div key={rule.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
                {/* Rule header */}
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">#{ri + 1}</span>
                  <div className="flex-1" />
                  <div className="flex items-center gap-0.5">
                    <button type="button" onClick={() => moveRule(ri, -1)} disabled={ri === 0} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                      <ChevronUp className="h-3 w-3" />
                    </button>
                    <button type="button" onClick={() => moveRule(ri, 1)} disabled={ri === rules.length - 1} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                      <ChevronDown className="h-3 w-3" />
                    </button>
                  </div>
                  <button type="button" onClick={() => removeRule(rule.id)} className="p-0.5 text-slate-400 hover:text-red-500 transition-colors">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Condition: operator + regex pattern */}
                <div className="flex items-center gap-2">
                  <span className="text-xs text-slate-500 shrink-0">{t("structure.ruleIf")}</span>
                  <select
                    value={rule.operator}
                    onChange={(e) => updateRule(rule.id, { operator: e.target.value as CliStyleRule["operator"] })}
                    className="shrink-0 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                  >
                    {(Object.keys(operatorLabels) as CliStyleRule["operator"][]).map((op) => (
                      <option key={op} value={op}>{operatorLabels[op]}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={rule.pattern}
                    onChange={(e) => updateRule(rule.id, { pattern: e.target.value })}
                    placeholder={t("structure.cliRulePattern")}
                    className="flex-1 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 font-mono focus:outline-none focus:border-violet-400 placeholder:text-slate-400"
                  />
                </div>

                {/* Style actions */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-slate-500 shrink-0">{t("structure.ruleThen")}</span>
                  <button
                    type="button"
                    onClick={() => updateRule(rule.id, { bold: !rule.bold })}
                    className={`p-1.5 rounded transition-colors ${rule.bold ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}
                    title="Bold"
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateRule(rule.id, { italic: !rule.italic })}
                    className={`p-1.5 rounded transition-colors ${rule.italic ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"}`}
                    title="Italic"
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </button>
                  {/* Text color */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">{t("structure.ruleTextColor")}</span>
                    <input
                      type="color"
                      value={rule.textColor || "#22c55e"}
                      onChange={(e) => updateRule(rule.id, { textColor: e.target.value })}
                      className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0"
                    />
                    {rule.textColor && (
                      <button type="button" onClick={() => updateRule(rule.id, { textColor: undefined })} className="text-[10px] text-slate-400 hover:text-slate-600">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  {/* Highlight */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">{t("structure.ruleHighlight")}</span>
                    <input
                      type="color"
                      value={rule.highlightColor || "#ffff00"}
                      onChange={(e) => updateRule(rule.id, { highlightColor: e.target.value })}
                      className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0"
                    />
                    {rule.highlightColor && (
                      <>
                        <button type="button" onClick={() => updateRule(rule.id, { highlightColor: undefined })} className="text-[10px] text-slate-400 hover:text-slate-600">
                          <X className="h-3 w-3" />
                        </button>
                        {/* Highlight mode toggle: line or match */}
                        <div className="flex items-center gap-0.5 ml-1">
                          <button
                            type="button"
                            onClick={() => updateRule(rule.id, { highlightMode: "line" })}
                            className={alignBtnClass((rule.highlightMode ?? "match") === "line")}
                            title={t("structure.cliHighlightLine")}
                          >
                            <span className="text-[9px] font-bold px-0.5">LINE</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => updateRule(rule.id, { highlightMode: "match" })}
                            className={alignBtnClass((rule.highlightMode ?? "match") === "match")}
                            title={t("structure.cliHighlightMatch")}
                          >
                            <span className="text-[9px] font-bold px-0.5">MATCH</span>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                  {/* Background */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-slate-400">{t("structure.ruleBgColor")}</span>
                    <input
                      type="color"
                      value={rule.bgColor || "#1e293b"}
                      onChange={(e) => updateRule(rule.id, { bgColor: e.target.value })}
                      className="w-6 h-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0"
                    />
                    {rule.bgColor && (
                      <button type="button" onClick={() => updateRule(rule.id, { bgColor: undefined })} className="text-[10px] text-slate-400 hover:text-slate-600">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ===== CONDITIONAL TAB ===== */}
      {tab === "conditional" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("structure.cliConditionalTitle")}</label>
              <p className="text-[10px] text-slate-400">{t("structure.cliConditionalHint")}</p>
            </div>
            <button
              type="button"
              onClick={addConditional}
              className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <Plus className="h-3 w-3" />
              {t("structure.cliConditionalAdd")}
            </button>
          </div>

          {conditionalRules.length === 0 && (
            <p className="text-xs text-slate-400 italic text-center py-6">{t("structure.cliConditionalEmpty")}</p>
          )}

          {conditionalRules.map((rule, ri) => (
            <div key={rule.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">#{ri + 1}</span>
                <div className="flex-1" />
                <button type="button" onClick={() => removeConditional(rule.id)} className="p-0.5 text-slate-400 hover:text-red-500 transition-colors">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Condition row: operator + pattern */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 shrink-0">{t("structure.ruleIf")}</span>
                <select
                  value={rule.operator}
                  onChange={(e) => updateConditional(rule.id, { operator: e.target.value as CliConditionalRule["operator"] })}
                  className="shrink-0 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                >
                  {(Object.keys(condOperatorLabels) as CliConditionalRule["operator"][]).map((op) => (
                    <option key={op} value={op}>{condOperatorLabels[op]}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={rule.pattern}
                  onChange={(e) => updateConditional(rule.id, { pattern: e.target.value })}
                  placeholder={t("structure.cliConditionalPattern")}
                  className="flex-1 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 font-mono focus:outline-none focus:border-violet-400 placeholder:text-slate-400"
                />
              </div>

              {/* Action row */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500 shrink-0">{t("structure.ruleThen")}</span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => updateConditional(rule.id, { action: "show" })}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      rule.action === "show"
                        ? "bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-300 dark:border-emerald-500/30"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                    }`}
                  >
                    {t("structure.cliConditionalShow")}
                  </button>
                  <button
                    type="button"
                    onClick={() => updateConditional(rule.id, { action: "hide" })}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                      rule.action === "hide"
                        ? "bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-500/30"
                        : "bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700"
                    }`}
                  >
                    {t("structure.cliConditionalHide")}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- Equipment List properties ---
function EquipmentListProperties({
  block,
  updateBlock,
  t,
}: {
  block: EquipmentListBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const { current } = useAppContext();
  const [nodes, setNodes] = useState<{ id: number; name: string | null; hostname: string | null; ipAddress: string }[]>([]);
  const [nodeSearch, setNodeSearch] = useState("");
  const [editingCatIdx, setEditingCatIdx] = useState<number | null>(null);

  useEffect(() => {
    if (!current) return;
    fetch(`/api/nodes?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setNodes);
  }, [current]);

  const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition-colors";
  const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

  const nodeLabel = (n: { name: string | null; hostname: string | null; ipAddress: string }) =>
    block.nodeDisplayField === "hostname" ? (n.hostname || n.name || n.ipAddress)
    : block.nodeDisplayField === "ipAddress" ? n.ipAddress
    : (n.name || n.hostname || n.ipAddress);

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <label className={labelCls}>{t("structure.equipTitle")}</label>
        <input type="text" value={block.title} onChange={(e) => updateBlock(block.id, { ...block, title: e.target.value })} placeholder={t("structure.equipTitlePlaceholder")} className={inputCls} />
      </div>

      {/* Title style */}
      <div>
        <label className={labelCls}>{t("structure.equipTitleStyle")}</label>
        <div className="flex items-center gap-3">
          <button onClick={() => updateBlock(block.id, { ...block, titleStyle: { ...block.titleStyle, bold: !block.titleStyle?.bold } })} className={`px-3 py-1.5 rounded-lg border text-sm font-bold transition-colors ${block.titleStyle?.bold ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-400"}`}>B</button>
          <button onClick={() => updateBlock(block.id, { ...block, titleStyle: { ...block.titleStyle, italic: !block.titleStyle?.italic } })} className={`px-3 py-1.5 rounded-lg border text-sm italic transition-colors ${block.titleStyle?.italic ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-400"}`}>I</button>
          <input type="number" value={block.titleStyle?.size || 13} onChange={(e) => updateBlock(block.id, { ...block, titleStyle: { ...block.titleStyle, size: Number(e.target.value) } })} className="w-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-sm text-center" />
          <span className="text-xs text-slate-400">pt</span>
          <input type="color" value={block.titleStyle?.color || "#1e293b"} onChange={(e) => updateBlock(block.id, { ...block, titleStyle: { ...block.titleStyle, color: e.target.value } })} className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 cursor-pointer" />
        </div>
      </div>

      {/* Category style (default) */}
      <div>
        <label className={labelCls}>{t("structure.equipCategoryStyle")}</label>
        <div className="flex items-center gap-3">
          <button onClick={() => updateBlock(block.id, { ...block, categoryStyle: { ...block.categoryStyle, bold: !block.categoryStyle?.bold } })} className={`px-3 py-1.5 rounded-lg border text-sm font-bold transition-colors ${block.categoryStyle?.bold ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-400"}`}>B</button>
          <button onClick={() => updateBlock(block.id, { ...block, categoryStyle: { ...block.categoryStyle, italic: !block.categoryStyle?.italic } })} className={`px-3 py-1.5 rounded-lg border text-sm italic transition-colors ${block.categoryStyle?.italic ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-400"}`}>I</button>
          <input type="number" value={block.categoryStyle?.size || 11} onChange={(e) => updateBlock(block.id, { ...block, categoryStyle: { ...block.categoryStyle, size: Number(e.target.value) } })} className="w-16 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-sm text-center" />
          <span className="text-xs text-slate-400">pt</span>
          <input type="color" value={block.categoryStyle?.color || "#1e293b"} onChange={(e) => updateBlock(block.id, { ...block, categoryStyle: { ...block.categoryStyle, color: e.target.value } })} className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 cursor-pointer" />
        </div>
      </div>

      {/* Node display field + node color */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t("structure.equipDisplayField")}</label>
          <select value={block.nodeDisplayField} onChange={(e) => updateBlock(block.id, { ...block, nodeDisplayField: e.target.value as "name" | "hostname" | "ipAddress" })} className={inputCls}>
            <option value="name">Name</option>
            <option value="hostname">Hostname</option>
            <option value="ipAddress">IP Address</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>{t("structure.equipNodeColor")}</label>
          <div className="flex items-center gap-2">
            <input type="color" value={block.nodeColor || "#7c3aed"} onChange={(e) => updateBlock(block.id, { ...block, nodeColor: e.target.value })} className="h-9 w-9 rounded border border-slate-200 dark:border-slate-700 cursor-pointer" />
            <span className="text-xs font-mono text-slate-400">{block.nodeColor || "#7c3aed"}</span>
          </div>
        </div>
      </div>

      {/* Indentation */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className={labelCls}>{t("structure.equipIndent")}</label>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={80} value={block.indent ?? 10} onChange={(e) => updateBlock(block.id, { ...block, indent: Number(e.target.value) })} className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-sm text-center" />
            <span className="text-xs text-slate-400">mm</span>
          </div>
        </div>
        <div>
          <label className={labelCls}>{t("structure.equipCategoryIndent")}</label>
          <div className="flex items-center gap-2">
            <input type="number" min={0} max={80} value={block.categoryIndent ?? 20} onChange={(e) => updateBlock(block.id, { ...block, categoryIndent: Number(e.target.value) })} className="w-20 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-sm text-center" />
            <span className="text-xs text-slate-400">mm</span>
          </div>
        </div>
      </div>

      {/* Categories */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className={labelCls}>{t("structure.equipCategories")}</label>
          <button
            onClick={() => {
              const id = Math.random().toString(36).slice(2, 10);
              updateBlock(block.id, { ...block, categories: [...block.categories, { id, name: "", nodeIds: [] }] });
              setEditingCatIdx(block.categories.length);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("structure.equipAddCategory")}
          </button>
        </div>

        {block.categories.length === 0 && (
          <div className="text-center py-8 text-sm text-slate-400">{t("structure.equipNoCategories")}</div>
        )}

        <div className="space-y-3">
          {block.categories.map((cat, catIdx) => {
            const isEditing = editingCatIdx === catIdx;
            const catNodes = nodes.filter((n) => cat.nodeIds.includes(n.id));
            const availNodes = nodes.filter((n) => !cat.nodeIds.includes(n.id) && (!nodeSearch || nodeLabel(n).toLowerCase().includes(nodeSearch.toLowerCase())));

            return (
              <div key={cat.id} className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                {/* Category header */}
                <div className="flex items-center justify-between px-4 py-2.5 bg-slate-50 dark:bg-slate-800/50 cursor-pointer" onClick={() => setEditingCatIdx(isEditing ? null : catIdx)}>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{cat.name || "(sans nom)"}</span>
                    <span className="text-xs text-slate-400">({cat.nodeIds.length})</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Pencil className="h-3.5 w-3.5 text-slate-400" />
                    <button onClick={(e) => { e.stopPropagation(); updateBlock(block.id, { ...block, categories: block.categories.filter((_, i) => i !== catIdx) }); }} className="p-1 rounded text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>

                {/* Category edit form */}
                {isEditing && (
                  <div className="p-4 space-y-3 border-t border-slate-200 dark:border-slate-700">
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">{t("structure.equipCategoryName")}</label>
                      <input type="text" value={cat.name} onChange={(e) => { const cats = [...block.categories]; cats[catIdx] = { ...cats[catIdx], name: e.target.value }; updateBlock(block.id, { ...block, categories: cats }); }} placeholder={t("structure.equipCategoryNamePlaceholder")} className={inputCls} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">{t("structure.equipCategoryStyleOverride")}</label>
                      <div className="flex items-center gap-2">
                        {(() => { const cs = cat.style; const updateCatStyle = (patch: Record<string, unknown>) => { const cats = [...block.categories]; cats[catIdx] = { ...cats[catIdx], style: { ...cats[catIdx].style, ...patch } }; updateBlock(block.id, { ...block, categories: cats }); }; return (<>
                          <button onClick={() => updateCatStyle({ bold: !cs?.bold })} className={`px-2.5 py-1 rounded border text-xs font-bold transition-colors ${cs?.bold ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-400"}`}>B</button>
                          <button onClick={() => updateCatStyle({ italic: !cs?.italic })} className={`px-2.5 py-1 rounded border text-xs italic transition-colors ${cs?.italic ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "border-slate-200 dark:border-slate-700 text-slate-400"}`}>I</button>
                          <input type="number" value={cs?.size || ""} onChange={(e) => updateCatStyle({ size: e.target.value ? Number(e.target.value) : undefined })} placeholder={String(block.categoryStyle?.size || 11)} className="w-14 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs text-center" />
                          <input type="color" value={cs?.color || block.categoryStyle?.color || "#1e293b"} onChange={(e) => updateCatStyle({ color: e.target.value })} className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer" />
                          {cs && (cs.bold || cs.italic || cs.size || cs.color) && <button onClick={() => { const cats = [...block.categories]; cats[catIdx] = { ...cats[catIdx], style: undefined }; updateBlock(block.id, { ...block, categories: cats }); }} className="text-[10px] text-slate-400 hover:text-red-500">Reset</button>}
                        </>); })()}
                      </div>
                    </div>

                    {/* Selected nodes */}
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">{t("structure.equipNodes")} ({cat.nodeIds.length})</label>
                      {catNodes.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {catNodes.map((n) => (
                            <span key={n.id} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium" style={{ backgroundColor: `${block.nodeColor || "#7c3aed"}15`, color: block.nodeColor || "#7c3aed" }}>
                              {nodeLabel(n)}
                              <button onClick={() => { const cats = [...block.categories]; cats[catIdx] = { ...cats[catIdx], nodeIds: cats[catIdx].nodeIds.filter((id) => id !== n.id) }; updateBlock(block.id, { ...block, categories: cats }); }} className="hover:opacity-60"><X className="h-3 w-3" /></button>
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Add nodes */}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
                        <input type="text" value={nodeSearch} onChange={(e) => setNodeSearch(e.target.value)} placeholder={t("structure.equipSearchNode")} className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-1.5 pl-8 pr-3 text-sm placeholder:text-slate-400 focus:outline-none" />
                      </div>
                      {nodeSearch && availNodes.length > 0 && (
                        <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                          {availNodes.slice(0, 20).map((n) => (
                            <button key={n.id} onClick={() => { const cats = [...block.categories]; cats[catIdx] = { ...cats[catIdx], nodeIds: [...cats[catIdx].nodeIds, n.id] }; updateBlock(block.id, { ...block, categories: cats }); setNodeSearch(""); }} className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                              <Server className="h-3.5 w-3.5 text-slate-400" />
                              <span>{nodeLabel(n)}</span>
                              <span className="text-xs text-slate-400 ml-auto">{n.ipAddress}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- Action List properties ---
const PRIORITY_STYLES: Record<string, { color: string; bg: string; border: string }> = {
  critical: { color: "text-red-700 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10", border: "border-red-200 dark:border-red-500/20" },
  high: { color: "text-orange-700 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-500/10", border: "border-orange-200 dark:border-orange-500/20" },
  medium: { color: "text-blue-700 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10", border: "border-blue-200 dark:border-blue-500/20" },
  low: { color: "text-emerald-700 dark:text-emerald-400", bg: "bg-emerald-50 dark:bg-emerald-500/10", border: "border-emerald-200 dark:border-emerald-500/20" },
};

function ActionListProperties({
  block,
  updateBlock,
  t,
}: {
  block: ActionListBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition-colors";
  const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

  const updateAction = (idx: number, patch: Partial<ActionItem>) => {
    const actions = [...block.actions];
    actions[idx] = { ...actions[idx], ...patch };
    updateBlock(block.id, { ...block, actions });
  };

  const reorderAction = (fromIdx: number, toIdx: number) => {
    const actions = [...block.actions];
    const [moved] = actions.splice(fromIdx, 1);
    actions.splice(toIdx, 0, moved);
    updateBlock(block.id, { ...block, actions });
    setDragIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div className="space-y-6">
      {/* Title */}
      <div>
        <label className={labelCls}>{t("structure.actionTitle")}</label>
        <input type="text" value={block.title} onChange={(e) => updateBlock(block.id, { ...block, title: e.target.value })} placeholder={t("structure.actionTitlePlaceholder")} className={inputCls} />
      </div>

      {/* Actions */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className={labelCls}>{t("structure.actionItems")}</label>
          <button
            onClick={() => {
              const id = Math.random().toString(36).slice(2, 10);
              const actions = [...block.actions, { id, priority: "medium" as const, details: "" }];
              updateBlock(block.id, { ...block, actions });
              setEditingIdx(actions.length - 1);
            }}
            className="flex items-center gap-1.5 rounded-lg bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("structure.actionAdd")}
          </button>
        </div>

        {block.actions.length === 0 && (
          <div className="text-center py-8 text-sm text-slate-400">{t("structure.actionEmpty")}</div>
        )}

        <div className="space-y-2">
          {block.actions.map((action, idx) => {
            const isEditing = editingIdx === idx;
            const prio = PRIORITY_STYLES[action.priority] || PRIORITY_STYLES.medium;

            return (
              <div
                key={action.id}
                className={`rounded-lg border overflow-hidden ${prio.border} ${dragOverIdx === idx && dragIdx !== idx ? "ring-2 ring-blue-400" : ""}`}
                draggable={!isEditing}
                onDragStart={() => setDragIdx(idx)}
                onDragOver={(e) => { e.preventDefault(); setDragOverIdx(idx); }}
                onDragLeave={() => setDragOverIdx(null)}
                onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== idx) reorderAction(dragIdx, idx); }}
                onDragEnd={() => { setDragIdx(null); setDragOverIdx(null); }}
              >
                {/* Compact view */}
                {!isEditing && (
                  <div className={`flex items-center gap-3 px-4 py-2.5 cursor-grab active:cursor-grabbing hover:opacity-80 transition-opacity ${prio.bg}`} onClick={() => setEditingIdx(idx)}>
                    <GripVertical className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />
                    <span className={`shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${prio.color} ${prio.bg} border ${prio.border}`}>
                      {t(`structure.priority_${action.priority}`)}
                    </span>
                    <span className="text-sm text-slate-900 dark:text-slate-100 truncate flex-1">{action.details || <span className="italic text-slate-400">{t("structure.actionDetailsPlaceholder")}</span>}</span>
                    <div className="flex items-center gap-1 shrink-0">
                      <Pencil className="h-3 w-3 text-slate-400" />
                      <button onClick={(e) => { e.stopPropagation(); updateBlock(block.id, { ...block, actions: block.actions.filter((_, ai) => ai !== idx) }); }} className="p-0.5 rounded text-slate-400 hover:text-red-500 transition-colors"><Trash2 className="h-3 w-3" /></button>
                    </div>
                  </div>
                )}

                {/* Edit view */}
                {isEditing && (
                  <div className="p-4 space-y-3">
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">{t("structure.actionPriority")}</label>
                      <div className="flex gap-1.5">
                        {(["critical", "high", "medium", "low"] as const).map((p) => {
                          const pc = PRIORITY_STYLES[p];
                          return (
                            <button key={p} onClick={() => updateAction(idx, { priority: p })} className={`flex-1 rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors ${action.priority === p ? `${pc.bg} ${pc.color} ${pc.border} ring-1 ring-current` : "border-slate-200 dark:border-slate-700 text-slate-400 hover:border-slate-300"}`}>
                              {t(`structure.priority_${p}`)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-500 mb-1 block">{t("structure.actionDetails")}</label>
                      <textarea value={action.details} onChange={(e) => updateAction(idx, { details: e.target.value })} placeholder={t("structure.actionDetailsPlaceholder")} rows={3} className={`${inputCls} resize-none`} />
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      <button onClick={() => { updateBlock(block.id, { ...block, actions: block.actions.filter((_, ai) => ai !== idx) }); setEditingIdx(null); }} className="flex items-center gap-1 text-[11px] text-red-500 hover:text-red-600"><Trash2 className="h-3 w-3" />{t("common.delete")}</button>
                      <button onClick={() => setEditingIdx(null)} className="flex items-center gap-1 rounded-md bg-slate-900 dark:bg-white px-3 py-1 text-[11px] font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">OK</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// --- Command List properties ---
function CommandListProperties({
  block,
  updateBlock,
  t,
}: {
  block: CommandListBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const { current } = useAppContext();
  const [manufacturers, setManufacturers] = useState<{ id: number; name: string }[]>([]);
  const [models, setModels] = useState<{ id: number; name: string; manufacturer: { id: number } }[]>([]);
  const [preview, setPreview] = useState<{ folderName: string; commands: { name: string; commands: string }[] }[]>([]);
  const [connectionScript, setConnectionScript] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"content" | "style">("content");

  const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none transition-colors";
  const labelCls = "block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1";

  const style = block.style ?? { fontSize: 9 };

  useEffect(() => {
    if (!current) return;
    fetch(`/api/manufacturers?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setManufacturers);
    fetch(`/api/models?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setModels);
  }, [current]);

  useEffect(() => {
    if (!block.modelId) { setPreview([]); setConnectionScript(""); return; }
    fetch(`/api/collection-commands/by-model/${block.modelId}`).then((r) => r.ok ? r.json() : []).then((cmds: { name: string; commands: string; folderName?: string }[]) => {
      const groups: Record<string, { folderName: string; commands: { name: string; commands: string }[] }> = {};
      for (const c of cmds) {
        const fn = c.folderName || "Other";
        if (!groups[fn]) groups[fn] = { folderName: fn, commands: [] };
        groups[fn].commands.push({ name: c.name, commands: c.commands });
      }
      setPreview(Object.values(groups));
    });
    fetch(`/api/models/${block.modelId}`).then((r) => r.ok ? r.json() : null).then((m: Record<string, unknown> | null) => {
      setConnectionScript((m?.connectionScript as string) || "");
    });
  }, [block.modelId]);

  const filteredModels = block.manufacturerId ? models.filter((m) => m.manufacturer?.id === block.manufacturerId) : models;

  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg border-b-2 transition-colors ${
      active
        ? "border-blue-600 text-blue-600 dark:text-blue-400 dark:border-blue-400"
        : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
    }`;

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        <button type="button" className={tabCls(activeTab === "content")} onClick={() => setActiveTab("content")}>
          {t("structure.cmdTabContent")}
        </button>
        <button type="button" className={tabCls(activeTab === "style")} onClick={() => setActiveTab("style")}>
          {t("structure.cmdTabStyle")}
        </button>
      </div>

      {activeTab === "content" && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelCls}>{t("structure.cmdManufacturer")}</label>
              <select value={block.manufacturerId ?? ""} onChange={(e) => updateBlock(block.id, { ...block, manufacturerId: e.target.value ? Number(e.target.value) : null, modelId: null })} className={inputCls}>
                <option value="">--</option>
                {manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>{t("structure.cmdModel")}</label>
              <select value={block.modelId ?? ""} onChange={(e) => updateBlock(block.id, { ...block, modelId: e.target.value ? Number(e.target.value) : null })} className={inputCls}>
                <option value="">--</option>
                {filteredModels.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={block.pageBreakBefore ?? false}
              onChange={(e) => updateBlock(block.id, { pageBreakBefore: e.target.checked })}
              className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.pageBreakBefore")}</span>
          </label>

          {block.modelId && (
            <div>
              <label className={labelCls}>{t("structure.cmdPreview")}</label>
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-4 max-h-80 overflow-y-auto font-mono text-xs text-slate-800 dark:text-slate-200 space-y-1">
                {connectionScript && connectionScript.split("\n").filter((l) => l.trim()).map((line, i) => (
                  <div key={`cs-${i}`} className="text-slate-500 dark:text-slate-400">{line}</div>
                ))}
                {preview.map((group, gi) => (
                  <div key={gi}>
                    {group.commands.map((cmd, ci) => (
                      <div key={`${gi}-${ci}`} className="mt-2">
                        <div className="font-bold text-slate-900 dark:text-slate-100"># {cmd.name.toUpperCase()}</div>
                        {cmd.commands.split("\n").filter((l) => l.trim()).map((line, li) => (
                          <div key={`${gi}-${ci}-${li}`}>{line}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                ))}
                {preview.length === 0 && !connectionScript && (
                  <div className="text-slate-400 italic">{t("structure.cmdNoCommands")}</div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "style" && (
        <div className="space-y-5">
          {/* Command content font size */}
          <div>
            <label className={labelCls}>{t("structure.cmdFontSize")}</label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={5}
                max={14}
                step={0.5}
                value={style.fontSize}
                onChange={(e) => updateBlock(block.id, { style: { fontSize: Number(e.target.value) } })}
                className="flex-1 accent-blue-600"
              />
              <span className="text-sm font-mono text-slate-600 dark:text-slate-300 w-12 text-right">{style.fontSize}pt</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function TopologyBlockProperties({
  block,
  updateBlock,
  t,
}: {
  block: TopologyBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const { current } = useAppContext();
  const [maps, setMaps] = useState<{ id: number; name: string; description: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!current) return;
    setLoading(true);
    fetch(`/api/topology-maps?context=${current.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setMaps(data))
      .finally(() => setLoading(false));
  }, [current]);

  const selectedMap = maps.find((m) => m.id === block.topologyMapId);

  return (
    <div className="space-y-4">
      {/* Map selector */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {t("structure.topologyMap")} <span className="text-red-500">*</span>
        </label>
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {t("common.loading")}
          </div>
        ) : (
          <select
            value={block.topologyMapId ?? ""}
            onChange={(e) => updateBlock(block.id, { topologyMapId: e.target.value ? Number(e.target.value) : null, viewportFrame: null })}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
          >
            <option value="">{t("structure.topologySelectMap")}</option>
            {maps.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {selectedMap?.description && (
          <p className="text-xs text-slate-400 dark:text-slate-500">{selectedMap.description}</p>
        )}
      </div>

      {/* Protocol filter */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {t("structure.topologyProtocol")}
        </label>
        <select
          value={block.protocol}
          onChange={(e) => updateBlock(block.id, { protocol: e.target.value })}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
        >
          <option value="">{t("topology.protocolAll")}</option>
          <option value="lldp">LLDP</option>
          <option value="stp">STP</option>
          <option value="ospf">OSPF</option>
          <option value="bgp">BGP</option>
          <option value="isis">ISIS</option>
        </select>
      </div>

      {/* Viewport Frame Selector */}
      {block.topologyMapId && (
        <ViewportFrameSelector
          mapId={block.topologyMapId}
          protocol={block.protocol}
          frame={block.viewportFrame ?? null}
          onFrameChange={(frame) => updateBlock(block.id, { viewportFrame: frame })}
        />
      )}

      {/* Width */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {t("structure.topologyWidth")}
        </label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={30}
            max={100}
            step={5}
            value={block.width}
            onChange={(e) => updateBlock(block.id, { width: Number(e.target.value) })}
            className="flex-1 accent-blue-600"
          />
          <span className="text-sm font-mono text-slate-600 dark:text-slate-300 w-10 text-right">{block.width}%</span>
        </div>
      </div>

      {/* Toggles */}
      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={block.showLabels}
            onChange={(e) => updateBlock(block.id, { showLabels: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.topologyShowLabels")}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={block.showLegend}
            onChange={(e) => updateBlock(block.id, { showLegend: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.topologyShowLegend")}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={block.showMonitoring}
            onChange={(e) => updateBlock(block.id, { showMonitoring: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.topologyShowMonitoring")}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={block.showCompliance}
            onChange={(e) => updateBlock(block.id, { showCompliance: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.topologyShowCompliance")}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={block.pageBreakBefore ?? false}
            onChange={(e) => updateBlock(block.id, { pageBreakBefore: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.pageBreakBefore")}</span>
        </label>
      </div>

      {/* Caption */}
      <div className="space-y-1.5">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {t("structure.topologyCaption")}
        </label>
        <input
          type="text"
          value={block.caption}
          onChange={(e) => updateBlock(block.id, { caption: e.target.value })}
          placeholder={t("structure.topologyCaptionPlaceholder")}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
        />
      </div>
    </div>
  );
}

// --- Compliance helpers (shared) ---
interface CompliancePolicyOption {
  id: number;
  name: string;
  description?: string | null;
}

interface ComplianceRuleOption {
  id: number;
  identifier?: string | null;
  name: string;
  description?: string | null;
}

function flattenRulesFromTree(folder: { rules?: ComplianceRuleOption[]; children?: unknown[] } | null | undefined, acc: ComplianceRuleOption[] = []): ComplianceRuleOption[] {
  if (!folder) return acc;
  for (const r of folder.rules ?? []) acc.push(r);
  for (const c of (folder.children ?? []) as { rules?: ComplianceRuleOption[]; children?: unknown[] }[]) {
    flattenRulesFromTree(c, acc);
  }
  return acc;
}

// --- Compliance matrix properties ---
function ComplianceMatrixProperties({
  block,
  updateBlock,
  t,
}: {
  block: ComplianceMatrixBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const { current } = useAppContext();
  const [policies, setPolicies] = useState<CompliancePolicyOption[]>([]);

  useEffect(() => {
    if (!current) return;
    fetch(`/api/compliance-policies?context=${current.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPolicies(Array.isArray(d) ? d : []));
  }, [current]);

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <label className={labelClass}>{t("structure.compliancePolicy")} <span className="text-red-500">*</span></label>
        <select
          value={block.policyId ?? ""}
          onChange={(e) => updateBlock(block.id, { policyId: e.target.value ? Number(e.target.value) : null })}
          className={inputClass}
        >
          <option value="">--</option>
          {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={block.showRuleId}
            onChange={(e) => updateBlock(block.id, { showRuleId: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.complianceShowRuleId")}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={block.showTotal}
            onChange={(e) => updateBlock(block.id, { showTotal: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.complianceShowTotal")}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={block.pageBreakBefore ?? false}
            onChange={(e) => updateBlock(block.id, { pageBreakBefore: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.pageBreakBefore")}</span>
        </label>
      </div>

      <div className="space-y-1.5">
        <label className={labelClass}>{t("structure.complianceFontSize")}</label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={6}
            max={14}
            step={0.5}
            value={block.fontSize ?? 9}
            onChange={(e) => updateBlock(block.id, { fontSize: Number(e.target.value) })}
            className="flex-1 accent-blue-600"
          />
          <span className="text-sm font-mono text-slate-600 dark:text-slate-300 w-12 text-right">{block.fontSize ?? 9}pt</span>
        </div>
      </div>
    </div>
  );
}

// --- Reusable inventory columns panel ---
interface InventoryColumnsPanelProps {
  columns: InventoryTableColumn[];
  onChange: (cols: InventoryTableColumn[]) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

function InventoryColumnsPanel({ columns, onChange, t }: InventoryColumnsPanelProps) {
  const { current } = useAppContext();
  const [structure, setStructure] = useState<InvStructureCategory[]>([]);
  const [structureLoaded, setStructureLoaded] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerCat, setPickerCat] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState<string | null>(null);

  useEffect(() => {
    if (!current || structureLoaded) return;
    fetch(`/api/inventory-categories/structure?context=${current.id}`)
      .then((r) => r.json())
      .then((data: InvStructureCategory[]) => { setStructure(data); setStructureLoaded(true); })
      .catch(() => setStructureLoaded(true));
  }, [current, structureLoaded]);

  const pickerCatData = pickerCat ? structure.find((c) => c.categoryName === pickerCat) : null;
  const pickerKeyData = pickerCatData && pickerKey ? pickerCatData.entries.find((e) => e.key === pickerKey) : null;

  const addColumn = (category: string, entryKey: string, colLabel: string) => {
    const col: InventoryTableColumn = { id: uid(), category, entryKey, colLabel, label: `${category} > ${entryKey} > ${colLabel}` };
    onChange([...columns, col]);
    setPickerOpen(false); setPickerCat(null); setPickerKey(null);
  };

  const removeColumn = (colId: string) => onChange(columns.filter((c) => c.id !== colId));
  const updateColumn = (colId: string, patch: Partial<InventoryTableColumn>) => onChange(columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)));
  const moveColumn = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= columns.length) return;
    const cols = [...columns];
    [cols[idx], cols[target]] = [cols[target], cols[idx]];
    onChange(cols);
  };

  const alignBtn = (active: boolean) =>
    `p-1 rounded transition-colors ${active ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900" : "text-slate-400 dark:text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"}`;

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">{t("structure.complianceColumnsHint")}</p>

      {columns.map((col, idx) => (
        <div key={col.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">{idx + 1}</span>
            <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate" title={`${col.category} > ${col.entryKey} > ${col.colLabel}`}>
              {col.category} &gt; {col.entryKey} &gt; {col.colLabel}
            </span>
            <div className="flex items-center gap-0.5">
              <button onClick={() => moveColumn(idx, -1)} disabled={idx === 0} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                <ChevronUp className="h-3 w-3" />
              </button>
              <button onClick={() => moveColumn(idx, 1)} disabled={idx === columns.length - 1} className="p-0.5 text-slate-400 hover:text-slate-600 disabled:opacity-30">
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
            <button onClick={() => removeColumn(col.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="text"
              value={col.headerLabel ?? ""}
              onChange={(e) => updateColumn(col.id, { headerLabel: e.target.value })}
              placeholder={col.label || `${col.category} > ${col.entryKey} > ${col.colLabel}`}
              className="flex-1 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 px-2 py-1 focus:outline-none focus:border-violet-400"
              title={t("structure.inventoryHeaderLabel")}
            />
            <div className="flex items-center gap-0.5 shrink-0">
              <button type="button" onClick={() => updateColumn(col.id, { align: "left" })} className={alignBtn((col.align ?? "left") === "left")}><AlignLeft className="h-3 w-3" /></button>
              <button type="button" onClick={() => updateColumn(col.id, { align: "center" })} className={alignBtn(col.align === "center")}><AlignCenter className="h-3 w-3" /></button>
              <button type="button" onClick={() => updateColumn(col.id, { align: "right" })} className={alignBtn(col.align === "right")}><AlignRight className="h-3 w-3" /></button>
            </div>
          </div>
        </div>
      ))}

      {!pickerOpen ? (
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          {t("structure.inventoryAddColumn")}
        </button>
      ) : (
        <div className="rounded-lg border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20 p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-violet-700 dark:text-violet-300">
              {!pickerCat ? t("structure.inventoryPickCategory") : !pickerKey ? t("structure.inventoryPickKey") : t("structure.inventoryPickValue")}
            </span>
            <button onClick={() => { setPickerOpen(false); setPickerCat(null); setPickerKey(null); }} className="p-0.5 text-slate-400 hover:text-slate-600">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {pickerCat && (
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <button onClick={() => { setPickerCat(null); setPickerKey(null); }} className="hover:text-violet-600 underline">
                {t("structure.inventoryCategories")}
              </button>
              <ChevronRight className="h-3 w-3" />
              {pickerKey ? (
                <>
                  <button onClick={() => setPickerKey(null)} className="hover:text-violet-600 underline">{pickerCat}</button>
                  <ChevronRight className="h-3 w-3" />
                  <span className="text-violet-600 dark:text-violet-400 font-medium">{pickerKey}</span>
                </>
              ) : (
                <span className="text-violet-600 dark:text-violet-400 font-medium">{pickerCat}</span>
              )}
            </div>
          )}
          {!pickerCat && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {structure.length === 0 && <p className="text-xs text-slate-400 italic py-2">{t("structure.inventoryNoData")}</p>}
              {structure.map((cat) => (
                <button key={cat.categoryName} onClick={() => setPickerCat(cat.categoryName)} className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-800/30">
                  {cat.categoryName}
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </button>
              ))}
            </div>
          )}
          {pickerCat && !pickerKey && pickerCatData && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {pickerCatData.entries.map((entry) => (
                <button key={entry.key} onClick={() => setPickerKey(entry.key)} className="w-full flex items-center justify-between rounded-md px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-800/30">
                  {entry.key}
                  <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
                </button>
              ))}
            </div>
          )}
          {pickerCat && pickerKey && pickerKeyData && (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {pickerKeyData.columns.map((col) => (
                <button key={col} onClick={() => addColumn(pickerCat, pickerKey, col)} className="w-full flex items-center rounded-md px-3 py-2 text-sm text-left text-slate-700 dark:text-slate-300 hover:bg-violet-100 dark:hover:bg-violet-800/30">
                  <Plus className="h-3.5 w-3.5 mr-2 text-violet-500" />
                  {col}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Reusable node selection panel ---
interface NodeSelectionPanelProps {
  nodeIds: number[];
  nodeRules: InventoryNodeRule[];
  nodeRulesMatch: "all" | "any";
  onChange: (patch: { nodeIds?: number[]; nodeRules?: InventoryNodeRule[]; nodeRulesMatch?: "all" | "any" }) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

function NodeSelectionPanel({ nodeIds, nodeRules, nodeRulesMatch, onChange, t }: NodeSelectionPanelProps) {
  const { current } = useAppContext();
  const [allNodes, setAllNodes] = useState<NodeItem[]>([]);
  const [nodesLoaded, setNodesLoaded] = useState(false);
  const [nodeSearch, setNodeSearch] = useState("");
  const [structure, setStructure] = useState<InvStructureCategory[]>([]);
  const [tags, setTags] = useState<InvTagItem[]>([]);
  const [manufacturers, setManufacturers] = useState<InvManufacturerItem[]>([]);
  const [models, setModels] = useState<InvModelItem[]>([]);
  const [rulePreview, setRulePreview] = useState<number[]>([]);
  const [rulePreviewLoading, setRulePreviewLoading] = useState(false);

  useEffect(() => {
    if (!current) return;
    fetch(`/api/nodes?context=${current.id}`).then((r) => r.json()).then((d: NodeItem[]) => { setAllNodes(d); setNodesLoaded(true); }).catch(() => setNodesLoaded(true));
    fetch(`/api/inventory-categories/structure?context=${current.id}`).then((r) => r.json()).then(setStructure).catch(() => {});
    fetch(`/api/node-tags?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setTags).catch(() => {});
    fetch(`/api/manufacturers?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setManufacturers).catch(() => {});
    fetch(`/api/models?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setModels).catch(() => {});
  }, [current]);

  useEffect(() => {
    if (!current || nodeRules.length === 0) { setRulePreview([]); return; }
    setRulePreviewLoading(true);
    fetch(`/api/nodes/match?context=${current.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rules: nodeRules, match: nodeRulesMatch }),
    })
      .then((r) => r.ok ? r.json() : { nodeIds: [] })
      .then((data: { nodeIds: number[] }) => setRulePreview(data.nodeIds ?? []))
      .catch(() => setRulePreview([]))
      .finally(() => setRulePreviewLoading(false));
  }, [current, JSON.stringify(nodeRules), nodeRulesMatch]);

  const selectedNodes = allNodes.filter((n) => nodeIds.includes(n.id));
  const ruleMatchedNodes = allNodes.filter((n) => rulePreview.includes(n.id) && !nodeIds.includes(n.id));
  const availableNodes = allNodes.filter((n) =>
    !nodeIds.includes(n.id) &&
    (nodeSearch === "" ||
      (n.hostname ?? "").toLowerCase().includes(nodeSearch.toLowerCase()) ||
      (n.name ?? "").toLowerCase().includes(nodeSearch.toLowerCase()) ||
      n.ipAddress.includes(nodeSearch)),
  );

  const addNode = (id: number) => onChange({ nodeIds: [...nodeIds, id] });
  const removeNode = (id: number) => onChange({ nodeIds: nodeIds.filter((n) => n !== id) });

  const addRule = () => {
    const r: InventoryNodeRule = { id: uid(), type: "tag", operator: "eq" };
    onChange({ nodeRules: [...nodeRules, r] });
  };
  const updateRule = (rid: string, patch: Partial<InventoryNodeRule>) =>
    onChange({ nodeRules: nodeRules.map((r) => (r.id === rid ? { ...r, ...patch } : r)) });
  const removeRule = (rid: string) => onChange({ nodeRules: nodeRules.filter((r) => r.id !== rid) });

  const ruleTypeOptions: { value: InventoryNodeRuleType; label: string }[] = [
    { value: "tag", label: t("structure.invRuleTypeTag") },
    { value: "manufacturer", label: t("structure.invRuleTypeManufacturer") },
    { value: "model", label: t("structure.invRuleTypeModel") },
    { value: "hostname", label: t("structure.invRuleTypeHostname") },
    { value: "inventory", label: t("structure.invRuleTypeInventory") },
  ];
  const ruleOperatorOptions: { value: InventoryNodeRuleOperator; label: string }[] = [
    { value: "eq", label: "=" },
    { value: "neq", label: "!=" },
    { value: "contains", label: t("structure.ruleContains") },
    { value: "not_contains", label: t("structure.ruleNotContains") },
    { value: "starts_with", label: t("structure.invRuleStartsWith") },
    { value: "ends_with", label: t("structure.invRuleEndsWith") },
  ];

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-slate-500">{t("structure.complianceDevicesHint")}</p>

      {selectedNodes.length > 0 && (
        <div className="space-y-1">
          <label className={labelClass}>{t("structure.inventorySelected")}</label>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {selectedNodes.map((node) => (
              <div key={node.id} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5">
                <Server className="h-3.5 w-3.5 text-violet-500 shrink-0" />
                <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">
                  {node.hostname || node.name || node.ipAddress}
                </span>
                <span className="text-[10px] text-slate-400">{node.ipAddress}</span>
                <button onClick={() => removeNode(node.id)} className="p-0.5 text-slate-400 hover:text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label className={labelClass}>{t("structure.inventoryAddEquipment")}</label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
          <input
            type="text"
            value={nodeSearch}
            onChange={(e) => setNodeSearch(e.target.value)}
            placeholder={t("common.search")}
            className={`${inputClass} pl-8`}
          />
        </div>
      </div>

      <div className="max-h-56 overflow-y-auto space-y-1 rounded-lg border border-slate-200 dark:border-slate-700 p-1.5">
        {!nodesLoaded && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
          </div>
        )}
        {nodesLoaded && availableNodes.length === 0 && (
          <p className="text-xs text-slate-400 italic text-center py-3">{t("common.noResult")}</p>
        )}
        {availableNodes.slice(0, 100).map((node) => (
          <button key={node.id} onClick={() => addNode(node.id)} className="w-full flex items-center gap-2 rounded-md px-3 py-1.5 text-left hover:bg-slate-100 dark:hover:bg-slate-800">
            <Plus className="h-3.5 w-3.5 text-violet-500 shrink-0" />
            <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 truncate">
              {node.hostname || node.name || node.ipAddress}
            </span>
            <span className="text-[10px] text-slate-400 shrink-0">{node.ipAddress}</span>
          </button>
        ))}
      </div>

      <div className="space-y-2 pt-3 border-t border-slate-200 dark:border-slate-700">
        <div className="flex items-center justify-between">
          <div>
            <label className={labelClass}>{t("structure.invAutoRulesTitle")}</label>
            <p className="text-[10px] text-slate-400">{t("structure.invAutoRulesHint")}</p>
          </div>
          <button type="button" onClick={addRule} className="flex items-center gap-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700">
            <Plus className="h-3 w-3" />
            {t("structure.invAutoRulesAdd")}
          </button>
        </div>

        {nodeRules.length > 0 && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-slate-500">{t("structure.invAutoRulesMatch")}</span>
            <select
              value={nodeRulesMatch}
              onChange={(e) => onChange({ nodeRulesMatch: e.target.value as "all" | "any" })}
              className="bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1 focus:outline-none focus:border-violet-400"
            >
              <option value="any">{t("structure.invAutoRulesAny")}</option>
              <option value="all">{t("structure.invAutoRulesAll")}</option>
            </select>
          </div>
        )}

        {nodeRules.map((rule) => {
          const isInventory = rule.type === "inventory";
          const isTag = rule.type === "tag";
          const isManufacturer = rule.type === "manufacturer";
          const isModel = rule.type === "model";
          const allowedOps: InventoryNodeRuleOperator[] = isTag || isManufacturer || isModel
            ? ["eq", "neq"]
            : ["eq", "neq", "contains", "not_contains", "starts_with", "ends_with"];
          return (
            <div key={rule.id} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 space-y-2">
              <div className="flex items-center gap-2">
                <select
                  value={rule.type}
                  onChange={(e) => {
                    const t2 = e.target.value as InventoryNodeRuleType;
                    const patch: Partial<InventoryNodeRule> = { type: t2, value: undefined, tagId: undefined, category: undefined, entryKey: undefined, colLabel: undefined };
                    if (t2 === "tag" || t2 === "manufacturer" || t2 === "model") {
                      if (!["eq", "neq"].includes(rule.operator)) patch.operator = "eq";
                    }
                    updateRule(rule.id, patch);
                  }}
                  className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                >
                  {ruleTypeOptions.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  value={rule.operator}
                  onChange={(e) => updateRule(rule.id, { operator: e.target.value as InventoryNodeRuleOperator })}
                  className="shrink-0 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                >
                  {ruleOperatorOptions.filter((o) => allowedOps.includes(o.value)).map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <button type="button" onClick={() => removeRule(rule.id)} className="p-1 text-slate-400 hover:text-red-500">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>

              {isTag && (
                <select
                  value={rule.tagId ?? ""}
                  onChange={(e) => updateRule(rule.id, { tagId: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                >
                  <option value="">{t("structure.invAutoRulePickTag")}</option>
                  {tags.map((tg) => (<option key={tg.id} value={tg.id}>{tg.name}</option>))}
                </select>
              )}
              {isManufacturer && (
                <select
                  value={rule.value ?? ""}
                  onChange={(e) => updateRule(rule.id, { value: e.target.value || undefined })}
                  className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                >
                  <option value="">{t("structure.invAutoRulePickManufacturer")}</option>
                  {manufacturers.map((m) => (<option key={m.id} value={String(m.id)}>{m.name}</option>))}
                </select>
              )}
              {isModel && (
                <select
                  value={rule.value ?? ""}
                  onChange={(e) => updateRule(rule.id, { value: e.target.value || undefined })}
                  className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                >
                  <option value="">{t("structure.invAutoRulePickModel")}</option>
                  {models.map((m) => (<option key={m.id} value={String(m.id)}>{m.manufacturer ? `${m.manufacturer.name} — ${m.name}` : m.name}</option>))}
                </select>
              )}
              {isInventory && (
                <div className="space-y-2">
                  <select
                    value={rule.category ?? ""}
                    onChange={(e) => updateRule(rule.id, { category: e.target.value || undefined, entryKey: undefined, colLabel: undefined })}
                    className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                  >
                    <option value="">{t("structure.inventoryPickCategory")}</option>
                    {structure.map((c) => (<option key={c.categoryName} value={c.categoryName}>{c.categoryName}</option>))}
                  </select>
                  {rule.category && (
                    <select
                      value={rule.entryKey ?? ""}
                      onChange={(e) => updateRule(rule.id, { entryKey: e.target.value || undefined, colLabel: undefined })}
                      className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                    >
                      <option value="">{t("structure.inventoryPickKey")}</option>
                      {(structure.find((c) => c.categoryName === rule.category)?.entries ?? []).map((e) => (<option key={e.key} value={e.key}>{e.key}</option>))}
                    </select>
                  )}
                  {rule.category && rule.entryKey && (
                    <select
                      value={rule.colLabel ?? ""}
                      onChange={(e) => updateRule(rule.id, { colLabel: e.target.value || undefined })}
                      className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400"
                    >
                      <option value="">{t("structure.inventoryPickValue")}</option>
                      {(structure.find((c) => c.categoryName === rule.category)?.entries.find((e) => e.key === rule.entryKey)?.columns ?? []).map((col) => (<option key={col} value={col}>{col}</option>))}
                    </select>
                  )}
                  <input
                    type="text"
                    value={rule.value ?? ""}
                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                    placeholder={t("structure.ruleValue")}
                    className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400 placeholder:text-slate-400"
                  />
                </div>
              )}
              {!isTag && !isManufacturer && !isModel && !isInventory && (
                <input
                  type="text"
                  value={rule.value ?? ""}
                  onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                  placeholder={t("structure.ruleValue")}
                  className="w-full bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 px-2 py-1.5 focus:outline-none focus:border-violet-400 placeholder:text-slate-400"
                />
              )}
            </div>
          );
        })}

        {nodeRules.length > 0 && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-2 space-y-1">
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              {rulePreviewLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              <span>{t("structure.invAutoRulesMatched", { count: String(rulePreview.length) })}</span>
            </div>
            {ruleMatchedNodes.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1">
                {ruleMatchedNodes.slice(0, 12).map((n) => (
                  <span key={n.id} className="inline-flex items-center gap-1 rounded-full bg-violet-100 dark:bg-violet-500/15 px-2 py-0.5 text-[10px] text-violet-700 dark:text-violet-300">
                    <Server className="h-2.5 w-2.5" />
                    {n.hostname || n.name || n.ipAddress}
                  </span>
                ))}
                {ruleMatchedNodes.length > 12 && (<span className="text-[10px] text-slate-400">+{ruleMatchedNodes.length - 12}</span>)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Shared compliance content tab ---
function ComplianceRulePicker({
  block,
  updateBlock,
  t,
}: {
  block: RuleNonCompliantBlock | RuleNodesTableBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const { current } = useAppContext();
  const [policies, setPolicies] = useState<CompliancePolicyOption[]>([]);
  const [rules, setRules] = useState<ComplianceRuleOption[]>([]);

  useEffect(() => {
    if (!current) return;
    fetch(`/api/compliance-policies?context=${current.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPolicies(Array.isArray(d) ? d : []));
  }, [current]);

  useEffect(() => {
    if (!block.policyId) { setRules([]); return; }
    fetch(`/api/compliance-policies/${block.policyId}/rules`)
      .then((r) => (r.ok ? r.json() : { folder: null, extraRules: [] }))
      .then((d) => {
        const fromTree = flattenRulesFromTree(d?.folder);
        const extras: ComplianceRuleOption[] = Array.isArray(d?.extraRules) ? d.extraRules : [];
        const all = [...fromTree, ...extras];
        const seen = new Set<number>();
        const dedup = all.filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
        dedup.sort((a, b) => (a.identifier ?? "").localeCompare(b.identifier ?? "") || a.name.localeCompare(b.name));
        setRules(dedup);
      });
  }, [block.policyId]);

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <label className={labelClass}>{t("structure.compliancePolicy")} <span className="text-red-500">*</span></label>
        <select
          value={block.policyId ?? ""}
          onChange={(e) => updateBlock(block.id, { policyId: e.target.value ? Number(e.target.value) : null, ruleId: null })}
          className={inputClass}
        >
          <option value="">--</option>
          {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <label className={labelClass}>{t("structure.complianceRule")} <span className="text-red-500">*</span></label>
        <select
          value={block.ruleId ?? ""}
          onChange={(e) => updateBlock(block.id, { ruleId: e.target.value ? Number(e.target.value) : null })}
          className={inputClass}
          disabled={!block.policyId}
        >
          <option value="">--</option>
          {rules.map((r) => <option key={r.id} value={r.id}>{r.identifier ? `[${r.identifier}] ` : ""}{r.name}</option>)}
        </select>
      </div>
    </div>
  );
}

function complianceTabBtnClass(active: boolean): string {
  return `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
    active
      ? "border-violet-500 text-violet-600 dark:text-violet-400"
      : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
  }`;
}

// --- Rule non-compliant nodes properties (tabbed) ---
function RuleNonCompliantProperties({
  block,
  updateBlock,
  t,
}: {
  block: RuleNonCompliantBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const [activeTab, setActiveTab] = useState<"content" | "columns" | "devices">("content");
  const blockColumns = block.columns ?? [];
  const blockNodeIds = block.nodeIds ?? [];
  const blockNodeRules = block.nodeRules ?? [];
  const blockNodeRulesMatch = block.nodeRulesMatch ?? "any";

  return (
    <div className="space-y-4">
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        <button type="button" className={complianceTabBtnClass(activeTab === "content")} onClick={() => setActiveTab("content")}>
          {t("structure.complianceTabContent")}
        </button>
        <button type="button" className={complianceTabBtnClass(activeTab === "columns")} onClick={() => setActiveTab("columns")}>
          {t("structure.complianceTabColumns")}
          {blockColumns.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-violet-100 dark:bg-violet-500/15 px-1.5 text-[10px] font-bold text-violet-600 dark:text-violet-400">
              {blockColumns.length}
            </span>
          )}
        </button>
        <button type="button" className={complianceTabBtnClass(activeTab === "devices")} onClick={() => setActiveTab("devices")}>
          {t("structure.complianceTabDevices")}
          {(blockNodeIds.length > 0 || blockNodeRules.length > 0) && (
            <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-violet-100 dark:bg-violet-500/15 px-1.5 text-[10px] font-bold text-violet-600 dark:text-violet-400">
              {blockNodeIds.length + blockNodeRules.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "content" && (
        <div className="space-y-4">
          <ComplianceRulePicker block={block} updateBlock={updateBlock} t={t} />

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={block.showRuleDescription}
                onChange={(e) => updateBlock(block.id, { showRuleDescription: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.complianceShowRuleDescription")}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={block.showSeverity}
                onChange={(e) => updateBlock(block.id, { showSeverity: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.complianceShowSeverity")}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={block.showMessage}
                onChange={(e) => updateBlock(block.id, { showMessage: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.complianceShowMessage")}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={block.pageBreakBefore ?? false}
                onChange={(e) => updateBlock(block.id, { pageBreakBefore: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.pageBreakBefore")}</span>
            </label>
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>{t("structure.complianceFontSize")}</label>
            <div className="flex items-center gap-3">
              <input type="range" min={6} max={14} step={0.5} value={block.fontSize ?? 9}
                onChange={(e) => updateBlock(block.id, { fontSize: Number(e.target.value) })}
                className="flex-1 accent-blue-600" />
              <span className="text-sm font-mono text-slate-600 dark:text-slate-300 w-12 text-right">{block.fontSize ?? 9}pt</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === "columns" && (
        <InventoryColumnsPanel
          columns={blockColumns}
          onChange={(cols) => updateBlock(block.id, { columns: cols })}
          t={t}
        />
      )}

      {activeTab === "devices" && (
        <NodeSelectionPanel
          nodeIds={blockNodeIds}
          nodeRules={blockNodeRules}
          nodeRulesMatch={blockNodeRulesMatch}
          onChange={(patch) => updateBlock(block.id, patch)}
          t={t}
        />
      )}
    </div>
  );
}

// --- Rule nodes table properties (tabbed) ---
function RuleNodesTableProperties({
  block,
  updateBlock,
  t,
}: {
  block: RuleNodesTableBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const [activeTab, setActiveTab] = useState<"content" | "columns" | "devices">("content");
  const blockColumns = block.columns ?? [];
  const blockNodeIds = block.nodeIds ?? [];
  const blockNodeRules = block.nodeRules ?? [];
  const blockNodeRulesMatch = block.nodeRulesMatch ?? "any";

  return (
    <div className="space-y-4">
      <div className="flex border-b border-slate-200 dark:border-slate-700">
        <button type="button" className={complianceTabBtnClass(activeTab === "content")} onClick={() => setActiveTab("content")}>
          {t("structure.complianceTabContent")}
        </button>
        <button type="button" className={complianceTabBtnClass(activeTab === "columns")} onClick={() => setActiveTab("columns")}>
          {t("structure.complianceTabColumns")}
          {blockColumns.length > 0 && (
            <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-violet-100 dark:bg-violet-500/15 px-1.5 text-[10px] font-bold text-violet-600 dark:text-violet-400">
              {blockColumns.length}
            </span>
          )}
        </button>
        <button type="button" className={complianceTabBtnClass(activeTab === "devices")} onClick={() => setActiveTab("devices")}>
          {t("structure.complianceTabDevices")}
          {(blockNodeIds.length > 0 || blockNodeRules.length > 0) && (
            <span className="ml-1.5 inline-flex items-center justify-center h-5 min-w-[20px] rounded-full bg-violet-100 dark:bg-violet-500/15 px-1.5 text-[10px] font-bold text-violet-600 dark:text-violet-400">
              {blockNodeIds.length + blockNodeRules.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === "content" && (
        <div className="space-y-4">
          <ComplianceRulePicker block={block} updateBlock={updateBlock} t={t} />

          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={block.showRuleDescription}
                onChange={(e) => updateBlock(block.id, { showRuleDescription: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.complianceShowRuleDescription")}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={block.showMessage}
                onChange={(e) => updateBlock(block.id, { showMessage: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.complianceShowMessage")}</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={block.pageBreakBefore ?? false}
                onChange={(e) => updateBlock(block.id, { pageBreakBefore: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500" />
              <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.pageBreakBefore")}</span>
            </label>
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>{t("structure.complianceFontSize")}</label>
            <div className="flex items-center gap-3">
              <input type="range" min={6} max={14} step={0.5} value={block.fontSize ?? 9}
                onChange={(e) => updateBlock(block.id, { fontSize: Number(e.target.value) })}
                className="flex-1 accent-blue-600" />
              <span className="text-sm font-mono text-slate-600 dark:text-slate-300 w-12 text-right">{block.fontSize ?? 9}pt</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === "columns" && (
        <InventoryColumnsPanel
          columns={blockColumns}
          onChange={(cols) => updateBlock(block.id, { columns: cols })}
          t={t}
        />
      )}

      {activeTab === "devices" && (
        <NodeSelectionPanel
          nodeIds={blockNodeIds}
          nodeRules={blockNodeRules}
          nodeRulesMatch={blockNodeRulesMatch}
          onChange={(patch) => updateBlock(block.id, patch)}
          t={t}
        />
      )}
    </div>
  );
}

// --- Rule recommendation properties ---
function RuleRecommendationProperties({
  block,
  updateBlock,
  t,
}: {
  block: RuleRecommendationBlock;
  updateBlock: (id: string, patch: Partial<ReportBlock>) => void;
  t: (key: string, params?: Record<string, string>) => string;
}) {
  const { current } = useAppContext();
  const [policies, setPolicies] = useState<CompliancePolicyOption[]>([]);
  const [recRules, setRecRules] = useState<ComplianceRuleOption[]>([]);
  const [recNodes, setRecNodes] = useState<NodeItem[]>([]);

  useEffect(() => {
    if (!current) return;
    fetch(`/api/compliance-policies?context=${current.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPolicies(Array.isArray(d) ? d : []));
    fetch(`/api/nodes?context=${current.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: NodeItem[]) => setRecNodes(Array.isArray(d) ? d : []));
  }, [current]);

  useEffect(() => {
    if (!block.policyId) { setRecRules([]); return; }
    fetch(`/api/compliance-policies/${block.policyId}/rules`)
      .then((r) => (r.ok ? r.json() : { folder: null, extraRules: [] }))
      .then((d) => {
        const fromTree = flattenRulesFromTree(d?.folder);
        const extras: ComplianceRuleOption[] = Array.isArray(d?.extraRules) ? d.extraRules : [];
        const all = [...fromTree, ...extras];
        const seen = new Set<number>();
        const dedup = all.filter((r) => { if (seen.has(r.id)) return false; seen.add(r.id); return true; });
        dedup.sort((a, b) => (a.identifier ?? "").localeCompare(b.identifier ?? "") || a.name.localeCompare(b.name));
        setRecRules(dedup);
      });
  }, [block.policyId]);

  const recPlaceholder =
    block.displayMode === "cli"
      ? "configure terminal\ninterface Vlan10\n no ip http server\nend\n! {{hostname}}"
      : t("structure.recommendationPlaceholder");

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className={labelClass}>{t("structure.compliancePolicy")} <span className="text-red-500">*</span></label>
          <select
            value={block.policyId ?? ""}
            onChange={(e) => updateBlock(block.id, { policyId: e.target.value ? Number(e.target.value) : null, ruleId: null })}
            className={inputClass}
          >
            <option value="">--</option>
            {policies.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className={labelClass}>{t("structure.complianceRule")} <span className="text-red-500">*</span></label>
          <select
            value={block.ruleId ?? ""}
            onChange={(e) => updateBlock(block.id, { ruleId: e.target.value ? Number(e.target.value) : null })}
            className={inputClass}
            disabled={!block.policyId}
          >
            <option value="">--</option>
            {recRules.map((r) => <option key={r.id} value={r.id}>{r.identifier ? `[${r.identifier}] ` : ""}{r.name}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className={labelClass}>{t("structure.recommendationDevice")} <span className="text-red-500">*</span></label>
        <select
          value={block.nodeId ?? ""}
          onChange={(e) => updateBlock(block.id, { nodeId: e.target.value ? Number(e.target.value) : null })}
          className={inputClass}
        >
          <option value="">--</option>
          {recNodes.map((n) => (
            <option key={n.id} value={n.id}>
              {(n.hostname || n.name || n.ipAddress)} ({n.ipAddress})
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className={labelClass}>{t("structure.recommendationSource")}</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => updateBlock(block.id, { source: "static" })}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              (block.source ?? "static") === "static"
                ? "border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
            }`}
          >
            {t("structure.recommendationSourceStatic")}
          </button>
          <button
            type="button"
            onClick={() => updateBlock(block.id, { source: "dynamic" })}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              block.source === "dynamic"
                ? "border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
            }`}
          >
            {t("structure.recommendationSourceDynamic")}
          </button>
        </div>
        <p className="text-[10px] text-slate-400 italic">
          {(block.source ?? "static") === "dynamic"
            ? t("structure.recommendationSourceDynamicHint")
            : t("structure.recommendationSourceStaticHint")}
        </p>
      </div>

      <div className="space-y-1.5">
        <label className={labelClass}>{t("structure.recommendationDisplayMode")}</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => updateBlock(block.id, { displayMode: "text" })}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              block.displayMode === "text"
                ? "border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
            }`}
          >
            {t("structure.recommendationModeText")}
          </button>
          <button
            type="button"
            onClick={() => updateBlock(block.id, { displayMode: "cli" })}
            className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
              block.displayMode === "cli"
                ? "border-amber-500 bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300"
                : "border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-100"
            }`}
          >
            {t("structure.recommendationModeCli")}
          </button>
        </div>
      </div>

      {(block.source ?? "static") === "static" && (
        <div className="space-y-1.5">
          <label className={labelClass}>{t("structure.recommendationContent")}</label>
          <textarea
            value={block.recommendation}
            onChange={(e) => updateBlock(block.id, { recommendation: e.target.value })}
            placeholder={recPlaceholder}
            rows={10}
            className={`${inputClass} resize-y ${block.displayMode === "cli" ? "font-mono text-xs" : ""}`}
          />
          <p className="text-[10px] text-slate-400 italic">{t("structure.recommendationVariablesHint")}</p>
        </div>
      )}

      <div className="space-y-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={block.showHeader}
            onChange={(e) => updateBlock(block.id, { showHeader: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.recommendationShowHeader")}</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={block.pageBreakBefore ?? false}
            onChange={(e) => updateBlock(block.id, { pageBreakBefore: e.target.checked })}
            className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-sm text-slate-700 dark:text-slate-300">{t("structure.pageBreakBefore")}</span>
        </label>
      </div>

      <div className="space-y-1.5">
        <label className={labelClass}>{t("structure.complianceFontSize")}</label>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={6}
            max={14}
            step={0.5}
            value={block.fontSize ?? (block.displayMode === "cli" ? 9 : 11)}
            onChange={(e) => updateBlock(block.id, { fontSize: Number(e.target.value) })}
            className="flex-1 accent-blue-600"
          />
          <span className="text-sm font-mono text-slate-600 dark:text-slate-300 w-12 text-right">{block.fontSize ?? (block.displayMode === "cli" ? 9 : 11)}pt</span>
        </div>
      </div>
    </div>
  );
}
