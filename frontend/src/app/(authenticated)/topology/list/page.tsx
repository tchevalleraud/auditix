"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  FolderClosed,
  FolderOpen,
  FolderInput,
  FolderPlus,
  Loader2,
  Network,
  Pencil,
  Plus,
  Settings,
  Star,
  Trash2,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import FolderPicker from "@/components/FolderPicker";

interface TopoItem {
  id: number;
  name: string;
  description: string | null;
  folderId: number | null;
  isPrimary: boolean;
  memberCount: number | null;
}

interface TopoFolder {
  id: number;
  name: string;
  type: "custom";
  parentId: number | null;
  children: TopoFolder[];
  topologies: TopoItem[];
}

interface Tree {
  folders: TopoFolder[];
  rootTopologies: TopoItem[];
}

export default function TopologyListPage() {
  const { t } = useI18n();
  const { current } = useAppContext();
  const [tree, setTree] = useState<Tree>({ folders: [], rootTopologies: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  // Create / edit topology modal
  const [topoModal, setTopoModal] = useState<{ folderId: number | null } | null>(null);
  const [topoName, setTopoName] = useState("");
  const [topoDescription, setTopoDescription] = useState("");
  const [savingTopo, setSavingTopo] = useState(false);
  const [topoError, setTopoError] = useState<string | null>(null);

  // Folder modal (create or rename)
  const [folderModal, setFolderModal] = useState<{ mode: "create"; parentId: number | null } | { mode: "rename"; id: number } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);

  // Move-topology modal
  const [moveModal, setMoveModal] = useState<TopoItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/topologies/tree?context=${current.id}`);
      if (res.ok) setTree(await res.json());
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => { load(); }, [load]);

  // Persist expand/collapse per context.
  useEffect(() => {
    if (!current) return;
    const raw = localStorage.getItem(`topo-folders-expanded-${current.id}`);
    if (raw) { try { setExpanded(new Set(JSON.parse(raw))); } catch { /* ignore */ } }
  }, [current]);
  const persistExpanded = (next: Set<number>) => {
    setExpanded(next);
    if (current) localStorage.setItem(`topo-folders-expanded-${current.id}`, JSON.stringify([...next]));
  };
  const toggleFolder = (id: number) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    persistExpanded(next);
  };

  const handleSetPrimary = async (id: number) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/topologies/${id}/set-primary`, { method: "POST" });
      if (res.ok) await load();
    } finally { setBusyId(null); }
  };

  const handleDeleteTopo = async (id: number, name: string) => {
    if (!confirm(t("topology.confirmDelete").replace("{name}", name))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/topologies/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) await load();
    } finally { setBusyId(null); }
  };

  const openCreateTopo = (folderId: number | null) => {
    setTopoName(""); setTopoDescription(""); setTopoError(null);
    setTopoModal({ folderId });
  };
  const submitTopo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !topoName.trim() || !topoModal) return;
    setSavingTopo(true); setTopoError(null);
    try {
      const res = await fetch(`/api/topologies?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: topoName.trim(),
          description: topoDescription.trim() || null,
          folderId: topoModal.folderId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setTopoError(err?.error ?? `HTTP ${res.status}`);
        return;
      }
      setTopoModal(null);
      await load();
    } finally { setSavingTopo(false); }
  };

  const openCreateFolder = (parentId: number | null) => { setFolderName(""); setFolderModal({ mode: "create", parentId }); };
  const openRenameFolder = (id: number, name: string) => { setFolderName(name); setFolderModal({ mode: "rename", id }); };
  const submitFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !folderName.trim() || !folderModal) return;
    setSavingFolder(true);
    try {
      if (folderModal.mode === "create") {
        await fetch(`/api/topology-folders?context=${current.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: folderName.trim(), parentId: folderModal.parentId }),
        });
        if (folderModal.parentId) persistExpanded(new Set(expanded).add(folderModal.parentId));
      } else {
        await fetch(`/api/topology-folders/${folderModal.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: folderName.trim() }),
        });
      }
      setFolderModal(null);
      await load();
    } finally { setSavingFolder(false); }
  };

  const handleDeleteFolder = async (id: number, name: string) => {
    if (!confirm(t("topology.confirmDeleteFolder").replace("{name}", name))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/topology-folders/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) await load();
    } finally { setBusyId(null); }
  };

  const openMove = (topo: TopoItem) => { setMoveTarget(topo.folderId); setMoveModal(topo); };
  const submitMove = async () => {
    if (!moveModal) return;
    setBusyId(moveModal.id);
    try {
      const res = await fetch(`/api/topologies/${moveModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: moveTarget }),
      });
      if (res.ok) { setMoveModal(null); await load(); }
    } finally { setBusyId(null); }
  };

  const isEmpty = tree.folders.length === 0 && tree.rootTopologies.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Network className="h-6 w-6" />
            {t("topology.listTitle")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("topology.listSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => openCreateFolder(null)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <FolderPlus className="h-4 w-4" />
            {t("topology.newFolder")}
          </button>
          <button
            onClick={() => openCreateTopo(null)}
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("topology.new")}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : isEmpty ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-12 text-center">
          <Network className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("topology.listEmpty")}</p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-2">
          {tree.folders.map((f) => (
            <FolderRow
              key={f.id}
              folder={f}
              depth={0}
              expanded={expanded}
              onToggle={toggleFolder}
              onAddFolder={openCreateFolder}
              onRenameFolder={openRenameFolder}
              onDeleteFolder={handleDeleteFolder}
              onAddTopo={openCreateTopo}
              onSetPrimary={handleSetPrimary}
              onDeleteTopo={handleDeleteTopo}
              onMoveTopo={openMove}
              busyId={busyId}
              t={t}
            />
          ))}
          {tree.rootTopologies.map((topo) => (
            <TopoRow
              key={topo.id}
              topo={topo}
              depth={0}
              onSetPrimary={handleSetPrimary}
              onDelete={handleDeleteTopo}
              onMove={openMove}
              busyId={busyId}
              t={t}
            />
          ))}
        </div>
      )}

      {/* Create topology modal */}
      {topoModal && (
        <Modal onClose={() => setTopoModal(null)} title={t("topology.createTitle")}>
          <form onSubmit={submitTopo} className="space-y-3">
            <Field label={t("topology.fieldNameLabel")}>
              <input type="text" value={topoName} onChange={(e) => setTopoName(e.target.value)} className={inputCls} autoFocus />
            </Field>
            <Field label={t("topology.fieldDescriptionLabel")}>
              <textarea value={topoDescription} onChange={(e) => setTopoDescription(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
            </Field>
            <Field label={t("topology.fieldFolderLabel")}>
              <FolderPicker
                folders={tree.folders}
                value={topoModal.folderId}
                onChange={(id) => setTopoModal({ folderId: id })}
                rootLabel={t("topology.folderRoot")}
              />
            </Field>
            {topoError && <p className="text-xs text-red-600 dark:text-red-400">{topoError}</p>}
            <ModalActions onCancel={() => setTopoModal(null)} saving={savingTopo} disabled={!topoName.trim()} t={t} saveLabel={t("topology.create")} />
          </form>
        </Modal>
      )}

      {/* Folder create/rename modal */}
      {folderModal && (
        <Modal onClose={() => setFolderModal(null)} title={folderModal.mode === "create" ? t("topology.createFolderTitle") : t("topology.renameFolderTitle")}>
          <form onSubmit={submitFolder} className="space-y-3">
            <Field label={t("topology.folderNameLabel")}>
              <input type="text" value={folderName} onChange={(e) => setFolderName(e.target.value)} className={inputCls} autoFocus />
            </Field>
            <ModalActions onCancel={() => setFolderModal(null)} saving={savingFolder} disabled={!folderName.trim()} t={t} saveLabel={t("common.save")} />
          </form>
        </Modal>
      )}

      {/* Move topology modal */}
      {moveModal && (
        <Modal onClose={() => setMoveModal(null)} title={t("topology.moveTitle").replace("{name}", moveModal.name)}>
          <div className="space-y-3">
            <Field label={t("topology.fieldFolderLabel")}>
              <FolderPicker folders={tree.folders} value={moveTarget} onChange={setMoveTarget} rootLabel={t("topology.folderRoot")} />
            </Field>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setMoveModal(null)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
                {t("common.cancel")}
              </button>
              <button type="button" onClick={submitMove} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900">
                {t("common.save")}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FolderRow({ folder, depth, expanded, onToggle, onAddFolder, onRenameFolder, onDeleteFolder, onAddTopo, onSetPrimary, onDeleteTopo, onMoveTopo, busyId, t }: {
  folder: TopoFolder;
  depth: number;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onAddFolder: (parentId: number | null) => void;
  onRenameFolder: (id: number, name: string) => void;
  onDeleteFolder: (id: number, name: string) => void;
  onAddTopo: (folderId: number | null) => void;
  onSetPrimary: (id: number) => void;
  onDeleteTopo: (id: number, name: string) => void;
  onMoveTopo: (topo: TopoItem) => void;
  busyId: number | null;
  t: (k: string) => string;
}) {
  const isOpen = expanded.has(folder.id);
  const count = folder.topologies.length + folder.children.length;
  return (
    <div>
      <div
        className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
        style={{ paddingLeft: `${8 + depth * 18}px` }}
        onClick={() => onToggle(folder.id)}
      >
        <span className="shrink-0 p-0.5 text-slate-400">
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        {isOpen ? <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" /> : <FolderClosed className="h-4 w-4 text-amber-500 shrink-0" />}
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{folder.name}</span>
        <span className="text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-1.5 py-0.5 shrink-0">{count}</span>
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <IconBtn title={t("topology.addTopologyHere")} onClick={() => onAddTopo(folder.id)}><Plus className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title={t("topology.newSubfolder")} onClick={() => onAddFolder(folder.id)}><FolderPlus className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title={t("topology.rename")} onClick={() => onRenameFolder(folder.id, folder.name)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title={t("topology.deleteFolder")} danger onClick={() => onDeleteFolder(folder.id, folder.name)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
        </div>
      </div>
      {isOpen && (
        <div>
          {folder.children.map((c) => (
            <FolderRow key={c.id} folder={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} onAddFolder={onAddFolder} onRenameFolder={onRenameFolder} onDeleteFolder={onDeleteFolder} onAddTopo={onAddTopo} onSetPrimary={onSetPrimary} onDeleteTopo={onDeleteTopo} onMoveTopo={onMoveTopo} busyId={busyId} t={t} />
          ))}
          {folder.topologies.map((topo) => (
            <TopoRow key={topo.id} topo={topo} depth={depth + 1} onSetPrimary={onSetPrimary} onDelete={onDeleteTopo} onMove={onMoveTopo} busyId={busyId} t={t} />
          ))}
          {count === 0 && (
            <p className="text-xs italic text-slate-400 dark:text-slate-600 py-1" style={{ paddingLeft: `${8 + (depth + 1) * 18 + 22}px` }}>
              {t("topology.emptyFolder")}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function TopoRow({ topo, depth, onSetPrimary, onDelete, onMove, busyId, t }: {
  topo: TopoItem;
  depth: number;
  onSetPrimary: (id: number) => void;
  onDelete: (id: number, name: string) => void;
  onMove: (topo: TopoItem) => void;
  busyId: number | null;
  t: (k: string) => string;
}) {
  return (
    <div className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" style={{ paddingLeft: `${8 + depth * 18 + 22}px` }}>
      <button
        onClick={() => !topo.isPrimary && onSetPrimary(topo.id)}
        disabled={topo.isPrimary || busyId === topo.id}
        title={topo.isPrimary ? t("topology.isPrimary") : t("topology.setPrimary")}
        className={`p-1 rounded transition-colors shrink-0 ${topo.isPrimary ? "text-amber-500 cursor-default" : "text-slate-300 dark:text-slate-600 hover:text-amber-500"}`}
      >
        <Star className={`h-3.5 w-3.5 ${topo.isPrimary ? "fill-amber-500" : ""}`} />
      </button>
      <Network className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <Link href={`/topology/${topo.id}`} className="text-sm font-medium text-slate-900 dark:text-white hover:underline truncate">
        {topo.name}
      </Link>
      {topo.description && <span className="text-xs text-slate-400 dark:text-slate-500 truncate hidden sm:inline">— {topo.description}</span>}
      <span className="text-[10px] text-slate-400 shrink-0">{topo.memberCount ?? 0} {t("topology.nodesLabel")}</span>
      <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <IconBtn title={t("topology.moveToFolder")} onClick={() => onMove(topo)}><FolderInput className="h-3.5 w-3.5" /></IconBtn>
        <Link href={`/topology/${topo.id}`} title={t("topology.openMap")} className="p-1.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Eye className="h-3.5 w-3.5" /></Link>
        <Link href={`/topology/${topo.id}/configure`} title={t("topology.configure")} className="p-1.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Settings className="h-3.5 w-3.5" /></Link>
        <IconBtn title={t("topology.delete")} danger onClick={() => onDelete(topo.id, topo.name)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
      </div>
    </div>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`p-1.5 rounded text-slate-400 transition-colors ${danger ? "hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" : "hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"}`}
    >
      {children}
    </button>
  );
}

const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{label}</label>
      {children}
    </div>
  );
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-4">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function ModalActions({ onCancel, saving, disabled, saveLabel, t }: { onCancel: () => void; saving: boolean; disabled: boolean; saveLabel: string; t: (k: string) => string }) {
  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">
        {t("common.cancel")}
      </button>
      <button type="submit" disabled={saving || disabled} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {saveLabel}
      </button>
    </div>
  );
}
