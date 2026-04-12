"use client";

import { X, GripVertical } from "lucide-react";

interface WidgetCardProps {
  title: string;
  icon: React.ReactNode;
  editing: boolean;
  onRemove?: () => void;
  children: React.ReactNode;
  className?: string;
}

export default function WidgetCard({ title, icon, editing, onRemove, children, className }: WidgetCardProps) {
  return (
    <div className={`h-full flex flex-col rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden ${editing ? "ring-2 ring-blue-200 dark:ring-blue-500/30" : ""} ${className ?? ""}`}>
      {/* Header — this is the drag handle */}
      <div
        className={`widget-drag-handle flex items-center gap-2 px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 shrink-0 ${editing ? "cursor-grab active:cursor-grabbing" : ""}`}
        onMouseDown={(e) => {
          // Prevent drag when clicking remove button
          if ((e.target as HTMLElement).closest("button")) e.stopPropagation();
        }}
      >
        {editing && <GripVertical className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600 shrink-0" />}
        <span className="text-slate-400 dark:text-slate-500 shrink-0">{icon}</span>
        <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate flex-1">{title}</h3>
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
      {/* Content */}
      <div className="flex-1 p-4 overflow-auto min-h-0">
        {children}
      </div>
    </div>
  );
}
