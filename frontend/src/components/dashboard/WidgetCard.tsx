"use client";

import { X, GripVertical, Filter } from "lucide-react";

interface WidgetCardProps {
  title: string;
  icon: React.ReactNode;
  editing: boolean;
  onRemove?: () => void;
  children: React.ReactNode;
  className?: string;
  compact?: boolean;
  filterCount?: number;
  onConfigureFilters?: () => void;
}

export default function WidgetCard({ title, icon, editing, onRemove, children, className, compact = false, filterCount, onConfigureFilters }: WidgetCardProps) {
  const headerCls = "px-4 py-2.5";
  const contentCls = compact ? "p-2" : "p-4";
  // In compact mode, the entire card is the drag handle so the content area
  // remains visually clean. In edit mode, grip and remove are absolute overlays
  // (no header bar) so the content keeps its full height.
  const cardDragCls = compact ? "widget-drag-handle" : "";
  return (
    <div
      className={`relative h-full flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden ${cardDragCls} ${editing && compact ? "cursor-grab active:cursor-grabbing" : ""} ${editing ? "ring-2 ring-blue-200 dark:ring-blue-500/30" : ""} ${className ?? ""}`}
      onMouseDown={(e) => {
        if (compact && (e.target as HTMLElement).closest("button")) e.stopPropagation();
      }}
    >
      {!compact && (
        <div
          className={`widget-drag-handle flex items-center gap-2 ${headerCls} border-b border-slate-100 dark:border-slate-800 shrink-0 ${editing ? "cursor-grab active:cursor-grabbing" : ""}`}
          onMouseDown={(e) => {
            if ((e.target as HTMLElement).closest("button")) e.stopPropagation();
          }}
        >
          {editing && <GripVertical className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />}
          <span className="text-slate-400 dark:text-slate-500 shrink-0">{icon}</span>
          <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate flex-1">{title}</h3>
          {!editing && filterCount !== undefined && filterCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-blue-600 dark:text-blue-400" title={`${filterCount}`}>
              <Filter className="h-2.5 w-2.5" />
              {filterCount}
            </span>
          )}
          {editing && onConfigureFilters && (
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onConfigureFilters(); }}
              onMouseDown={(e) => e.stopPropagation()}
              className={`relative p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0 ${filterCount && filterCount > 0 ? "text-blue-500" : "text-slate-300"}`}
            >
              <Filter className="h-3.5 w-3.5" />
              {filterCount !== undefined && filterCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 flex h-3 min-w-3 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[8px] font-bold text-white">{filterCount}</span>
              )}
            </button>
          )}
          {editing && onRemove && (
            <button
              onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-0.5 rounded hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0"
            >
              <X className="h-3.5 w-3.5 text-slate-300 hover:text-red-500" />
            </button>
          )}
        </div>
      )}
      <div className={`@container flex-1 ${contentCls} overflow-hidden min-h-0`}>
        {children}
      </div>
      {compact && editing && (
        <>
          <div className="pointer-events-none absolute top-1 left-1 z-10 rounded bg-white/85 dark:bg-slate-900/85 backdrop-blur-[1px] p-0.5 shadow-sm">
            <GripVertical className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
          </div>
          <div className="absolute top-1 right-1 z-10 flex items-center gap-1">
            {onConfigureFilters && (
              <button
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onConfigureFilters(); }}
                onMouseDown={(e) => e.stopPropagation()}
                className={`relative rounded bg-white/85 dark:bg-slate-900/85 backdrop-blur-[1px] p-0.5 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ${filterCount && filterCount > 0 ? "text-blue-500" : "text-slate-400"}`}
                title={title}
              >
                <Filter className="h-3.5 w-3.5" />
                {filterCount !== undefined && filterCount > 0 && (
                  <span className="absolute -top-1 -right-1 flex h-3 min-w-3 items-center justify-center rounded-full bg-blue-500 px-0.5 text-[8px] font-bold text-white">{filterCount}</span>
                )}
              </button>
            )}
            {onRemove && (
              <button
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); onRemove(); }}
                onMouseDown={(e) => e.stopPropagation()}
                className="rounded bg-white/85 dark:bg-slate-900/85 backdrop-blur-[1px] p-0.5 shadow-sm hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                title={title}
              >
                <X className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
              </button>
            )}
          </div>
        </>
      )}
      {compact && !editing && filterCount !== undefined && filterCount > 0 && (
        <span className="absolute top-1 right-1 z-10 inline-flex items-center gap-0.5 rounded-full bg-blue-500 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow">
          <Filter className="h-2.5 w-2.5" />
          {filterCount}
        </span>
      )}
    </div>
  );
}
