"use client";

import { useEffect, useRef, useState } from "react";
import {
  GripVertical, X, Settings, Layers, ChevronRight, Folder, Tag, Server, ShieldCheck,
  Network, FileSearch, Zap, FileText, Box, AlertCircle, Activity, Star,
} from "lucide-react";

const ICONS = {
  layers: Layers,
  chevron: ChevronRight,
  folder: Folder,
  tag: Tag,
  server: Server,
  shield: ShieldCheck,
  network: Network,
  search: FileSearch,
  zap: Zap,
  file: FileText,
  box: Box,
  alert: AlertCircle,
  activity: Activity,
  star: Star,
} as const;

type IconKey = keyof typeof ICONS;

const COLORS = [
  { id: "slate", barCls: "bg-slate-400 dark:bg-slate-500", iconBg: "bg-slate-100 dark:bg-slate-800", iconText: "text-slate-600 dark:text-slate-300" },
  { id: "blue", barCls: "bg-blue-500", iconBg: "bg-blue-50 dark:bg-blue-500/10", iconText: "text-blue-600 dark:text-blue-400" },
  { id: "violet", barCls: "bg-violet-500", iconBg: "bg-violet-50 dark:bg-violet-500/10", iconText: "text-violet-600 dark:text-violet-400" },
  { id: "emerald", barCls: "bg-emerald-500", iconBg: "bg-emerald-50 dark:bg-emerald-500/10", iconText: "text-emerald-600 dark:text-emerald-400" },
  { id: "amber", barCls: "bg-amber-500", iconBg: "bg-amber-50 dark:bg-amber-500/10", iconText: "text-amber-600 dark:text-amber-400" },
  { id: "rose", barCls: "bg-rose-500", iconBg: "bg-rose-50 dark:bg-rose-500/10", iconText: "text-rose-600 dark:text-rose-400" },
  { id: "teal", barCls: "bg-teal-500", iconBg: "bg-teal-50 dark:bg-teal-500/10", iconText: "text-teal-600 dark:text-teal-400" },
  { id: "red", barCls: "bg-red-500", iconBg: "bg-red-50 dark:bg-red-500/10", iconText: "text-red-600 dark:text-red-400" },
] as const;

type ColorId = (typeof COLORS)[number]["id"];

export interface SectionTitleConfig {
  text?: string;
  subtitle?: string;
  icon?: IconKey;
  color?: ColorId;
}

interface Props {
  config: SectionTitleConfig;
  editing: boolean;
  onChange: (config: SectionTitleConfig) => void;
  onRemove: () => void;
  t: (key: string) => string;
}

export default function SectionTitleBlock({ config, editing, onChange, onRemove, t }: Props) {
  const text = config.text ?? t("dashboard.sectionTitle.defaultText");
  const subtitle = config.subtitle ?? "";
  const iconKey: IconKey = config.icon ?? "layers";
  const colorId: ColorId = config.color ?? "slate";
  const Icon = ICONS[iconKey];
  const color = COLORS.find((c) => c.id === colorId) ?? COLORS[0];

  const [editingText, setEditingText] = useState(false);
  const [editingSubtitle, setEditingSubtitle] = useState(false);
  const [popoverOpen, setPopoverOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) setPopoverOpen(false);
    }
    if (popoverOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [popoverOpen]);

  const dragHandleClass = editing ? "widget-drag-handle" : "";
  const cursor = editing && !editingText && !editingSubtitle ? "cursor-grab active:cursor-grabbing" : "";

  return (
    <div
      className={`relative h-full flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 shadow-sm ${dragHandleClass} ${cursor} ${editing ? "ring-2 ring-blue-200 dark:ring-blue-500/30" : ""}`}
      onMouseDown={(e) => {
        if (editingText || editingSubtitle) return;
        if ((e.target as HTMLElement).closest("button, input, [data-no-drag]")) e.stopPropagation();
      }}
    >
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-xl ${color.barCls}`} />

      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${color.iconBg} ${color.iconText}`}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1 flex flex-col justify-center">
        {editingText ? (
          <input
            data-no-drag
            autoFocus
            type="text"
            defaultValue={text}
            onBlur={(e) => { onChange({ ...config, text: e.target.value || undefined }); setEditingText(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingText(false); }}
            className="bg-transparent outline-none text-base font-semibold text-slate-900 dark:text-slate-100 w-full border-b border-slate-300 dark:border-slate-600 focus:border-slate-900 dark:focus:border-white"
          />
        ) : (
          <button
            type="button"
            data-no-drag
            disabled={!editing}
            onClick={() => editing && setEditingText(true)}
            className={`text-base font-semibold text-slate-900 dark:text-slate-100 truncate text-left ${editing ? "hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded px-1 -mx-1" : ""}`}
          >
            {text}
          </button>
        )}
        {(editingSubtitle || subtitle || editing) && (
          editingSubtitle ? (
            <input
              data-no-drag
              autoFocus
              type="text"
              defaultValue={subtitle}
              placeholder={t("dashboard.sectionTitle.subtitlePlaceholder")}
              onBlur={(e) => { onChange({ ...config, subtitle: e.target.value || undefined }); setEditingSubtitle(false); }}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setEditingSubtitle(false); }}
              className="bg-transparent outline-none text-xs text-slate-500 dark:text-slate-400 w-full border-b border-slate-200 dark:border-slate-700 focus:border-slate-700 dark:focus:border-slate-300"
            />
          ) : (
            <button
              type="button"
              data-no-drag
              disabled={!editing}
              onClick={() => editing && setEditingSubtitle(true)}
              className={`text-xs truncate text-left ${subtitle ? "text-slate-500 dark:text-slate-400" : "text-slate-300 dark:text-slate-600 italic"} ${editing ? "hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded px-1 -mx-1" : ""}`}
            >
              {subtitle || (editing ? t("dashboard.sectionTitle.subtitlePlaceholder") : "")}
            </button>
          )
        )}
      </div>

      {editing && (
        <div className="flex items-center gap-1 shrink-0" data-no-drag>
          <div className="relative" ref={popoverRef}>
            <button
              onClick={(e) => { e.stopPropagation(); setPopoverOpen((v) => !v); }}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={t("dashboard.sectionTitle.configure")}
            >
              <Settings className="h-4 w-4 text-slate-400" />
            </button>
            {popoverOpen && (
              <div className="absolute right-0 top-full mt-2 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-50 p-3 space-y-3">
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1.5">{t("dashboard.sectionTitle.color")}</label>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {COLORS.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => onChange({ ...config, color: c.id })}
                        className={`h-6 w-6 rounded-full ${c.barCls} ${colorId === c.id ? "ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-800" : ""}`}
                        title={c.id}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-medium uppercase tracking-wider text-slate-400 mb-1.5">{t("dashboard.sectionTitle.icon")}</label>
                  <div className="grid grid-cols-7 gap-1">
                    {(Object.keys(ICONS) as IconKey[]).map((k) => {
                      const I = ICONS[k];
                      return (
                        <button
                          key={k}
                          onClick={() => onChange({ ...config, icon: k })}
                          className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${iconKey === k ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900" : "hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"}`}
                          title={k}
                        >
                          <I className="h-4 w-4" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
          <button
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            title={t("dashboard.sectionTitle.remove")}
          >
            <X className="h-4 w-4 text-slate-400 hover:text-red-500" />
          </button>
          <GripVertical className="h-4 w-4 text-slate-300 dark:text-slate-600" />
        </div>
      )}
    </div>
  );
}
