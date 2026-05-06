"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Plus,
  Loader2,
  Search,
  Server,
  Wifi,
  Play,
  Tag,
  X,
  CheckCircle2,
  ShieldCheck,
  ScanSearch,
  HelpCircle,
  Ban,
  Minus,
  AlertTriangle,
  ChevronDown,
  Trash2,
  Upload,
  Pencil,
  FileSpreadsheet,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  RefreshCw,
} from "lucide-react";
import CsvImportModal from "@/components/CsvImportModal";
import { renderCell, getSortValue, type NodeRow, type NodeExtras, type FieldRef } from "@/components/NodeCellRenderer";

interface NodeTag {
  id: number;
  name: string;
  color: string;
}

interface NodeDynamicTag extends NodeTag {
  ruleId: number | null;
  ruleName: string | null;
}

interface NodeItem extends NodeRow {}

interface CatalogField {
  key: string;
  category: string;
  sortable?: boolean;
  reactive?: boolean;
  primaryOnly?: boolean;
  parameterized?: boolean;
}

interface CatalogCategory { key: string; labelKey: string; }

interface ColumnDef {
  id: string;
  primary: FieldRef;
  secondary: FieldRef | null;
  labelOverride?: string;
  align?: "left" | "center" | "right";
  width?: "auto" | "min";
  minWidth?: number;
}

interface ColumnsConfig {
  columns: ColumnDef[];
  pageSize?: number;
  defaultSort?: { column: string; direction: "asc" | "desc" } | null;
}

export default function NodesPage() {
  const { t, locale } = useI18n();
  const { current, userInfo } = useAppContext();
  const router = useRouter();
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [search, setSearch] = useState("");
  const [fetchLoading, setFetchLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pinging, setPinging] = useState(false);
  const [collectModal, setCollectModal] = useState(false);
  const [collectTags, setCollectTags] = useState<string[]>([]);
  const [collectTagInput, setCollectTagInput] = useState("");
  const [collecting, setCollecting] = useState(false);
  const [complianceStats, setComplianceStats] = useState<Record<number, { compliant: number; non_compliant: number; error: number; not_applicable: number }>>({});
  const [complianceHelpOpen, setComplianceHelpOpen] = useState(false);
  // Compliance evaluation status per node: pending | running
  const [complianceStatus, setComplianceStatus] = useState<Record<number, string>>({});
  // Product ranges for version upgrade detection
  const [productRanges, setProductRanges] = useState<{ name: string; recommendedVersion: string | null }[]>([]);

  // Columns config + catalog + extras
  const [columnsConfig, setColumnsConfig] = useState<ColumnsConfig | null>(null);
  const [catalog, setCatalog] = useState<{ categories: CatalogCategory[]; fields: CatalogField[] } | null>(null);
  const [extras, setExtras] = useState<Record<number, NodeExtras>>({});

  // Action dropdown, bulk delete, bulk add
  const [actionMenuOpen, setActionMenuOpen] = useState<false | "actions" | "add" | "edit">(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [bulkAddModal, setBulkAddModal] = useState(false);
  const [bulkAddInput, setBulkAddInput] = useState("");
  const [bulkAdding, setBulkAdding] = useState(false);
  const [bulkManufacturerId, setBulkManufacturerId] = useState<number | null>(null);
  const [bulkModelId, setBulkModelId] = useState<number | null>(null);
  const [bulkProfileId, setBulkProfileId] = useState<number | null>(null);
  const [bulkPolicy, setBulkPolicy] = useState<string>("audit");
  const [csvImportModal, setCsvImportModal] = useState(false);
  const [manufacturers, setManufacturers] = useState<{ id: number; name: string }[]>([]);
  const [models, setModels] = useState<{ id: number; name: string; manufacturer: { id: number } }[]>([]);
  const [profiles, setProfiles] = useState<{ id: number; name: string }[]>([]);
  const [allTags, setAllTags] = useState<NodeTag[]>([]);
  // Bulk edit
  const [bulkEditModal, setBulkEditModal] = useState(false);
  const [editManufacturerId, setEditManufacturerId] = useState<number | null | undefined>(undefined);
  const [editModelId, setEditModelId] = useState<number | null | undefined>(undefined);
  const [editProfileId, setEditProfileId] = useState<number | null | undefined>(undefined);
  const [editPolicy, setEditPolicy] = useState<string | undefined>(undefined);
  const [editTagIds, setEditTagIds] = useState<number[]>([]);
  const [editTagMode, setEditTagMode] = useState<"add" | "replace">("add");
  const [bulkEditing, setBulkEditing] = useState(false);

  // Collection status indicators per node: pending | running | completed | failed
  const [collectStatus, setCollectStatus] = useState<Record<number, string>>({});
  const dismissTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Extraction status indicators per node: pending | running | completed | failed
  const [extractStatus, setExtractStatus] = useState<Record<number, string>>({});
  const extractDismissTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Manual refresh
  const [refreshing, setRefreshing] = useState(false);

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = dismissTimers.current;
    const extractTimers = extractDismissTimers.current;
    return () => {
      Object.values(timers).forEach(clearTimeout);
      Object.values(extractTimers).forEach(clearTimeout);
    };
  }, []);

  const loadNodes = useCallback(async () => {
    if (!current) return;
    const [nodesRes, prRes] = await Promise.all([
      fetch(`/api/nodes?context=${current.id}`),
      fetch(`/api/product-ranges?context=${current.id}`),
    ]);
    if (nodesRes.ok) {
      const data: NodeItem[] = await nodesRes.json();
      setNodes(data);
      const evaluating: Record<number, string> = {};
      data.forEach((n) => { if (n.complianceEvaluating) evaluating[n.id] = n.complianceEvaluating; });
      setComplianceStatus((prev) => ({ ...evaluating, ...prev }));
    }
    if (prRes.ok) {
      setProductRanges(await prRes.json());
    }
    setFetchLoading(false);
  }, [current]);

  const loadComplianceStats = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/nodes/compliance-stats?context=${current.id}`);
    if (res.ok) setComplianceStats(await res.json());
  }, [current]);

  // Load catalog (once) and config (per context)
  useEffect(() => {
    fetch("/api/nodes/columns-catalog").then((r) => r.ok ? r.json() : null).then((c) => { if (c) setCatalog(c); });
  }, []);

  useEffect(() => {
    if (!current) return;
    fetch(`/api/contexts/${current.id}/node-columns-config`).then((r) => r.ok ? r.json() : null).then((c) => { if (c) setColumnsConfig(c); });
  }, [current]);

  // Derive needed extras "fields" + inventory column refs from the columns config
  const extrasNeeded = useMemo(() => {
    if (!columnsConfig || !catalog) return { fields: [] as string[], inventoryCols: [] as { category: string; key: string; column: string }[] };
    const cats = new Set<string>();
    const inv: { category: string; key: string; column: string }[] = [];
    const collectField = (ref: FieldRef | null) => {
      if (!ref) return;
      const def = catalog.fields.find((f) => f.key === ref.field);
      if (!def) return;
      if (def.category === "score") {
        if (ref.field.startsWith("compliance")) cats.add("compliance");
        if (ref.field.startsWith("vulnerability")) cats.add("vulnerability");
        if (ref.field.startsWith("systemUpdate")) cats.add("systemUpdate");
        if (ref.field === "score") { /* derived from node directly */ }
      } else if (def.category === "vulnerability") {
        cats.add("vulnerability");
      } else if (def.category === "systemUpdate") {
        cats.add("systemUpdate");
      } else if (def.category === "inventory") {
        cats.add("inventory");
        const c = typeof ref.params?.category === "string" ? ref.params.category : null;
        const col = typeof ref.params?.column === "string" ? ref.params.column : null;
        const k = typeof ref.params?.key === "string" ? ref.params.key : "";
        if (c && col) inv.push({ category: c, key: k, column: col });
      }
    };
    for (const c of columnsConfig.columns) {
      collectField(c.primary);
      collectField(c.secondary);
    }
    return { fields: Array.from(cats), inventoryCols: inv };
  }, [columnsConfig, catalog]);

  const loadExtras = useCallback(async () => {
    if (!current) return;
    if (extrasNeeded.fields.length === 0) { setExtras({}); return; }
    const params = new URLSearchParams();
    params.set("context", String(current.id));
    params.set("fields", extrasNeeded.fields.join(","));
    if (extrasNeeded.inventoryCols.length > 0) {
      params.set("inventoryColumns", JSON.stringify(extrasNeeded.inventoryCols));
    }
    const res = await fetch(`/api/nodes/extras?${params.toString()}`);
    if (res.ok) setExtras(await res.json());
  }, [current, extrasNeeded]);

  useEffect(() => { loadExtras(); }, [loadExtras]);

  // Load active collections (pending/running) on mount to restore status indicators
  const loadActiveCollections = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/collections?context=${current.id}`);
    if (!res.ok) return;
    const cols: {
      node: { id: number };
      status: string;
      extractStatus: string | null;
    }[] = await res.json();
    const activeCollect: Record<number, string> = {};
    const activeExtract: Record<number, string> = {};
    for (const col of cols) {
      if (col.status === "pending" || col.status === "running") {
        if (!activeCollect[col.node.id] || col.status === "running") {
          activeCollect[col.node.id] = col.status;
        }
      }
      if (col.extractStatus === "pending" || col.extractStatus === "running") {
        if (!activeExtract[col.node.id] || col.extractStatus === "running") {
          activeExtract[col.node.id] = col.extractStatus;
        }
      }
    }
    setCollectStatus((prev) => ({ ...activeCollect, ...prev }));
    setExtractStatus((prev) => ({ ...activeExtract, ...prev }));
  }, [current]);

  useEffect(() => {
    loadNodes();
    loadActiveCollections();
    loadComplianceStats();
  }, [loadNodes, loadActiveCollections, loadComplianceStats]);

  // Mercure SSE for real-time ping + collection + compliance updates
  useEffect(() => {
    if (!current || nodes.length === 0) return;
    const url = new URL("/.well-known/mercure", window.location.origin);
    url.searchParams.append("topic", `nodes/context/${current.id}`);
    nodes.forEach((n) => {
      url.searchParams.append("topic", `collections/node/${n.id}`);
      url.searchParams.append("topic", `compliance/node/${n.id}`);
      url.searchParams.append("topic", `extractions/node/${n.id}`);
    });
    const es = new EventSource(url);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "ping") {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === data.nodeId
              ? { ...n, isReachable: data.isReachable, lastPingAt: data.lastPingAt }
              : n
          )
        );
      }
      if (data.event === "node.updated") {
        const nodeId = Number(data.nodeId ?? 0);
        if (!nodeId) return;
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId
              ? {
                  ...n,
                  hostname: data.hostname ?? n.hostname,
                  discoveredModel: data.discoveredModel ?? n.discoveredModel,
                  discoveredVersion: data.discoveredVersion ?? n.discoveredVersion,
                  productModel: data.productModel ?? n.productModel,
                  tags: Array.isArray(data.tags) ? data.tags : n.tags,
                  dynamicTags: Array.isArray(data.dynamicTags) ? data.dynamicTags : n.dynamicTags,
                }
              : n
          )
        );
      }
      if (data.event === "collection.updated" && data.collection) {
        const col = data.collection;
        const nodeId = Number(data.collection.nodeId ?? 0);
        if (!nodeId) return;
        const status = col.status as string;
        setCollectStatus((prev) => ({ ...prev, [nodeId]: status }));

        if (status === "completed" || status === "failed") {
          // Clear any existing timer for this node
          if (dismissTimers.current[nodeId]) clearTimeout(dismissTimers.current[nodeId]);
          dismissTimers.current[nodeId] = setTimeout(() => {
            setCollectStatus((prev) => {
              const next = { ...prev };
              delete next[nodeId];
              return next;
            });
            delete dismissTimers.current[nodeId];
          }, 15000);
        }
      }
      if (data.event === "extraction.updated") {
        const nodeId = Number(data.nodeId ?? 0);
        if (!nodeId) return;
        const status = String(data.status ?? "");
        setExtractStatus((prev) => ({ ...prev, [nodeId]: status }));

        if (status === "completed" || status === "failed") {
          if (extractDismissTimers.current[nodeId]) clearTimeout(extractDismissTimers.current[nodeId]);
          extractDismissTimers.current[nodeId] = setTimeout(() => {
            setExtractStatus((prev) => {
              const next = { ...prev };
              delete next[nodeId];
              return next;
            });
            delete extractDismissTimers.current[nodeId];
          }, 15000);
        }
      }
      if (data.event === "compliance.progress") {
        const nodeId = Number(data.nodeId ?? 0);
        if (!nodeId) return;
        setComplianceStatus((prev) => ({ ...prev, [nodeId]: "running" }));
      }
      if (data.event === "compliance.evaluated") {
        const nodeId = Number(data.nodeId ?? 0);
        if (!nodeId) return;
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId ? { ...n, score: data.score, complianceEvaluating: null } : n
          )
        );
        setComplianceStatus((prev) => {
          const next = { ...prev };
          delete next[nodeId];
          return next;
        });
        loadComplianceStats();
        loadExtras();
      }
      // Nodes without a compliance policy go through RecalculateNodeScoreMessage,
      // which only emits vulnerability.score. Treat it like an evaluation end
      // so the optimistic spinner clears and the score updates.
      if (data.event === "vulnerability.score") {
        const nodeId = Number(data.nodeId ?? 0);
        if (!nodeId) return;
        setNodes((prev) =>
          prev.map((n) =>
            n.id === nodeId ? { ...n, score: data.score, complianceEvaluating: null } : n
          )
        );
        setComplianceStatus((prev) => {
          const next = { ...prev };
          delete next[nodeId];
          return next;
        });
        loadExtras();
      }
    };
    return () => es.close();
  }, [current, nodes.length, loadComplianceStats, loadExtras]);

  // Sort + pagination, persisted in user.preferences
  type SortKey = string;
  type SortRule = { column: SortKey; direction: "asc" | "desc" };
  const PAGE_SIZES = [5, 10, 15, 25, 50, 100, 200];
  const [sorts, setSorts] = useState<SortRule[]>([]);
  const [pageSize, setPageSize] = useState<number>(15);
  const [page, setPage] = useState(1);
  const prefsLoaded = useRef(false);

  // Initial sort + pageSize: context defaults first, then user prefs override
  useEffect(() => {
    if (!userInfo || !columnsConfig || prefsLoaded.current) return;
    const prefs = userInfo.preferences as { nodes?: { sorts?: SortRule[]; pageSize?: number } } | null;
    const nodesPref = prefs?.nodes;

    if (nodesPref?.sorts && Array.isArray(nodesPref.sorts)) {
      setSorts(nodesPref.sorts);
    } else if (columnsConfig.defaultSort) {
      setSorts([{ column: columnsConfig.defaultSort.column, direction: columnsConfig.defaultSort.direction }]);
    }

    if (nodesPref?.pageSize && PAGE_SIZES.includes(nodesPref.pageSize)) {
      setPageSize(nodesPref.pageSize);
    } else if (columnsConfig.pageSize && PAGE_SIZES.includes(columnsConfig.pageSize)) {
      setPageSize(columnsConfig.pageSize);
    }
    prefsLoaded.current = true;
  }, [userInfo, columnsConfig]);

  // Persist sort + pageSize on every change. keepalive ensures the request
  // completes even if the user refreshes/navigates immediately after the click.
  useEffect(() => {
    if (!prefsLoaded.current) return;
    fetch("/api/profile/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nodes: { sorts, pageSize } }),
      keepalive: true,
    }).catch(() => {});
  }, [sorts, pageSize]);

  const toggleSort = (column: SortKey, additive: boolean) => {
    setSorts((prev) => {
      const existing = prev.find((s) => s.column === column);
      if (!additive) {
        if (!existing) return [{ column, direction: "asc" }];
        if (existing.direction === "asc") return [{ column, direction: "desc" }];
        return [];
      }
      if (!existing) return [...prev, { column, direction: "asc" }];
      if (existing.direction === "asc") return prev.map((s) => s.column === column ? { ...s, direction: "desc" } : s);
      return prev.filter((s) => s.column !== column);
    });
  };

  const sortValueFor = (n: NodeItem, column: SortKey): string | number => {
    return getSortValue(n, { field: column }, extras[n.id], complianceStats[n.id]);
  };

  const searched = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return nodes;
    return nodes.filter((n) => {
      return (
        n.ipAddress.toLowerCase().includes(q) ||
        (n.name && n.name.toLowerCase().includes(q)) ||
        (n.hostname && n.hostname.toLowerCase().includes(q)) ||
        (n.discoveredModel && n.discoveredModel.toLowerCase().includes(q)) ||
        (n.discoveredVersion && n.discoveredVersion.toLowerCase().includes(q))
      );
    });
  }, [nodes, search]);

  const filtered = useMemo(() => {
    if (sorts.length === 0) return searched;
    const sorted = [...searched];
    sorted.sort((a, b) => {
      for (const s of sorts) {
        const va = sortValueFor(a, s.column);
        const vb = sortValueFor(b, s.column);
        if (va < vb) return s.direction === "asc" ? -1 : 1;
        if (va > vb) return s.direction === "asc" ? 1 : -1;
      }
      return 0;
    });
    return sorted;
  }, [searched, sorts]);

  // Reset to page 1 whenever the filter changes meaningfully
  useEffect(() => { setPage(1); }, [search, pageSize, sorts]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageEnd = Math.min(pageStart + pageSize, filtered.length);
  const paged = filtered.slice(pageStart, pageEnd);

  const filteredIds = new Set(filtered.map((n) => n.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((n) => selected.has(n.id));

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handlePing = async () => {
    if (selected.size === 0) return;
    setPinging(true);
    // Reset selected nodes to grey (null) immediately
    setNodes((prev) =>
      prev.map((n) =>
        selected.has(n.id) ? { ...n, isReachable: null } : n
      )
    );
    try {
      await fetch("/api/nodes/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeIds: Array.from(selected) }),
      });
    } finally {
      setPinging(false);
      setSelected(new Set());
    }
  };

  const handleCollect = async () => {
    if (!current || selected.size === 0) return;
    setCollecting(true);
    try {
      const nodeIds = Array.from(selected);
      // Mark selected nodes as pending immediately
      setCollectStatus((prev) => {
        const next = { ...prev };
        nodeIds.forEach((id) => { next[id] = "pending"; });
        return next;
      });
      const pending = collectTagInput.trim().replace(/,/g, "");
      const tags = pending && !collectTags.includes(pending)
        ? [...collectTags, pending]
        : collectTags;
      await fetch(`/api/collections/collect?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeIds, tags }),
      });
      setCollectModal(false);
      setCollectTags([]);
      setCollectTagInput("");
      setSelected(new Set());
    } finally {
      setCollecting(false);
    }
  };

  const handleEvaluateCompliance = async () => {
    if (selected.size === 0) return;
    const nodeIds = Array.from(selected);
    // Mark selected nodes as pending immediately so the spinner + bar animate without delay.
    setComplianceStatus((prev) => {
      const next = { ...prev };
      nodeIds.forEach((id) => { next[id] = "pending"; });
      return next;
    });
    try {
      const res = await fetch("/api/nodes/evaluate-compliance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeIds }),
      });
      if (res.ok) {
        // Reload nodes to get actual complianceEvaluating state from backend
        const nodesRes = await fetch(`/api/nodes?context=${current?.id}`);
        if (nodesRes.ok) {
          const data: NodeItem[] = await nodesRes.json();
          setNodes(data);
          // For each node we just dispatched: keep our spinner only if the
          // backend confirms an evaluation is actually queued/running. Nodes
          // with no compliance policy fall through RecalculateNodeScoreMessage,
          // so their complianceEvaluating stays null and we must clear the
          // optimistic indicator — otherwise the spinner sticks forever.
          const dispatched = new Set(nodeIds);
          setComplianceStatus((prev) => {
            const next = { ...prev };
            data.forEach((n) => {
              if (n.complianceEvaluating) {
                next[n.id] = n.complianceEvaluating;
              } else if (dispatched.has(n.id)) {
                delete next[n.id];
              }
            });
            return next;
          });
          // Refresh the per-node compliance bar with up-to-date stats for the
          // nodes that don't trigger a compliance.evaluated Mercure event.
          loadComplianceStats();
        }
      } else {
        // Roll back the optimistic indicator on failure
        setComplianceStatus((prev) => {
          const next = { ...prev };
          nodeIds.forEach((id) => { delete next[id]; });
          return next;
        });
      }
    } finally {
      setSelected(new Set());
    }
  };

  const handleExtraction = async () => {
    if (!current || selected.size === 0) return;
    const nodeIds = Array.from(selected);
    // Optimistically mark selected nodes as pending so the user gets feedback immediately.
    setExtractStatus((prev) => {
      const next = { ...prev };
      nodeIds.forEach((id) => { next[id] = "pending"; });
      return next;
    });
    try {
      const res = await fetch("/api/collections/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nodeIds }),
      });
      if (!res.ok) {
        setExtractStatus((prev) => {
          const next = { ...prev };
          nodeIds.forEach((id) => { delete next[id]; });
          return next;
        });
      }
    } finally {
      setSelected(new Set());
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadNodes(), loadComplianceStats(), loadActiveCollections()]);
    } finally {
      setRefreshing(false);
    }
  };

  const loadEditLists = () => {
    if (!current) return;
    fetch(`/api/manufacturers?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setManufacturers);
    fetch(`/api/models?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setModels);
    fetch(`/api/profiles?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setProfiles);
    fetch(`/api/node-tags?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setAllTags);
  };

  const openBulkEdit = () => {
    setEditManufacturerId(undefined);
    setEditModelId(undefined);
    setEditProfileId(undefined);
    setEditPolicy(undefined);
    setEditTagIds([]);
    setEditTagMode("add");
    loadEditLists();
    setBulkEditModal(true);
  };

  const handleBulkEdit = async () => {
    if (selected.size === 0) return;
    setBulkEditing(true);
    try {
      for (const id of selected) {
        const body: Record<string, unknown> = {};
        if (editManufacturerId !== undefined) body.manufacturerId = editManufacturerId;
        if (editModelId !== undefined) body.modelId = editModelId;
        if (editProfileId !== undefined) body.profileId = editProfileId;
        if (editPolicy !== undefined) body.policy = editPolicy;
        if (editTagIds.length > 0) body.tagIds = editTagIds;
        if (editTagIds.length > 0) body.tagMode = editTagMode;
        if (Object.keys(body).length > 0) {
          await fetch(`/api/nodes/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        }
      }
      setBulkEditModal(false);
      setSelected(new Set());
      loadNodes();
    } finally {
      setBulkEditing(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    for (const id of selected) {
      await fetch(`/api/nodes/${id}`, { method: "DELETE" });
    }
    setSelected(new Set());
    setDeleteConfirm(false);
    loadNodes();
  };

  const parseBulkIps = (input: string): string[] => {
    const ips: string[] = [];
    for (const line of input.split(/[\n,;]+/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Range: 10.201.100.41-45
      const rangeMatch = trimmed.match(/^(\d+\.\d+\.\d+\.)(\d+)-(\d+)$/);
      if (rangeMatch) {
        const prefix = rangeMatch[1];
        const start = parseInt(rangeMatch[2], 10);
        const end = parseInt(rangeMatch[3], 10);
        for (let i = start; i <= end; i++) ips.push(prefix + i);
      } else if (/^\d+\.\d+\.\d+\.\d+$/.test(trimmed)) {
        ips.push(trimmed);
      }
    }
    return ips;
  };

  const handleBulkAdd = async () => {
    if (!current) return;
    const ips = parseBulkIps(bulkAddInput);
    if (ips.length === 0) return;
    setBulkAdding(true);
    try {
      for (const ip of ips) {
        const body: Record<string, unknown> = { ipAddress: ip, policy: bulkPolicy };
        if (bulkManufacturerId) body.manufacturerId = bulkManufacturerId;
        if (bulkModelId) body.modelId = bulkModelId;
        if (bulkProfileId) body.profileId = bulkProfileId;
        await fetch(`/api/nodes?context=${current.id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setBulkAddModal(false);
      setBulkAddInput("");
      loadNodes();
    } finally {
      setBulkAdding(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

  const getDefaultWidth = (fieldKey: string): "auto" | "min" => {
    const autoFields = ["hostname", "name", "ipAddress", "manufacturer", "model", "profile", "productModel", "discoveredModel", "inventory"];
    return autoFields.includes(fieldKey) ? "auto" : "min";
  };
  const getColumnWidthClass = (col: ColumnDef): string => {
    const w = col.width ?? getDefaultWidth(col.primary.field);
    return w === "min" ? "w-px whitespace-nowrap" : "";
  };
  const getColumnMinWidthStyle = (col: ColumnDef): { minWidth: string } | undefined => {
    if (!col.minWidth || col.minWidth <= 0) return undefined;
    return { minWidth: `${col.minWidth}px` };
  };

  if (fetchLoading || !columnsConfig) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  const renderSortableTh = (column: SortKey, label: string, align: "left" | "center" | "right" = "left", extra = "", key?: string, style?: { minWidth: string }) => {
    const idx = sorts.findIndex((s) => s.column === column);
    const active = idx !== -1;
    const dir = active ? sorts[idx].direction : null;
    const alignClass = align === "center" ? "text-center justify-center" : align === "right" ? "text-right justify-end" : "text-left";
    const thAlignClass = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
    return (
      <th key={key ?? column} style={style} className={`px-4 py-3 ${thAlignClass} text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider ${extra}`}>
        <button
          onClick={(e) => toggleSort(column, e.shiftKey)}
          className={`group inline-flex items-center gap-1 ${alignClass} ${active ? "text-slate-700 dark:text-slate-200" : ""} hover:text-slate-700 dark:hover:text-slate-200 transition-colors`}
          title={t("nodes.sortHint")}
        >
          <span>{label}</span>
          {active ? (
            <span className="inline-flex items-center gap-0.5">
              {dir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {sorts.length > 1 && <span className="text-[10px] font-bold tabular-nums">{idx + 1}</span>}
            </span>
          ) : (
            <ArrowUp className="h-3 w-3 opacity-0 group-hover:opacity-30" />
          )}
        </button>
      </th>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("nodes.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("nodes.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              {/* Actions dropdown */}
              <div className="relative">
                <button
                  onClick={() => setActionMenuOpen(actionMenuOpen === "actions" ? false : "actions")}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <Play className="h-4 w-4" />
                  {t("nodes.actions")} ({selected.size})
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                {actionMenuOpen === "actions" && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setActionMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-20 w-56 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg py-1">
                      {current?.monitoringEnabled && (
                        <button onClick={() => { handlePing(); setActionMenuOpen(false); }} disabled={pinging} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50">
                          {pinging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4 text-blue-500" />}
                          {t("nodes.pingSelected", { count: String(selected.size) })}
                        </button>
                      )}
                      <button onClick={() => { setCollectTags([]); setCollectTagInput(""); setCollectModal(true); setActionMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <Play className="h-4 w-4 text-emerald-500" />
                        {t("nodes.collectSelected", { count: String(selected.size) })}
                      </button>
                      <button onClick={() => { handleExtraction(); setActionMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <ScanSearch className="h-4 w-4 text-amber-500" />
                        {t("nodes.extractSelected", { count: String(selected.size) })}
                      </button>
                      <button onClick={() => { handleEvaluateCompliance(); setActionMenuOpen(false); }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                        <ShieldCheck className="h-4 w-4 text-violet-500" />
                        {t("nodes.evaluateSelected", { count: String(selected.size) })}
                      </button>
                    </div>
                  </>
                )}
              </div>
              {/* Bulk edit */}
              <button
                onClick={openBulkEdit}
                className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Pencil className="h-4 w-4" />
                {t("nodes.editSelected", { count: String(selected.size) })}
              </button>
              {/* Delete selected */}
              <button
                onClick={() => setDeleteConfirm(true)}
                className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/30 px-4 py-2.5 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
                {t("nodes.deleteSelected", { count: String(selected.size) })}
              </button>
            </>
          )}
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            title={t("nodes.refresh")}
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            {t("nodes.refresh")}
          </button>
          <div className="relative flex">
            <Link
              href="/nodes/new"
              className="flex items-center gap-2 rounded-l-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("nodes.newNode")}
            </Link>
            <button
              onClick={() => setActionMenuOpen(actionMenuOpen === "add" ? false : "add")}
              className="flex items-center rounded-r-lg border-l border-slate-700 dark:border-slate-300 bg-slate-900 dark:bg-white px-2 py-2.5 text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {actionMenuOpen === "add" && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setActionMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 z-20 w-48 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg py-1">
                  <button onClick={() => { setActionMenuOpen(false); setBulkAddModal(true); setBulkAddInput(""); setBulkManufacturerId(null); setBulkModelId(null); setBulkProfileId(null); setBulkPolicy("audit"); if (current) { fetch(`/api/manufacturers?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setManufacturers); fetch(`/api/models?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setModels); fetch(`/api/profiles?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setProfiles); } }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <Upload className="h-4 w-4 text-blue-500" />
                    {t("nodes.bulkAdd")}
                  </button>
                  <button onClick={() => { setActionMenuOpen(false); setCsvImportModal(true); if (current) { fetch(`/api/manufacturers?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setManufacturers); fetch(`/api/models?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setModels); fetch(`/api/profiles?context=${current.id}`).then((r) => r.ok ? r.json() : []).then(setProfiles); } }} className="flex items-center gap-2.5 w-full px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors">
                    <FileSpreadsheet className="h-4 w-4 text-emerald-500" />
                    {t("nodes.csvImport")}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder={t("nodes.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20"
                  />
                </th>
                {(columnsConfig?.columns ?? []).map((col) => {
                  const def = catalog?.fields.find((f) => f.key === col.primary.field);
                  const sortable = !!def?.sortable;
                  const headerKey = `nodeColumns.header.${col.primary.field}`;
                  const fieldKey = `nodeColumns.field.${col.primary.field}`;
                  const headerCandidate = t(headerKey);
                  const fallback = headerCandidate === headerKey ? t(fieldKey) : headerCandidate;
                  const label = col.labelOverride
                    || (col.primary.field === "inventory" && typeof col.primary.params?.column === "string" ? col.primary.params.column : fallback);
                  const defaultAlign: "left" | "center" | "right" =
                    ["score", "policy", "complianceBar", "complianceBarOnly"].includes(col.primary.field) || col.primary.field.startsWith("cve") ? "center" : "left";
                  const align: "left" | "center" | "right" = col.align ?? defaultAlign;
                  const isCompliance = col.primary.field === "complianceBar" || col.primary.field === "complianceBarOnly";

                  const widthClass = getColumnWidthClass(col);
                  const minWidthStyle = getColumnMinWidthStyle(col);
                  if (!sortable) {
                    const alignClass = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
                    return (
                      <th key={col.id} style={minWidthStyle} className={`px-4 py-3 ${alignClass} ${widthClass} text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider`}>
                        <span className="inline-flex items-center gap-1">
                          {label}
                          {isCompliance && (
                            <button
                              onClick={() => setComplianceHelpOpen(true)}
                              className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                            >
                              <HelpCircle className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </span>
                      </th>
                    );
                  }
                  return renderSortableTh(col.primary.field, label, align, widthClass, col.id, minWidthStyle);
                })}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={1 + (columnsConfig?.columns.length ?? 0)} className="px-5 py-12 text-center">
                    <Server className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {search ? t("nodes.noResult") : t("nodes.noNodes")}
                    </p>
                  </td>
                </tr>
              ) : (
                paged.map((node) => (
                  <tr
                    key={node.id}
                    onClick={(e) => {
                      const target = e.target as HTMLElement;
                      if (target.closest('input,button,a,label')) return;
                      router.push(`/nodes/${node.id}`);
                    }}
                    className={`cursor-pointer hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors ${selected.has(node.id) ? "bg-slate-50 dark:bg-slate-800/30" : ""}`}
                  >
                    <td className="px-4 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(node.id)}
                        onChange={() => toggleSelect(node.id)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20"
                      />
                    </td>
                    {(columnsConfig?.columns ?? []).map((col) => {
                      const defaultAlign: "left" | "center" | "right" =
                        ["score", "policy", "complianceBar", "complianceBarOnly"].includes(col.primary.field) || col.primary.field.startsWith("cve") ? "center" : "left";
                      const align: "left" | "center" | "right" = col.align ?? defaultAlign;
                      const alignClass = align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
                      const isFluid = col.primary.field === "complianceBar" || col.primary.field === "complianceBarOnly";
                      const itemsClass = isFluid
                        ? "items-stretch"
                        : align === "center" ? "items-center" : align === "right" ? "items-end" : "items-start";
                      const widthClass = getColumnWidthClass(col);
                      const minWidthStyle = getColumnMinWidthStyle(col);
                      return (
                        <td key={col.id} style={minWidthStyle} className={`px-4 py-2 ${alignClass} ${widthClass}`}>
                          <div className={`flex flex-col ${itemsClass}`}>
                            {renderCell(node, col.primary, {
                              extras: extras[node.id],
                              complianceStats: complianceStats[node.id],
                              complianceStatus: complianceStatus[node.id],
                              collectStatus: collectStatus[node.id],
                              extractStatus: extractStatus[node.id],
                              productRanges,
                              t,
                              locale,
                            }, "primary")}
                            {col.secondary && (
                              <div className="mt-0.5">
                                {renderCell(node, col.secondary, {
                                  extras: extras[node.id],
                                  complianceStats: complianceStats[node.id],
                                  complianceStatus: complianceStatus[node.id],
                                  collectStatus: collectStatus[node.id],
                                  extractStatus: extractStatus[node.id],
                                  productRanges,
                                  t,
                                  locale,
                                }, "secondary")}
                              </div>
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="flex items-center justify-between gap-4 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-sm text-slate-600 dark:text-slate-400">
            <div className="flex items-center gap-2">
              <span>{t("nodes.pageSize")}</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs"
              >
                {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-3">
              <span className="tabular-nums">
                {t("nodes.pageRange", { from: String(pageStart + 1), to: String(pageEnd), total: String(filtered.length) })}
              </span>
              <div className="inline-flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={currentPage <= 1}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={t("nodes.pageFirst")}
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage <= 1}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={t("nodes.pagePrev")}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="px-2 text-xs tabular-nums">
                  {t("nodes.pageOf", { page: String(currentPage), total: String(totalPages) })}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage >= totalPages}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={t("nodes.pageNext")}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={currentPage >= totalPages}
                  className="p-1.5 rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  title={t("nodes.pageLast")}
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Compliance help modal */}
      {complianceHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("compliance.legend")}</h3>
              <button onClick={() => setComplianceHelpOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* Progress bar legend */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance.legendProgressBar")}</h4>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-8 rounded-full" style={{ backgroundColor: "#10b981" }} />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{t("compliance.compliant")}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-8 rounded-full" style={{ backgroundColor: "#ef4444" }} />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{t("compliance.nonCompliant")}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-8 rounded-full relative overflow-hidden" style={{ backgroundColor: "#ef4444" }}>
                      <div className="absolute inset-0" style={{ backgroundImage: "repeating-linear-gradient(135deg, transparent, transparent 2px, rgba(255,255,255,0.35) 2px, rgba(255,255,255,0.35) 4px)" }} />
                    </div>
                    <span className="text-sm text-slate-700 dark:text-slate-300">{t("compliance.error")}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-8 rounded-full" style={{ backgroundColor: "#e2e8f0" }} />
                    <span className="text-sm text-slate-700 dark:text-slate-300">{t("compliance.notApplicable")}</span>
                  </div>
                </div>
              </div>
              {/* Icons legend */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("compliance.legendIcons")}</h4>
                <div className="space-y-2.5">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">{t("compliance.legendCompliant")}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Ban className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">{t("compliance.legendNonCompliant")}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">{t("compliance.legendError")}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <Minus className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-600 dark:text-slate-400">{t("compliance.legendNotApplicable")}</span>
                  </div>
                </div>
              </div>
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
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("nodes.collectDescription")} ({selected.size} {selected.size === 1 ? "node" : "nodes"})
              </p>
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

      {/* Delete confirmation modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-sm p-6 space-y-4">
            <p className="text-sm text-slate-700 dark:text-slate-300">
              {t("nodes.confirmBulkDelete", { count: String(selected.size) })}
            </p>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setDeleteConfirm(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button onClick={handleBulkDelete} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 transition-colors">
                {t("common.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk edit modal */}
      {bulkEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("nodes.editSelectedTitle", { count: String(selected.size) })}</h3>
              <button onClick={() => setBulkEditModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-xs text-slate-400 dark:text-slate-500">{t("nodes.editSelectedHelp")}</p>
              {/* Manufacturer + Model */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>{t("nodes.manufacturer")}</label>
                  <select value={editManufacturerId === undefined ? "__unchanged__" : (editManufacturerId ?? "")} onChange={(e) => { const v = e.target.value; if (v === "__unchanged__") { setEditManufacturerId(undefined); setEditModelId(undefined); } else { setEditManufacturerId(v ? Number(v) : null); setEditModelId(undefined); } }} className={inputClass}>
                    <option value="__unchanged__">— {t("nodes.unchanged")} —</option>
                    <option value="">{t("nodes.none")}</option>
                    {manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>{t("nodes.model")}</label>
                  <select value={editModelId === undefined ? "__unchanged__" : (editModelId ?? "")} onChange={(e) => { const v = e.target.value; setEditModelId(v === "__unchanged__" ? undefined : v ? Number(v) : null); }} className={inputClass}>
                    <option value="__unchanged__">— {t("nodes.unchanged")} —</option>
                    <option value="">{t("nodes.none")}</option>
                    {(editManufacturerId ? models.filter((m) => m.manufacturer?.id === editManufacturerId) : models).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              {/* Profile + Policy */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>{t("nodes.profile")}</label>
                  <select value={editProfileId === undefined ? "__unchanged__" : (editProfileId ?? "")} onChange={(e) => { const v = e.target.value; setEditProfileId(v === "__unchanged__" ? undefined : v ? Number(v) : null); }} className={inputClass}>
                    <option value="__unchanged__">— {t("nodes.unchanged")} —</option>
                    <option value="">{t("nodes.none")}</option>
                    {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>{t("nodes.policy")}</label>
                  <select value={editPolicy === undefined ? "__unchanged__" : editPolicy} onChange={(e) => { const v = e.target.value; setEditPolicy(v === "__unchanged__" ? undefined : v); }} className={inputClass}>
                    <option value="__unchanged__">— {t("nodes.unchanged")} —</option>
                    <option value="audit">Audit</option>
                    <option value="enforce">Enforce</option>
                  </select>
                </div>
              </div>
              {/* Tags */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className={labelClass}>{t("nodes.tags")}</label>
                  <div className="flex gap-1">
                    <button onClick={() => setEditTagMode("add")} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${editTagMode === "add" ? "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300" : "text-slate-400 hover:text-slate-600"}`}>{t("nodes.tagsAdd")}</button>
                    <button onClick={() => setEditTagMode("replace")} className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${editTagMode === "replace" ? "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300" : "text-slate-400 hover:text-slate-600"}`}>{t("nodes.tagsReplace")}</button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {allTags.map((tag) => {
                    const active = editTagIds.includes(tag.id);
                    return (
                      <button key={tag.id} onClick={() => setEditTagIds(active ? editTagIds.filter((id) => id !== tag.id) : [...editTagIds, tag.id])}
                        className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors border ${active ? "" : "border-slate-200 dark:border-slate-700 text-slate-400"}`}
                        style={active ? { backgroundColor: tag.color + "20", color: tag.color, borderColor: tag.color + "40" } : {}}
                      >
                        <Tag className="h-3 w-3" />
                        {tag.name}
                      </button>
                    );
                  })}
                  {allTags.length === 0 && <span className="text-xs text-slate-400">{t("nodes.noTags")}</span>}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setBulkEditModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">{t("common.cancel")}</button>
              <button onClick={handleBulkEdit} disabled={bulkEditing} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                {bulkEditing && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("nodes.applyChanges")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk add modal */}
      {bulkAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("nodes.bulkAddTitle")}</h3>
              <button onClick={() => setBulkAddModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {/* Manufacturer + Model */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>{t("nodes.manufacturer")}</label>
                  <select value={bulkManufacturerId ?? ""} onChange={(e) => { setBulkManufacturerId(e.target.value ? Number(e.target.value) : null); setBulkModelId(null); }} className={inputClass}>
                    <option value="">--</option>
                    {manufacturers.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>{t("nodes.model")}</label>
                  <select value={bulkModelId ?? ""} onChange={(e) => setBulkModelId(e.target.value ? Number(e.target.value) : null)} className={inputClass}>
                    <option value="">--</option>
                    {(bulkManufacturerId ? models.filter((m) => m.manufacturer?.id === bulkManufacturerId) : models).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </div>
              </div>
              {/* Profile + Policy */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className={labelClass}>{t("nodes.profile")}</label>
                  <select value={bulkProfileId ?? ""} onChange={(e) => setBulkProfileId(e.target.value ? Number(e.target.value) : null)} className={inputClass}>
                    <option value="">--</option>
                    {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className={labelClass}>{t("nodes.policy")}</label>
                  <select value={bulkPolicy} onChange={(e) => setBulkPolicy(e.target.value)} className={inputClass}>
                    <option value="audit">Audit</option>
                    <option value="enforce">Enforce</option>
                  </select>
                </div>
              </div>
              {/* IPs */}
              <div className="space-y-1.5">
                <label className={labelClass}>{t("nodes.bulkAddLabel")}</label>
                <textarea
                  value={bulkAddInput}
                  onChange={(e) => setBulkAddInput(e.target.value)}
                  rows={6}
                  placeholder={t("nodes.bulkAddPlaceholder")}
                  className={`${inputClass} font-mono resize-none`}
                />
                <p className="text-xs text-slate-400 dark:text-slate-500">{t("nodes.bulkAddHelp")}</p>
              </div>
              {bulkAddInput.trim() && (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {t("nodes.bulkAddPreview", { count: String(parseBulkIps(bulkAddInput).length) })}
                </p>
              )}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setBulkAddModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleBulkAdd}
                disabled={bulkAdding || !bulkAddInput.trim()}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {bulkAdding && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("nodes.bulkAddSubmit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {current && (
        <CsvImportModal
          open={csvImportModal}
          onClose={() => setCsvImportModal(false)}
          onImported={loadNodes}
          contextId={current.id}
          manufacturers={manufacturers}
          models={models}
          profiles={profiles}
        />
      )}
    </div>
  );
}
