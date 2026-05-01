"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Heading,
  Pilcrow,
  Image as ImageIcon,
  MousePointerClick,
  Minus,
  ArrowDownUp,
  Columns3,
  Gauge,
  Trophy,
  LayoutGrid,
  ListChecks,
  PanelTop,
  PanelBottom,
  ChevronUp,
  ChevronDown,
  Copy,
  Trash2,
  Plus,
  X,
  GripVertical,
  ServerCog,
  ShieldCheck,
  Bug,
  PieChart,
  RefreshCw,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type Block =
  | { type: "header"; title?: string; subtitle?: string; logoUrl?: string; align?: "left" | "center" | "right"; background?: string; color?: string }
  | { type: "heading"; level?: number; text?: string; align?: "left" | "center" | "right"; color?: string }
  | { type: "paragraph"; text?: string; align?: "left" | "center" | "right"; size?: number; color?: string }
  | { type: "image"; src?: string; alt?: string; width?: number; align?: "left" | "center" | "right" }
  | { type: "button"; label?: string; href?: string; align?: "left" | "center" | "right"; bg?: string; color?: string }
  | { type: "divider" }
  | { type: "spacer"; height?: number }
  | { type: "columns"; columns?: { blocks: InnerBlock[] }[] }
  | { type: "compliance_score"; title?: string }
  | { type: "top_nodes"; direction?: "best" | "worst"; limit?: number; title?: string }
  | { type: "kpi_tiles" }
  | { type: "action_list"; title?: string; items?: { text: string }[] }
  | { type: "footer"; text?: string; align?: "left" | "center" | "right" }
  | { type: "node_detail"; nodeId?: number | null; title?: string; limit?: number }
  | { type: "policy_ranking"; direction?: "best" | "worst"; limit?: number; title?: string }
  | { type: "recent_cves"; limit?: number; minSeverity?: "low" | "medium" | "high" | "critical"; title?: string }
  | { type: "cve_distribution"; title?: string }
  | { type: "system_updates"; monthsAhead?: number; limit?: number; title?: string };

export type InnerBlock =
  | { type: "heading"; level?: number; text?: string; color?: string }
  | { type: "paragraph"; text?: string; color?: string }
  | { type: "image"; src?: string }
  | { type: "kpi"; label?: string; value?: string; accent?: string }
  | { type: "button"; label?: string; href?: string };

type AnyBlock = Block | InnerBlock;

interface BlockDef {
  type: Block["type"];
  i18nKey: string;
  icon: LucideIcon;
}

interface BlockCategory {
  i18nKey: string;
  blocks: BlockDef[];
}

const BLOCK_CATEGORIES: BlockCategory[] = [
  {
    i18nKey: "cat_content",
    blocks: [
      { type: "header", i18nKey: "block_header", icon: PanelTop },
      { type: "heading", i18nKey: "block_heading", icon: Heading },
      { type: "paragraph", i18nKey: "block_paragraph", icon: Pilcrow },
      { type: "image", i18nKey: "block_image", icon: ImageIcon },
      { type: "button", i18nKey: "block_button", icon: MousePointerClick },
      { type: "divider", i18nKey: "block_divider", icon: Minus },
      { type: "spacer", i18nKey: "block_spacer", icon: ArrowDownUp },
      { type: "columns", i18nKey: "block_columns", icon: Columns3 },
      { type: "action_list", i18nKey: "block_action_list", icon: ListChecks },
      { type: "footer", i18nKey: "block_footer", icon: PanelBottom },
    ],
  },
  {
    i18nKey: "cat_context",
    blocks: [
      { type: "kpi_tiles", i18nKey: "block_kpi_tiles", icon: LayoutGrid },
      { type: "compliance_score", i18nKey: "block_compliance_score", icon: Gauge },
    ],
  },
  {
    i18nKey: "cat_node",
    blocks: [
      { type: "top_nodes", i18nKey: "block_top_nodes", icon: Trophy },
      { type: "node_detail", i18nKey: "block_node_detail", icon: ServerCog },
    ],
  },
  {
    i18nKey: "cat_compliance",
    blocks: [
      { type: "policy_ranking", i18nKey: "block_policy_ranking", icon: ShieldCheck },
    ],
  },
  {
    i18nKey: "cat_security",
    blocks: [
      { type: "recent_cves", i18nKey: "block_recent_cves", icon: Bug },
      { type: "cve_distribution", i18nKey: "block_cve_distribution", icon: PieChart },
    ],
  },
  {
    i18nKey: "cat_system_updates",
    blocks: [
      { type: "system_updates", i18nKey: "block_system_updates", icon: RefreshCw },
    ],
  },
];

const BLOCK_DEFINITIONS: BlockDef[] = BLOCK_CATEGORIES.flatMap((c) => c.blocks);

const ICONS: Record<string, LucideIcon> = Object.fromEntries(
  BLOCK_DEFINITIONS.map((d) => [d.type, d.icon])
);

function defaultBlock(type: Block["type"]): Block {
  switch (type) {
    case "header": return { type, title: "Network compliance report", subtitle: "Weekly summary", align: "center", background: "#1e293b", color: "#ffffff" };
    case "heading": return { type, level: 2, text: "Section title", align: "left" };
    case "paragraph": return { type, text: "Type your text here.", align: "left" };
    case "image": return { type, src: "", alt: "", align: "center" };
    case "button": return { type, label: "Open dashboard", href: "https://", align: "center" };
    case "divider": return { type };
    case "spacer": return { type, height: 24 };
    case "columns": return { type, columns: [{ blocks: [{ type: "kpi", label: "Nodes", value: "0" }] }, { blocks: [{ type: "kpi", label: "Score", value: "0%" }] }] };
    case "compliance_score": return { type, title: "Overall compliance" };
    case "top_nodes": return { type, direction: "best", limit: 5, title: "Top compliant nodes" };
    case "kpi_tiles": return { type };
    case "action_list": return { type, title: "Recommended actions", items: [{ text: "Review non-compliant nodes" }] };
    case "footer": return { type, text: "Sent by Auditix", align: "center" };
    case "node_detail": return { type, nodeId: null, title: "Node detail", limit: 5 };
    case "policy_ranking": return { type, direction: "worst", limit: 5, title: "Top compliance policies" };
    case "recent_cves": return { type, limit: 5, minSeverity: "medium", title: "Latest vulnerabilities" };
    case "cve_distribution": return { type, title: "Vulnerability distribution" };
    case "system_updates": return { type, monthsAhead: 6, limit: 5, title: "System updates & lifecycle" };
  }
}

interface Props {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}

export function MailEditor({ blocks, onChange }: Props) {
  const { t } = useI18n();
  const [palette, setPalette] = useState<{ index: number } | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const update = (i: number, patch: Partial<Block>) => {
    const next = blocks.slice();
    next[i] = { ...next[i], ...patch } as Block;
    onChange(next);
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = blocks.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  const reorder = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= blocks.length || to > blocks.length) return;
    const next = blocks.slice();
    const [moved] = next.splice(from, 1);
    next.splice(from < to ? to - 1 : to, 0, moved);
    onChange(next);
    setEditing((cur) => {
      if (cur === null) return cur;
      if (cur === from) return from < to ? to - 1 : to;
      if (from < cur && cur < to) return cur - 1;
      if (to <= cur && cur < from) return cur + 1;
      return cur;
    });
  };

  const duplicate = (i: number) => {
    const next = blocks.slice();
    next.splice(i + 1, 0, JSON.parse(JSON.stringify(blocks[i])));
    onChange(next);
  };

  const remove = (i: number) => {
    const next = blocks.slice();
    next.splice(i, 1);
    onChange(next);
    setEditing(null);
  };

  const insertAt = (index: number, type: Block["type"]) => {
    const next = blocks.slice();
    next.splice(index, 0, defaultBlock(type));
    onChange(next);
    setPalette(null);
    setEditing(index);
  };

  return (
    <div className="space-y-3">
      {blocks.map((block, i) => {
        const Icon = ICONS[block.type] ?? Pilcrow;
        const def = BLOCK_DEFINITIONS.find((d) => d.type === block.type);
        const isEditing = editing === i;
        const isDragging = dragIndex === i;
        const isDropTarget = dragOverIndex === i && dragIndex !== null && dragIndex !== i;
        return (
          <div key={i} className="relative">
            {isDropTarget && dragIndex !== null && dragIndex > i && (
              <div className="absolute -top-1.5 left-0 right-0 h-1 bg-blue-500 rounded-full pointer-events-none z-10" />
            )}
            <div
              onDragOver={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = "move";
                setDragOverIndex(i);
              }}
              onDrop={(e) => {
                if (dragIndex === null) return;
                e.preventDefault();
                const target = dragIndex < i ? i + 1 : i;
                reorder(dragIndex, target);
                setDragIndex(null);
                setDragOverIndex(null);
              }}
              className={`rounded-xl border bg-white dark:bg-slate-900 overflow-hidden transition-all ${
                isDragging ? "opacity-40" : ""
              } ${
                isDropTarget ? "border-blue-400 ring-2 ring-blue-400/30" : "border-slate-200 dark:border-slate-700"
              }`}
            >
              <div className="flex items-center justify-between px-2 py-2 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span
                    draggable
                    onDragStart={(e) => {
                      setDragIndex(i);
                      e.dataTransfer.effectAllowed = "move";
                      e.dataTransfer.setData("text/plain", String(i));
                    }}
                    onDragEnd={() => {
                      setDragIndex(null);
                      setDragOverIndex(null);
                    }}
                    className="cursor-grab active:cursor-grabbing p-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                    title="Drag"
                  >
                    <GripVertical className="h-4 w-4 text-slate-400" />
                  </span>
                  <button
                    type="button"
                    onClick={() => setEditing(isEditing ? null : i)}
                    className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-200 min-w-0"
                  >
                    <Icon className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="truncate">{def ? t(`mail_reports.${def.i18nKey}`) : block.type}</span>
                    <span className="text-xs text-slate-400 shrink-0">#{i + 1}</span>
                  </button>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => move(i, -1)} title={t("mail_reports.moveUp")} className="p-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors">
                    <ChevronUp className="h-4 w-4 text-slate-500" />
                  </button>
                  <button onClick={() => move(i, 1)} title={t("mail_reports.moveDown")} className="p-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors">
                    <ChevronDown className="h-4 w-4 text-slate-500" />
                  </button>
                  <button onClick={() => duplicate(i)} title={t("mail_reports.duplicate")} className="p-1 rounded hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors">
                    <Copy className="h-4 w-4 text-slate-500" />
                  </button>
                  <button onClick={() => remove(i)} title={t("mail_reports.remove")} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-500/20 transition-colors">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </button>
                </div>
              </div>
              <div className="px-3 py-2 text-xs text-slate-500 dark:text-slate-400 truncate">
                {summarize(block, t)}
              </div>
              {isEditing && (
                <div className="px-3 py-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-800/30 space-y-3">
                  <BlockForm block={block} onChange={(patch) => update(i, patch)} />
                </div>
              )}
            </div>
            {isDropTarget && dragIndex !== null && dragIndex < i && (
              <div className="absolute -bottom-1.5 left-0 right-0 h-1 bg-blue-500 rounded-full pointer-events-none z-10" />
            )}
          </div>
        );
      })}

      <div className="pt-2">
        <button
          type="button"
          onClick={() => setPalette({ index: blocks.length })}
          className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 px-4 py-3 text-sm font-medium text-slate-600 dark:text-slate-400 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
        >
          <Plus className="h-4 w-4" />
          {t("mail_reports.addBlock")}
        </button>
      </div>

      {palette && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setPalette(null)}>
          <div onClick={(e) => e.stopPropagation()} className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("mail_reports.addBlock")}</h3>
              <button onClick={() => setPalette(null)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            <div className="overflow-y-auto p-4 space-y-5">
              {BLOCK_CATEGORIES.map((cat) => (
                <div key={cat.i18nKey}>
                  <h4 className="text-[11px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                    {t(`mail_reports.${cat.i18nKey}`)}
                  </h4>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {cat.blocks.map((d) => {
                      const Icon = d.icon;
                      return (
                        <button
                          key={d.type}
                          onClick={() => insertAt(palette.index, d.type)}
                          className="flex flex-col items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-4 text-sm font-medium text-slate-700 dark:text-slate-300 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-500/10 transition-colors"
                        >
                          <Icon className="h-5 w-5 text-blue-500" />
                          {t(`mail_reports.${d.i18nKey}`)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function summarize(b: Block, t: (k: string) => string): string {
  switch (b.type) {
    case "header": return `${b.title ?? ""} · ${b.subtitle ?? ""}`.replace(/^ · | · $/g, "");
    case "heading": return `H${b.level ?? 2} · ${(b.text ?? "").slice(0, 60)}`;
    case "paragraph": return (b.text ?? "").slice(0, 80);
    case "image": return b.src || "—";
    case "button": return `${b.label ?? ""} → ${b.href ?? ""}`;
    case "divider": return "—";
    case "spacer": return `${b.height ?? 16}px`;
    case "columns": return `${b.columns?.length ?? 0} columns`;
    case "compliance_score": return b.title ?? "Compliance";
    case "top_nodes": return `${t(b.direction === "best" ? "mail_reports.directionBest" : "mail_reports.directionWorst")} · ${b.limit ?? 5}`;
    case "kpi_tiles": return "Nodes · Compliant · Non compliant · Score";
    case "action_list": return `${b.items?.length ?? 0} items`;
    case "footer": return (b.text ?? "").slice(0, 80);
    case "node_detail": return b.nodeId ? `Node #${b.nodeId}` : "—";
    case "policy_ranking": return `${t(b.direction === "best" ? "mail_reports.directionBest" : "mail_reports.directionWorst")} · ${b.limit ?? 5}`;
    case "recent_cves": return `${b.limit ?? 5} · ${b.minSeverity ?? "medium"}+`;
    case "cve_distribution": return b.title ?? "Distribution";
    case "system_updates": return `EoL ≤ ${b.monthsAhead ?? 6} months · ${b.limit ?? 5}`;
  }
}

const inputCls = "w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-400/30";
const labelCls = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
    </div>
  );
}

function ColorInput({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} className="h-8 w-10 rounded border border-slate-200 dark:border-slate-700 bg-transparent cursor-pointer" />
      <input type="text" value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="#000000" className={inputCls} />
    </div>
  );
}

function AlignSelect({ value, onChange, t }: { value?: string; onChange: (v: "left" | "center" | "right") => void; t: (k: string) => string }) {
  return (
    <select value={value || "left"} onChange={(e) => onChange(e.target.value as "left" | "center" | "right")} className={inputCls}>
      <option value="left">{t("mail_reports.alignLeft")}</option>
      <option value="center">{t("mail_reports.alignCenter")}</option>
      <option value="right">{t("mail_reports.alignRight")}</option>
    </select>
  );
}

function BlockForm({ block, onChange }: { block: Block; onChange: (patch: Partial<Block>) => void }) {
  const { t } = useI18n();
  switch (block.type) {
    case "header":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("mail_reports.field_title")}>
            <input className={inputCls} value={block.title ?? ""} onChange={(e) => onChange({ title: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_subtitle")}>
            <input className={inputCls} value={block.subtitle ?? ""} onChange={(e) => onChange({ subtitle: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_logoUrl")}>
            <input className={inputCls} value={block.logoUrl ?? ""} onChange={(e) => onChange({ logoUrl: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_align")}>
            <AlignSelect value={block.align} onChange={(v) => onChange({ align: v } as Partial<Block>)} t={t} />
          </Field>
          <Field label={t("mail_reports.field_background")}>
            <ColorInput value={block.background} onChange={(v) => onChange({ background: v } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_color")}>
            <ColorInput value={block.color} onChange={(v) => onChange({ color: v } as Partial<Block>)} />
          </Field>
        </div>
      );
    case "heading":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("mail_reports.field_text")}>
            <input className={inputCls} value={block.text ?? ""} onChange={(e) => onChange({ text: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_level")}>
            <select className={inputCls} value={block.level ?? 2} onChange={(e) => onChange({ level: parseInt(e.target.value, 10) } as Partial<Block>)}>
              {[1, 2, 3, 4].map((l) => <option key={l} value={l}>H{l}</option>)}
            </select>
          </Field>
          <Field label={t("mail_reports.field_align")}>
            <AlignSelect value={block.align} onChange={(v) => onChange({ align: v } as Partial<Block>)} t={t} />
          </Field>
          <Field label={t("mail_reports.field_color")}>
            <ColorInput value={block.color} onChange={(v) => onChange({ color: v } as Partial<Block>)} />
          </Field>
        </div>
      );
    case "paragraph":
      return (
        <div className="space-y-3">
          <Field label={t("mail_reports.field_text")}>
            <textarea rows={3} className={inputCls} value={block.text ?? ""} onChange={(e) => onChange({ text: e.target.value } as Partial<Block>)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("mail_reports.field_align")}>
              <AlignSelect value={block.align} onChange={(v) => onChange({ align: v } as Partial<Block>)} t={t} />
            </Field>
            <Field label={t("mail_reports.field_color")}>
              <ColorInput value={block.color} onChange={(v) => onChange({ color: v } as Partial<Block>)} />
            </Field>
          </div>
        </div>
      );
    case "image":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("mail_reports.field_src")}>
            <input className={inputCls} value={block.src ?? ""} onChange={(e) => onChange({ src: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_alt")}>
            <input className={inputCls} value={block.alt ?? ""} onChange={(e) => onChange({ alt: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_width")}>
            <input type="number" className={inputCls} value={block.width ?? ""} onChange={(e) => onChange({ width: e.target.value ? parseInt(e.target.value, 10) : undefined } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_align")}>
            <AlignSelect value={block.align} onChange={(v) => onChange({ align: v } as Partial<Block>)} t={t} />
          </Field>
        </div>
      );
    case "button":
      return (
        <div className="grid grid-cols-2 gap-3">
          <Field label={t("mail_reports.field_label")}>
            <input className={inputCls} value={block.label ?? ""} onChange={(e) => onChange({ label: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_href")}>
            <input className={inputCls} value={block.href ?? ""} onChange={(e) => onChange({ href: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_align")}>
            <AlignSelect value={block.align} onChange={(v) => onChange({ align: v } as Partial<Block>)} t={t} />
          </Field>
          <Field label={t("mail_reports.field_background")}>
            <ColorInput value={block.bg} onChange={(v) => onChange({ bg: v } as Partial<Block>)} />
          </Field>
        </div>
      );
    case "spacer":
      return (
        <Field label={t("mail_reports.field_height")}>
          <input type="number" className={inputCls} value={block.height ?? 16} onChange={(e) => onChange({ height: parseInt(e.target.value, 10) || 16 } as Partial<Block>)} />
        </Field>
      );
    case "compliance_score":
      return (
        <Field label={t("mail_reports.field_title")}>
          <input className={inputCls} value={block.title ?? ""} onChange={(e) => onChange({ title: e.target.value } as Partial<Block>)} />
        </Field>
      );
    case "top_nodes":
      return (
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("mail_reports.field_title")}>
            <input className={inputCls} value={block.title ?? ""} onChange={(e) => onChange({ title: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_direction")}>
            <select className={inputCls} value={block.direction ?? "best"} onChange={(e) => onChange({ direction: e.target.value as "best" | "worst" } as Partial<Block>)}>
              <option value="best">{t("mail_reports.directionBest")}</option>
              <option value="worst">{t("mail_reports.directionWorst")}</option>
            </select>
          </Field>
          <Field label={t("mail_reports.field_limit")}>
            <input type="number" min={1} max={10} className={inputCls} value={block.limit ?? 5} onChange={(e) => onChange({ limit: parseInt(e.target.value, 10) || 5 } as Partial<Block>)} />
          </Field>
        </div>
      );
    case "action_list":
      return (
        <div className="space-y-3">
          <Field label={t("mail_reports.field_title")}>
            <input className={inputCls} value={block.title ?? ""} onChange={(e) => onChange({ title: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_items")}>
            <textarea
              rows={4}
              className={inputCls}
              value={(block.items ?? []).map((it) => it.text).join("\n")}
              onChange={(e) => onChange({ items: e.target.value.split("\n").filter((s) => s.trim()).map((s) => ({ text: s })) } as Partial<Block>)}
            />
          </Field>
        </div>
      );
    case "footer":
      return (
        <div className="space-y-3">
          <Field label={t("mail_reports.field_text")}>
            <textarea rows={2} className={inputCls} value={block.text ?? ""} onChange={(e) => onChange({ text: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_align")}>
            <AlignSelect value={block.align} onChange={(v) => onChange({ align: v } as Partial<Block>)} t={t} />
          </Field>
        </div>
      );
    case "node_detail":
      return <NodeDetailForm block={block} onChange={onChange} />;
    case "policy_ranking":
      return (
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("mail_reports.field_title")}>
            <input className={inputCls} value={block.title ?? ""} onChange={(e) => onChange({ title: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_direction")}>
            <select className={inputCls} value={block.direction ?? "worst"} onChange={(e) => onChange({ direction: e.target.value as "best" | "worst" } as Partial<Block>)}>
              <option value="best">{t("mail_reports.directionBest")}</option>
              <option value="worst">{t("mail_reports.directionWorst")}</option>
            </select>
          </Field>
          <Field label={t("mail_reports.field_limit")}>
            <input type="number" min={1} max={10} className={inputCls} value={block.limit ?? 5} onChange={(e) => onChange({ limit: parseInt(e.target.value, 10) || 5 } as Partial<Block>)} />
          </Field>
        </div>
      );
    case "recent_cves":
      return (
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("mail_reports.field_title")}>
            <input className={inputCls} value={block.title ?? ""} onChange={(e) => onChange({ title: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_limit")}>
            <input type="number" min={1} max={20} className={inputCls} value={block.limit ?? 5} onChange={(e) => onChange({ limit: parseInt(e.target.value, 10) || 5 } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_minSeverity")}>
            <select className={inputCls} value={block.minSeverity ?? "medium"} onChange={(e) => onChange({ minSeverity: e.target.value as "low" | "medium" | "high" | "critical" } as Partial<Block>)}>
              <option value="low">{t("mail_reports.severity_low")}</option>
              <option value="medium">{t("mail_reports.severity_medium")}</option>
              <option value="high">{t("mail_reports.severity_high")}</option>
              <option value="critical">{t("mail_reports.severity_critical")}</option>
            </select>
          </Field>
        </div>
      );
    case "cve_distribution":
      return (
        <Field label={t("mail_reports.field_title")}>
          <input className={inputCls} value={block.title ?? ""} onChange={(e) => onChange({ title: e.target.value } as Partial<Block>)} />
        </Field>
      );
    case "system_updates":
      return (
        <div className="grid grid-cols-3 gap-3">
          <Field label={t("mail_reports.field_title")}>
            <input className={inputCls} value={block.title ?? ""} onChange={(e) => onChange({ title: e.target.value } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_monthsAhead")}>
            <input type="number" min={1} max={36} className={inputCls} value={block.monthsAhead ?? 6} onChange={(e) => onChange({ monthsAhead: parseInt(e.target.value, 10) || 6 } as Partial<Block>)} />
          </Field>
          <Field label={t("mail_reports.field_limit")}>
            <input type="number" min={1} max={20} className={inputCls} value={block.limit ?? 5} onChange={(e) => onChange({ limit: parseInt(e.target.value, 10) || 5 } as Partial<Block>)} />
          </Field>
        </div>
      );
    default:
      return null;
  }
}

interface NodeOption {
  id: number;
  name: string | null;
  hostname: string | null;
  ipAddress: string | null;
}

function NodeDetailForm({ block, onChange }: { block: Extract<Block, { type: "node_detail" }>; onChange: (patch: Partial<Block>) => void }) {
  const { t } = useI18n();
  const { current } = useAppContext();
  const [nodes, setNodes] = useState<NodeOption[]>([]);

  useEffect(() => {
    if (!current) return;
    fetch(`/api/mail-reports/nodes?context=${current.id}`).then(async (r) => {
      if (r.ok) setNodes(await r.json());
    });
  }, [current]);

  const labelOf = (n: NodeOption) =>
    n.name?.trim() || n.hostname?.trim() || n.ipAddress?.trim() || `#${n.id}`;

  return (
    <div className="grid grid-cols-2 gap-3">
      <Field label={t("mail_reports.field_title")}>
        <input className={inputCls} value={block.title ?? ""} onChange={(e) => onChange({ title: e.target.value } as Partial<Block>)} />
      </Field>
      <Field label={t("mail_reports.field_node")}>
        <select
          className={inputCls}
          value={block.nodeId ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            onChange({ nodeId: v === "" ? null : parseInt(v, 10) } as Partial<Block>);
          }}
        >
          <option value="">{t("mail_reports.field_nodeNone")}</option>
          {nodes.map((n) => (
            <option key={n.id} value={n.id}>{labelOf(n)}</option>
          ))}
        </select>
      </Field>
      <Field label={t("mail_reports.field_limit")}>
        <input type="number" min={1} max={10} className={inputCls} value={block.limit ?? 5} onChange={(e) => onChange({ limit: parseInt(e.target.value, 10) || 5 } as Partial<Block>)} />
      </Field>
    </div>
  );
}
