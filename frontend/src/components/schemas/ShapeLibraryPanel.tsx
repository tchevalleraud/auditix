"use client";

import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Lock,
  Plus,
  Save,
  Trash2,
  Upload,
  X,
} from "lucide-react";

export interface ShapeLibraryItemDto {
  id: number;
  name: string;
  keywords: string | null;
  payload: Record<string, unknown>[];
  width: number;
  height: number;
  previewSvg: string | null;
  position: number;
}

export interface ShapeLibraryDto {
  id: number;
  name: string;
  description: string | null;
  managedByPlugin: string | null;
  position: number;
  items: ShapeLibraryItemDto[];
  createdAt: string;
  updatedAt: string;
}

export type SaveTarget = { libraryId: number } | { newLibraryName: string };

export const SHAPE_DND_MIME = "application/x-auditix-shape";

interface Props {
  libraries: ShapeLibraryDto[];
  onClose: () => void;
  canSave: boolean;
  onSaveSelection: (target: SaveTarget, name: string) => void;
  onCreateLibrary: (name: string) => void;
  onRenameLibrary: (id: number, name: string) => void;
  onDeleteLibrary: (id: number) => void;
  onDeleteItem: (libraryId: number, itemId: number) => void;
  onUpload: (libraryId: number, file: File) => void;
  onImportStencil: (file: File) => void;
  onPlaceItemCenter: (item: ShapeLibraryItemDto) => void;
}

function previewSrc(svg: string | null): string | null {
  if (!svg) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function ShapeLibraryPanel({
  libraries,
  onClose,
  canSave,
  onSaveSelection,
  onCreateLibrary,
  onRenameLibrary,
  onDeleteLibrary,
  onDeleteItem,
  onUpload,
  onImportStencil,
  onPlaceItemCenter,
}: Props) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [newLibName, setNewLibName] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);

  const term = search.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!term) return libraries;
    return libraries
      .map((lib) => ({
        ...lib,
        items: lib.items.filter(
          (it) =>
            it.name.toLowerCase().includes(term) ||
            (it.keywords ?? "").toLowerCase().includes(term),
        ),
      }))
      .filter((lib) => lib.items.length > 0 || lib.name.toLowerCase().includes(term));
  }, [libraries, term]);

  const toggle = (id: number) =>
    setCollapsed((cur) => {
      const next = new Set(cur);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <div className="w-72 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200 dark:border-slate-800">
        <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">Bibliothèques de formes</span>
        <button onClick={onClose} title="Fermer" className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
          <X className="h-4 w-4 text-slate-500" />
        </button>
      </div>

      {/* Actions */}
      <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 space-y-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher une forme…"
          className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-700 dark:text-slate-200"
        />
        <div className="flex gap-1.5">
          <button
            onClick={() => setSaveOpen(true)}
            disabled={!canSave}
            title="Sauvegarder la sélection comme forme"
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 px-2 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Save className="h-3.5 w-3.5" /> Sélection
          </button>
          <button
            onClick={() => importRef.current?.click()}
            title="Importer un stencil (SVG, Visio .vssx)"
            className="flex-1 inline-flex items-center justify-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Upload className="h-3.5 w-3.5" /> Importer
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".svg,.vssx,.vsdx,.vstx,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImportStencil(f);
              e.target.value = "";
            }}
          />
        </div>
        {creating ? (
          <div className="flex gap-1">
            <input
              autoFocus
              value={newLibName}
              onChange={(e) => setNewLibName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newLibName.trim()) {
                  onCreateLibrary(newLibName.trim());
                  setNewLibName("");
                  setCreating(false);
                } else if (e.key === "Escape") {
                  setCreating(false);
                  setNewLibName("");
                }
              }}
              placeholder="Nom de la bibliothèque"
              className="flex-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
            />
            <button
              onClick={() => {
                if (newLibName.trim()) {
                  onCreateLibrary(newLibName.trim());
                  setNewLibName("");
                  setCreating(false);
                }
              }}
              className="rounded-md bg-blue-600 px-2 py-1 text-[11px] text-white hover:bg-blue-700"
            >
              OK
            </button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="w-full inline-flex items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 dark:border-slate-600 px-2 py-1 text-[11px] text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" /> Nouvelle bibliothèque
          </button>
        )}
      </div>

      {/* Libraries */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-xs text-slate-400">
            Aucune bibliothèque. Créez-en une ou sauvegardez une sélection.
          </div>
        )}
        {filtered.map((lib) => {
          const open = !collapsed.has(lib.id);
          const managed = !!lib.managedByPlugin;
          return (
            <div key={lib.id} className="border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-1 px-2 py-1.5 group">
                <button onClick={() => toggle(lib.id)} className="p-0.5 text-slate-400 hover:text-slate-600">
                  {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                </button>
                <span className="flex-1 truncate text-xs font-medium text-slate-700 dark:text-slate-200">{lib.name}</span>
                {managed ? (
                  <span title={`Lecture seule — gérée par ${lib.managedByPlugin}`} className="inline-flex items-center gap-0.5 rounded bg-amber-100 dark:bg-amber-500/15 px-1 py-0.5 text-[9px] font-medium text-amber-700 dark:text-amber-300">
                    <Lock className="h-2.5 w-2.5" /> Lecture seule
                  </span>
                ) : (
                  <span className="hidden group-hover:flex items-center gap-0.5">
                    <UploadButton libraryId={lib.id} onUpload={onUpload} />
                    <button
                      onClick={() => {
                        const name = window.prompt("Renommer la bibliothèque", lib.name);
                        if (name && name.trim()) onRenameLibrary(lib.id, name.trim());
                      }}
                      title="Renommer"
                      className="p-0.5 text-slate-400 hover:text-slate-600 text-[10px]"
                    >
                      ✎
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Supprimer la bibliothèque « ${lib.name} » et ses formes ?`)) onDeleteLibrary(lib.id);
                      }}
                      title="Supprimer la bibliothèque"
                      className="p-0.5 text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                )}
              </div>
              {open && (
                <div className="grid grid-cols-3 gap-1.5 px-2 pb-2">
                  {lib.items.length === 0 && (
                    <div className="col-span-3 py-2 text-center text-[10px] text-slate-400">Vide</div>
                  )}
                  {lib.items.map((item) => {
                    const src = previewSrc(item.previewSvg);
                    return (
                      <div
                        key={item.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData(SHAPE_DND_MIME, String(item.id));
                          e.dataTransfer.effectAllowed = "copy";
                        }}
                        onClick={() => onPlaceItemCenter(item)}
                        title={item.name}
                        className="group/item relative aspect-square cursor-grab rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-1 hover:border-blue-400 hover:bg-blue-50/50 dark:hover:bg-blue-500/10"
                      >
                        {src ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={src} alt={item.name} className="h-full w-full object-contain pointer-events-none" draggable={false} />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-[9px] text-slate-400">{item.name}</div>
                        )}
                        {!managed && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteItem(lib.id, item.id);
                            }}
                            title="Supprimer la forme"
                            className="absolute -right-1 -top-1 hidden group-hover/item:flex items-center justify-center h-4 w-4 rounded-full bg-red-500 text-white"
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {saveOpen && (
        <SaveSelectionModal
          libraries={libraries.filter((l) => !l.managedByPlugin)}
          onClose={() => setSaveOpen(false)}
          onConfirm={(target, name) => {
            onSaveSelection(target, name);
            setSaveOpen(false);
          }}
        />
      )}
    </div>
  );
}

function UploadButton({ libraryId, onUpload }: { libraryId: number; onUpload: (id: number, f: File) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button
        onClick={() => ref.current?.click()}
        title="Téléverser une icône (SVG/PNG)"
        className="p-0.5 text-slate-400 hover:text-slate-600"
      >
        <Upload className="h-3 w-3" />
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/svg+xml,image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onUpload(libraryId, f);
          e.target.value = "";
        }}
      />
    </>
  );
}

function SaveSelectionModal({
  libraries,
  onClose,
  onConfirm,
}: {
  libraries: ShapeLibraryDto[];
  onClose: () => void;
  onConfirm: (target: SaveTarget, name: string) => void;
}) {
  const [name, setName] = useState("");
  const [libChoice, setLibChoice] = useState<string>(libraries[0] ? String(libraries[0].id) : "__new__");
  const [newLibName, setNewLibName] = useState("");

  const confirm = () => {
    const shapeName = name.trim() || "Forme";
    if (libChoice === "__new__") {
      const ln = newLibName.trim();
      if (!ln) return;
      onConfirm({ newLibraryName: ln }, shapeName);
    } else {
      onConfirm({ libraryId: Number(libChoice) }, shapeName);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-80 rounded-lg bg-white dark:bg-slate-900 p-4 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold text-slate-800 dark:text-slate-100">Sauvegarder la sélection</h3>
        <label className="block text-[11px] font-medium text-slate-500 mb-1">Nom de la forme</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex. Switch 48 ports"
          className="mb-3 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
        />
        <label className="block text-[11px] font-medium text-slate-500 mb-1">Bibliothèque</label>
        <select
          value={libChoice}
          onChange={(e) => setLibChoice(e.target.value)}
          className="mb-2 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
        >
          {libraries.map((l) => (
            <option key={l.id} value={String(l.id)}>{l.name}</option>
          ))}
          <option value="__new__">+ Nouvelle bibliothèque…</option>
        </select>
        {libChoice === "__new__" && (
          <input
            value={newLibName}
            onChange={(e) => setNewLibName(e.target.value)}
            placeholder="Nom de la nouvelle bibliothèque"
            className="mb-2 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm"
          />
        )}
        <div className="mt-3 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">Annuler</button>
          <button onClick={confirm} className="rounded-md bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700">Sauvegarder</button>
        </div>
      </div>
    </div>
  );
}
