"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import { ArrowLeft, Loader2, Play, Tag, CheckCircle2, XCircle, Clock, FileText, Eye, Trash2, X, FolderOpen, FolderClosed, ChevronRight, ChevronDown, Plus } from "lucide-react";

interface Manufacturer { id: number; name: string; logo: string | null }
interface Model { id: number; name: string; manufacturer?: { id: number } | null }
interface ProfileItem { id: number; name: string }

interface NodeDetail {
  id: number;
  name: string | null;
  ipAddress: string;
  hostname: string | null;
  score: string | null;
  policy: string;
  discoveredModel: string | null;
  discoveredVersion: string | null;
  isReachable: boolean | null;
  lastPingAt: string | null;
  monitoringEnabled: boolean;
  manufacturer: { id: number; name: string; logo: string | null } | null;
  model: { id: number; name: string } | null;
  profile: { id: number; name: string } | null;
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

type TabKey = "summary" | "settings" | "collections";

export default function NodeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const nodeId = params.id as string;

  const [tab, setTab] = useState<TabKey>("summary");
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

  // Collections state
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectModal, setCollectModal] = useState(false);
  const [collectTag, setCollectTag] = useState("");
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

  const dateLocale = locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  const loadData = useCallback(async () => {
    if (!current) return;
    const [nRes, mRes, mdRes, pRes] = await Promise.all([
      fetch(`/api/nodes?context=${current.id}`),
      fetch(`/api/manufacturers?context=${current.id}`),
      fetch(`/api/models?context=${current.id}`),
      fetch(`/api/profiles?context=${current.id}`),
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

      const mfId = found.manufacturer ? String(found.manufacturer.id) : "";
      setFilteredModels(mfId ? loadedModels.filter((m) => m.manufacturer && m.manufacturer.id === Number(mfId)) : loadedModels);
    }
    if (mRes.ok) setManufacturers(await mRes.json());
    if (pRes.ok) setProfiles(await pRes.json());
    setFetchLoading(false);
  }, [nodeId, current]);

  useEffect(() => { loadData(); }, [loadData]);

  const loadCollections = useCallback(async () => {
    setCollectionsLoading(true);
    const res = await fetch(`/api/collections/by-node/${nodeId}`);
    if (res.ok) setCollections(await res.json());
    setCollectionsLoading(false);
  }, [nodeId]);

  useEffect(() => {
    if (tab === "collections") loadCollections();
  }, [tab, loadCollections]);

  // Mercure SSE for real-time updates
  useEffect(() => {
    if (!current) return;
    const url = new URL("/.well-known/mercure", window.location.origin);
    url.searchParams.append("topic", `nodes/context/${current.id}`);
    url.searchParams.append("topic", `collections/node/${nodeId}`);
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
    };
    return () => es.close();
  }, [current, nodeId]);

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
        body: JSON.stringify({ nodeIds: [Number(nodeId)], tag: collectTag.trim() || null }),
      });
      setCollectModal(false);
      setCollectTag("");
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

  const tabs: { key: TabKey; label: string }[] = [
    { key: "summary", label: t("nodes.tabSummary") },
    { key: "collections", label: t("nodes.tabCollections") },
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
    <div className="space-y-6">
      <div>
        <Link href="/nodes" className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-3">
          <ArrowLeft className="h-4 w-4" />
          {t("nodes.title")}
        </Link>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {node.score ? (
              <div className={`flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold text-white ${scoreColors[node.score] ?? "bg-slate-300 dark:bg-slate-600"}`}>{node.score}</div>
            ) : (
              <div className="h-9 w-9 rounded-full bg-slate-200 dark:bg-slate-700" />
            )}
            <div>
              <h1 className="flex items-center gap-3 text-2xl font-bold text-slate-900 dark:text-slate-100">
                {node.name || node.ipAddress}
                {node.name && (
                  <span className="flex items-center gap-1.5 text-base font-normal text-slate-400 dark:text-slate-500 font-mono">
                    {node.ipAddress}
                    {node.monitoringEnabled && (
                      <span className={`inline-block h-2 w-2 rounded-full ${node.isReachable === null ? "bg-slate-300 dark:bg-slate-600" : node.isReachable ? "bg-emerald-500" : "bg-red-500"}`} />
                    )}
                  </span>
                )}
                {!node.name && node.monitoringEnabled && (
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${node.isReachable === null ? "bg-slate-300 dark:bg-slate-600" : node.isReachable ? "bg-emerald-500" : "bg-red-500"}`} />
                )}
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
              </div>
            </div>
          </div>
          {node.model && (
            <button
              onClick={() => { setCollectTag(""); setCollectModal(true); }}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              <Play className="h-4 w-4" />
              {t("nodes.collect")}
            </button>
          )}
        </div>
      </div>

      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex gap-6">
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
              {tb.label}
            </button>
          ))}
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
          {selectedCollections.size > 0 && (
            <div className="flex items-center gap-3">
              <button
                onClick={deleteSelectedCollections}
                disabled={deletingSelected}
                className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 transition-colors"
              >
                {deletingSelected ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {t("nodes.deleteSelected", { count: String(selectedCollections.size) })}
              </button>
            </div>
          )}
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

      {tab === "settings" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <form onSubmit={handleSave} className="p-6 space-y-5">
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
            <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <button type="submit" disabled={saving || !ipAddress.trim()} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </button>
              {saved && <span className="text-sm text-green-600 dark:text-green-400">{t("nodes.saved")}</span>}
            </div>
          </form>
          <div className="px-6 pb-6 pt-2">
            <div className="border-t border-red-200 dark:border-red-500/20 pt-5">
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
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md">
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
                <input
                  type="text"
                  value={collectTag}
                  onChange={(e) => setCollectTag(e.target.value)}
                  placeholder={t("nodes.collectTagPlaceholder")}
                  className={inputClass}
                />
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
