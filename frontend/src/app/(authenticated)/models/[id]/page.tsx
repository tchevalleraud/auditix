"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import { ArrowLeft, Loader2, Pencil, TerminalSquare, Terminal, ToggleLeft, ToggleRight, FileText, Plus, X, Search, LinkIcon } from "lucide-react";

interface ManufacturerOption {
  id: number;
  name: string;
  logo: string | null;
}

interface ModelDetail {
  id: number;
  name: string;
  description: string | null;
  connectionScript: string | null;
  manufacturer: ManufacturerOption;
  createdAt: string;
}

interface CollectionCmd {
  id: number;
  name: string;
  description: string | null;
  commands: string;
  enabled: boolean;
  inherited: boolean;
  association: "auto" | "manual";
}

interface AvailableCmd {
  id: number;
  name: string;
  description: string | null;
  commands: string;
  enabled: boolean;
  folderName: string | null;
}

type Tab = "edit" | "script" | "collection";

export default function ModelDetailPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const modelId = params.id as string;

  const [model, setModel] = useState<ModelDetail | null>(null);
  const [manufacturers, setManufacturers] = useState<ManufacturerOption[]>([]);
  const [fetchLoading, setFetchLoading] = useState(true);

  const initialTab = (searchParams.get("tab") as Tab) || "edit";
  const [activeTab, setActiveTab] = useState<Tab>(initialTab);

  // Edit form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [manufacturerId, setManufacturerId] = useState<number | "">("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Script form state
  const [connectionScript, setConnectionScript] = useState("");
  const [savingScript, setSavingScript] = useState(false);
  const [savedScript, setSavedScript] = useState(false);

  // Collection commands state
  const [collectionCmds, setCollectionCmds] = useState<CollectionCmd[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);

  // Associate modal state
  const [showAssociateModal, setShowAssociateModal] = useState(false);
  const [availableCmds, setAvailableCmds] = useState<AvailableCmd[]>([]);
  const [availableLoading, setAvailableLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [associating, setAssociating] = useState(false);

  const dateLocale =
    locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  const loadModel = useCallback(async () => {
    if (!current) return;
    const [modelsRes, mansRes] = await Promise.all([
      fetch(`/api/models?context=${current.id}`),
      fetch(`/api/manufacturers?context=${current.id}`),
    ]);
    const models: ModelDetail[] = modelsRes.ok ? await modelsRes.json() : [];
    const mans: ManufacturerOption[] = mansRes.ok ? await mansRes.json() : [];
    setManufacturers(mans);

    const found = models.find((m) => m.id === Number(modelId));
    if (found) {
      setModel(found);
      setName(found.name);
      setDescription(found.description ?? "");
      setManufacturerId(found.manufacturer.id);
      setConnectionScript(found.connectionScript ?? "");
    }
    setFetchLoading(false);
  }, [modelId, current]);

  useEffect(() => {
    loadModel();
  }, [loadModel]);

  const loadCollectionCmds = useCallback(async () => {
    if (!modelId) return;
    setCollectionLoading(true);
    const res = await fetch(`/api/collection-commands/by-model/${modelId}`);
    if (res.ok) setCollectionCmds(await res.json());
    setCollectionLoading(false);
  }, [modelId]);

  useEffect(() => {
    if (activeTab === "collection") loadCollectionCmds();
  }, [activeTab, loadCollectionCmds]);

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !manufacturerId) return;
    setSaving(true);
    setSaved(false);

    try {
      const res = await fetch(`/api/models/${modelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: description || null,
          connectionScript: model?.connectionScript ?? null,
          manufacturerId,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setModel(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleSaveScript = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model) return;
    setSavingScript(true);
    setSavedScript(false);

    try {
      const res = await fetch(`/api/models/${modelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: model.name,
          description: model.description,
          connectionScript: connectionScript || null,
          manufacturerId: model.manufacturer.id,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setModel(updated);
        setSavedScript(true);
        setTimeout(() => setSavedScript(false), 2000);
      }
    } finally {
      setSavingScript(false);
    }
  };

  const openAssociateModal = async () => {
    setShowAssociateModal(true);
    setSearchQuery("");
    setSelectedIds([]);
    setAvailableLoading(true);
    const res = await fetch(`/api/collection-commands/available-for-model/${modelId}`);
    if (res.ok) setAvailableCmds(await res.json());
    setAvailableLoading(false);
  };

  const handleAssociate = async () => {
    if (selectedIds.length === 0) return;
    setAssociating(true);
    await fetch(`/api/collection-commands/by-model/${modelId}/associate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandIds: selectedIds }),
    });
    setAssociating(false);
    setShowAssociateModal(false);
    loadCollectionCmds();
  };

  const handleDissociate = async (cmdId: number) => {
    await fetch(`/api/collection-commands/by-model/${modelId}/dissociate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commandId: cmdId }),
    });
    loadCollectionCmds();
  };

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const filteredAvailable = availableCmds.filter((c) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.description?.toLowerCase().includes(q)) || (c.folderName?.toLowerCase().includes(q));
  });

  if (fetchLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  if (!model) return null;

  const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: "edit", label: t("models.tabEdit"), icon: <Pencil className="h-4 w-4" /> },
    { key: "script", label: t("models.tabScript"), icon: <TerminalSquare className="h-4 w-4" /> },
    { key: "collection", label: t("models.tabCollection"), icon: <Terminal className="h-4 w-4" /> },
  ];

  const autoCmds = collectionCmds.filter((c) => c.association === "auto");
  const manualCmds = collectionCmds.filter((c) => c.association === "manual");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/models"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("models.title")}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{model.name}</h1>
        <div className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          {model.manufacturer.logo ? (
            <img src={model.manufacturer.logo} alt="" className="h-4 w-4 rounded object-contain" />
          ) : null}
          <span>{model.manufacturer.name}{model.description ? ` — ${model.description}` : ""}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      {activeTab === "edit" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <form onSubmit={handleSaveEdit} className="p-6 space-y-5">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("models.colManufacturer")}
                </label>
                <select
                  value={manufacturerId}
                  onChange={(e) => setManufacturerId(e.target.value ? Number(e.target.value) : "")}
                  required
                  className={inputCls}
                >
                  <option value="">{t("models.selectManufacturer")}</option>
                  {manufacturers.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("models.colName")}
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className={inputCls}
                  placeholder={t("models.namePlaceholder")}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                  {t("models.colDescription")}
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  className={`${inputCls} resize-none`}
                  placeholder={t("models.descriptionPlaceholder")}
                />
              </div>
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="submit"
                disabled={saving || !name.trim() || !manufacturerId}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </button>
              {saved && (
                <span className="text-sm text-green-600 dark:text-green-400">{t("models.saved")}</span>
              )}
            </div>
          </form>
        </div>
      )}

      {activeTab === "script" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <form onSubmit={handleSaveScript} className="p-6 space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("models.connectionScriptLabel")}
              </label>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
                {t("models.connectionScriptHelp")}
              </p>
              <textarea
                value={connectionScript}
                onChange={(e) => setConnectionScript(e.target.value)}
                rows={10}
                className={`${inputCls} font-mono`}
                placeholder={t("models.connectionScriptPlaceholder")}
              />
            </div>

            <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                type="submit"
                disabled={savingScript}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {savingScript && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </button>
              {savedScript && (
                <span className="text-sm text-green-600 dark:text-green-400">{t("models.saved")}</span>
              )}
            </div>
          </form>
        </div>
      )}

      {activeTab === "collection" && (
        <div className="space-y-4">
          {/* Action bar */}
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("models.collectionSubtitle")}</p>
            <button
              onClick={openAssociateModal}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("models.associateCommand")}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            {collectionLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-900 dark:text-white" />
              </div>
            ) : collectionCmds.length === 0 ? (
              <div className="p-12 text-center">
                <Terminal className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">{t("models.noCollectionCommands")}</p>
              </div>
            ) : (
              <div>
                {/* Auto-associated commands (inherited + direct from folders) */}
                {autoCmds.length > 0 && (
                  <div>
                    <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("models.autoAssociated")}</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {autoCmds.map((cmd) => (
                        <CmdRow key={cmd.id} cmd={cmd} t={t} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Manually associated commands */}
                {manualCmds.length > 0 && (
                  <div>
                    <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 border-t">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("models.manualAssociated")}</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {manualCmds.map((cmd) => (
                        <CmdRow key={cmd.id} cmd={cmd} t={t} onDissociate={() => handleDissociate(cmd.id)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Associate modal */}
          {showAssociateModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
              <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("models.associateCommand")}</h3>
                  <button onClick={() => setShowAssociateModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <X className="h-5 w-5 text-slate-400" />
                  </button>
                </div>

                <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder={t("models.searchCommands")}
                      className={`${inputCls} pl-9`}
                      autoFocus
                    />
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                  {availableLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-900 dark:text-white" />
                    </div>
                  ) : filteredAvailable.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-sm text-slate-400 dark:text-slate-500">{t("models.noAvailableCommands")}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {filteredAvailable.map((cmd) => {
                        const isSelected = selectedIds.includes(cmd.id);
                        return (
                          <button
                            key={cmd.id}
                            onClick={() => toggleSelected(cmd.id)}
                            className={`w-full text-left px-6 py-3 flex items-center gap-3 transition-colors ${
                              isSelected ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                            }`}
                          >
                            <div className={`h-5 w-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? "bg-slate-900 dark:bg-white border-slate-900 dark:border-white"
                                : "border-slate-300 dark:border-slate-600"
                            }`}>
                              {isSelected && (
                                <svg className="h-3 w-3 text-white dark:text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{cmd.name}</span>
                                {cmd.folderName && (
                                  <span className="text-[10px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">{cmd.folderName}</span>
                                )}
                                {!cmd.enabled && (
                                  <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">{t("collection_commands.disabled")}</span>
                                )}
                              </div>
                              {cmd.description && (
                                <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{cmd.description}</p>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    {selectedIds.length > 0 ? t("models.selectedCount").replace("{count}", String(selectedIds.length)) : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowAssociateModal(false)}
                      className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      {t("common.cancel")}
                    </button>
                    <button
                      onClick={handleAssociate}
                      disabled={selectedIds.length === 0 || associating}
                      className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
                    >
                      {associating && <Loader2 className="h-4 w-4 animate-spin" />}
                      <LinkIcon className="h-4 w-4" />
                      {t("models.associate")}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CmdRow({ cmd, t, onDissociate }: { cmd: CollectionCmd; t: (k: string) => string; onDissociate?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-6 py-3">
      <FileText className={`h-4 w-4 shrink-0 ${cmd.enabled ? "text-emerald-500" : "text-slate-300 dark:text-slate-600"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${cmd.enabled ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
            {cmd.name}
          </span>
          {cmd.inherited && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-sky-700 bg-sky-50 ring-1 ring-inset ring-sky-600/20 dark:text-sky-400 dark:bg-sky-500/10 dark:ring-sky-500/20">
              {t("models.inheritedFromManufacturer")}
            </span>
          )}
          {cmd.association === "manual" && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-violet-700 bg-violet-50 ring-1 ring-inset ring-violet-600/20 dark:text-violet-400 dark:bg-violet-500/10 dark:ring-violet-500/20">
              {t("models.manualAssociation")}
            </span>
          )}
          {!cmd.enabled && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 ring-1 ring-inset ring-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:ring-slate-700">
              {t("collection_commands.disabled")}
            </span>
          )}
        </div>
        {cmd.description && (
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{cmd.description}</p>
        )}
      </div>
      <code className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-2 py-1 max-w-xs truncate">
        {cmd.commands.split("\n")[0]}{cmd.commands.includes("\n") ? "..." : ""}
      </code>
      {cmd.enabled ? (
        <ToggleRight className="h-5 w-5 text-emerald-500 shrink-0" />
      ) : (
        <ToggleLeft className="h-5 w-5 text-slate-300 dark:text-slate-600 shrink-0" />
      )}
      {onDissociate && (
        <button
          onClick={onDissociate}
          className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
          title={t("models.dissociate")}
        >
          <X className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
