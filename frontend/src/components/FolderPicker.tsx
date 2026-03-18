"use client";

import { useState, useRef, useEffect } from "react";
import {
  FolderOpen,
  FolderClosed,
  ChevronRight,
  ChevronDown,
  X,
} from "lucide-react";

interface FolderNode {
  id: number;
  name: string;
  type: "custom" | "manufacturer" | "model";
  children: FolderNode[];
}

interface FolderPickerProps {
  folders: FolderNode[];
  value: number | null;
  onChange: (id: number | null) => void;
  rootLabel: string;
  placeholder?: string;
}

export default function FolderPicker({ folders, value, onChange, rootLabel, placeholder }: FolderPickerProps) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Auto-expand parents of selected folder
  useEffect(() => {
    if (value === null) return;
    const path: number[] = [];
    const find = (nodes: FolderNode[], target: number): boolean => {
      for (const n of nodes) {
        if (n.id === target) return true;
        if (find(n.children, target)) { path.push(n.id); return true; }
      }
      return false;
    };
    find(folders, value);
    if (path.length > 0) setExpanded((prev) => { const next = new Set(prev); path.forEach((id) => next.add(id)); return next; });
  }, [value, folders]);

  const toggle = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setExpanded((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  };

  const selectedName = findFolderName(folders, value);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-left transition-colors focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20"
      >
        {value !== null ? (
          <>
            <FolderClosed className="h-4 w-4 text-slate-400 shrink-0" />
            <span className="flex-1 truncate text-slate-900 dark:text-slate-100">{selectedName}</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(null); }}
              className="p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
            >
              <X className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </>
        ) : (
          <span className="flex-1 text-slate-400 dark:text-slate-500">{placeholder || rootLabel}</span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg max-h-64 overflow-y-auto">
          {/* Root option */}
          <button
            type="button"
            onClick={() => { onChange(null); setOpen(false); }}
            className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${value === null ? "bg-slate-100 dark:bg-slate-800 font-medium" : ""}`}
          >
            <span className="text-slate-500 dark:text-slate-400 italic">{rootLabel}</span>
          </button>

          {/* Tree */}
          {folders.map((folder) => (
            <TreeRow
              key={folder.id}
              folder={folder}
              depth={0}
              expanded={expanded}
              toggle={toggle}
              selected={value}
              onSelect={(id) => { onChange(id); setOpen(false); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TreeRow({ folder, depth, expanded, toggle, selected, onSelect }: {
  folder: FolderNode;
  depth: number;
  expanded: Set<number>;
  toggle: (id: number, e: React.MouseEvent) => void;
  selected: number | null;
  onSelect: (id: number) => void;
}) {
  const isExpanded = expanded.has(folder.id);
  const hasChildren = folder.children.length > 0;
  const folderColor = folder.type === "manufacturer" ? "text-amber-500" : folder.type === "model" ? "text-blue-500" : "text-slate-400 dark:text-slate-500";
  const isSelected = selected === folder.id;

  return (
    <>
      <button
        type="button"
        onClick={() => onSelect(folder.id)}
        className={`w-full flex items-center gap-1.5 pr-3 py-1.5 text-sm text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${isSelected ? "bg-slate-100 dark:bg-slate-800 font-medium" : ""}`}
        style={{ paddingLeft: `${12 + depth * 20}px` }}
      >
        {hasChildren ? (
          <span onClick={(e) => toggle(folder.id, e)} className="shrink-0 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
          </span>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        {isExpanded ? (
          <FolderOpen className={`h-4 w-4 ${folderColor} shrink-0`} />
        ) : (
          <FolderClosed className={`h-4 w-4 ${folderColor} shrink-0`} />
        )}
        <span className="truncate text-slate-900 dark:text-slate-100">{folder.name}</span>
        {folder.type !== "custom" && (
          <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium text-slate-500 bg-slate-100 ring-1 ring-inset ring-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:ring-slate-700 ml-1">auto</span>
        )}
      </button>
      {isExpanded && folder.children.map((child) => (
        <TreeRow
          key={child.id}
          folder={child}
          depth={depth + 1}
          expanded={expanded}
          toggle={toggle}
          selected={selected}
          onSelect={onSelect}
        />
      ))}
    </>
  );
}

function findFolderName(folders: FolderNode[], id: number | null): string | null {
  if (id === null) return null;
  for (const f of folders) {
    if (f.id === id) return f.name;
    const found = findFolderName(f.children, id);
    if (found) return found;
  }
  return null;
}
