"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, LayoutDashboard, Star, Plus, Pencil, Copy, Trash2, Check } from "lucide-react";

export interface DashboardSummary {
  id: number;
  name: string;
  isDefault: boolean;
}

interface Props {
  dashboards: DashboardSummary[];
  currentId: number | null;
  editing: boolean;
  onSelect: (id: number) => void;
  onCreate: (name: string) => void;
  onRename: (id: number, name: string) => void;
  onDuplicate: () => void;
  onDelete: (id: number) => void;
  onSetDefault: (id: number) => void;
  t: (key: string) => string;
}

export default function DashboardSwitcher({ dashboards, currentId, editing, onSelect, onCreate, onRename, onDuplicate, onDelete, onSetDefault, t }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = dashboards.find((d) => d.id === currentId);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleNew = () => {
    setOpen(false);
    const name = window.prompt(t("dashboard.switcher.namePlaceholder"), t("dashboard.switcher.newNameDefault"));
    if (name && name.trim()) onCreate(name.trim());
  };

  const handleRename = () => {
    if (!current) return;
    setOpen(false);
    const name = window.prompt(t("dashboard.switcher.namePlaceholder"), current.name);
    if (name && name.trim() && name.trim() !== current.name) onRename(current.id, name.trim());
  };

  const handleDelete = () => {
    if (!current) return;
    setOpen(false);
    if (dashboards.length <= 1) {
      window.alert(t("dashboard.switcher.lastOne"));
      return;
    }
    if (window.confirm(t("dashboard.switcher.confirmDelete"))) onDelete(current.id);
  };

  const handleDuplicate = () => {
    setOpen(false);
    onDuplicate();
  };

  const handleSetDefault = () => {
    if (!current) return;
    setOpen(false);
    onSetDefault(current.id);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors min-w-[220px]"
      >
        <LayoutDashboard className="h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0" />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate flex-1 text-left">
          {current?.name ?? t("dashboard.switcher.select")}
        </span>
        {current?.isDefault && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
        <ChevronDown className={`h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-50 overflow-hidden">
          <div className="max-h-64 overflow-y-auto py-1">
            {dashboards.map((d) => (
              <button
                key={d.id}
                onClick={() => { onSelect(d.id); setOpen(false); }}
                className={`flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left ${d.id === currentId ? "bg-slate-100 dark:bg-slate-700/60" : ""}`}
              >
                <Check className={`h-3.5 w-3.5 shrink-0 ${d.id === currentId ? "text-slate-700 dark:text-slate-200" : "opacity-0"}`} />
                <span className={`text-sm truncate flex-1 ${d.id === currentId ? "font-semibold text-slate-900 dark:text-white" : "text-slate-700 dark:text-slate-200"}`}>
                  {d.name}
                </span>
                {d.isDefault && <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />}
              </button>
            ))}
          </div>

          <div className="border-t border-slate-100 dark:border-slate-700 py-1">
            <button onClick={handleNew} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left">
              <Plus className="h-3.5 w-3.5 shrink-0" />
              {t("dashboard.switcher.new")}
            </button>
            {editing && current && (
              <>
                <button onClick={handleRename} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left">
                  <Pencil className="h-3.5 w-3.5 shrink-0" />
                  {t("dashboard.switcher.rename")}
                </button>
                <button onClick={handleDuplicate} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left">
                  <Copy className="h-3.5 w-3.5 shrink-0" />
                  {t("dashboard.switcher.duplicate")}
                </button>
                {!current.isDefault && (
                  <button onClick={handleSetDefault} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left">
                    <Star className="h-3.5 w-3.5 shrink-0" />
                    {t("dashboard.switcher.setDefault")}
                  </button>
                )}
                {dashboards.length > 1 && (
                  <button onClick={handleDelete} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors text-left">
                    <Trash2 className="h-3.5 w-3.5 shrink-0" />
                    {t("dashboard.switcher.delete")}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
