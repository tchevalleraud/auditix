"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Copy,
  Download,
  FolderClosed,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Workflow,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import FolderPicker from "@/components/FolderPicker";

interface SchemaItem {
  id: number;
  name: string;
  description: string | null;
  folderId: number | null;
  managedByPlugin: string | null;
  updatedAt: string;
}

interface SchemaFolder {
  id: number;
  name: string;
  type: "custom";
  parentId: number | null;
  children: SchemaFolder[];
  schemas: SchemaItem[];
}

interface Tree {
  folders: SchemaFolder[];
  rootSchemas: SchemaItem[];
}

export default function ReportSchemasListPage() {
  const { t } = useI18n();
  const { current } = useAppContext();
  const router = useRouter();
  const [tree, setTree] = useState<Tree>({ folders: [], rootSchemas: [] });
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const [importError, setImportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const [visioOpen, setVisioOpen] = useState(false);
  const [visioFile, setVisioFile] = useState<File | null>(null);
  const [visioPages, setVisioPages] = useState<{ index: number; name: string }[]>([]);
  const [visioPage, setVisioPage] = useState(0);
  const [visioLoadingPages, setVisioLoadingPages] = useState(false);
  const [visioImporting, setVisioImporting] = useState(false);
  const [visioError, setVisioError] = useState<string | null>(null);

  // Create schema modal
  const [createModal, setCreateModal] = useState<{ folderId: number | null } | null>(null);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Folder modal (create or rename)
  const [folderModal, setFolderModal] = useState<{ mode: "create"; parentId: number | null } | { mode: "rename"; id: number } | null>(null);
  const [folderName, setFolderName] = useState("");
  const [savingFolder, setSavingFolder] = useState(false);

  // Move schema modal
  const [moveModal, setMoveModal] = useState<SchemaItem | null>(null);
  const [moveTarget, setMoveTarget] = useState<number | null>(null);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/report-schemas/tree?context=${current.id}`);
      if (res.ok) setTree(await res.json());
    } finally {
      setLoading(false);
    }
  }, [current]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!current) return;
    const raw = localStorage.getItem(`report-schema-folders-expanded-${current.id}`);
    if (raw) { try { setExpanded(new Set(JSON.parse(raw))); } catch { /* ignore */ } }
  }, [current]);
  const persistExpanded = (next: Set<number>) => {
    setExpanded(next);
    if (current) localStorage.setItem(`report-schema-folders-expanded-${current.id}`, JSON.stringify([...next]));
  };
  const toggleFolder = (id: number) => {
    const next = new Set(expanded);
    next.has(id) ? next.delete(id) : next.add(id);
    persistExpanded(next);
  };

  // ── Schema CRUD ──
  const openCreate = (folderId: number | null) => { setCreateName(""); setCreateDescription(""); setCreateError(null); setCreateModal({ folderId }); };
  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !createName.trim() || !createModal) return;
    setCreating(true); setCreateError(null);
    try {
      const res = await fetch(`/api/report-schemas?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName.trim(), description: createDescription.trim() || null, folderId: createModal.folderId }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setCreateError(err?.error ?? `HTTP ${res.status}`);
        return;
      }
      setCreateModal(null);
      await load();
    } finally { setCreating(false); }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(t("schemas.confirmDelete").replace("{name}", name))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/report-schemas/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) await load();
    } finally { setBusyId(null); }
  };

  const handleDuplicate = async (id: number) => {
    setBusyId(id);
    try {
      const res = await fetch(`/api/report-schemas/${id}/duplicate`, { method: "POST" });
      if (res.ok) await load();
    } finally { setBusyId(null); }
  };

  // ── Folder CRUD ──
  const openCreateFolder = (parentId: number | null) => { setFolderName(""); setFolderModal({ mode: "create", parentId }); };
  const openRenameFolder = (id: number, name: string) => { setFolderName(name); setFolderModal({ mode: "rename", id }); };
  const submitFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !folderName.trim() || !folderModal) return;
    setSavingFolder(true);
    try {
      if (folderModal.mode === "create") {
        await fetch(`/api/report-schema-folders?context=${current.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: folderName.trim(), parentId: folderModal.parentId }),
        });
        if (folderModal.parentId) persistExpanded(new Set(expanded).add(folderModal.parentId));
      } else {
        await fetch(`/api/report-schema-folders/${folderModal.id}`, {
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
    if (!confirm(t("schemas.confirmDeleteFolder").replace("{name}", name))) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/report-schema-folders/${id}`, { method: "DELETE" });
      if (res.ok || res.status === 204) await load();
    } finally { setBusyId(null); }
  };

  const openMove = (s: SchemaItem) => { setMoveTarget(s.folderId); setMoveModal(s); };
  const submitMove = async () => {
    if (!moveModal) return;
    setBusyId(moveModal.id);
    try {
      const res = await fetch(`/api/report-schemas/${moveModal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folderId: moveTarget }),
      });
      if (res.ok) { setMoveModal(null); await load(); }
    } finally { setBusyId(null); }
  };

  // ── Import ──
  const handleImportClick = () => { setImportError(null); importInputRef.current?.click(); };
  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !current) return;
    setImporting(true); setImportError(null);
    try {
      const text = await file.text();
      let payload: unknown;
      try { payload = JSON.parse(text); } catch { throw new Error("Fichier JSON invalide"); }
      const res = await fetch(`/api/report-schemas/import?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const created = await res.json();
      await load();
      router.push(`/reports/schemas/${created.id}`);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
    } finally { setImporting(false); }
  };

  const openVisioModal = () => { setVisioOpen(true); setVisioFile(null); setVisioPages([]); setVisioPage(0); setVisioError(null); };
  const handleVisioFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !current) return;
    setVisioFile(file); setVisioPages([]); setVisioPage(0); setVisioError(null); setVisioLoadingPages(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/report-schemas/import-visio/pages?context=${current.id}`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const data = await res.json();
      setVisioPages(data.pages ?? []);
    } catch (err) {
      setVisioError(err instanceof Error ? err.message : String(err));
    } finally { setVisioLoadingPages(false); }
  };
  const handleVisioImport = async () => {
    if (!visioFile || !current) return;
    setVisioImporting(true); setVisioError(null);
    try {
      const fd = new FormData();
      fd.append("file", visioFile);
      const res = await fetch(`/api/report-schemas/import-visio?context=${current.id}&page=${visioPage}`, { method: "POST", body: fd });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error ?? `HTTP ${res.status}`);
      }
      const created = await res.json();
      setVisioOpen(false);
      await load();
      router.push(`/reports/schemas/${created.id}`);
    } catch (err) {
      setVisioError(err instanceof Error ? err.message : String(err));
    } finally { setVisioImporting(false); }
  };

  const isEmpty = tree.folders.length === 0 && tree.rootSchemas.length === 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Workflow className="h-6 w-6" />
            {t("schemas.listTitle")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("schemas.listSubtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImportFile} className="hidden" />
          <button onClick={() => openCreateFolder(null)} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
            <FolderPlus className="h-4 w-4" />
            {t("schemas.newFolder")}
          </button>
          <button onClick={handleImportClick} disabled={importing} title={t("schemas.importJsonTitle")} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
            {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {t("schemas.importJson")}
          </button>
          <button onClick={openVisioModal} title={t("schemas.importVisioTitle")} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">
            <Upload className="h-4 w-4" />
            {t("schemas.importVisio")}
          </button>
          <button onClick={() => openCreate(null)} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
            <Plus className="h-4 w-4" />
            {t("schemas.new")}
          </button>
        </div>
      </div>

      {importError && (
        <div className="rounded-md border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
          Import impossible : {importError}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      ) : isEmpty ? (
        <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-12 text-center">
          <Workflow className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">{t("schemas.listEmpty")}</p>
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
              onAddSchema={openCreate}
              onDeleteSchema={handleDelete}
              onDuplicateSchema={handleDuplicate}
              onMoveSchema={openMove}
              busyId={busyId}
              t={t}
            />
          ))}
          {tree.rootSchemas.map((s) => (
            <SchemaRow key={s.id} schema={s} depth={0} onDelete={handleDelete} onDuplicate={handleDuplicate} onMove={openMove} busyId={busyId} t={t} />
          ))}
        </div>
      )}

      {/* Create schema modal */}
      {createModal && (
        <Modal title={t("schemas.createTitle")} onClose={() => setCreateModal(null)}>
          <form onSubmit={handleCreate} className="space-y-3">
            <Field label={t("schemas.fieldNameLabel")}>
              <input type="text" value={createName} onChange={(e) => setCreateName(e.target.value)} className={inputCls} autoFocus />
            </Field>
            <Field label={t("schemas.fieldDescriptionLabel")}>
              <textarea value={createDescription} onChange={(e) => setCreateDescription(e.target.value)} rows={3} className={`${inputCls} resize-none`} />
            </Field>
            <Field label={t("schemas.fieldFolderLabel")}>
              <FolderPicker folders={tree.folders} value={createModal.folderId} onChange={(id) => setCreateModal({ folderId: id })} rootLabel={t("schemas.folderRoot")} />
            </Field>
            {createError && <p className="text-xs text-red-600 dark:text-red-400">{createError}</p>}
            <ModalActions onCancel={() => setCreateModal(null)} saving={creating} disabled={!createName.trim()} saveLabel={t("schemas.create")} t={t} />
          </form>
        </Modal>
      )}

      {/* Folder create/rename modal */}
      {folderModal && (
        <Modal title={folderModal.mode === "create" ? t("schemas.createFolderTitle") : t("schemas.renameFolderTitle")} onClose={() => setFolderModal(null)}>
          <form onSubmit={submitFolder} className="space-y-3">
            <Field label={t("schemas.folderNameLabel")}>
              <input type="text" value={folderName} onChange={(e) => setFolderName(e.target.value)} className={inputCls} autoFocus />
            </Field>
            <ModalActions onCancel={() => setFolderModal(null)} saving={savingFolder} disabled={!folderName.trim()} saveLabel={t("common.save")} t={t} />
          </form>
        </Modal>
      )}

      {/* Move schema modal */}
      {moveModal && (
        <Modal title={t("schemas.moveTitle").replace("{name}", moveModal.name)} onClose={() => setMoveModal(null)}>
          <div className="space-y-3">
            <Field label={t("schemas.fieldFolderLabel")}>
              <FolderPicker folders={tree.folders} value={moveTarget} onChange={setMoveTarget} rootLabel={t("schemas.folderRoot")} />
            </Field>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button type="button" onClick={() => setMoveModal(null)} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">{t("common.cancel")}</button>
              <button type="button" onClick={submitMove} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900">{t("common.save")}</button>
            </div>
          </div>
        </Modal>
      )}

      {/* Visio import modal */}
      {visioOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => !visioImporting && setVisioOpen(false)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white mb-1">{t("schemas.importVisioTitle")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t("schemas.importVisioHint")}</p>
            <label className="flex items-center gap-2 cursor-pointer rounded-lg border border-dashed border-slate-300 dark:border-slate-700 px-4 py-3 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
              <Upload className="h-4 w-4 shrink-0" />
              <span className="truncate">{visioFile ? visioFile.name : t("schemas.importVisioChoose")}</span>
              <input type="file" accept=".vsdx,.vsdt" onChange={handleVisioFileSelected} className="hidden" />
            </label>
            {visioLoadingPages && (
              <div className="flex items-center gap-2 mt-4 text-sm text-slate-500 dark:text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> {t("schemas.importVisioReading")}
              </div>
            )}
            {visioPages.length > 0 && (
              <div className="mt-4 space-y-1">
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold mb-1">{t("schemas.importVisioTab")}</label>
                <div className="max-h-52 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
                  {visioPages.map((p) => (
                    <label key={p.index} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800">
                      <input type="radio" name="visio-page" checked={visioPage === p.index} onChange={() => setVisioPage(p.index)} />
                      <span className="text-slate-700 dark:text-slate-200">{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            {visioError && <p className="text-xs text-red-600 dark:text-red-400 mt-3">{visioError}</p>}
            <div className="flex items-center justify-end gap-2 pt-5">
              <button type="button" onClick={() => setVisioOpen(false)} disabled={visioImporting} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg disabled:opacity-50">{t("common.cancel")}</button>
              <button type="button" onClick={handleVisioImport} disabled={visioImporting || visioPages.length === 0} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 disabled:opacity-50">
                {visioImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                {t("schemas.importVisioAction")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FolderRow({ folder, depth, expanded, onToggle, onAddFolder, onRenameFolder, onDeleteFolder, onAddSchema, onDeleteSchema, onDuplicateSchema, onMoveSchema, busyId, t }: {
  folder: SchemaFolder;
  depth: number;
  expanded: Set<number>;
  onToggle: (id: number) => void;
  onAddFolder: (parentId: number | null) => void;
  onRenameFolder: (id: number, name: string) => void;
  onDeleteFolder: (id: number, name: string) => void;
  onAddSchema: (folderId: number | null) => void;
  onDeleteSchema: (id: number, name: string) => void;
  onDuplicateSchema: (id: number) => void;
  onMoveSchema: (s: SchemaItem) => void;
  busyId: number | null;
  t: (k: string) => string;
}) {
  const isOpen = expanded.has(folder.id);
  const count = folder.schemas.length + folder.children.length;
  return (
    <div>
      <div className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer" style={{ paddingLeft: `${8 + depth * 18}px` }} onClick={() => onToggle(folder.id)}>
        <span className="shrink-0 p-0.5 text-slate-400">
          {isOpen ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </span>
        {isOpen ? <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" /> : <FolderClosed className="h-4 w-4 text-amber-500 shrink-0" />}
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">{folder.name}</span>
        <span className="text-[10px] font-medium text-slate-400 bg-slate-100 dark:bg-slate-800 rounded-full px-1.5 py-0.5 shrink-0">{count}</span>
        <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
          <IconBtn title={t("schemas.addSchemaHere")} onClick={() => onAddSchema(folder.id)}><Plus className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title={t("schemas.newSubfolder")} onClick={() => onAddFolder(folder.id)}><FolderPlus className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title={t("schemas.rename")} onClick={() => onRenameFolder(folder.id, folder.name)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
          <IconBtn title={t("schemas.deleteFolder")} danger onClick={() => onDeleteFolder(folder.id, folder.name)}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
        </div>
      </div>
      {isOpen && (
        <div>
          {folder.children.map((c) => (
            <FolderRow key={c.id} folder={c} depth={depth + 1} expanded={expanded} onToggle={onToggle} onAddFolder={onAddFolder} onRenameFolder={onRenameFolder} onDeleteFolder={onDeleteFolder} onAddSchema={onAddSchema} onDeleteSchema={onDeleteSchema} onDuplicateSchema={onDuplicateSchema} onMoveSchema={onMoveSchema} busyId={busyId} t={t} />
          ))}
          {folder.schemas.map((s) => (
            <SchemaRow key={s.id} schema={s} depth={depth + 1} onDelete={onDeleteSchema} onDuplicate={onDuplicateSchema} onMove={onMoveSchema} busyId={busyId} t={t} />
          ))}
          {count === 0 && (
            <p className="text-xs italic text-slate-400 dark:text-slate-600 py-1" style={{ paddingLeft: `${8 + (depth + 1) * 18 + 22}px` }}>{t("schemas.emptyFolder")}</p>
          )}
        </div>
      )}
    </div>
  );
}

function SchemaRow({ schema, depth, onDelete, onDuplicate, onMove, busyId, t }: {
  schema: SchemaItem;
  depth: number;
  onDelete: (id: number, name: string) => void;
  onDuplicate: (id: number) => void;
  onMove: (s: SchemaItem) => void;
  busyId: number | null;
  t: (k: string) => string;
}) {
  return (
    <div className="group flex items-center gap-1.5 rounded-lg px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors" style={{ paddingLeft: `${8 + depth * 18 + 22}px` }}>
      <Workflow className="h-3.5 w-3.5 text-slate-400 shrink-0" />
      <Link href={`/reports/schemas/${schema.id}`} className="text-sm font-medium text-slate-900 dark:text-white hover:underline truncate">{schema.name}</Link>
      {schema.managedByPlugin && (
        <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-violet-700 bg-violet-100 ring-1 ring-inset ring-violet-200 dark:text-violet-300 dark:bg-violet-900/40 dark:ring-violet-700/50 shrink-0" title={`Managed by plugin "${schema.managedByPlugin}" — read-only`}>
          {schema.managedByPlugin}
        </span>
      )}
      {schema.description && <span className="text-xs text-slate-400 dark:text-slate-500 truncate hidden sm:inline">— {schema.description}</span>}
      <div className="ml-auto flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <IconBtn title={t("schemas.moveToFolder")} onClick={() => onMove(schema)}><FolderInput className="h-3.5 w-3.5" /></IconBtn>
        <Link href={`/reports/schemas/${schema.id}`} title={t("schemas.open")} className="p-1.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Pencil className="h-3.5 w-3.5" /></Link>
        <IconBtn title={t("schemas.duplicate")} onClick={() => onDuplicate(schema.id)} disabled={busyId === schema.id}><Copy className="h-3.5 w-3.5" /></IconBtn>
        <a href={`/api/report-schemas/${schema.id}/export`} download title="Exporter en JSON" className="p-1.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><Download className="h-3.5 w-3.5" /></a>
        {!schema.managedByPlugin && (
          <IconBtn title={t("schemas.delete")} danger onClick={() => onDelete(schema.id, schema.name)} disabled={busyId === schema.id}><Trash2 className="h-3.5 w-3.5" /></IconBtn>
        )}
      </div>
    </div>
  );
}

function IconBtn({ children, title, onClick, danger, disabled }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} title={title} disabled={disabled} className={`p-1.5 rounded text-slate-400 transition-colors disabled:opacity-50 ${danger ? "hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10" : "hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"}`}>
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
      <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">{t("common.cancel")}</button>
      <button type="submit" disabled={saving || disabled} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 disabled:opacity-50">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        {saveLabel}
      </button>
    </div>
  );
}
