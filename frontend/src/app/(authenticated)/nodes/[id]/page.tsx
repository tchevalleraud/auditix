"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import { ArrowLeft, Loader2, Play, Tag, CheckCircle2, XCircle, Clock, FileText, Eye, Trash2, X, FolderOpen, FolderClosed, ChevronRight, ChevronDown, Plus, Table2, ShieldCheck, Ban, Minus, Save, AlertTriangle } from "lucide-react";

interface Manufacturer { id: number; name: string; logo: string | null }
interface Model { id: number; name: string; manufacturer?: { id: number } | null }
interface ProfileItem { id: number; name: string }

interface NodeTag { id: number; name: string; color: string }

interface NodeDetail {
  id: number;
  name: string | null;
  ipAddress: string;
  hostname: string | null;
  score: string | null;
  policy: string;
  discoveredModel: string | null;
  discoveredVersion: string | null;
  complianceEvaluating: string | null;
  isReachable: boolean | null;
  lastPingAt: string | null;
  monitoringEnabled: boolean;
  manufacturer: { id: number; name: string; logo: string | null } | null;
  model: { id: number; name: string } | null;
  profile: { id: number; name: string } | null;
  tags: NodeTag[];
  createdAt: string;
}

interface CollectionItem {
  id: number;
  tags: string[];
  status: string;
  worker: string | null;
  commandCount: number;
  completedCount: number;
  error: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

interface CollectionRule {
  name: string;
  files: { filename: string; size: number }[];
}

interface CollectionDetail extends CollectionItem {
  rules: CollectionRule[];
}

const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const selectClass = inputClass;
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

type TabKey = "summary" | "settings" | "collections" | "inventory" | "compliance";

interface ComplianceResultEntry {
  ruleId: number;
  ruleIdentifier: string | null;
  ruleName: string;
  ruleDescription: string | null;
  status: string;
  severity: string | null;
  message: string | null;
  evaluatedAt: string;
}

interface CompliancePolicyResult {
  policy: { id: number; name: string };
  results: ComplianceResultEntry[];
  stats: Record<string, number>;
  evaluatedAt: string | null;
}

interface ComplianceData {
  score: string | null;
  policies: CompliancePolicyResult[];
}

interface InventoryCatData {
  categoryName: string;
  keyLabel: string | null;
  columns: { colKey: string; label: string }[];
  rows: { key: string; values: Record<string, string> }[];
}

export default function NodeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const nodeId = params.id as string;

  const initialTab = (searchParams.get("tab") as TabKey) || "summary";
  const initialCollectionId = searchParams.get("collectionId");
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [node, setNode] = useState<NodeDetail | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);

  const [name, setName] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [manufacturerId, setManufacturerId] = useState("");
  const [modelId, setModelId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [policy, setPolicy] = useState("audit");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [allModels, setAllModels] = useState<Model[]>([]);
  const [filteredModels, setFilteredModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [allTags, setAllTags] = useState<NodeTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  // Collections state
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectModal, setCollectModal] = useState(false);
  const [collectTags, setCollectTags] = useState<string[]>([]);
  const [collectTagInput, setCollectTagInput] = useState("");
  const [collecting, setCollecting] = useState(false);

  // Collection detail modal
  const [viewCollection, setViewCollection] = useState<CollectionDetail | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [viewFile, setViewFile] = useState<{ filename: string; content: string } | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [expandedRules, setExpandedRules] = useState<Set<string>>(new Set());
  const [newTag, setNewTag] = useState("");
  const [selectedCollections, setSelectedCollections] = useState<Set<number>>(new Set());
  const [deletingSelected, setDeletingSelected] = useState(false);

  // Inventory state
  const [inventoryData, setInventoryData] = useState<InventoryCatData[]>([]);
  const [inventoryLoading, setInventoryLoading] = useState(false);
  const [selectedInventoryCat, setSelectedInventoryCat] = useState(0);

  // Compliance state
  const [complianceData, setComplianceData] = useState<ComplianceData | null>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceEvaluating, setComplianceEvaluating] = useState(false);
  const [expandedCompliancePolicies, setExpandedCompliancePolicies] = useState<Set<number>>(new Set());
  const [scoreCalcOpen, setScoreCalcOpen] = useState(false);

  const dateLocale = locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  const loadData = useCallback(async () => {
    if (!current) return;
    const [nRes, mRes, mdRes, pRes, tRes] = await Promise.all([
      fetch(`/api/nodes?context=${current.id}`),
      fetch(`/api/manufacturers?context=${current.id}`),
      fetch(`/api/models?context=${current.id}`),
      fetch(`/api/profiles?context=${current.id}`),
      fetch(`/api/node-tags?context=${current.id}`),
    ]);
    const nodes: NodeDetail[] = nRes.ok ? await nRes.json() : [];
    const found = nodes.find((n) => n.id === Number(nodeId));
    const loadedModels: Model[] = mdRes.ok ? await mdRes.json() : [];
    setAllModels(loadedModels);

    if (found) {
      setNode(found);
      setName(found.name ?? "");
      setIpAddress(found.ipAddress);
      setManufacturerId(found.manufacturer ? String(found.manufacturer.id) : "");
      setModelId(found.model ? String(found.model.id) : "");
      setProfileId(found.profile ? String(found.profile.id) : "");
      setPolicy(found.policy);
      setSelectedTagIds(found.tags ? found.tags.map((t) => t.id) : []);
      if (found.complianceEvaluating) setComplianceEvaluating(true);

      const mfId = found.manufacturer ? String(found.manufacturer.id) : "";
      setFilteredModels(mfId ? loadedModels.filter((m) => m.manufacturer && m.manufacturer.id === Number(mfId)) : loadedModels);
    }
    if (mRes.ok) setManufacturers(await mRes.json());
    if (pRes.ok) setProfiles(await pRes.json());
    if (tRes.ok) setAllTags(await tRes.json());
    setFetchLoading(false);
  }, [nodeId, current]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadCollections = useCallback(async () => {
    setCollectionsLoading(true);
    const res = await fetch(`/api/collections/by-node/${nodeId}`);
    if (res.ok) setCollections(await res.json());
    setCollectionsLoading(false);
  }, [nodeId]);

  const loadInventory = useCallback(async () => {
    setInventoryLoading(true);
    const res = await fetch(`/api/nodes/${nodeId}/inventory`);
    if (res.ok) {
      setInventoryData(await res.json());
      setSelectedInventoryCat(0);
    }
    setInventoryLoading(false);
  }, [nodeId]);

  const loadCompliance = useCallback(async () => {
    setComplianceLoading(true);
    const res = await fetch(`/api/nodes/${nodeId}/compliance`);
    if (res.ok) setComplianceData(await res.json());
    setComplianceLoading(false);
  }, [nodeId]);

  // Always load collections on mount (for tab spinner), then reload when switching to tab
  useEffect(() => { loadCollections(); }, [loadCollections]);
  useEffect(() => {
    if (tab === "inventory") loadInventory();
    if (tab === "collections") loadCollections();
    if (tab === "compliance") loadCompliance();
  }, [tab, loadCollections, loadCompliance]);

  // Open collection from query params (e.g. from Collections page)
  const [initialCollectionOpened, setInitialCollectionOpened] = useState(false);
  useEffect(() => {
    if (initialCollectionId && !initialCollectionOpened && tab === "collections" && !collectionsLoading) {
      setInitialCollectionOpened(true);
      openCollection(Number(initialCollectionId));
    }
  }, [initialCollectionId, initialCollectionOpened, tab, collectionsLoading]);

  // Mercure SSE for real-time updates
  useEffect(() => {
    if (!current) return;
    const url = new URL("/.well-known/mercure", window.location.origin);
    url.searchParams.append("topic", `nodes/context/${current.id}`);
    url.searchParams.append("topic", `collections/node/${nodeId}`);
    url.searchParams.append("topic", `compliance/node/${nodeId}`);
    const es = new EventSource(url);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "ping" && data.nodeId === Number(nodeId)) {
        setNode((prev) => prev ? { ...prev, isReachable: data.isReachable, lastPingAt: data.lastPingAt } : prev);
      }
      if (data.event === "collection.updated" && data.collection) {
        const col = data.collection;
        setCollections((prev) => {
          const idx = prev.findIndex((c) => c.id === col.id);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = { ...next[idx], ...col };
            return next;
          }
          return [col, ...prev];
        });
      }
      if (data.event === "compliance.progress" && data.nodeId === Number(nodeId)) {
        setComplianceEvaluating(true);
      }
      if (data.event === "compliance.evaluated" && data.nodeId === Number(nodeId)) {
        setNode((prev) => prev ? { ...prev, score: data.score, complianceEvaluating: false } : prev);
        setComplianceEvaluating(false);
        loadCompliance();
      }
    };
    return () => es.close();
  }, [current, nodeId, loadCompliance]);

  const handleManufacturerChange = (value: string) => {
    setManufacturerId(value);
    setModelId("");
    setModelsLoading(true);
    setTimeout(() => {
      setFilteredModels(value ? allModels.filter((m) => m.manufacturer && m.manufacturer.id === Number(value)) : allModels);
      setModelsLoading(false);
    }, 300);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ipAddress.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/nodes/${nodeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || null,
          ipAddress,
          manufacturerId: manufacturerId ? Number(manufacturerId) : null,
          modelId: modelId ? Number(modelId) : null,
          profileId: profileId ? Number(profileId) : null,
          policy,
          tagIds: selectedTagIds,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setNode(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm(t("nodes.confirmDelete", { name: node?.name || node?.ipAddress || "" }))) return;
    await fetch(`/api/nodes/${nodeId}`, { method: "DELETE" });
    router.push("/nodes");
  };

  const handleCollect = async () => {
    if (!current) return;
    setCollecting(true);
    try {
      await fetch(`/api/collections/collect?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeIds: [Number(nodeId)], tags: collectTags }),
      });
      setCollectModal(false);
      setCollectTags([]);
      setCollectTagInput("");
      if (tab === "collections") loadCollections();
      else setTab("collections");
    } finally {
      setCollecting(false);
    }
  };

  const openCollection = async (id: number) => {
    setViewLoading(true);
    setViewFile(null);
    setExpandedRules(new Set());
    setNewTag("");
    const res = await fetch(`/api/collections/${id}`);
    if (res.ok) setViewCollection(await res.json());
    setViewLoading(false);
  };

  const openFile = async (collectionId: number, ruleName: string, filename: string) => {
    setFileLoading(true);
    const res = await fetch(`/api/collections/${collectionId}/files/${ruleName}/${filename}`);
    if (res.ok) setViewFile({ filename, content: await res.text() });
    setFileLoading(false);
  };

  const deleteCollection = async (id: number) => {
    await fetch(`/api/collections/${id}`, { method: "DELETE" });
    setViewCollection(null);
    loadCollections();
  };

  const addCollectionTag = async (collectionId: number, tag: string) => {
    const res = await fetch(`/api/collections/${collectionId}/tags`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag }),
    });
    if (res.ok) {
      const updated = await res.json();
      setViewCollection((prev) => prev ? { ...prev, tags: updated.tags } : prev);
      // Tag is unique per context: remove it from other collections in local state
      setCollections((prev) => prev.map((c) => {
        if (c.id === collectionId) return { ...c, tags: updated.tags };
        return { ...c, tags: c.tags.filter((t) => t !== tag) };
      }));
    }
  };

  const removeCollectionTag = async (collectionId: number, tag: string) => {
    const res = await fetch(`/api/collections/${collectionId}/tags/${encodeURIComponent(tag)}`, { method: "DELETE" });
    if (res.ok) {
      const updated = await res.json();
      setViewCollection((prev) => prev ? { ...prev, tags: updated.tags } : prev);
      setCollections((prev) => prev.map((c) => c.id === collectionId ? { ...c, tags: updated.tags } : c));
    }
  };

  const deleteSelectedCollections = async () => {
    if (!confirm(t("nodes.confirmDeleteCollections", { count: String(selectedCollections.size) }))) return;
    setDeletingSelected(true);
    try {
      await Promise.all(
        Array.from(selectedCollections).map((id) =>
          fetch(`/api/collections/${id}`, { method: "DELETE" })
        )
      );
      setSelectedCollections(new Set());
      loadCollections();
    } finally {
      setDeletingSelected(false);
    }
  };

  if (fetchLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  if (!node) return null;

  const scoreColors: Record<string, string> = {
    A: "bg-emerald-500", B: "bg-lime-500", C: "bg-yellow-500",
    D: "bg-orange-500", E: "bg-red-400", F: "bg-red-600",
  };

  const hasRunning = collections.some((c) => c.status === "running");
  const hasPending = collections.some((c) => c.status === "pending");
  const collectionsTabStatus = hasRunning ? "running" : hasPending ? "pending" : null;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "summary", label: t("nodes.tabSummary") },
    { key: "compliance", label: t("compliance.title") },
    { key: "inventory", label: t("nodes.tabInventory") },
    { key: "collections", label: t("nodes.tabCollections") },
  ];
  const rightTabs: { key: TabKey; label: string }[] = [
    { key: "settings", label: t("nodes.tabSettings") },
  ];

  const statusIcon = (status: string) => {
    switch (status) {
      case "completed": return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
      case "failed": return <XCircle className="h-4 w-4 text-red-500" />;
      case "running": return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
      default: return <Clock className="h-4 w-4 text-slate-400" />;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case "completed": return t("status.completed");
      case "failed": return t("status.failed");
      case "running": return t("status.running");
      default: return t("nodes.collectionPending");
    }
  };

  return (
    <div className="flex flex-col gap-6 h-[calc(100vh-7rem)]">
      <div>
        <Link href="/nodes" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" />
          {t("nodes.title")}
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {complianceEvaluating ? (
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 dark:bg-slate-700">
                <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
              </div>
            ) : node.score ? (
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white ${scoreColors[node.score] ?? "bg-slate-300 dark:bg-slate-600"}`}>{node.score}</div>
            ) : (
              <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700" />
            )}
            <div>
              <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {node.hostname || node.name || node.ipAddress}
                <span className="flex items-center gap-1.5 text-base font-normal text-slate-400 dark:text-slate-500 font-mono">
                  {(node.hostname || node.name) && node.ipAddress}
                  {node.monitoringEnabled && (
                    <span className={`inline-block h-2 w-2 rounded-full ${node.isReachable === null ? "bg-slate-300 dark:bg-slate-600" : node.isReachable ? "bg-emerald-500" : "bg-red-500"}`} />
                  )}
                </span>
              </h1>
              <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                {node.manufacturer && (
                  <div className="flex items-center gap-1.5">
                    {node.manufacturer.logo && <img src={`/api/logos/${node.manufacturer.logo}`} alt="" className="h-4 w-4 object-contain" />}
                    <span>{node.manufacturer.name}</span>
                  </div>
                )}
                {node.model && (
                  <>
                    {node.manufacturer && <span className="text-slate-300 dark:text-slate-600">|</span>}
                    <span>{node.model.name}</span>
                  </>
                )}
                {node.tags && node.tags.length > 0 && (
                  <>
                    {(node.manufacturer || node.model) && <span className="text-slate-300 dark:text-slate-600">|</span>}
                    <div className="flex items-center gap-1">
                      {node.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag.id}
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium text-white"
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name}
                        </span>
                      ))}
                      {node.tags.length > 3 && (
                        <span className="text-xs font-medium text-slate-400 dark:text-slate-500">
                          +{node.tags.length - 3}
                        </span>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedCollections.size > 0 && (
              <button
                onClick={deleteSelectedCollections}
                disabled={deletingSelected}
                className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              >
                {deletingSelected ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t("nodes.deleteSelected", { count: String(selectedCollections.size) })}
              </button>
            )}
            {tab === "settings" && (
              <button
                onClick={() => { const form = document.getElementById("node-settings-form") as HTMLFormElement; form?.requestSubmit(); }}
                disabled={saving || !ipAddress.trim()}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("common.save")}
              </button>
            )}
            <button
              onClick={async () => {
                const res = await fetch(`/api/nodes/${nodeId}/evaluate-compliance`, { method: "POST" });
                if (res.ok) {
                  const data = await res.json();
                  if (data.dispatched > 0) {
                    setComplianceEvaluating(true);
                    setNode((prev) => prev ? { ...prev, score: null } : prev);
                  }
                }
              }}
              disabled={complianceEvaluating}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {complianceEvaluating ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
              {complianceEvaluating ? t("compliance.evaluating") : t("compliance.evaluateCompliance")}
            </button>
            {node.model && (
              <button
                onClick={() => { setCollectTags([]); setCollectTagInput(""); setCollectModal(true); }}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
              >
                <Play className="h-4 w-4" />
                {t("nodes.collect")}
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex justify-between">
          <div className="flex gap-6">
            {tabs.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                  tab === tb.key
                    ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                <span className="flex items-center gap-1.5">
                  {tb.key === "collections" && collectionsTabStatus && (
                    <Loader2 className={`h-3.5 w-3.5 animate-spin ${collectionsTabStatus === "running" ? "text-blue-500" : "text-slate-400"}`} />
                  )}
                  {tb.key === "compliance" && complianceEvaluating && (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
                  )}
                  {tb.label}
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-6">
            {rightTabs.map((tb) => (
              <button
                key={tb.key}
                onClick={() => setTab(tb.key)}
                className={`pb-3 text-sm font-medium transition-colors border-b-2 ${
                  tab === tb.key
                    ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                    : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                }`}
              >
                {tb.label}
              </button>
            ))}
          </div>
        </nav>
      </div>

      {tab === "summary" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-3">
              <div className="h-6 w-6 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("nodes.compliancePlaceholder")}</p>
          </div>
        </div>
      )}

      {tab === "collections" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            {collectionsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-slate-900 dark:text-white" />
              </div>
            ) : collections.length === 0 ? (
              <div className="p-12 text-center">
                <Play className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">{t("nodes.noCollections")}</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {collections.map((col) => (
                  <div
                    key={col.id}
                    className={`flex items-center gap-4 px-6 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${selectedCollections.has(col.id) ? "bg-slate-50 dark:bg-slate-800/30" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedCollections.has(col.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        setSelectedCollections((prev) => {
                          const next = new Set(prev);
                          next.has(col.id) ? next.delete(col.id) : next.add(col.id);
                          return next;
                        });
                      }}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20 shrink-0"
                    />
                    <button
                      onClick={() => openCollection(col.id)}
                      className="flex-1 min-w-0 flex items-center gap-4 text-left"
                    >
                      {statusIcon(col.status)}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                            #{col.id}
                          </span>
                          {col.tags.map((t_tag) => (
                            <span key={t_tag} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium text-violet-700 bg-violet-50 ring-1 ring-inset ring-violet-600/20 dark:text-violet-400 dark:bg-violet-500/10 dark:ring-violet-500/20">
                              <Tag className="h-2.5 w-2.5" />
                              {t_tag}
                            </span>
                          ))}
                          <span className={`text-xs ${col.status === "completed" ? "text-emerald-600 dark:text-emerald-400" : col.status === "failed" ? "text-red-600 dark:text-red-400" : col.status === "running" ? "text-blue-600 dark:text-blue-400" : "text-slate-400"}`}>
                            {statusLabel(col.status)}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {col.completedCount}/{col.commandCount} {t("nodes.collectionCommands")}
                          {col.worker && ` — ${col.worker}`}
                        </p>
                      </div>
                      <span className="text-xs text-slate-400 dark:text-slate-500">
                        {new Date(col.createdAt).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "medium" })}
                      </span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "inventory" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden flex-1 min-h-0 flex flex-col">
          {inventoryLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : inventoryData.length > 0 ? (
            <div className="flex flex-1 min-h-0">
              {/* Sidebar */}
              <div className="w-52 flex-shrink-0 border-r border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/30 overflow-y-auto">
                <nav className="py-2">
                  {inventoryData.map((cat, catIdx) => (
                    <button
                      key={catIdx}
                      onClick={() => setSelectedInventoryCat(catIdx)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        selectedInventoryCat === catIdx
                          ? "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium border-r-2 border-r-slate-900 dark:border-r-slate-100 shadow-sm"
                          : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-white/50 dark:hover:bg-slate-800/50"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{cat.categoryName}</span>
                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 bg-slate-200/60 dark:bg-slate-700/60 rounded-full px-1.5 py-0.5 flex-shrink-0">{cat.rows.length}</span>
                      </div>
                    </button>
                  ))}
                </nav>
              </div>

              {/* Table */}
              <div className="flex-1 min-w-0 overflow-auto">
                {(() => {
                  const cat = inventoryData[selectedInventoryCat] ?? inventoryData[0];
                  if (!cat) return null;
                  return (
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-800/50">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{cat.keyLabel || t("nodes.inventoryKey")}</th>
                          {cat.columns.map((col) => (
                            <th key={col.colKey} className="text-left px-4 py-2.5 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap">{col.label}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {cat.rows.map((row, rowIdx) => (
                          <tr key={rowIdx} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-2.5 font-medium text-slate-700 dark:text-slate-300 whitespace-nowrap">
                              <code className="text-xs bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">{row.key}</code>
                            </td>
                            {cat.columns.map((col) => (
                              <td key={col.colKey} className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                                {row.values[col.colKey] ? (
                                  <code className="text-xs font-mono">{row.values[col.colKey]}</code>
                                ) : (
                                  <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
                                )}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="text-center py-12">
              <Table2 className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-slate-400 dark:text-slate-500">{t("nodes.inventoryEmpty")}</p>
            </div>
          )}
        </div>
      )}

      {tab === "compliance" && (
        <div className="space-y-6">

          {complianceLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : !complianceData || complianceData.policies.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
              <ShieldCheck className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("compliance.noResults")}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("compliance.noResultsDesc")}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {[...complianceData.policies].sort((a, b) => a.policy.name.localeCompare(b.policy.name)).map((pr) => {
                  const isExp = expandedCompliancePolicies.has(pr.policy.id);
                  const total = Object.values(pr.stats).reduce((a, b) => a + b, 0);

                  return (
                    <div key={pr.policy.id}>
                      <button
                        onClick={() => setExpandedCompliancePolicies((prev) => { const next = new Set(prev); next.has(pr.policy.id) ? next.delete(pr.policy.id) : next.add(pr.policy.id); return next; })}
                        className="w-full flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                      >
                        {isExp ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                        <ShieldCheck className="h-5 w-5 text-blue-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{pr.policy.name}</span>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {(() => {
                            const c = pr.stats.compliant || 0;
                            const nc = pr.stats.non_compliant || 0;
                            const err = pr.stats.error || 0;
                            const na = pr.stats.not_applicable || 0;
                            const t2 = c + nc + err + na;
                            if (t2 === 0) return null;
                            const pC = (c / t2) * 100;
                            const pNC = ((c + nc) / t2) * 100;
                            const pErr = ((c + nc + err) / t2) * 100;
                            return (
                              <div className="h-2.5 w-56 rounded-full overflow-hidden relative">
                                <div className="absolute inset-0" style={{
                                  background: `linear-gradient(to right, ${[
                                    ...(c > 0 ? [`#10b981 0%, #10b981 ${pC}%`] : []),
                                    ...(nc > 0 ? [`#ef4444 ${pC}%, #ef4444 ${pNC}%`] : []),
                                    ...(err > 0 ? [`#ef4444 ${pNC}%, #ef4444 ${pErr}%`] : []),
                                    ...(na > 0 ? [`#e2e8f0 ${pErr}%, #e2e8f0 100%`] : []),
                                  ].join(", ")})`
                                }} />
                                {err > 0 && (
                                  <div className="absolute inset-0" style={{
                                    clipPath: `inset(0 ${100 - pErr}% 0 ${pNC}%)`,
                                    backgroundImage: `repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(255,255,255,0.35) 2px, rgba(255,255,255,0.35) 4px)`,
                                  }} />
                                )}
                              </div>
                            );
                          })()}
                          <span className="text-xs text-slate-400">{total}</span>
                        </div>
                      </button>
                      {isExp && (
                        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                          {pr.results.filter((r) => r.status !== "skipped").map((r) => {
                            const statusIcon = r.status === "compliant" ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                              : r.status === "non_compliant" ? <Ban className="h-4 w-4 text-red-500" />
                              : r.status === "error" ? (
                                <span className="relative inline-flex h-4 w-4">
                                  <XCircle className="h-4 w-4 text-red-500" />
                                  <span className="absolute inset-0 flex items-center justify-center">
                                    <span className="block w-[18px] h-[1.5px] bg-red-500 rotate-45 rounded-full" />
                                  </span>
                                </span>
                              )
                              : <Minus className="h-4 w-4 text-slate-400" />;
                            const sevCls = r.severity === "critical" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                              : r.severity === "high" ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400"
                              : r.severity === "medium" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400"
                              : r.severity === "low" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";
                            return (
                              <div key={r.ruleId} className="flex items-center gap-3 px-4 py-2.5 pl-14">
                                {statusIcon}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    {r.ruleIdentifier && <code className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5 font-mono">{r.ruleIdentifier}</code>}
                                    <span className="text-sm text-slate-900 dark:text-slate-100">{r.ruleName}</span>
                                    {r.severity && r.status === "non_compliant" && (
                                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${sevCls}`}>{r.severity}</span>
                                    )}
                                  </div>
                                  {r.ruleDescription && <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{r.ruleDescription}</p>}
                                </div>
                                {r.message && (
                                  <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0 max-w-xs truncate text-right">{r.message}</span>
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
            </div>
          )}

          {/* Score calculation explanation */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <button
              onClick={() => setScoreCalcOpen(!scoreCalcOpen)}
              className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
            >
              {scoreCalcOpen ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{t("compliance.scoreCalculation")}</span>
            </button>
            {scoreCalcOpen && (
              <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-4 space-y-4">
                <p className="text-sm text-slate-600 dark:text-slate-400">{t("compliance.scoreCalculationDesc")}</p>

                <div className="space-y-1.5">
                  <code className="block text-xs bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-lg px-3 py-2 font-mono">{t("compliance.scoreFormula")}</code>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t("compliance.scoreMaxPenalty")}</p>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">{t("compliance.scoreSeverityWeights")}</h4>
                  <div className="grid grid-cols-2 gap-x-6 gap-y-1">
                    {[
                      { label: t("compliance.scoreSeverityInfo"), value: 1, cls: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400" },
                      { label: t("compliance.scoreSeverityLow"), value: 3, cls: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400" },
                      { label: t("compliance.scoreSeverityMedium"), value: 5, cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400" },
                      { label: t("compliance.scoreSeverityHigh"), value: 8, cls: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400" },
                      { label: t("compliance.scoreSeverityCritical"), value: 10, cls: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" },
                      { label: t("compliance.scoreSeverityError"), value: 10, cls: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400" },
                    ].map((s) => (
                      <div key={s.label} className="flex items-center justify-between py-1">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${s.cls}`}>{s.label}</span>
                        <span className="text-xs font-mono text-slate-500 dark:text-slate-400">{s.value} / 10</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">{t("compliance.scoreGradeScale")}</h4>
                  <div className="flex gap-1.5">
                    {[
                      { grade: "A", pct: "90%", bg: "bg-emerald-500" },
                      { grade: "B", pct: "75%", bg: "bg-lime-500" },
                      { grade: "C", pct: "60%", bg: "bg-yellow-500" },
                      { grade: "D", pct: "45%", bg: "bg-orange-500" },
                      { grade: "E", pct: "30%", bg: "bg-red-400" },
                      { grade: "F", pct: "<30%", bg: "bg-red-600" },
                    ].map((g) => (
                      <div key={g.grade} className="flex flex-col items-center gap-1">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${g.bg}`}>{g.grade}</div>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500">{g.grade === "F" ? g.pct : `≥${g.pct}`}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Score breakdown for this node */}
                {complianceData && complianceData.policies.length > 0 && (() => {
                  const severityWeights: Record<string, number> = { info: 1, low: 3, medium: 5, high: 8, critical: 10 };
                  const allResults = complianceData.policies.flatMap((p) => p.results.filter((r) => r.status !== "skipped"));
                  const scored = allResults.filter((r) => r.status !== "not_applicable");
                  const totalScorable = scored.length;
                  const maxPenalty = totalScorable * 10;
                  let totalPenalty = 0;
                  const rows = allResults.map((r) => {
                    let penalty = 0;
                    if (r.status === "non_compliant") {
                      penalty = severityWeights[r.severity ?? "info"] ?? 1;
                    } else if (r.status === "error") {
                      penalty = 10;
                    }
                    totalPenalty += penalty;
                    return { ...r, penalty };
                  });
                  const percentage = maxPenalty > 0 ? Math.round(((maxPenalty - totalPenalty) / maxPenalty) * 100) : 100;
                  const sevCls = (sev: string | null) =>
                    sev === "critical" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                    : sev === "high" ? "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400"
                    : sev === "medium" ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/20 dark:text-yellow-400"
                    : sev === "low" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400"
                    : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";

                  return (
                    <div>
                      <h4 className="text-xs font-semibold text-slate-900 dark:text-slate-100 mb-2">{t("compliance.scoreCalculation")} — {complianceData.score ?? "–"}</h4>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700">
                              <th className="px-3 py-1.5 text-left font-semibold text-slate-500 dark:text-slate-400">{t("compliance.policy")}</th>
                              <th className="px-3 py-1.5 text-left font-semibold text-slate-500 dark:text-slate-400">{t("nodes.colCompliance")}</th>
                              <th className="px-3 py-1.5 text-center font-semibold text-slate-500 dark:text-slate-400">{t("status.completed")}</th>
                              <th className="px-3 py-1.5 text-center font-semibold text-slate-500 dark:text-slate-400">{t("compliance.severity")}</th>
                              <th className="px-3 py-1.5 text-right font-semibold text-slate-500 dark:text-slate-400">Penalty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {complianceData.policies.flatMap((p) =>
                              p.results.filter((r) => r.status !== "skipped").map((r) => {
                                const row = rows.find((rr) => rr.ruleId === r.ruleId);
                                const statusIcon = r.status === "compliant" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                                  : r.status === "non_compliant" ? <Ban className="h-3.5 w-3.5 text-red-500" />
                                  : r.status === "error" ? <XCircle className="h-3.5 w-3.5 text-red-500" />
                                  : <Minus className="h-3.5 w-3.5 text-slate-400" />;
                                return (
                                  <tr key={`${p.policy.id}-${r.ruleId}`} className={r.status === "not_applicable" ? "opacity-50" : ""}>
                                    <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{p.policy.name}</td>
                                    <td className="px-3 py-1.5">
                                      <div className="flex items-center gap-1.5">
                                        {statusIcon}
                                        <span className="text-slate-700 dark:text-slate-300">{r.ruleIdentifier ? `${r.ruleIdentifier} — ` : ""}{r.ruleName}</span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-1.5 text-center">
                                      <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                        r.status === "compliant" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400"
                                        : r.status === "non_compliant" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                                        : r.status === "error" ? "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                                        : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                                      }`}>
                                        {r.status === "compliant" ? t("compliance.compliant")
                                          : r.status === "non_compliant" ? t("compliance.nonCompliant")
                                          : r.status === "error" ? t("compliance.error")
                                          : t("compliance.notApplicable")}
                                      </span>
                                    </td>
                                    <td className="px-3 py-1.5 text-center">
                                      {r.severity && r.status === "non_compliant" ? (
                                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${sevCls(r.severity)}`}>{r.severity}</span>
                                      ) : r.status === "error" ? (
                                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-medium ${sevCls("critical")}`}>{t("compliance.error")}</span>
                                      ) : (
                                        <span className="text-slate-300 dark:text-slate-600">—</span>
                                      )}
                                    </td>
                                    <td className="px-3 py-1.5 text-right font-mono text-slate-500 dark:text-slate-400">
                                      {r.status === "not_applicable" ? "—" : row?.penalty ?? 0}
                                    </td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                          <tfoot>
                            <tr className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                              <td colSpan={4} className="px-3 py-2 text-right font-semibold text-slate-700 dark:text-slate-300">
                                {totalPenalty} / {maxPenalty} → {percentage}% → <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white ${scoreColors[complianceData.score ?? ""] ?? "bg-slate-400"}`}>{complianceData.score ?? "–"}</span>
                              </td>
                              <td className="px-3 py-2 text-right font-mono font-semibold text-slate-700 dark:text-slate-300">{totalPenalty}</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "settings" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("nodes.tabSettings")}</h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t("nodes.settingsDesc")}</p>
            </div>
            <form id="node-settings-form" onSubmit={handleSave} className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className={labelClass}>{t("nodes.colIpAddress")}</label>
                <input type="text" value={ipAddress} onChange={(e) => setIpAddress(e.target.value)} required className={inputClass} placeholder={t("nodes.ipPlaceholder")} />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("nodes.colManufacturer")}</label>
                <select value={manufacturerId} onChange={(e) => handleManufacturerChange(e.target.value)} className={selectClass}>
                  <option value="">{"\u2014"}</option>
                  {manufacturers.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>
                  <span className="flex items-center gap-2">
                    {t("nodes.colModel")}
                    {modelsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
                  </span>
                </label>
                <select value={modelId} onChange={(e) => setModelId(e.target.value)} disabled={modelsLoading} className={`${selectClass} ${modelsLoading ? "opacity-50" : ""}`}>
                  <option value="">{modelsLoading ? t("nodes.loadingModels") : "\u2014"}</option>
                  {filteredModels.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("nodes.colProfile")}</label>
                <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={selectClass}>
                  <option value="">{"\u2014"}</option>
                  {profiles.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className={labelClass}>{t("nodes.colPolicy")}</label>
                <select value={policy} onChange={(e) => setPolicy(e.target.value)} className={selectClass}>
                  <option value="audit">{t("nodes.policyAudit")}</option>
                  <option value="enforce">{t("nodes.policyEnforce")}</option>
                </select>
              </div>
              {allTags.length > 0 && (
                <div className="space-y-1.5">
                  <label className={labelClass}>{t("sidebar.tags")}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map((tag) => {
                      const isSelected = selectedTagIds.includes(tag.id);
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => setSelectedTagIds((prev) =>
                            isSelected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id]
                          )}
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-all ${
                            isSelected
                              ? "text-white ring-2 ring-offset-1 ring-slate-900 dark:ring-white"
                              : "text-white opacity-40 hover:opacity-70"
                          }`}
                          style={{ backgroundColor: tag.color }}
                        >
                          {tag.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </form>
            {saved && <div className="px-6 pb-4"><span className="text-sm text-green-600 dark:text-green-400">{t("nodes.saved")}</span></div>}
          </div>

          <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-white dark:bg-slate-900 shadow-sm">
            <div className="px-6 py-4 border-b border-red-100 dark:border-red-500/10">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-red-600 dark:text-red-400">
                <AlertTriangle className="h-4 w-4" />
                {t("nodes.dangerZone")}
              </h3>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{t("nodes.dangerZoneDesc")}</p>
            </div>
            <div className="p-6">
              <button onClick={handleDelete} className="rounded-lg border border-red-200 dark:border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                {t("nodes.deleteNode")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collect modal */}
      {collectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("nodes.collectTitle")}</h3>
              <button onClick={() => setCollectModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("nodes.collectDescription")}</p>
              <div className="space-y-1.5">
                <label className={labelClass}>
                  <span className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" />
                    {t("nodes.collectTagLabel")}
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-1.5 min-h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2">
                  {collectTags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                      {tag}
                      <button type="button" onClick={() => setCollectTags(collectTags.filter((t) => t !== tag))} className="hover:text-red-500 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={collectTagInput}
                    onChange={(e) => setCollectTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === ",") && collectTagInput.trim()) {
                        e.preventDefault();
                        const tag = collectTagInput.trim().replace(/,/g, "");
                        if (tag && !collectTags.includes(tag)) setCollectTags([...collectTags, tag]);
                        setCollectTagInput("");
                      }
                      if (e.key === "Backspace" && !collectTagInput && collectTags.length > 0) {
                        setCollectTags(collectTags.slice(0, -1));
                      }
                    }}
                    placeholder={collectTags.length === 0 ? t("nodes.collectTagPlaceholder") : ""}
                    className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
                  />
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t("nodes.collectTagHelp")}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setCollectModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleCollect}
                disabled={collecting}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {collecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {t("nodes.collectStart")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Collection detail modal */}
      {(viewCollection || viewLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-5xl max-h-[85vh] flex flex-col">
            {viewLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin text-slate-900 dark:text-white" />
              </div>
            ) : viewCollection && !viewFile ? (
              <>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-3">
                    {statusIcon(viewCollection.status)}
                    <div>
                      <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                        {t("nodes.collectionDetail")} #{viewCollection.id}
                      </h3>
                      <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
                        <span>{statusLabel(viewCollection.status)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { if (confirm(t("nodes.confirmDeleteCollection"))) deleteCollection(viewCollection.id); }}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => setViewCollection(null)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                      <X className="h-5 w-5 text-slate-400" />
                    </button>
                  </div>
                </div>

                <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800 grid grid-cols-3 gap-4 text-xs text-slate-500 dark:text-slate-400">
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{t("nodes.collectionWorker")}</span>
                    <p>{viewCollection.worker ?? "—"}</p>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{t("nodes.collectionStarted")}</span>
                    <p>{viewCollection.startedAt ? new Date(viewCollection.startedAt).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "medium" }) : "—"}</p>
                  </div>
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-300">{t("nodes.collectionCompleted")}</span>
                    <p>{viewCollection.completedAt ? new Date(viewCollection.completedAt).toLocaleString(dateLocale, { dateStyle: "short", timeStyle: "medium" }) : "—"}</p>
                  </div>
                </div>

                <div className="px-6 py-3 border-b border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2 flex-wrap">
                    {viewCollection.tags.map((t_tag) => (
                      <span key={t_tag} className="inline-flex items-center gap-1 rounded-full pl-2.5 pr-1 py-1 text-xs font-medium text-violet-700 bg-violet-50 ring-1 ring-inset ring-violet-600/20 dark:text-violet-400 dark:bg-violet-500/10 dark:ring-violet-500/20">
                        <Tag className="h-3 w-3" />
                        {t_tag}
                        <button
                          onClick={() => removeCollectionTag(viewCollection.id, t_tag)}
                          className="ml-0.5 p-0.5 rounded-full hover:bg-violet-200 dark:hover:bg-violet-500/30 transition-colors"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <form
                      className="inline-flex"
                      onSubmit={(e) => {
                        e.preventDefault();
                        const val = newTag.trim();
                        if (val) {
                          addCollectionTag(viewCollection.id, val);
                          setNewTag("");
                        }
                      }}
                    >
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder={t("nodes.addTagPlaceholder")}
                        className="h-7 w-28 rounded-full border border-dashed border-slate-300 dark:border-slate-600 bg-transparent px-2.5 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-violet-400 focus:outline-none transition-colors"
                      />
                    </form>
                  </div>
                </div>

                {viewCollection.error && (
                  <div className="mx-6 my-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3">
                    <p className="text-sm text-red-700 dark:text-red-400 font-medium">{t("nodes.collectionError")}</p>
                    <p className="text-xs text-red-600 dark:text-red-300 mt-1 font-mono">{viewCollection.error}</p>
                  </div>
                )}

                <div className="flex-1 overflow-y-auto">
                  {viewCollection.rules.length === 0 ? (
                    <div className="p-8 text-center">
                      <p className="text-sm text-slate-400 dark:text-slate-500">{t("nodes.noCollectionFiles")}</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                      {viewCollection.rules.map((rule) => (
                        <div key={rule.name}>
                          <button
                            onClick={() => setExpandedRules((prev) => {
                              const next = new Set(prev);
                              next.has(rule.name) ? next.delete(rule.name) : next.add(rule.name);
                              return next;
                            })}
                            className="w-full text-left flex items-center gap-3 px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                          >
                            {expandedRules.has(rule.name) ? (
                              <>
                                <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" />
                                <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
                              </>
                            ) : (
                              <>
                                <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />
                                <FolderClosed className="h-4 w-4 text-amber-500 shrink-0" />
                              </>
                            )}
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 flex-1">{rule.name}</span>
                            <span className="text-xs text-slate-400">{rule.files.length} {rule.files.length === 1 ? "file" : "files"}</span>
                          </button>
                          {expandedRules.has(rule.name) && (
                            <div className="border-t border-slate-50 dark:border-slate-800/50">
                              {rule.files.map((file) => (
                                <button
                                  key={file.filename}
                                  onClick={() => openFile(viewCollection.id, rule.name, file.filename)}
                                  className="w-full text-left flex items-center gap-3 pl-16 pr-6 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
                                >
                                  <FileText className="h-4 w-4 text-slate-400 shrink-0" />
                                  <span className="text-sm text-slate-700 dark:text-slate-300 flex-1 truncate">{file.filename}</span>
                                  <span className="text-xs text-slate-400">{formatSize(file.size)}</span>
                                  <Eye className="h-4 w-4 text-slate-300 dark:text-slate-600" />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            ) : viewCollection && viewFile ? (
              <>
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <button onClick={() => setViewFile(null)} className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                      <ArrowLeft className="h-4 w-4 text-slate-400" />
                    </button>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{viewFile.filename}</h3>
                  </div>
                  <button onClick={() => { setViewFile(null); setViewCollection(null); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                    <X className="h-5 w-5 text-slate-400" />
                  </button>
                </div>
                <div className="flex-1 overflow-auto p-4">
                  {fileLoading ? (
                    <div className="flex items-center justify-center py-12">
                      <Loader2 className="h-6 w-6 animate-spin text-slate-900 dark:text-white" />
                    </div>
                  ) : (
                    <pre className="text-xs font-mono text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-lg p-4 whitespace-pre-wrap break-words">{viewFile.content}</pre>
                  )}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}
