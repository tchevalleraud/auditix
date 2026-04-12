"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import { ArrowLeft, Loader2, Pencil, TerminalSquare, Terminal, FileSearch, ToggleLeft, ToggleRight, FileText, Plus, X, Search, LinkIcon, Info, FolderOpen, FolderClosed, ChevronRight, ChevronDown, Activity, Cpu, MemoryStick, HardDrive, Thermometer, Clock, ArrowDownToLine, ArrowUpFromLine, ShieldAlert } from "lucide-react";

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
  sendCtrlChar: string | null;
  nvdKeyword: string | null;
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

interface AvailableItem {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
}

interface AvailableFolder {
  id: number;
  name: string;
  type: string;
  children: AvailableFolder[];
  commands?: AvailableItem[];
  rules?: AvailableItem[];
}

interface AvailableTree {
  folders: AvailableFolder[];
}

interface CollectionRuleItem {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  inherited: boolean;
  association: "auto" | "manual";
}

interface MonitoringOidItem {
  category: string;
  oid: string;
  enabled: boolean;
}

type Tab = "edit" | "script" | "nvd" | "collection" | "rules" | "monitoring";

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
  const [sendCtrlChar, setSendCtrlChar] = useState("");
  const [nvdKeyword, setNvdKeyword] = useState("");
  const [savingScript, setSavingScript] = useState(false);
  const [savedScript, setSavedScript] = useState(false);

  // Collection commands state
  const [collectionCmds, setCollectionCmds] = useState<CollectionCmd[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);

  // Associate modal state
  const [showAssociateModal, setShowAssociateModal] = useState(false);
  const [availableCmdTree, setAvailableCmdTree] = useState<AvailableTree>({ folders: [] });
  const [availableLoading, setAvailableLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [associating, setAssociating] = useState(false);
  const [expandedCmdFolders, setExpandedCmdFolders] = useState<Set<number>>(new Set());

  // Monitoring OID state
  const [monitoringOids, setMonitoringOids] = useState<MonitoringOidItem[]>([]);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [savingMonitoring, setSavingMonitoring] = useState(false);
  const [savedMonitoring, setSavedMonitoring] = useState(false);

  const MONITORING_CATEGORIES = [
    { key: "cpu", icon: <Cpu className="h-5 w-5" />, color: "text-blue-500" },
    { key: "memory", icon: <MemoryStick className="h-5 w-5" />, color: "text-violet-500" },
    { key: "disk", icon: <HardDrive className="h-5 w-5" />, color: "text-amber-500" },
    { key: "temperature", icon: <Thermometer className="h-5 w-5" />, color: "text-red-500" },
    { key: "interface_in", icon: <ArrowDownToLine className="h-5 w-5" />, color: "text-cyan-500" },
    { key: "interface_out", icon: <ArrowUpFromLine className="h-5 w-5" />, color: "text-orange-500" },
  ];

  // Collection rules state
  const [collectionRules, setCollectionRules] = useState<CollectionRuleItem[]>([]);
  const [rulesLoading, setRulesLoading] = useState(false);
  const [showAssociateRuleModal, setShowAssociateRuleModal] = useState(false);
  const [availableRuleTree, setAvailableRuleTree] = useState<AvailableTree>({ folders: [] });
  const [availableRulesLoading, setAvailableRulesLoading] = useState(false);
  const [ruleSearchQuery, setRuleSearchQuery] = useState("");
  const [selectedRuleIds, setSelectedRuleIds] = useState<number[]>([]);
  const [associatingRules, setAssociatingRules] = useState(false);
  const [expandedRuleFolders, setExpandedRuleFolders] = useState<Set<number>>(new Set());

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
      setSendCtrlChar(found.sendCtrlChar ?? "");
      setNvdKeyword(found.nvdKeyword ?? "");
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

  const loadMonitoringOids = useCallback(async () => {
    if (!modelId) return;
    setMonitoringLoading(true);
    const res = await fetch(`/api/monitoring-oids/by-model/${modelId}`);
    if (res.ok) {
      const data: { category: string; oid: string; enabled: boolean }[] = await res.json();
      // Merge with all categories (fill missing ones with defaults)
      const merged = MONITORING_CATEGORIES.map((cat) => {
        const found = data.find((d) => d.category === cat.key);
        return found ? { category: cat.key, oid: found.oid, enabled: found.enabled } : { category: cat.key, oid: "", enabled: false };
      });
      setMonitoringOids(merged);
    } else {
      setMonitoringOids(MONITORING_CATEGORIES.map((cat) => ({ category: cat.key, oid: "", enabled: false })));
    }
    setMonitoringLoading(false);
  }, [modelId]);

  const loadCollectionRules = useCallback(async () => {
    if (!modelId) return;
    setRulesLoading(true);
    const res = await fetch(`/api/collection-rules/by-model/${modelId}`);
    if (res.ok) setCollectionRules(await res.json());
    setRulesLoading(false);
  }, [modelId]);

  useEffect(() => {
    if (activeTab === "collection") loadCollectionCmds();
    if (activeTab === "rules") loadCollectionRules();
    if (activeTab === "monitoring") loadMonitoringOids();
  }, [activeTab, loadCollectionCmds, loadCollectionRules, loadMonitoringOids]);

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
          sendCtrlChar: sendCtrlChar || null,
          nvdKeyword: nvdKeyword || null,
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

  const handleSaveMonitoring = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMonitoring(true);
    setSavedMonitoring(false);
    try {
      const res = await fetch(`/api/monitoring-oids/by-model/${modelId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: monitoringOids.filter((o) => o.oid.trim() !== "") }),
      });
      if (res.ok) {
        setSavedMonitoring(true);
        setTimeout(() => setSavedMonitoring(false), 2000);
      }
    } finally {
      setSavingMonitoring(false);
    }
  };

  const updateMonitoringOid = (category: string, field: "oid" | "enabled", value: string | boolean) => {
    setMonitoringOids((prev) => prev.map((o) => o.category === category ? { ...o, [field]: value } : o));
  };

  const openAssociateModal = async () => {
    setShowAssociateModal(true);
    setSearchQuery("");
    setSelectedIds([]);
    setExpandedCmdFolders(new Set());
    setAvailableLoading(true);
    const res = await fetch(`/api/collection-commands/available-for-model/${modelId}`);
    if (res.ok) {
      const data = await res.json();
      setAvailableCmdTree(data);
      // Auto-expand all folders
      const allIds = new Set<number>();
      const walk = (folders: AvailableFolder[]) => { for (const f of folders) { allIds.add(f.id); walk(f.children); } };
      walk(data.folders);
      setExpandedCmdFolders(allIds);
    }
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

  const matchesSearch = (item: AvailableItem, query: string) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return item.name.toLowerCase().includes(q) || (item.description?.toLowerCase().includes(q) ?? false);
  };

  // Rule association functions
  const openAssociateRuleModal = async () => {
    setShowAssociateRuleModal(true);
    setRuleSearchQuery("");
    setSelectedRuleIds([]);
    setExpandedRuleFolders(new Set());
    setAvailableRulesLoading(true);
    const res = await fetch(`/api/collection-rules/available-for-model/${modelId}`);
    if (res.ok) {
      const data = await res.json();
      setAvailableRuleTree(data);
      const allIds = new Set<number>();
      const walk = (folders: AvailableFolder[]) => { for (const f of folders) { allIds.add(f.id); walk(f.children); } };
      walk(data.folders);
      setExpandedRuleFolders(allIds);
    }
    setAvailableRulesLoading(false);
  };

  const handleAssociateRules = async () => {
    if (selectedRuleIds.length === 0) return;
    setAssociatingRules(true);
    await fetch(`/api/collection-rules/by-model/${modelId}/associate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleIds: selectedRuleIds }),
    });
    setAssociatingRules(false);
    setShowAssociateRuleModal(false);
    loadCollectionRules();
  };

  const handleDissociateRule = async (ruleId: number) => {
    await fetch(`/api/collection-rules/by-model/${modelId}/dissociate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ruleId }),
    });
    loadCollectionRules();
  };

  const toggleSelectedRule = (id: number) => {
    setSelectedRuleIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const totalAvailableCmds = countTreeItems(availableCmdTree.folders, "commands");
  const totalAvailableRules = countTreeItems(availableRuleTree.folders, "rules");

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
    { key: "nvd", label: t("models.tabNvd"), icon: <ShieldAlert className="h-4 w-4" /> },
    { key: "collection", label: t("models.tabCollection"), icon: <Terminal className="h-4 w-4" /> },
    { key: "rules", label: t("models.tabRules"), icon: <FileSearch className="h-4 w-4" /> },
    { key: "monitoring", label: t("models.tabMonitoring"), icon: <Activity className="h-4 w-4" /> },
  ];

  const autoCmds = collectionCmds.filter((c) => c.association === "auto");
  const manualCmds = collectionCmds.filter((c) => c.association === "manual");
  const autoRules = collectionRules.filter((r) => r.association === "auto");
  const manualRules = collectionRules.filter((r) => r.association === "manual");

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

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
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
            {/* Send control character option */}
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("models.sendCtrlCharLabel")}
              </label>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {t("models.sendCtrlCharHelp")}
              </p>
              <select
                value={sendCtrlChar}
                onChange={(e) => setSendCtrlChar(e.target.value)}
                className={inputCls}
              >
                <option value="">{t("models.sendCtrlCharNone")}</option>
                {"ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("").map((letter) => (
                  <option key={letter} value={letter}>
                    Ctrl+{letter}
                  </option>
                ))}
              </select>
            </div>

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

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
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

      {activeTab === "nvd" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <form onSubmit={handleSaveScript} className="p-6 space-y-5">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("models.nvdKeywordLabel")}
              </label>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">
                {t("models.nvdKeywordHelp")}
              </p>
              <input
                type="text"
                value={nvdKeyword}
                onChange={(e) => setNvdKeyword(e.target.value)}
                className={inputCls}
                placeholder={t("models.nvdKeywordPlaceholder")}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
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

          {/* Associate command modal */}
          {showAssociateModal && (
            <AssociateTreeModal
              title={t("models.associateCommand")}
              searchPlaceholder={t("models.searchCommands")}
              emptyLabel={t("models.noAvailableCommands")}
              disabledLabel={t("collection_commands.disabled")}
              loading={availableLoading}
              tree={availableCmdTree}
              itemsKey="commands"
              searchQuery={searchQuery}
              onSearchChange={setSearchQuery}
              selectedIds={selectedIds}
              onToggle={toggleSelected}
              expandedFolders={expandedCmdFolders}
              onToggleFolder={(id) => setExpandedCmdFolders((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
              matchesSearch={matchesSearch}
              onClose={() => setShowAssociateModal(false)}
              onConfirm={handleAssociate}
              confirming={associating}
              confirmLabel={t("models.associate")}
              selectedLabel={t("models.selectedCount")}
              cancelLabel={t("common.cancel")}
            />
          )}
        </div>
      )}

      {activeTab === "rules" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("models.rulesSubtitle")}</p>
            <button
              onClick={openAssociateRuleModal}
              className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("models.associateRule")}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            {rulesLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-900 dark:text-white" />
              </div>
            ) : collectionRules.length === 0 ? (
              <div className="p-12 text-center">
                <FileSearch className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">{t("models.noCollectionRules")}</p>
              </div>
            ) : (
              <div>
                {autoRules.length > 0 && (
                  <div>
                    <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("models.autoAssociated")}</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {autoRules.map((rule) => (
                        <RuleRow key={rule.id} rule={rule} t={t} />
                      ))}
                    </div>
                  </div>
                )}

                {manualRules.length > 0 && (
                  <div>
                    <div className="px-6 py-2.5 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800 border-t">
                      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">{t("models.manualAssociated")}</span>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {manualRules.map((rule) => (
                        <RuleRow key={rule.id} rule={rule} t={t} onDissociate={() => handleDissociateRule(rule.id)} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Associate rule modal */}
          {showAssociateRuleModal && (

            <AssociateTreeModal
              title={t("models.associateRule")}
              searchPlaceholder={t("models.searchRules")}
              emptyLabel={t("models.noAvailableRules")}
              disabledLabel={t("collection_rules.disabled")}
              loading={availableRulesLoading}
              tree={availableRuleTree}
              itemsKey="rules"
              searchQuery={ruleSearchQuery}
              onSearchChange={setRuleSearchQuery}
              selectedIds={selectedRuleIds}
              onToggle={toggleSelectedRule}
              expandedFolders={expandedRuleFolders}
              onToggleFolder={(id) => setExpandedRuleFolders((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; })}
              matchesSearch={matchesSearch}
              onClose={() => setShowAssociateRuleModal(false)}
              onConfirm={handleAssociateRules}
              confirming={associatingRules}
              confirmLabel={t("models.associate")}
              selectedLabel={t("models.selectedCount")}
              cancelLabel={t("common.cancel")}
            />
          )}
        </div>
      )}

      {activeTab === "monitoring" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          {monitoringLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-slate-900 dark:text-white" />
            </div>
          ) : (
            <form onSubmit={handleSaveMonitoring} className="p-6 space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">{t("models.monitoringSubtitle")}</p>

              <div className="space-y-3">
                {MONITORING_CATEGORIES.map((cat) => {
                  const item = monitoringOids.find((o) => o.category === cat.key);
                  if (!item) return null;
                  return (
                    <div
                      key={cat.key}
                      className={`flex items-center gap-4 rounded-lg border px-4 py-3 transition-colors ${
                        item.enabled
                          ? "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
                          : "border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50"
                      }`}
                    >
                      <div className={`shrink-0 ${item.enabled ? cat.color : "text-slate-300 dark:text-slate-600"}`}>
                        {cat.icon}
                      </div>
                      <div className="shrink-0 w-36">
                        <span className={`text-sm font-medium ${item.enabled ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
                          {t(`models.monitoringCat_${cat.key}`)}
                        </span>
                      </div>
                      <div className="flex-1">
                        <input
                          type="text"
                          value={item.oid}
                          onChange={(e) => updateMonitoringOid(cat.key, "oid", e.target.value)}
                          placeholder={t("models.monitoringOidPlaceholder")}
                          className={`w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm font-mono text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors ${
                            !item.enabled ? "opacity-50" : ""
                          }`}
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => updateMonitoringOid(cat.key, "enabled", !item.enabled)}
                        className="shrink-0"
                      >
                        {item.enabled ? (
                          <ToggleRight className="h-6 w-6 text-emerald-500" />
                        ) : (
                          <ToggleLeft className="h-6 w-6 text-slate-300 dark:text-slate-600" />
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="submit"
                  disabled={savingMonitoring}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
                >
                  {savingMonitoring && <Loader2 className="h-4 w-4 animate-spin" />}
                  {t("common.save")}
                </button>
                {savedMonitoring && (
                  <span className="text-sm text-green-600 dark:text-green-400">{t("models.saved")}</span>
                )}
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

function RuleRow({ rule, t, onDissociate }: { rule: CollectionRuleItem; t: (k: string) => string; onDissociate?: () => void }) {
  return (
    <div className="flex items-center gap-3 px-6 py-3">
      <FileText className={`h-4 w-4 shrink-0 ${rule.enabled ? "text-emerald-500" : "text-slate-300 dark:text-slate-600"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${rule.enabled ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>
            {rule.name}
          </span>
          {rule.inherited && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-sky-700 bg-sky-50 ring-1 ring-inset ring-sky-600/20 dark:text-sky-400 dark:bg-sky-500/10 dark:ring-sky-500/20">
              {t("models.inheritedFromManufacturer")}
            </span>
          )}
          {rule.association === "manual" && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-violet-700 bg-violet-50 ring-1 ring-inset ring-violet-600/20 dark:text-violet-400 dark:bg-violet-500/10 dark:ring-violet-500/20">
              {t("models.manualAssociation")}
            </span>
          )}
          {!rule.enabled && (
            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 ring-1 ring-inset ring-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:ring-slate-700">
              {t("collection_rules.disabled")}
            </span>
          )}
        </div>
        {rule.description && (
          <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{rule.description}</p>
        )}
      </div>
      {rule.enabled ? (
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

function countTreeItems(folders: AvailableFolder[], key: "commands" | "rules"): number {
  let count = 0;
  for (const f of folders) {
    count += (key === "commands" ? f.commands?.length : f.rules?.length) ?? 0;
    count += countTreeItems(f.children, key);
  }
  return count;
}

function AssociateTreeModal({
  title, searchPlaceholder, emptyLabel, disabledLabel, loading, tree, itemsKey,
  searchQuery, onSearchChange, selectedIds, onToggle, expandedFolders, onToggleFolder,
  matchesSearch, onClose, onConfirm, confirming, confirmLabel, selectedLabel, cancelLabel,
}: {
  title: string; searchPlaceholder: string; emptyLabel: string; disabledLabel: string;
  loading: boolean; tree: AvailableTree; itemsKey: "commands" | "rules";
  searchQuery: string; onSearchChange: (v: string) => void;
  selectedIds: number[]; onToggle: (id: number) => void;
  expandedFolders: Set<number>; onToggleFolder: (id: number) => void;
  matchesSearch: (item: AvailableItem, query: string) => boolean;
  onClose: () => void; onConfirm: () => void; confirming: boolean;
  confirmLabel: string; selectedLabel: string; cancelLabel: string;
}) {
  const totalItems = countTreeItems(tree.folders, itemsKey);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>
        <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input type="text" value={searchQuery} onChange={(e) => onSearchChange(e.target.value)} placeholder={searchPlaceholder} autoFocus
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2.5 pl-9 pr-3.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors" />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-slate-900 dark:text-white" /></div>
          ) : totalItems === 0 ? (
            <div className="p-8 text-center"><p className="text-sm text-slate-400 dark:text-slate-500">{emptyLabel}</p></div>
          ) : (
            <div className="py-1">
              {tree.folders.map((folder) => (
                <AssocFolderNode key={folder.id} folder={folder} depth={0} itemsKey={itemsKey} selectedIds={selectedIds} onToggle={onToggle}
                  expandedFolders={expandedFolders} onToggleFolder={onToggleFolder} matchesSearch={matchesSearch} searchQuery={searchQuery} disabledLabel={disabledLabel} />
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {selectedIds.length > 0 ? selectedLabel.replace("{count}", String(selectedIds.length)) : ""}
          </span>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">{cancelLabel}</button>
            <button onClick={onConfirm} disabled={selectedIds.length === 0 || confirming}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
              {confirming && <Loader2 className="h-4 w-4 animate-spin" />}
              <LinkIcon className="h-4 w-4" />
              {confirmLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function AssocFolderNode({ folder, depth, itemsKey, selectedIds, onToggle, expandedFolders, onToggleFolder, matchesSearch, searchQuery, disabledLabel }: {
  folder: AvailableFolder; depth: number; itemsKey: "commands" | "rules"; selectedIds: number[]; onToggle: (id: number) => void;
  expandedFolders: Set<number>; onToggleFolder: (id: number) => void; matchesSearch: (item: AvailableItem, query: string) => boolean; searchQuery: string; disabledLabel: string;
}) {
  const isExpanded = expandedFolders.has(folder.id);
  const items: AvailableItem[] = (itemsKey === "commands" ? folder.commands : folder.rules) ?? [];
  const filteredItems = items.filter((item) => matchesSearch(item, searchQuery));
  const hasChildren = folder.children.length > 0 || items.length > 0;
  const folderColor = folder.type === "manufacturer" ? "text-amber-500" : folder.type === "model" ? "text-blue-500" : "text-slate-400 dark:text-slate-500";

  return (
    <>
      <button onClick={() => onToggleFolder(folder.id)}
        className="w-full flex items-center gap-1.5 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
        style={{ paddingLeft: `${12 + depth * 20}px`, paddingRight: "16px" }}>
        {hasChildren ? (
          <span className="shrink-0 p-0.5 rounded hover:bg-slate-200 dark:hover:bg-slate-700">
            {isExpanded ? <ChevronDown className="h-3.5 w-3.5 text-slate-400" /> : <ChevronRight className="h-3.5 w-3.5 text-slate-400" />}
          </span>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}
        {isExpanded ? <FolderOpen className={`h-4 w-4 ${folderColor} shrink-0`} /> : <FolderClosed className={`h-4 w-4 ${folderColor} shrink-0`} />}
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300 truncate">{folder.name}</span>
        <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium text-slate-500 bg-slate-100 ring-1 ring-inset ring-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:ring-slate-700 ml-auto">{items.length}</span>
      </button>
      {isExpanded && (
        <>
          {folder.children.map((child) => (
            <AssocFolderNode key={child.id} folder={child} depth={depth + 1} itemsKey={itemsKey} selectedIds={selectedIds} onToggle={onToggle}
              expandedFolders={expandedFolders} onToggleFolder={onToggleFolder} matchesSearch={matchesSearch} searchQuery={searchQuery} disabledLabel={disabledLabel} />
          ))}
          {filteredItems.map((item) => (
            <AssocItemRow key={item.id} item={item} depth={depth + 1} isSelected={selectedIds.includes(item.id)} onToggle={() => onToggle(item.id)} disabledLabel={disabledLabel} />
          ))}
        </>
      )}
    </>
  );
}

function AssocItemRow({ item, depth, isSelected, onToggle, disabledLabel }: { item: AvailableItem; depth: number; isSelected: boolean; onToggle: () => void; disabledLabel: string }) {
  return (
    <button onClick={onToggle}
      className={`w-full text-left flex items-center gap-3 py-2 transition-colors ${isSelected ? "bg-slate-100 dark:bg-slate-800" : "hover:bg-slate-50 dark:hover:bg-slate-800/50"}`}
      style={{ paddingLeft: `${16 + depth * 20 + 24}px`, paddingRight: "16px" }}>
      <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${isSelected ? "bg-slate-900 dark:bg-white border-slate-900 dark:border-white" : "border-slate-300 dark:border-slate-600"}`}>
        {isSelected && <svg className="h-2.5 w-2.5 text-white dark:text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
      </div>
      <FileText className={`h-3.5 w-3.5 shrink-0 ${item.enabled ? "text-emerald-500" : "text-slate-300 dark:text-slate-600"}`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${item.enabled ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500"}`}>{item.name}</span>
          {!item.enabled && <span className="text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5">{disabledLabel}</span>}
        </div>
        {item.description && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{item.description}</p>}
      </div>
    </button>
  );
}
