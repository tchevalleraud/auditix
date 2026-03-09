"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import Link from "next/link";
import {
  Loader2,
  ArrowLeft,
  ToggleLeft,
  ToggleRight,
  Save,
  CheckCircle2,
  BookOpen,
  ClipboardCheck,
  Server,
  BarChart3,
  Trash2,
  FolderOpen,
  FolderClosed,
  ChevronRight,
  ChevronDown,
  Ban,
  Package,
  FileText,
  Terminal,
  Plus,
  Pencil,
  X,
  Search,
  Link2,
  Tag,
  Minus,
  Play,
  XCircle,
  ShieldCheck,
} from "lucide-react";

interface PolicyDetail {
  id: number;
  name: string;
  description: string | null;
  enabled: boolean;
  createdAt: string;
}

interface PolicyRule {
  id: number;
  identifier: string | null;
  name: string;
  description: string | null;
  enabled: boolean;
  sourceType: string;
  folderPath?: string[];
}

interface PolicyFolder {
  id: number;
  name: string;
  children: PolicyFolder[];
  rules: PolicyRule[];
}

interface PolicyRulesData {
  folder: PolicyFolder | null;
  extraRules: PolicyRule[];
}

interface NodeTag {
  id: number;
  name: string;
  color: string;
}

interface PolicyNode {
  id: number;
  name: string | null;
  ipAddress: string;
  hostname: string | null;
  manufacturer: { id: number; name: string } | null;
  model: { id: number; name: string } | null;
  tags: NodeTag[];
}

interface PolicyResultEntry {
  ruleId: number;
  ruleIdentifier: string | null;
  ruleName: string;
  ruleDescription: string | null;
  status: string;
  severity: string | null;
  message: string | null;
  evaluatedAt: string;
}

interface PolicyNodeResult {
  node: { id: number; name: string | null; ipAddress: string; hostname: string | null; score: string | null; tags?: { id: number; name: string; color: string }[] };
  results: PolicyResultEntry[];
  stats: Record<string, number>;
  evaluatedAt: string | null;
}

const tabKeys = ["general", "rules", "nodes", "results"] as const;
type TabKey = (typeof tabKeys)[number];

export default function CompliancePolicyEditPage() {
  const { t } = useI18n();
  const params = useParams();
  const router = useRouter();
  const { current } = useAppContext();
  const policyId = params.id as string;

  const [policy, setPolicy] = useState<PolicyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>("general");

  // Edit fields
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Rules
  const [rulesData, setRulesData] = useState<PolicyRulesData>({ folder: null, extraRules: [] });
  const [loadingRules, setLoadingRules] = useState(false);
  const [rulesExpanded, setRulesExpanded] = useState<Set<string>>(new Set());
  const [showAddRuleModal, setShowAddRuleModal] = useState(false);
  const [allRules, setAllRules] = useState<PolicyRule[]>([]);
  const [addRuleSearch, setAddRuleSearch] = useState("");

  // Nodes
  const [policyNodes, setPolicyNodes] = useState<PolicyNode[]>([]);
  const [loadingNodes, setLoadingNodes] = useState(false);
  const [showAddNodeModal, setShowAddNodeModal] = useState(false);
  const [allNodes, setAllNodes] = useState<PolicyNode[]>([]);
  const [addNodeSearch, setAddNodeSearch] = useState("");
  const [showTagSelector, setShowTagSelector] = useState(false);
  const [availableTags, setAvailableTags] = useState<NodeTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [addingByTags, setAddingByTags] = useState(false);
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<number>>(new Set());
  const [nodeSearch, setNodeSearch] = useState("");
  const [filterTagId, setFilterTagId] = useState<number | null>(null);
  const [confirmBulkRemove, setConfirmBulkRemove] = useState(false);

  // Results
  const [policyResults, setPolicyResults] = useState<PolicyNodeResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [expandedResultNodes, setExpandedResultNodes] = useState<Set<number>>(new Set());
  // Per-node evaluation status: "pending" (queued, grey), "running" (in progress, blue), "done" (finished)
  const [nodeEvalStatus, setNodeEvalStatus] = useState<Record<number, "pending" | "running" | "done">>({});

  // Delete
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  const loadPolicy = useCallback(async () => {
    const res = await fetch(`/api/compliance-policies/${policyId}`);
    if (res.ok) {
      const data = await res.json();
      setPolicy(data);
      setName(data.name);
      setDescription(data.description || "");
      setEnabled(data.enabled);
    }
    setLoading(false);
  }, [policyId]);

  const loadRules = useCallback(async () => {
    setLoadingRules(true);
    try {
      const res = await fetch(`/api/compliance-policies/${policyId}/rules`);
      if (res.ok) {
        const data = await res.json();
        setRulesData(data);
        // Auto-expand root folder
        if (data.folder) setRulesExpanded((prev) => new Set(prev).add(`f-${data.folder.id}`));
      }
    } finally { setLoadingRules(false); }
  }, [policyId]);

  const loadNodes = useCallback(async () => {
    setLoadingNodes(true);
    try {
      const res = await fetch(`/api/compliance-policies/${policyId}/nodes`);
      if (res.ok) setPolicyNodes(await res.json());
    } finally { setLoadingNodes(false); }
  }, [policyId]);

  const loadAvailableTags = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/node-tags?context=${current.id}`);
    if (res.ok) setAvailableTags(await res.json());
  }, [current]);

  const loadResults = useCallback(async (silent = false) => {
    if (!silent) setLoadingResults(true);
    try {
      const res = await fetch(`/api/compliance-policies/${policyId}/results`);
      if (res.ok) setPolicyResults(await res.json());
    } finally { if (!silent) setLoadingResults(false); }
  }, [policyId]);

  useEffect(() => { loadPolicy(); }, [loadPolicy]);

  const resultsLoadedRef = useRef(false);
  const rulesLoadedRef = useRef(false);
  const nodesLoadedRef = useRef(false);

  useEffect(() => {
    if (activeTab === "rules" && !rulesLoadedRef.current) { rulesLoadedRef.current = true; loadRules(); }
    if (activeTab === "nodes" && !nodesLoadedRef.current) { nodesLoadedRef.current = true; loadNodes(); loadAvailableTags(); }
    if (activeTab === "results" && !resultsLoadedRef.current) { resultsLoadedRef.current = true; loadResults(); }
  }, [activeTab, loadRules, loadNodes, loadAvailableTags, loadResults]);

  // Mercure SSE for compliance results
  useEffect(() => {
    if (activeTab !== "results") return;
    const url = new URL("/.well-known/mercure", window.location.origin);
    url.searchParams.append("topic", `compliance/policy/${policyId}`);
    const es = new EventSource(url);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.event === "compliance.progress" && data.nodeId) {
        setNodeEvalStatus((prev) => ({ ...prev, [data.nodeId]: "running" }));
      }
      if (data.event === "compliance.evaluated" && data.nodeId) {
        setNodeEvalStatus((prev) => {
          const next = { ...prev, [data.nodeId]: "done" as const };
          // If all nodes are done, stop evaluating
          const allDone = Object.values(next).every((s) => s === "done");
          if (allDone) setTimeout(() => setEvaluating(false), 300);
          return next;
        });
        loadResults(true);
      }
    };
    return () => es.close();
  }, [activeTab, policyId, loadResults]);

  const saveGeneral = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/compliance-policies/${policyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          enabled,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPolicy(data);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    await fetch(`/api/compliance-policies/${policyId}`, { method: "DELETE" });
    router.push("/compliance/policies");
  };

  const inputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";

  const tabs = [
    { key: "general" as TabKey, label: t("compliance_policies.tabGeneral"), icon: <BookOpen className="h-4 w-4" /> },
    { key: "rules" as TabKey, label: t("compliance_policies.tabRules"), icon: <ClipboardCheck className="h-4 w-4" /> },
    { key: "nodes" as TabKey, label: t("compliance_policies.tabNodes"), icon: <Server className="h-4 w-4" /> },
    { key: "results" as TabKey, label: t("compliance_policies.tabResults"), icon: <BarChart3 className="h-4 w-4" /> },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  if (!policy) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-slate-500">{t("common.noResult")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center gap-4">
          <button onClick={() => router.push("/compliance/policies")} className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{policy.name}</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {t("compliance_policies.editPolicy")}
              {policy.description && <span> | {policy.description}</span>}
            </p>
          </div>
        </div>
        {saved && (
          <div className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            {t("compliance_policies.saved")}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 shrink-0">
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

      {/* General tab */}
      {activeTab === "general" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-6 space-y-5">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("compliance_policies.colName")}</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t("compliance_policies.namePlaceholder")}
                  className={inputCls}
                />
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("compliance_policies.colDescription")}</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder={t("compliance_policies.descriptionPlaceholder")}
                  className={`${inputCls} resize-none`}
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <button type="button" onClick={() => setEnabled(!enabled)}>
                  {enabled ? <ToggleRight className="h-6 w-6 text-emerald-500" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                </button>
                <span className="text-sm text-slate-700 dark:text-slate-300">
                  {enabled ? t("compliance_policies.enabled") : t("compliance_policies.disabled")}
                </span>
              </label>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={saveGeneral}
                disabled={saving || !name.trim()}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {t("common.save")}
              </button>
            </div>
          </div>

          {/* Danger zone */}
          <div className="rounded-xl border border-red-200 dark:border-red-500/20 bg-white dark:bg-slate-900 shadow-sm">
            <div className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-red-600 dark:text-red-400">{t("compliance_policies.dangerZone")}</h3>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("compliance_policies.dangerZoneDesc")}</p>
                </div>
                <button
                  onClick={() => setDeleteConfirm(true)}
                  className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("common.delete")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rules tab */}
      {activeTab === "rules" && (
        <div className="space-y-6">
          {loadingRules ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (() => {
            const folder = rulesData.folder;
            const hasContent = (folder && (folder.rules.length > 0 || folder.children.length > 0)) || rulesData.extraRules.length > 0;

            const countRulesInFolder = (f: PolicyFolder): number =>
              f.rules.length + f.children.reduce((s, c) => s + countRulesInFolder(c), 0);

            const toggleExpand = (key: string) => {
              setRulesExpanded((prev) => {
                const next = new Set(prev);
                next.has(key) ? next.delete(key) : next.add(key);
                return next;
              });
            };

            const plForDepth = (d: number) =>
              d === 0 ? "pl-4" : d === 1 ? "pl-14" : d === 2 ? "pl-20" : "pl-26";

            const renderRule = (rule: PolicyRule, depth: number, extra?: boolean) => (
              <div key={`rule-${rule.id}`} className={`flex items-center gap-3 ${plForDepth(depth)} pr-4 py-2.5 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group`}>
                <FileText className={`h-4 w-4 shrink-0 ${rule.enabled ? "text-emerald-500" : "text-slate-300 dark:text-slate-600"}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {rule.identifier && (
                      <code className="text-xs text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 rounded px-2 py-0.5 font-mono">{rule.identifier}</code>
                    )}
                    <Link href={`/compliance/rules/${rule.id}`} className={`text-sm font-medium hover:underline ${rule.enabled ? "text-slate-900 dark:text-slate-100" : "text-slate-400 dark:text-slate-500 line-through"}`}>{rule.name}</Link>
                    {!rule.enabled && (
                      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-slate-500 bg-slate-100 ring-1 ring-inset ring-slate-200 dark:text-slate-400 dark:bg-slate-800 dark:ring-slate-700">{t("compliance_policies.ruleDisabled")}</span>
                    )}
                  </div>
                  {rule.description && <p className="text-xs text-slate-400 dark:text-slate-500 truncate">{rule.description}</p>}
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Link href={`/compliance/rules/${rule.id}`} className="rounded-lg p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-200/50 dark:hover:bg-slate-700/50 transition-colors">
                    <Pencil className="h-3.5 w-3.5" />
                  </Link>
                  {extra && (
                    <button
                      onClick={async () => {
                        await fetch(`/api/compliance-policies/${policyId}/rules/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleId: rule.id }) });
                        loadRules();
                      }}
                      className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      title={t("compliance_policies.removeExtraRule")}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );

            const renderFolder = (f: PolicyFolder, depth: number) => {
              const key = `f-${f.id}`;
              const isExp = rulesExpanded.has(key);
              const folderPl = depth === 0 ? "pl-4" : depth === 1 ? "pl-10" : depth === 2 ? "pl-16" : "pl-22";
              return (
                <div key={key}>
                  <div className={`flex items-center gap-3 ${folderPl} pr-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group`}>
                    <button onClick={() => toggleExpand(key)} className="shrink-0">
                      {isExp ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    </button>
                    <button onClick={() => toggleExpand(key)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      {isExp ? <FolderOpen className="h-5 w-5 text-blue-500 shrink-0" /> : <FolderClosed className="h-5 w-5 text-blue-500 shrink-0" />}
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{f.name}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">{countRulesInFolder(f)} {t("compliance_rules.rule")}{countRulesInFolder(f) !== 1 ? "s" : ""}</span>
                    </button>
                  </div>
                  {isExp && (
                    <>
                      {f.children.map((child) => renderFolder(child, depth + 1))}
                      {f.rules.map((r) => renderRule(r, depth + 1))}
                    </>
                  )}
                </div>
              );
            };

            // Build virtual folder tree from extra rules based on folderPath arrays
            interface VirtualFolder { key: string; name: string; children: VirtualFolder[]; rules: PolicyRule[]; }
            const buildExtraTree = (rules: PolicyRule[]): { rootRules: PolicyRule[]; folders: VirtualFolder[] } => {
              const rootRules: PolicyRule[] = [];
              const folderMap = new Map<string, VirtualFolder>();

              const getOrCreateFolder = (pathSegments: string[]): VirtualFolder => {
                const key = `extra-${pathSegments.join("/")}`;
                if (folderMap.has(key)) return folderMap.get(key)!;
                const vf: VirtualFolder = { key, name: pathSegments[pathSegments.length - 1], children: [], rules: [] };
                folderMap.set(key, vf);
                if (pathSegments.length > 1) {
                  const parent = getOrCreateFolder(pathSegments.slice(0, -1));
                  if (!parent.children.find((c) => c.key === key)) parent.children.push(vf);
                }
                return vf;
              };

              for (const rule of rules) {
                if (!rule.folderPath || rule.folderPath.length === 0) {
                  rootRules.push(rule);
                } else {
                  const leaf = getOrCreateFolder(rule.folderPath);
                  leaf.rules.push(rule);
                }
              }

              // Collect only top-level folders (depth 1)
              const topFolders: VirtualFolder[] = [];
              for (const [, vf] of folderMap) {
                const segments = vf.key.replace("extra-", "").split("/");
                if (segments.length === 1) topFolders.push(vf);
              }
              topFolders.sort((a, b) => a.name.localeCompare(b.name));
              return { rootRules, folders: topFolders };
            };

            const countVirtualRules = (vf: VirtualFolder): number =>
              vf.rules.length + vf.children.reduce((s, c) => s + countVirtualRules(c), 0);

            const renderVirtualFolder = (vf: VirtualFolder, depth: number) => {
              const isExp = rulesExpanded.has(vf.key);
              const folderPl = depth === 0 ? "pl-4" : depth === 1 ? "pl-10" : depth === 2 ? "pl-16" : "pl-22";
              return (
                <div key={vf.key}>
                  <div className={`flex items-center gap-3 ${folderPl} pr-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group`}>
                    <button onClick={() => toggleExpand(vf.key)} className="shrink-0">
                      {isExp ? <ChevronDown className="h-4 w-4 text-slate-400" /> : <ChevronRight className="h-4 w-4 text-slate-400" />}
                    </button>
                    <button onClick={() => toggleExpand(vf.key)} className="flex items-center gap-2 flex-1 min-w-0 text-left">
                      {isExp ? <FolderOpen className="h-5 w-5 text-blue-500 shrink-0" /> : <FolderClosed className="h-5 w-5 text-blue-500 shrink-0" />}
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{vf.name}</span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">{countVirtualRules(vf)} {t("compliance_rules.rule")}{countVirtualRules(vf) !== 1 ? "s" : ""}</span>
                    </button>
                  </div>
                  {isExp && (
                    <>
                      {vf.children.map((child) => renderVirtualFolder(child, depth + 1))}
                      {vf.rules.map((r) => renderRule(r, depth + 1, true))}
                    </>
                  )}
                </div>
              );
            };

            if (!hasContent) {
              return (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
                  <ClipboardCheck className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                  <p className="text-sm text-slate-500 dark:text-slate-400">{t("compliance_policies.noRulesInPolicy")}</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("compliance_policies.noRulesInPolicyDesc")}</p>
                  <button onClick={() => { setShowAddRuleModal(true); setAddRuleSearch(""); }} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                    <Plus className="h-4 w-4" />
                    {t("compliance_policies.addExtraRule")}
                  </button>
                </div>
              );
            }

            const extraTree = buildExtraTree(rulesData.extraRules);

            return (
              <>
                <div className="flex items-center justify-end">
                  <button onClick={() => { setShowAddRuleModal(true); setAddRuleSearch(""); }} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                    <Link2 className="h-4 w-4" />
                    {t("compliance_policies.addExtraRule")}
                  </button>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {folder && renderFolder(folder, 0)}
                    {rulesData.extraRules.length > 0 && (
                      <>
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-50/50 dark:bg-slate-800/30">
                          <Link2 className="h-4 w-4 text-indigo-500 shrink-0" />
                          <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{t("compliance_policies.extraRulesSection")}</span>
                          <span className="text-xs text-slate-400">{rulesData.extraRules.length}</span>
                        </div>
                        {extraTree.folders.map((vf) => renderVirtualFolder(vf, 0))}
                        {extraTree.rootRules.map((r) => renderRule(r, 0, true))}
                      </>
                    )}
                  </div>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Add extra rule modal */}
      {showAddRuleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_policies.addExtraRule")}</h3>
              <button onClick={() => setShowAddRuleModal(false)} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={addRuleSearch}
                onChange={(e) => setAddRuleSearch(e.target.value)}
                onFocus={() => {
                  if (allRules.length === 0 && current) {
                    fetch(`/api/compliance-rules/tree?context=${current.id}`).then((r) => r.json()).then((tree) => {
                      const flat: PolicyRule[] = [];
                      const flatten = (folders: PolicyFolder[]) => {
                        for (const f of folders) {
                          flat.push(...f.rules);
                          if (f.children) flatten(f.children);
                        }
                      };
                      flatten(tree.folders || []);
                      if (tree.rootRules) flat.push(...tree.rootRules);
                      setAllRules(flat);
                    });
                  }
                }}
                placeholder={t("compliance_policies.searchRulePlaceholder")}
                className={`${inputCls} pl-9`}
              />
            </div>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {(() => {
                const existingIds = new Set<number>();
                if (rulesData.folder) {
                  const collect = (f: PolicyFolder) => { f.rules.forEach((r) => existingIds.add(r.id)); f.children.forEach(collect); };
                  collect(rulesData.folder);
                }
                rulesData.extraRules.forEach((r) => existingIds.add(r.id));

                const q = addRuleSearch.toLowerCase();
                const filtered = allRules.filter((r) => !existingIds.has(r.id) && (!q || (r.name.toLowerCase().includes(q)) || (r.identifier && r.identifier.toLowerCase().includes(q))));

                if (filtered.length === 0) {
                  return <div className="px-3 py-6 text-center text-sm text-slate-400">{t("common.noResult")}</div>;
                }
                return filtered.slice(0, 30).map((r) => (
                  <button
                    key={r.id}
                    onClick={async () => {
                      await fetch(`/api/compliance-policies/${policyId}/rules/add`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ruleId: r.id }) });
                      setShowAddRuleModal(false);
                      loadRules();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <FileText className={`h-4 w-4 shrink-0 ${r.enabled ? "text-emerald-500" : "text-slate-300"}`} />
                    <div className="text-left min-w-0">
                      <div className="flex items-center gap-2">
                        {r.identifier && <code className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 rounded px-1.5 py-0.5 font-mono">{r.identifier}</code>}
                        <span className="font-medium truncate">{r.name}</span>
                      </div>
                    </div>
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Nodes tab */}
      {activeTab === "nodes" && (
        <div className="space-y-6">
          {loadingNodes ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : (() => {
            const q = nodeSearch.toLowerCase();
            const filteredNodes = policyNodes.filter((n) => {
              if (q && !(
                (n.name && n.name.toLowerCase().includes(q)) ||
                n.ipAddress.includes(q) ||
                (n.hostname && n.hostname.toLowerCase().includes(q)) ||
                (n.manufacturer && n.manufacturer.name.toLowerCase().includes(q)) ||
                (n.model && n.model.name.toLowerCase().includes(q))
              )) return false;
              if (filterTagId !== null && !n.tags.some((t2) => t2.id === filterTagId)) return false;
              return true;
            });
            const allFilteredSelected = filteredNodes.length > 0 && filteredNodes.every((n) => selectedNodeIds.has(n.id));
            const someSelected = selectedNodeIds.size > 0;

            return (
              <>
                {/* Actions bar */}
                <div className="flex items-center gap-3 justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative shrink-0">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <input
                        type="text"
                        value={nodeSearch}
                        onChange={(e) => setNodeSearch(e.target.value)}
                        placeholder={t("compliance_policies.searchNodePlaceholder")}
                        className={`${inputCls} pl-9 w-64`}
                      />
                    </div>
                    {availableTags.length > 0 && (
                      <select
                        value={filterTagId ?? ""}
                        onChange={(e) => setFilterTagId(e.target.value ? Number(e.target.value) : null)}
                        className={`${inputCls} w-auto shrink-0`}
                      >
                        <option value="">{t("compliance_policies.allTags")}</option>
                        {availableTags.map((tag) => (
                          <option key={tag.id} value={tag.id}>{tag.name}</option>
                        ))}
                      </select>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    {someSelected && (
                      <button
                        onClick={() => setConfirmBulkRemove(true)}
                        className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("compliance_policies.removeSelectedNodes", { count: String(selectedNodeIds.size) })}
                      </button>
                    )}
                    <button onClick={() => { setShowTagSelector(true); setSelectedTagIds([]); }} className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                      <Tag className="h-4 w-4" />
                      {t("compliance_policies.addByTags")}
                    </button>
                    <button onClick={() => { setShowAddNodeModal(true); setAddNodeSearch(""); setAllNodes([]); }} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                      <Plus className="h-4 w-4" />
                      {t("compliance_policies.addNode")}
                    </button>
                  </div>
                </div>

                {policyNodes.length === 0 ? (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
                    <Server className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">{t("compliance_policies.noNodesInPolicy")}</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("compliance_policies.noNodesInPolicyDesc")}</p>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-100 dark:border-slate-800 text-left">
                          <th className="px-4 py-3 w-10">
                            <input
                              type="checkbox"
                              checked={allFilteredSelected}
                              onChange={() => {
                                if (allFilteredSelected) {
                                  setSelectedNodeIds((prev) => {
                                    const next = new Set(prev);
                                    filteredNodes.forEach((n) => next.delete(n.id));
                                    return next;
                                  });
                                } else {
                                  setSelectedNodeIds((prev) => {
                                    const next = new Set(prev);
                                    filteredNodes.forEach((n) => next.add(n.id));
                                    return next;
                                  });
                                }
                              }}
                              className="rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400"
                            />
                          </th>
                          <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t("nodes.colName")}</th>
                          <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t("nodes.colIpAddress")}</th>
                          <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t("nodes.colManufacturer")}</th>
                          <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t("nodes.colModel")}</th>
                          <th className="px-4 py-3 font-medium text-slate-500 dark:text-slate-400">{t("tags.title")}</th>
                          <th className="px-4 py-3 w-12"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {filteredNodes.map((node) => (
                          <tr key={node.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group ${selectedNodeIds.has(node.id) ? "bg-slate-50 dark:bg-slate-800/40" : ""}`}>
                            <td className="px-4 py-3">
                              <input
                                type="checkbox"
                                checked={selectedNodeIds.has(node.id)}
                                onChange={() => {
                                  setSelectedNodeIds((prev) => {
                                    const next = new Set(prev);
                                    next.has(node.id) ? next.delete(node.id) : next.add(node.id);
                                    return next;
                                  });
                                }}
                                className="rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400"
                              />
                            </td>
                            <td className="px-4 py-3">
                              <Link href={`/nodes/${node.id}`} className="font-medium text-slate-900 dark:text-slate-100 hover:underline">
                                {node.name || node.hostname || node.ipAddress}
                              </Link>
                              {node.hostname && node.name && (
                                <p className="text-xs text-slate-400 dark:text-slate-500">{node.hostname}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{node.ipAddress}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{node.manufacturer?.name || "—"}</td>
                            <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{node.model?.name || "—"}</td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 flex-wrap">
                                {node.tags.slice(0, 3).map((tag) => (
                                  <span key={tag.id} className="inline-flex rounded-full px-1.5 py-0 text-[10px] font-medium text-white" style={{ backgroundColor: tag.color }}>{tag.name}</span>
                                ))}
                                {node.tags.length > 3 && (
                                  <span className="text-[10px] text-slate-400">+{node.tags.length - 3}</span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <button
                                onClick={async () => {
                                  await fetch(`/api/compliance-policies/${policyId}/nodes/remove`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodeIds: [node.id] }) });
                                  loadNodes();
                                  setSelectedNodeIds((prev) => { const next = new Set(prev); next.delete(node.id); return next; });
                                }}
                                className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors opacity-0 group-hover:opacity-100"
                                title={t("compliance_policies.removeNode")}
                              >
                                <Minus className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {filteredNodes.length === 0 && policyNodes.length > 0 && (
                          <tr>
                            <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">{t("common.noResult")}</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      {/* Add node modal */}
      {showAddNodeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg p-6 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_policies.addNode")}</h3>
              <button onClick={() => setShowAddNodeModal(false)} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={addNodeSearch}
                onChange={(e) => setAddNodeSearch(e.target.value)}
                onFocus={() => {
                  if (allNodes.length === 0 && current) {
                    fetch(`/api/nodes?context=${current.id}`).then((r) => r.json()).then((data) => setAllNodes(data));
                  }
                }}
                placeholder={t("compliance_policies.searchNodePlaceholder")}
                className={`${inputCls} pl-9`}
              />
            </div>
            <div className="max-h-60 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700 divide-y divide-slate-100 dark:divide-slate-800">
              {(() => {
                const existingIds = new Set(policyNodes.map((n) => n.id));
                const q = addNodeSearch.toLowerCase();
                const filtered = allNodes.filter((n) => !existingIds.has(n.id) && (!q || (n.name && n.name.toLowerCase().includes(q)) || n.ipAddress.includes(q) || (n.hostname && n.hostname.toLowerCase().includes(q))));

                if (filtered.length === 0) {
                  return <div className="px-3 py-6 text-center text-sm text-slate-400">{t("common.noResult")}</div>;
                }
                return filtered.slice(0, 30).map((n) => (
                  <button
                    key={n.id}
                    onClick={async () => {
                      await fetch(`/api/compliance-policies/${policyId}/nodes/add`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nodeIds: [n.id] }) });
                      setShowAddNodeModal(false);
                      loadNodes();
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >
                    <Server className="h-4 w-4 shrink-0 text-slate-400" />
                    <div className="text-left min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium truncate">{n.name || n.hostname || n.ipAddress}</span>
                        <span className="text-xs text-slate-400 font-mono">{n.ipAddress}</span>
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        {n.tags.slice(0, 3).map((tag) => (
                          <span key={tag.id} className="inline-flex rounded-full px-1.5 py-0 text-[10px] font-medium text-white" style={{ backgroundColor: tag.color }}>{tag.name}</span>
                        ))}
                      </div>
                    </div>
                  </button>
                ));
              })()}
            </div>
          </div>
        </div>
      )}

      {/* Add by tags modal */}
      {showTagSelector && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance_policies.addByTags")}</h3>
              <button onClick={() => setShowTagSelector(false)} className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t("compliance_policies.addByTagsDesc")}</p>
            {availableTags.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">{t("tags.noTags")}</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {availableTags.map((tag) => {
                  const isSelected = selectedTagIds.includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => setSelectedTagIds((prev) => isSelected ? prev.filter((id) => id !== tag.id) : [...prev, tag.id])}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${isSelected ? "ring-2 ring-offset-1 ring-slate-900 dark:ring-white" : "opacity-50 hover:opacity-80"}`}
                      style={{ backgroundColor: tag.color, color: "white" }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={() => setShowTagSelector(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                disabled={selectedTagIds.length === 0 || addingByTags}
                onClick={async () => {
                  setAddingByTags(true);
                  try {
                    await fetch(`/api/compliance-policies/${policyId}/nodes/add-by-tags`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tagIds: selectedTagIds }) });
                    setShowTagSelector(false);
                    loadNodes();
                  } finally { setAddingByTags(false); }
                }}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {addingByTags ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                {t("compliance_policies.addMatchingNodes")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk remove nodes confirmation */}
      {confirmBulkRemove && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("compliance_policies.confirmRemoveNodes", { count: String(selectedNodeIds.size) })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmBulkRemove(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={async () => {
                  await fetch(`/api/compliance-policies/${policyId}/nodes/remove`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ nodeIds: Array.from(selectedNodeIds) }),
                  });
                  setSelectedNodeIds(new Set());
                  setConfirmBulkRemove(false);
                  loadNodes();
                }}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results tab */}
      {activeTab === "results" && (
        <div className="space-y-6">
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={async () => {
                setEvaluating(true);
                const res = await fetch(`/api/compliance-policies/${policyId}/evaluate`, { method: "POST" });
                if (res.ok) {
                  const data = await res.json();
                  const ids: number[] = data.nodeIds || [];
                  const pending: Record<number, "pending"> = {};
                  ids.forEach((id) => { pending[id] = "pending"; });
                  setNodeEvalStatus(pending);
                }
              }}
              disabled={evaluating}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {evaluating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {evaluating ? t("compliance_policies.evaluating") : t("compliance_policies.evaluateAll")}
            </button>
            <button
              onClick={() => setLegendOpen(true)}
              className="flex items-center justify-center h-10 w-10 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm font-semibold"
            >
              ?
            </button>
          </div>

          {loadingResults ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
            </div>
          ) : policyResults.length === 0 ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
              <BarChart3 className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("compliance_policies.noResults")}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("compliance_policies.noResultsDesc")}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {[...policyResults].sort((a, b) => {
                  const aLabel = (a.node.hostname || a.node.name || a.node.ipAddress || "").toLowerCase();
                  const bLabel = (b.node.hostname || b.node.name || b.node.ipAddress || "").toLowerCase();
                  return aLabel.localeCompare(bLabel);
                }).map((nr) => {
                  const isExp = expandedResultNodes.has(nr.node.id);
                  const total = Object.values(nr.stats).reduce((a, b) => a + b, 0);
                  const evalStatus = nodeEvalStatus[nr.node.id];
                  const isNodeEvaluating = evalStatus === "pending" || evalStatus === "running";
                  const scoreCls = nr.node.score === "A" ? "bg-emerald-500" : nr.node.score === "B" ? "bg-green-500" : nr.node.score === "C" ? "bg-yellow-500" : nr.node.score === "D" ? "bg-orange-500" : nr.node.score === "E" ? "bg-red-500" : nr.node.score === "F" ? "bg-red-700" : "bg-slate-300 dark:bg-slate-600";

                  return (
                    <div key={nr.node.id}>
                      <div className="flex items-center">
                        <button
                          onClick={() => setExpandedResultNodes((prev) => { const next = new Set(prev); next.has(nr.node.id) ? next.delete(nr.node.id) : next.add(nr.node.id); return next; })}
                          className="flex-1 flex items-center gap-4 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
                        >
                          {isExp ? <ChevronDown className="h-4 w-4 text-slate-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-slate-400 shrink-0" />}
                          {isNodeEvaluating ? (
                            <span className={`inline-flex items-center justify-center h-7 w-7 rounded-lg ${evalStatus === "running" ? "bg-blue-500" : "bg-slate-300 dark:bg-slate-600"}`}>
                              <Loader2 className="h-4 w-4 animate-spin text-white" />
                            </span>
                          ) : (
                            <span className={`inline-flex items-center justify-center h-7 w-7 rounded-lg text-xs font-bold text-white ${scoreCls}`}>
                              {nr.node.score || "?"}
                            </span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{nr.node.hostname || nr.node.name || nr.node.ipAddress}</span>
                              <span className="text-xs text-slate-400 font-mono">{nr.node.ipAddress}</span>
                              {nr.node.tags?.map((tag) => (
                                <span key={tag.id} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-white" style={{ backgroundColor: tag.color }}>
                                  {tag.name}
                                </span>
                              ))}
                            </div>
                          </div>
                          {isNodeEvaluating ? (
                            <span className={`text-xs shrink-0 ${evalStatus === "running" ? "text-blue-500" : "text-slate-400"}`}>
                              {evalStatus === "running" ? t("compliance_policies.evaluating") : t("compliance.pending")}
                            </span>
                          ) : (() => {
                            const c = nr.stats.compliant || 0;
                            const nc = nr.stats.non_compliant || 0;
                            const err = nr.stats.error || 0;
                            const na = nr.stats.not_applicable || 0;
                            const t2 = c + nc + err + na;
                            if (t2 === 0) return null;
                            const pC = (c / t2) * 100;
                            const pNC = ((c + nc) / t2) * 100;
                            const pErr = ((c + nc + err) / t2) * 100;
                            return (
                              <div className="flex items-center gap-2.5 shrink-0 w-56">
                                <div className="h-2.5 flex-1 rounded-full overflow-hidden relative">
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
                                <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">{c}/{t2}</span>
                              </div>
                            );
                          })()}
                        </button>
                        {!isNodeEvaluating && (
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              await fetch(`/api/compliance-policies/${policyId}/results/${nr.node.id}`, { method: "DELETE" });
                              setPolicyResults((prev) => prev.filter((p) => p.node.id !== nr.node.id));
                            }}
                            className="shrink-0 p-2.5 mr-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title={t("compliance_policies.deleteResults")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      {isExp && (
                        <div className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
                          {nr.results.filter((r) => r.status !== "skipped").map((r) => {
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
        </div>
      )}

      {/* Delete confirmation */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("compliance_policies.confirmDelete", { name: policy.name })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteConfirm(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleDelete}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors"
              >
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Legend modal */}
      {legendOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("compliance.legend")}</h3>
              <button onClick={() => setLegendOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-3">
                <h4 className="text-xs font-semibold uppercase text-slate-400 tracking-wider">{t("compliance.legendIcons")}</h4>
                <div className="flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{t("compliance.legendCompliant")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Ban className="h-5 w-5 text-red-500 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{t("compliance.legendNonCompliant")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="relative inline-flex h-5 w-5 shrink-0">
                    <XCircle className="h-5 w-5 text-red-500" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="block w-[22px] h-[2px] bg-red-500 rotate-45 rounded-full" />
                    </span>
                  </span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">{t("compliance.legendError")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Minus className="h-5 w-5 text-slate-400 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{t("compliance.legendNotApplicable")}</span>
                </div>
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800 pt-4 space-y-3">
                <h4 className="text-xs font-semibold uppercase text-slate-400 tracking-wider">{t("compliance.legendProgressBar")}</h4>
                <div className="flex items-center gap-3">
                  <span className="inline-block h-3 w-6 rounded-full bg-emerald-500 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{t("compliance.legendCompliant")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-block h-3 w-6 rounded-full bg-red-500 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{t("compliance.legendNonCompliant")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-block h-3 w-6 rounded-full shrink-0 overflow-hidden relative">
                    <span className="absolute inset-0 bg-red-500" />
                    <span className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(255,255,255,0.35) 2px, rgba(255,255,255,0.35) 4px)" }} />
                  </span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">{t("compliance.legendError")}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-block h-3 w-6 rounded-full bg-slate-200 dark:bg-slate-600 shrink-0" />
                  <span className="text-sm text-slate-700 dark:text-slate-300">{t("compliance.legendNotApplicable")}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
