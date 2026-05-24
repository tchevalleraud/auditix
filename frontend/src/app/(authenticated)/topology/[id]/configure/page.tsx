"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  ChevronLeft,
  Loader2,
  Network,
  Plus,
  RotateCcw,
  Save,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import NodeLabelEditor, {
  type LabelElement,
  type NodeDesign,
  type InventoryCategoryOption,
} from "@/components/topology2/NodeLabelEditor";
import ProtocolWorkflowModal, {
  type ProtocolDraft,
} from "@/components/topology2/ProtocolWorkflowModal";

interface NodeTagRef {
  id: number;
  name: string;
  color: string | null;
}

interface ContextNode {
  id: number;
  name: string | null;
  hostname: string | null;
  ipAddress: string;
  tags?: NodeTagRef[];
  dynamicTags?: NodeTagRef[];
}

interface MapOptions {
  aggregateParallelLinks?: boolean;
  aggregateBorderColor?: string;
  aggregateBorderWidth?: number;
  aggregateFillColor?: string;
  aggregateTransparent?: boolean;
  aggregateLabelPosition?: "center" | "above" | "below";
  aggregateLabelFontSize?: number;
  aggregateLabelColor?: string;
  /** Initial protocol filter when opening the map. "manual" | protocol id */
  defaultProtocolFilter?: "manual" | number;
}

const AGGREGATE_LABEL_POSITIONS = [
  { value: "center", labelKey: "topology.aggregateLabelCenter" },
  { value: "above", labelKey: "topology.aggregateLabelAbove" },
  { value: "below", labelKey: "topology.aggregateLabelBelow" },
] as const;

interface TopologyDetail {
  id: number;
  name: string;
  description: string | null;
  isPrimary: boolean;
  nodeDesign: NodeDesign;
  mapOptions: MapOptions | null;
}

interface Member {
  id: number;
  nodeId: number;
  nodeName: string | null;
  nodeIp: string | null;
}

interface EdgeLabel {
  text: string;
  position: "source" | "middle" | "target";
  offset?: number;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  background?: boolean;
}

interface EdgeStyle {
  type: "straight" | "orthogonal" | "curved";
  color: string;
  width: number;
  dash: "solid" | "dashed" | "dotted";
  curveTension?: number;
  labels?: EdgeLabel[];
  aggregationGroup?: string;
  aggregationLabel?: string;
}

interface Edge {
  id: number;
  sourceNodeId: number;
  targetNodeId: number;
  style: EdgeStyle;
}

interface ClusterStyle {
  shape?: "rectangle" | "polygon" | "hull";
  borderColor: string;
  borderWidth: number;
  dash: "solid" | "dashed" | "dotted";
  fillColor: string;
  transparent: boolean;
  padding: number;
  borderRadius: number;
  labelPosition: "top" | "bottom" | "none";
  labelFontSize: number;
  labelColor: string;
  labelOffset?: { dx: number; dy: number };
}

interface Cluster {
  id: number;
  name: string;
  style: ClusterStyle;
  nodeIds: number[];
  protocolId: number | null;
}

function defaultClusterStyle(): ClusterStyle {
  return {
    borderColor: "#ef4444",
    borderWidth: 0.5,
    dash: "dashed",
    fillColor: "#ef4444",
    transparent: true,
    padding: 5,
    borderRadius: 12,
    labelPosition: "none",
    labelFontSize: 6,
    labelColor: "#ef4444",
  };
}

const CLUSTER_SHAPES = [
  { value: "rectangle", labelKey: "topology.clusterShapeRectangle" },
  { value: "polygon", labelKey: "topology.clusterShapePolygon" },
  { value: "hull", labelKey: "topology.clusterShapeHull" },
] as const;

const CLUSTER_LABEL_POSITIONS = [
  { value: "top", labelKey: "topology.clusterLabelTop" },
  { value: "bottom", labelKey: "topology.clusterLabelBottom" },
  { value: "none", labelKey: "topology.clusterLabelNone" },
] as const;

interface ProtocolMapping {
  destNodeColumn: string;
  nodeMatchField: "auto" | "name" | "hostname" | "ipAddress" | "inventory";
  // Used when nodeMatchField = "inventory": pinpoints a category + optional
  // entryKey filter + column whose values are indexed value→Node. Lets the
  // matcher resolve a chassis ID or any other identifier that doesn't live on
  // the Node entity itself.
  nodeMatchInventoryCategoryId?: number | null;
  nodeMatchInventoryKey?: string;
  nodeMatchInventoryColumn?: string;
  localPortColumn: string;
  remotePortColumn: string;
  metricColumn: string;
  // LLDP-specific aggregation: optional pointer to a separate inventory category
  // (e.g. "Port-channel members") that maps a port name to its LAG id.
  aggregationCategoryId?: number | null;
  aggregationKeyColumn?: string;
  aggregationValueColumn?: string;
  // ISIS-specific
  linkAreaColumn?: string;
  areaCategoryId?: number | null;
  areaColumn?: string;
}

interface Protocol {
  id: number;
  name: string;
  type: "lldp" | "isis";
  inventoryCategoryId: number | null;
  inventoryCategoryName: string | null;
  mapping: ProtocolMapping;
  edgeStyle: Partial<EdgeStyle>;
  enabled: boolean;
  lastGeneratedAt: string | null;
}

interface ClusterRule {
  id: number;
  name: string;
  inventoryCategoryId: number | null;
  inventoryCategoryName: string | null;
  groupByColumn: string;
  clusterStyle: Partial<ClusterStyle>;
  enabled: boolean;
  lastGeneratedAt: string | null;
}

const EDGE_TYPE_OPTIONS = [
  { value: "straight", labelKey: "topology.edgeTypeStraight" },
  { value: "orthogonal", labelKey: "topology.edgeTypeOrthogonal" },
  { value: "curved", labelKey: "topology.edgeTypeCurved" },
] as const;

const EDGE_DASH_OPTIONS = [
  { value: "solid", labelKey: "topology.edgeDashSolid" },
  { value: "dashed", labelKey: "topology.edgeDashDashed" },
  { value: "dotted", labelKey: "topology.edgeDashDotted" },
] as const;

const LABEL_POSITION_OPTIONS = [
  { value: "source", labelKey: "topology.labelPosSource" },
  { value: "middle", labelKey: "topology.labelPosMiddle" },
  { value: "target", labelKey: "topology.labelPosTarget" },
] as const;

function defaultEdgeStyle(): EdgeStyle {
  return { type: "straight", color: "#94a3b8", width: 0.5, dash: "solid", curveTension: 0.3, labels: [] };
}

function defaultEdgeLabel(): EdgeLabel {
  return { text: "", position: "middle", fontSize: 6, color: "#475569", fontWeight: 400 };
}

const SHAPE_OPTIONS = [
  { value: "round-rectangle", labelKey: "topology.shapeRoundRect" },
  { value: "rectangle", labelKey: "topology.shapeRect" },
  { value: "ellipse", labelKey: "topology.shapeEllipse" },
  { value: "diamond", labelKey: "topology.shapeDiamond" },
  { value: "hexagon", labelKey: "topology.shapeHexagon" },
  { value: "triangle", labelKey: "topology.shapeTriangle" },
];

const TABS = [
  { key: "settings", labelKey: "topology.tabSettings" },
  { key: "members", labelKey: "topology.tabMembers" },
  { key: "design", labelKey: "topology.tabDesign" },
  { key: "links", labelKey: "topology.tabLinks" },
  { key: "clusters", labelKey: "topology.tabClusters" },
  { key: "areas", labelKey: "topology.tabAreas" },
  { key: "protocols", labelKey: "topology.tabProtocols" },
  { key: "clusterRules", labelKey: "topology.tabClusterRules" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

export default function TopologyConfigurePage() {
  const { t } = useI18n();
  const router = useRouter();
  const params = useParams();
  const idParam = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const id = Number(idParam);
  const { current } = useAppContext();

  const [topology, setTopology] = useState<TopologyDetail | null>(null);
  const [allNodes, setAllNodes] = useState<ContextNode[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [memberIds, setMemberIds] = useState<Set<number>>(new Set());
  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategoryOption[]>([]);

  const [tab, setTab] = useState<TabKey>("settings");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [design, setDesign] = useState<NodeDesign | null>(null);
  const [mapOptions, setMapOptions] = useState<MapOptions>({});
  const [edges, setEdges] = useState<Edge[]>([]);
  const [editingEdgeId, setEditingEdgeId] = useState<number | null>(null);
  const [clusters, setClusters] = useState<Cluster[]>([]);
  const [editingClusterId, setEditingClusterId] = useState<number | null>(null);
  const [protocols, setProtocols] = useState<Protocol[]>([]);
  const [editingProtocolId, setEditingProtocolId] = useState<number | null>(null);
  const [protocolWorkflowMode, setProtocolWorkflowMode] = useState<"create" | "edit" | null>(null);
  const [generatingProtocolId, setGeneratingProtocolId] = useState<number | null>(null);
  const [generateResult, setGenerateResult] = useState<{ protocolId: number; created: number; skipped: number } | null>(null);
  const [clusterRules, setClusterRules] = useState<ClusterRule[]>([]);
  const [editingClusterRuleId, setEditingClusterRuleId] = useState<number | null>(null);
  const [generatingClusterRuleId, setGeneratingClusterRuleId] = useState<number | null>(null);
  const [clusterRuleResult, setClusterRuleResult] = useState<{ ruleId: number; created: number; members: number } | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [nodesSearch, setNodesSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!current || !id) return;
    setLoading(true);
    try {
      const [topoRes, membersRes, nodesRes, invRes, edgesRes, clustersRes, protocolsRes, clusterRulesRes] = await Promise.all([
        fetch(`/api/topologies/${id}`),
        fetch(`/api/topologies/${id}/members`),
        fetch(`/api/nodes?context=${current.id}`),
        fetch(`/api/topologies/inventory-fields?context=${current.id}`),
        fetch(`/api/topologies/${id}/edges`),
        fetch(`/api/topologies/${id}/clusters`),
        fetch(`/api/topologies/${id}/protocols`),
        fetch(`/api/topologies/${id}/cluster-rules`),
      ]);
      if (!topoRes.ok) {
        setError(`HTTP ${topoRes.status}`);
        return;
      }
      const topo: TopologyDetail = await topoRes.json();
      setTopology(topo);
      setName(topo.name);
      setDescription(topo.description ?? "");
      setDesign(topo.nodeDesign ?? defaultDesign());
      setMapOptions(topo.mapOptions ?? {});

      if (membersRes.ok) {
        const ms: Member[] = await membersRes.json();
        setMembers(ms);
        setMemberIds(new Set(ms.map((m) => m.nodeId)));
      }
      if (nodesRes.ok) {
        setAllNodes(await nodesRes.json());
      }
      if (invRes.ok) {
        setInventoryCategories(await invRes.json());
      }
      if (edgesRes.ok) {
        setEdges(await edgesRes.json());
      }
      if (clustersRes.ok) {
        setClusters(await clustersRes.json());
      }
      if (protocolsRes.ok) {
        setProtocols(await protocolsRes.json());
      }
      if (clusterRulesRes.ok) {
        setClusterRules(await clusterRulesRes.json());
      }
    } finally {
      setLoading(false);
    }
  }, [current, id]);

  useEffect(() => { load(); }, [load]);

  const filteredNodes = useMemo(() => {
    const q = nodesSearch.trim().toLowerCase();
    if (!q) return allNodes;
    return allNodes.filter((n) =>
      (n.name ?? "").toLowerCase().includes(q) ||
      (n.hostname ?? "").toLowerCase().includes(q) ||
      n.ipAddress.toLowerCase().includes(q)
    );
  }, [allNodes, nodesSearch]);

  const nodeTagsCombined = (n: ContextNode): NodeTagRef[] => {
    const out: NodeTagRef[] = [];
    const seen = new Set<number>();
    for (const tag of [...(n.tags ?? []), ...(n.dynamicTags ?? [])]) {
      if (!seen.has(tag.id)) { seen.add(tag.id); out.push(tag); }
    }
    return out;
  };

  const availableTags = useMemo(() => {
    const map = new Map<number, NodeTagRef>();
    for (const n of allNodes) {
      for (const tag of nodeTagsCombined(n)) {
        if (!map.has(tag.id)) map.set(tag.id, tag);
      }
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [allNodes]);

  const nodesByTag = useMemo(() => {
    const map = new Map<number, number[]>();
    for (const n of allNodes) {
      for (const tag of nodeTagsCombined(n)) {
        const arr = map.get(tag.id) ?? [];
        arr.push(n.id);
        map.set(tag.id, arr);
      }
    }
    return map;
  }, [allNodes]);

  const selectAllFiltered = () => {
    const next = new Set(memberIds);
    filteredNodes.forEach((n) => next.add(n.id));
    setMemberIds(next);
  };

  const deselectAllFiltered = () => {
    const next = new Set(memberIds);
    filteredNodes.forEach((n) => next.delete(n.id));
    setMemberIds(next);
  };

  const toggleByTag = (tagId: number) => {
    const ids = nodesByTag.get(tagId) ?? [];
    const allSelected = ids.every((id) => memberIds.has(id));
    const next = new Set(memberIds);
    if (allSelected) ids.forEach((id) => next.delete(id));
    else ids.forEach((id) => next.add(id));
    setMemberIds(next);
  };

  const toggleMember = (nodeId: number) => {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!topology) return;
    setSaving(true);
    setError(null);
    try {
      const updateRes = await fetch(`/api/topologies/${topology.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim() || topology.name,
          description: description.trim() || null,
          nodeDesign: design,
          mapOptions,
        }),
      });
      if (!updateRes.ok) {
        const err = await updateRes.json().catch(() => null);
        setError(err?.error ?? `HTTP ${updateRes.status}`);
        return;
      }

      const membersRes = await fetch(`/api/topologies/${topology.id}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeIds: Array.from(memberIds) }),
      });
      if (!membersRes.ok) {
        setError(`HTTP ${membersRes.status}`);
        return;
      }
      setSavedAt(Date.now());
      await load();
    } finally {
      setSaving(false);
    }
  };

  const updateDesign = (patch: Partial<NodeDesign>) => {
    setDesign((d) => (d ? { ...d, ...patch } : d));
  };

  const updateLabelElements = (els: LabelElement[]) => {
    setDesign((d) => (d ? { ...d, labelElements: els } : d));
  };

  const createEdge = async (): Promise<Edge | null> => {
    const memberArr = Array.from(memberIds);
    if (memberArr.length < 2) return null;
    const res = await fetch(`/api/topologies/${id}/edges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceNodeId: memberArr[0],
        targetNodeId: memberArr[1],
        style: defaultEdgeStyle(),
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setEdges((prev) => [...prev, created]);
      return created;
    }
    return null;
  };

  const updateEdge = async (edgeId: number, patch: Partial<Edge>) => {
    const current = edges.find((e) => e.id === edgeId);
    if (!current) return;
    const mergedStyle: EdgeStyle | undefined = patch.style
      ? { ...current.style, ...patch.style }
      : undefined;
    const next: Edge = {
      ...current,
      ...patch,
      style: mergedStyle ?? current.style,
    };
    setEdges((prev) => prev.map((e) => (e.id === edgeId ? next : e)));
    const payload: Record<string, unknown> = { ...patch };
    if (mergedStyle) payload.style = mergedStyle;
    await fetch(`/api/topologies/${id}/edges/${edgeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  };

  const deleteEdge = async (edgeId: number) => {
    const res = await fetch(`/api/topologies/${id}/edges/${edgeId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setEdges((prev) => prev.filter((e) => e.id !== edgeId));
    }
  };

  const updateEdgeStyle = (edgeId: number, patch: Partial<EdgeStyle>) => {
    updateEdge(edgeId, { style: patch as EdgeStyle });
  };

  const addEdgeLabel = (edgeId: number) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const labels = [...(edge.style.labels ?? []), defaultEdgeLabel()];
    updateEdgeStyle(edgeId, { labels });
  };

  const updateEdgeLabel = (edgeId: number, labelIdx: number, patch: Partial<EdgeLabel>) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const labels = (edge.style.labels ?? []).map((l, i) => (i === labelIdx ? { ...l, ...patch } : l));
    updateEdgeStyle(edgeId, { labels });
  };

  const removeEdgeLabel = (edgeId: number, labelIdx: number) => {
    const edge = edges.find((e) => e.id === edgeId);
    if (!edge) return;
    const labels = (edge.style.labels ?? []).filter((_, i) => i !== labelIdx);
    updateEdgeStyle(edgeId, { labels });
  };

  const memberNodes = allNodes.filter((n) => memberIds.has(n.id));
  const nodeLabel = (nodeId: number) => {
    const n = allNodes.find((x) => x.id === nodeId);
    return n ? (n.name || n.hostname || n.ipAddress) : `#${nodeId}`;
  };

  const createCluster = async (): Promise<Cluster | null> => {
    const res = await fetch(`/api/topologies/${id}/clusters`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: t("topology.clusterDefaultName"),
        style: defaultClusterStyle(),
        nodeIds: [],
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setClusters((prev) => [...prev, created]);
      return created;
    }
    return null;
  };

  const updateCluster = async (clusterId: number, patch: Partial<Cluster>) => {
    const current = clusters.find((c) => c.id === clusterId);
    if (!current) return;
    const mergedStyle: ClusterStyle | undefined = patch.style
      ? { ...current.style, ...patch.style }
      : undefined;
    const next: Cluster = {
      ...current,
      ...patch,
      style: mergedStyle ?? current.style,
    };
    setClusters((prev) => prev.map((c) => (c.id === clusterId ? next : c)));
    const payload: Record<string, unknown> = { ...patch };
    if (mergedStyle) payload.style = mergedStyle;
    await fetch(`/api/topologies/${id}/clusters/${clusterId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  };

  const updateClusterStyle = (clusterId: number, patch: Partial<ClusterStyle>) => {
    updateCluster(clusterId, { style: patch as ClusterStyle });
  };

  const deleteCluster = async (clusterId: number) => {
    const res = await fetch(`/api/topologies/${id}/clusters/${clusterId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setClusters((prev) => prev.filter((c) => c.id !== clusterId));
    }
  };

  const toggleClusterMember = (clusterId: number, nodeId: number) => {
    const cluster = clusters.find((c) => c.id === clusterId);
    if (!cluster) return;
    const nodeIds = cluster.nodeIds.includes(nodeId)
      ? cluster.nodeIds.filter((id) => id !== nodeId)
      : [...cluster.nodeIds, nodeId];
    updateCluster(clusterId, { nodeIds });
  };

  const createProtocolFromDraft = async (draft: ProtocolDraft): Promise<Protocol | null> => {
    const res = await fetch(`/api/topologies/${id}/protocols`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: draft.name.trim() || draft.type.toUpperCase(),
        type: draft.type,
        inventoryCategoryId: draft.inventoryCategoryId,
        mapping: draft.mapping,
        edgeStyle: draft.edgeStyle,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setProtocols((prev) => [...prev, created]);
      return created;
    }
    return null;
  };

  const updateProtocol = async (protocolId: number, patch: Partial<Protocol>) => {
    const current = protocols.find((p) => p.id === protocolId);
    if (!current) return;
    const mergedMapping: ProtocolMapping | undefined = patch.mapping
      ? { ...current.mapping, ...patch.mapping }
      : undefined;
    const mergedStyle = patch.edgeStyle ? { ...current.edgeStyle, ...patch.edgeStyle } : undefined;
    const next: Protocol = {
      ...current,
      ...patch,
      mapping: mergedMapping ?? current.mapping,
      edgeStyle: mergedStyle ?? current.edgeStyle,
    };
    setProtocols((prev) => prev.map((p) => (p.id === protocolId ? next : p)));
    const payload: Record<string, unknown> = { ...patch };
    if (mergedMapping) payload.mapping = mergedMapping;
    if (mergedStyle) payload.edgeStyle = mergedStyle;
    await fetch(`/api/topologies/${id}/protocols/${protocolId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  };

  const deleteProtocol = async (protocolId: number) => {
    const res = await fetch(`/api/topologies/${id}/protocols/${protocolId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setProtocols((prev) => prev.filter((p) => p.id !== protocolId));
      if (editingProtocolId === protocolId) setEditingProtocolId(null);
    }
  };

  const generateProtocol = async (protocolId: number) => {
    setGeneratingProtocolId(protocolId);
    setGenerateResult(null);
    try {
      const res = await fetch(`/api/topologies/${id}/protocols/${protocolId}/generate`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setProtocols((prev) => prev.map((p) => (p.id === protocolId ? { ...p, lastGeneratedAt: result.protocol.lastGeneratedAt } : p)));
        setGenerateResult({ protocolId, created: result.stats.created, skipped: result.stats.skipped });
        // Refresh edges to display newly generated ones
        const edgesRes = await fetch(`/api/topologies/${id}/edges`);
        if (edgesRes.ok) setEdges(await edgesRes.json());
      }
    } finally {
      setGeneratingProtocolId(null);
    }
  };

  const inventoryColsForRule = (rule: ClusterRule): string[] => {
    if (!rule.inventoryCategoryName) return [];
    const cat = inventoryCategories.find((c) => c.name === rule.inventoryCategoryName);
    return cat?.columns ?? [];
  };

  const createClusterRule = async (): Promise<ClusterRule | null> => {
    const res = await fetch(`/api/topologies/${id}/cluster-rules`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: t("topology.clusterRuleDefaultName"),
        clusterStyle: defaultClusterStyle(),
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setClusterRules((prev) => [...prev, created]);
      return created;
    }
    return null;
  };

  const updateClusterRule = async (ruleId: number, patch: Partial<ClusterRule>) => {
    const current = clusterRules.find((r) => r.id === ruleId);
    if (!current) return;
    const mergedStyle = patch.clusterStyle ? { ...current.clusterStyle, ...patch.clusterStyle } : undefined;
    const next: ClusterRule = {
      ...current,
      ...patch,
      clusterStyle: mergedStyle ?? current.clusterStyle,
    };
    setClusterRules((prev) => prev.map((r) => (r.id === ruleId ? next : r)));
    const payload: Record<string, unknown> = { ...patch };
    if (mergedStyle) payload.clusterStyle = mergedStyle;
    await fetch(`/api/topologies/${id}/cluster-rules/${ruleId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  };

  const deleteClusterRule = async (ruleId: number) => {
    const res = await fetch(`/api/topologies/${id}/cluster-rules/${ruleId}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      setClusterRules((prev) => prev.filter((r) => r.id !== ruleId));
      if (editingClusterRuleId === ruleId) setEditingClusterRuleId(null);
      // Reload clusters since some were just dropped server-side.
      const clustersRes = await fetch(`/api/topologies/${id}/clusters`);
      if (clustersRes.ok) setClusters(await clustersRes.json());
    }
  };

  const generateClusterRule = async (ruleId: number) => {
    setGeneratingClusterRuleId(ruleId);
    setClusterRuleResult(null);
    try {
      const res = await fetch(`/api/topologies/${id}/cluster-rules/${ruleId}/generate`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setClusterRules((prev) => prev.map((r) => (r.id === ruleId ? { ...r, lastGeneratedAt: result.rule.lastGeneratedAt } : r)));
        setClusterRuleResult({ ruleId, created: result.stats.created, members: result.stats.members });
        const clustersRes = await fetch(`/api/topologies/${id}/clusters`);
        if (clustersRes.ok) setClusters(await clustersRes.json());
      }
    } finally {
      setGeneratingClusterRuleId(null);
    }
  };

  if (loading || !topology || !design) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push(`/topology/${topology.id}`)}
            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
            title={t("common.back")}
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Network className="h-6 w-6" />
              {topology.name}
            </h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {t("topology.configureSubtitle")}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {savedAt && Date.now() - savedAt < 3000 && (
            <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <Check className="h-3.5 w-3.5" />
              {t("common.saved")}
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {t("common.save")}
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-2 text-sm text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="flex border-b border-slate-200 dark:border-slate-800 -mt-2">
        {TABS.map((tabDef) => (
          <button
            key={tabDef.key}
            onClick={() => setTab(tabDef.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === tabDef.key
                ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            }`}
          >
            {t(tabDef.labelKey)}
          </button>
        ))}
      </div>

      {tab === "settings" && (
        <div className="space-y-4">
          <div className="space-y-1">
            <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              {t("topology.fieldNameLabel")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
              {t("topology.fieldDescriptionLabel")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm resize-none"
            />
          </div>
          <div className="text-xs text-slate-500 dark:text-slate-400">
            {topology.isPrimary ? t("topology.isPrimary") : t("topology.notPrimaryHint")}
          </div>

          <div className="pt-4 mt-4 border-t border-slate-100 dark:border-slate-800 space-y-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
              {t("topology.mapOptionsTitle")}
            </h3>

            <div className="space-y-1 max-w-md">
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                {t("topology.defaultProtocolFilter")}
              </label>
              <select
                value={(() => {
                  const v = mapOptions.defaultProtocolFilter;
                  if (typeof v === "number") return String(v);
                  return v ?? "manual";
                })()}
                onChange={(e) => {
                  const v = e.target.value;
                  setMapOptions((m) => ({
                    ...m,
                    defaultProtocolFilter: v === "manual" ? v : Number(v),
                  }));
                }}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
              >
                <option value="manual">{t("topology.filterManual")}</option>
                {protocols.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("topology.defaultProtocolFilterHint")}
              </p>
            </div>

            <label className="flex items-start gap-3 text-sm text-slate-700 dark:text-slate-200">
              <input
                type="checkbox"
                checked={mapOptions.aggregateParallelLinks ?? false}
                onChange={(e) => setMapOptions((m) => ({ ...m, aggregateParallelLinks: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-slate-300"
              />
              <div className="flex-1">
                <div className="font-medium">{t("topology.aggregateParallelLinks")}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {t("topology.aggregateParallelLinksHint")}
                </div>
              </div>
            </label>

            {mapOptions.aggregateParallelLinks && (
              <div className="pl-7 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                      {t("topology.aggregateLabelPosition")}
                    </label>
                    <select
                      value={mapOptions.aggregateLabelPosition ?? "center"}
                      onChange={(e) => setMapOptions((m) => ({ ...m, aggregateLabelPosition: e.target.value as MapOptions["aggregateLabelPosition"] }))}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                    >
                      {AGGREGATE_LABEL_POSITIONS.map((o) => (
                        <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                      {t("topology.aggregateLabelFontSize")}
                    </label>
                    <input
                      type="number"
                      min={4}
                      max={32}
                      step={1}
                      value={mapOptions.aggregateLabelFontSize ?? 6}
                      onChange={(e) => setMapOptions((m) => ({ ...m, aggregateLabelFontSize: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                      {t("topology.aggregateLabelColor")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={mapOptions.aggregateLabelColor ?? mapOptions.aggregateBorderColor ?? "#1e293b"}
                        onChange={(e) => setMapOptions((m) => ({ ...m, aggregateLabelColor: e.target.value }))}
                        className="h-9 w-9 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={mapOptions.aggregateLabelColor ?? ""}
                        onChange={(e) => setMapOptions((m) => ({ ...m, aggregateLabelColor: e.target.value || undefined }))}
                        placeholder={t("topology.aggregateLabelColorAuto")}
                        className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                      {t("topology.aggregateBorderColor")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={mapOptions.aggregateBorderColor ?? "#94a3b8"}
                        onChange={(e) => setMapOptions((m) => ({ ...m, aggregateBorderColor: e.target.value }))}
                        className="h-9 w-9 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={mapOptions.aggregateBorderColor ?? "#94a3b8"}
                        onChange={(e) => setMapOptions((m) => ({ ...m, aggregateBorderColor: e.target.value }))}
                        className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                      {t("topology.aggregateBorderWidth")}
                    </label>
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={10}
                      value={mapOptions.aggregateBorderWidth ?? 0.5}
                      onChange={(e) => setMapOptions((m) => ({ ...m, aggregateBorderWidth: Number(e.target.value) }))}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                      {t("topology.aggregateFillColor")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        disabled={mapOptions.aggregateTransparent}
                        value={mapOptions.aggregateFillColor ?? "#f1f5f9"}
                        onChange={(e) => setMapOptions((m) => ({ ...m, aggregateFillColor: e.target.value }))}
                        className="h-9 w-9 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5 disabled:opacity-40 disabled:cursor-not-allowed"
                      />
                      <input
                        type="text"
                        disabled={mapOptions.aggregateTransparent}
                        value={mapOptions.aggregateFillColor ?? "#f1f5f9"}
                        onChange={(e) => setMapOptions((m) => ({ ...m, aggregateFillColor: e.target.value }))}
                        className="flex-1 min-w-0 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono disabled:opacity-40"
                      />
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={mapOptions.aggregateTransparent ?? false}
                    onChange={(e) => setMapOptions((m) => ({ ...m, aggregateTransparent: e.target.checked }))}
                    className="h-4 w-4 rounded border-slate-300"
                  />
                  {t("topology.aggregateTransparent")}
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "members" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {t("topology.membersSelected").replace("{n}", String(memberIds.size))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400" />
              <input
                type="text"
                value={nodesSearch}
                onChange={(e) => setNodesSearch(e.target.value)}
                placeholder={t("topology.searchNodes")}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-8 pr-3 py-1.5 text-sm w-64"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 px-3 py-2">
            <button
              type="button"
              onClick={selectAllFiltered}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {t("topology.selectAllVisible")}
            </button>
            <button
              type="button"
              onClick={deselectAllFiltered}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1 text-xs hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              {t("topology.deselectAllVisible")}
            </button>
            {availableTags.length > 0 && (
              <>
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold ml-2">
                  {t("topology.selectByTag")}
                </span>
                {availableTags.map((tag) => {
                  const ids = nodesByTag.get(tag.id) ?? [];
                  const allSelected = ids.length > 0 && ids.every((id) => memberIds.has(id));
                  const someSelected = !allSelected && ids.some((id) => memberIds.has(id));
                  return (
                    <button
                      key={tag.id}
                      type="button"
                      onClick={() => toggleByTag(tag.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-colors border ${
                        allSelected
                          ? "border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
                          : someSelected
                          ? "border-blue-200/60 dark:border-blue-600/40 bg-blue-50/50 dark:bg-blue-500/5 text-blue-600 dark:text-blue-400"
                          : "border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                      }`}
                      title={`${ids.length} ${t("topology.nodesLabel")}`}
                    >
                      {tag.color && (
                        <span className="h-2 w-2 rounded-full" style={{ background: tag.color }} />
                      )}
                      {tag.name}
                      <span className="text-[10px] text-slate-400">({ids.length})</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 max-h-[60vh] overflow-y-auto">
            {filteredNodes.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">{t("topology.noNodes")}</p>
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredNodes.map((n) => {
                  const checked = memberIds.has(n.id);
                  return (
                    <li key={n.id}>
                      <label className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleMember(n.id)}
                          className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-slate-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-slate-900 dark:text-white truncate">
                            {n.name || n.hostname || n.ipAddress}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">
                            {n.ipAddress}
                          </div>
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      )}

      {tab === "design" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="space-y-4 lg:col-span-1">
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                {t("topology.designShape")}
              </label>
              <select
                value={design.shape}
                onChange={(e) => updateDesign({ shape: e.target.value })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
              >
                {SHAPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  {t("topology.designWidth")}
                </label>
                <input
                  type="number"
                  min={20}
                  max={400}
                  value={design.width}
                  onChange={(e) => updateDesign({ width: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                  {t("topology.designHeight")}
                </label>
                <input
                  type="number"
                  min={20}
                  max={400}
                  value={design.height}
                  onChange={(e) => updateDesign({ height: Number(e.target.value) })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                {t("topology.designBorderWidth")}
              </label>
              <input
                type="number"
                step={0.1}
                min={0}
                max={10}
                value={design.borderWidth}
                onChange={(e) => updateDesign({ borderWidth: Number(e.target.value) })}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                {t("topology.designBorderColor")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={design.borderColor}
                  onChange={(e) => updateDesign({ borderColor: e.target.value })}
                  className="h-9 w-9 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={design.borderColor}
                  onChange={(e) => updateDesign({ borderColor: e.target.value })}
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">
                {t("topology.designBgColor")}
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={design.bgColor}
                  onChange={(e) => updateDesign({ bgColor: e.target.value })}
                  className="h-9 w-9 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                />
                <input
                  type="text"
                  value={design.bgColor}
                  onChange={(e) => updateDesign({ bgColor: e.target.value })}
                  className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-xs font-mono"
                />
              </div>
            </div>
          </div>

          <div className="lg:col-span-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-3">
              {t("topology.designLabelsTitle")}
            </h3>
            <NodeLabelEditor
              elements={design.labelElements ?? []}
              onChange={updateLabelElements}
              node={design}
              inventoryCategories={inventoryCategories}
            />
          </div>
        </div>
      )}

      {tab === "links" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {edges.length} {t("topology.linksLabel")}
            </div>
            <button
              onClick={async () => {
                const created = await createEdge();
                if (created) setEditingEdgeId(created.id);
              }}
              disabled={memberIds.size < 2}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-3 py-1.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={memberIds.size < 2 ? t("topology.linkNeedTwoMembers") : ""}
            >
              <Plus className="h-4 w-4" />
              {t("topology.linkNew")}
            </button>
          </div>

          {edges.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-12 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("topology.linksEmpty")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <table className="w-full">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-2">{t("topology.colLinkPair")}</th>
                    <th className="px-4 py-2">{t("topology.edgeType")}</th>
                    <th className="px-4 py-2">{t("topology.edgeLabels")}</th>
                    <th className="px-4 py-2">{t("topology.aggregationGroup")}</th>
                    <th className="px-4 py-2 text-right">{t("topology.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {edges.map((edge) => {
                    const labels = edge.style.labels ?? [];
                    const labelsSummary = labels.length === 0
                      ? "—"
                      : labels.map((l) => l.text).filter(Boolean).slice(0, 3).join(", ") + (labels.length > 3 ? "…" : "");
                    const typeLabel = EDGE_TYPE_OPTIONS.find((o) => o.value === edge.style.type)?.labelKey;
                    return (
                      <tr
                        key={edge.id}
                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                        onClick={() => setEditingEdgeId(edge.id)}
                      >
                        <td className="px-4 py-2.5 text-sm">
                          <span className="font-medium text-slate-900 dark:text-white">{nodeLabel(edge.sourceNodeId)}</span>
                          <span className="text-slate-400 px-2">→</span>
                          <span className="font-medium text-slate-900 dark:text-white">{nodeLabel(edge.targetNodeId)}</span>
                        </td>
                        <td className="px-4 py-2.5 text-xs">
                          <span className="inline-flex items-center gap-1.5">
                            <span
                              className="inline-block h-2.5 w-6 rounded-sm"
                              style={{ background: edge.style.color, opacity: edge.style.dash === "dotted" ? 0.4 : edge.style.dash === "dashed" ? 0.7 : 1 }}
                            />
                            <span className="text-slate-600 dark:text-slate-300">
                              {typeLabel ? t(typeLabel) : edge.style.type}
                            </span>
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 max-w-xs truncate">
                          {labels.length > 0 && (
                            <span className="inline-flex items-center gap-1.5">
                              <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 text-[10px]">{labels.length}</span>
                              <span className="truncate">{labelsSummary}</span>
                            </span>
                          )}
                          {labels.length === 0 && "—"}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                          {edge.style.aggregationGroup?.trim() || "—"}
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteEdge(edge.id); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                            title={t("common.delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {editingEdgeId !== null && (() => {
        const edge = edges.find((e) => e.id === editingEdgeId);
        if (!edge) return null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setEditingEdgeId(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {t("topology.linkEditTitle")}
                </h2>
                <button
                  onClick={() => setEditingEdgeId(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-end">
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.colLinkSource")}</label>
                  <select
                    value={edge.sourceNodeId}
                    onChange={(e) => updateEdge(edge.id, { sourceNodeId: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
                  >
                    {memberNodes.map((n) => (
                      <option key={n.id} value={n.id}>{nodeLabel(n.id)}</option>
                    ))}
                  </select>
                </div>
                <span className="text-slate-400 text-sm pb-2">→</span>
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.colLinkTarget")}</label>
                  <select
                    value={edge.targetNodeId}
                    onChange={(e) => updateEdge(edge.id, { targetNodeId: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
                  >
                    {memberNodes.map((n) => (
                      <option key={n.id} value={n.id}>{nodeLabel(n.id)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.edgeType")}</label>
                  <select
                    value={edge.style.type}
                    onChange={(e) => updateEdgeStyle(edge.id, { type: e.target.value as EdgeStyle["type"] })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
                  >
                    {EDGE_TYPE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.edgeDash")}</label>
                  <select
                    value={edge.style.dash}
                    onChange={(e) => updateEdgeStyle(edge.id, { dash: e.target.value as EdgeStyle["dash"] })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
                  >
                    {EDGE_DASH_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.edgeWidth")}</label>
                  <input
                    type="number"
                    step={0.5}
                    min={0.5}
                    max={10}
                    value={edge.style.width}
                    onChange={(e) => updateEdgeStyle(edge.id, { width: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.edgeColor")}</label>
                  <div className="flex items-center gap-1">
                    <input
                      type="color"
                      value={edge.style.color}
                      onChange={(e) => updateEdgeStyle(edge.id, { color: e.target.value })}
                      className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                    />
                    <input
                      type="text"
                      value={edge.style.color}
                      onChange={(e) => updateEdgeStyle(edge.id, { color: e.target.value })}
                      className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-[10px] font-mono"
                    />
                  </div>
                </div>
              </div>

              {edge.style.type === "curved" && (
                <div className="space-y-1 max-w-xs">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.edgeCurveTension")}</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="range"
                      min={0}
                      max={1}
                      step={0.05}
                      value={edge.style.curveTension ?? 0.3}
                      onChange={(e) => updateEdgeStyle(edge.id, { curveTension: Number(e.target.value) })}
                      className="flex-1 accent-blue-600"
                    />
                    <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-10 text-right">
                      {(edge.style.curveTension ?? 0.3).toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {mapOptions.aggregateParallelLinks && (
                <div className="space-y-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      {t("topology.aggregationGroup")}
                    </label>
                    <input
                      type="text"
                      value={edge.style.aggregationGroup ?? ""}
                      onChange={(e) => updateEdgeStyle(edge.id, { aggregationGroup: e.target.value })}
                      placeholder={t("topology.aggregationGroupPlaceholder")}
                      list={`agg-groups-modal-${edge.id}`}
                      className="w-full max-w-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
                    />
                    <datalist id={`agg-groups-modal-${edge.id}`}>
                      {Array.from(new Set(edges.map((e) => e.style.aggregationGroup).filter((g): g is string => !!g && g.trim() !== ""))).map((g) => (
                        <option key={g} value={g} />
                      ))}
                    </datalist>
                    <p className="text-[10px] text-slate-400">{t("topology.aggregationGroupHint")}</p>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      {t("topology.aggregationLabel")}
                    </label>
                    <input
                      type="text"
                      value={edge.style.aggregationLabel ?? ""}
                      onChange={(e) => updateEdgeStyle(edge.id, { aggregationLabel: e.target.value })}
                      placeholder={edge.style.aggregationGroup ?? t("topology.aggregationLabelPlaceholder")}
                      className="w-full max-w-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.edgeLabels")}</span>
                  <button
                    onClick={() => addEdgeLabel(edge.id)}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <Plus className="h-3 w-3" />
                    {t("topology.addLabel")}
                  </button>
                </div>
                {(edge.style.labels ?? []).map((label, lidx) => (
                  <div key={lidx} className="grid grid-cols-[1fr_120px_60px_60px_auto] gap-2 items-center">
                    <input
                      type="text"
                      value={label.text}
                      onChange={(e) => updateEdgeLabel(edge.id, lidx, { text: e.target.value })}
                      placeholder={t("topology.labelTextPlaceholder")}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
                    />
                    <select
                      value={label.position}
                      onChange={(e) => updateEdgeLabel(edge.id, lidx, { position: e.target.value as EdgeLabel["position"] })}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
                    >
                      {LABEL_POSITION_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                      ))}
                    </select>
                    <input
                      type="number"
                      step={1}
                      min={4}
                      max={32}
                      value={label.fontSize ?? 6}
                      onChange={(e) => updateEdgeLabel(edge.id, lidx, { fontSize: Number(e.target.value) })}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
                      title={t("topology.labelFontSize")}
                    />
                    <input
                      type="color"
                      value={label.color ?? "#475569"}
                      onChange={(e) => updateEdgeLabel(edge.id, lidx, { color: e.target.value })}
                      className="h-7 w-full rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                      title={t("topology.labelColor")}
                    />
                    <button
                      onClick={() => removeEdgeLabel(edge.id, lidx)}
                      className="p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={async () => {
                    await deleteEdge(edge.id);
                    setEditingEdgeId(null);
                  }}
                  className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 px-3 py-1.5 rounded-lg"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("topology.delete")}
                </button>
                <button
                  onClick={() => setEditingEdgeId(null)}
                  className="rounded-lg bg-slate-900 dark:bg-white px-4 py-1.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {tab === "clusters" && (() => {
        const manualClusters = clusters.filter((c) => c.protocolId == null);
        return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {manualClusters.length} {t("topology.clustersLabel")}
            </div>
            <button
              onClick={async () => {
                const created = await createCluster();
                if (created) setEditingClusterId(created.id);
              }}
              disabled={memberIds.size < 2}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-3 py-1.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title={memberIds.size < 2 ? t("topology.linkNeedTwoMembers") : ""}
            >
              <Plus className="h-4 w-4" />
              {t("topology.clusterNew")}
            </button>
          </div>

          {manualClusters.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-12 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("topology.clustersEmpty")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <table className="w-full">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-2">{t("topology.clusterName")}</th>
                    <th className="px-4 py-2">{t("topology.clusterMembers")}</th>
                    <th className="px-4 py-2">{t("topology.clusterStyle")}</th>
                    <th className="px-4 py-2 text-right">{t("topology.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {manualClusters.map((cluster) => (
                    <tr
                      key={cluster.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      onClick={() => setEditingClusterId(cluster.id)}
                    >
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-white">
                        {cluster.name}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 text-[10px]">{cluster.nodeIds.length}</span>
                          <span className="truncate max-w-md">
                            {cluster.nodeIds.slice(0, 3).map((nid) => nodeLabel(nid)).join(", ")}
                            {cluster.nodeIds.length > 3 ? "…" : ""}
                          </span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-xs">
                        <span className="inline-flex items-center gap-1.5">
                          <span
                            className="inline-block h-3 w-6 rounded"
                            style={{
                              border: `${cluster.style.borderWidth}px ${cluster.style.dash === "solid" ? "solid" : cluster.style.dash} ${cluster.style.borderColor}`,
                              background: cluster.style.transparent ? "transparent" : cluster.style.fillColor + "33",
                            }}
                          />
                          <span className="text-slate-500 dark:text-slate-400">{cluster.style.dash}</span>
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteCluster(cluster.id); }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          title={t("common.delete")}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        );
      })()}

      {tab === "areas" && (() => {
        // Group auto-generated clusters by their protocol. Each protocol's areas are
        // shown together so we can later mix ISIS, OSPF, etc. in the same view.
        const areaClusters = clusters.filter((c) => c.protocolId != null);
        const protocolsById = new Map(protocols.map((p) => [p.id, p]));
        const grouped = new Map<number, Cluster[]>();
        for (const c of areaClusters) {
          const pid = c.protocolId as number;
          const list = grouped.get(pid) ?? [];
          list.push(c);
          grouped.set(pid, list);
        }
        return (
          <div className="space-y-4">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {areaClusters.length} {t("topology.areasLabel")}
            </div>
            {areaClusters.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-12 text-center">
                <p className="text-sm text-slate-500 dark:text-slate-400">{t("topology.areasEmpty")}</p>
              </div>
            ) : (
              <div className="space-y-6">
                {Array.from(grouped.entries()).map(([pid, areas]) => {
                  const proto = protocolsById.get(pid);
                  const protoLabel = proto ? `${proto.name} (${proto.type.toUpperCase()})` : `#${pid}`;
                  return (
                    <div key={pid} className="space-y-2">
                      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {protoLabel}
                      </div>
                      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                        <table className="w-full">
                          <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                            <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              <th className="px-4 py-2">{t("topology.areaName")}</th>
                              <th className="px-4 py-2">{t("topology.clusterMembers")}</th>
                              <th className="px-4 py-2">{t("topology.clusterStyle")}</th>
                              <th className="px-4 py-2 text-right">{t("topology.colActions")}</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {areas.map((cluster) => {
                              const off = cluster.style.labelOffset ?? { dx: 0, dy: 0 };
                              const hasOffset = Math.abs(off.dx) > 0.5 || Math.abs(off.dy) > 0.5;
                              return (
                                <tr
                                  key={cluster.id}
                                  className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                                  onClick={() => setEditingClusterId(cluster.id)}
                                >
                                  <td className="px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-white">
                                    {cluster.name}
                                  </td>
                                  <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                                    <span className="inline-flex items-center gap-1.5">
                                      <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-1.5 text-[10px]">{cluster.nodeIds.length}</span>
                                      <span className="truncate max-w-md">
                                        {cluster.nodeIds.slice(0, 3).map((nid) => nodeLabel(nid)).join(", ")}
                                        {cluster.nodeIds.length > 3 ? "…" : ""}
                                      </span>
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-xs">
                                    <span className="inline-flex items-center gap-1.5">
                                      <span
                                        className="inline-block h-3 w-6 rounded"
                                        style={{
                                          border: `${cluster.style.borderWidth}px ${cluster.style.dash === "solid" ? "solid" : cluster.style.dash} ${cluster.style.borderColor}`,
                                          background: cluster.style.transparent ? "transparent" : cluster.style.fillColor + "33",
                                        }}
                                      />
                                      <span className="text-slate-500 dark:text-slate-400">{cluster.style.dash}</span>
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 text-right">
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (!hasOffset) return;
                                        updateClusterStyle(cluster.id, { labelOffset: { dx: 0, dy: 0 } });
                                      }}
                                      disabled={!hasOffset}
                                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                                      title={t("topology.areaResetLabel")}
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })()}

      {editingClusterId !== null && (() => {
        const cluster = clusters.find((c) => c.id === editingClusterId);
        if (!cluster) return null;
        const tooFew = cluster.nodeIds.length < 2;
        const isArea = cluster.protocolId != null;
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setEditingClusterId(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {isArea ? t("topology.areaEditTitle") : t("topology.clusterEditTitle")}
                </h2>
                <button
                  onClick={() => setEditingClusterId(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  ✕
                </button>
              </div>

              {isArea && (
                <div className="rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">
                  {t("topology.areaAutoGenHint")}
                </div>
              )}

              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                  {t("topology.clusterName")}
                </label>
                <input
                  type="text"
                  value={cluster.name}
                  onChange={(e) => updateCluster(cluster.id, { name: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                    {t("topology.clusterMembers")} ({cluster.nodeIds.length})
                  </label>
                  {tooFew && (
                    <span className="text-[10px] text-amber-600 dark:text-amber-400">
                      {t("topology.clusterMinMembersHint")}
                    </span>
                  )}
                </div>
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 max-h-48 overflow-y-auto">
                  {memberNodes.length === 0 ? (
                    <p className="p-3 text-xs text-slate-400 italic">{t("topology.noNodes")}</p>
                  ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                      {memberNodes.map((n) => {
                        const checked = cluster.nodeIds.includes(n.id);
                        return (
                          <li key={n.id}>
                            <label className="flex items-center gap-3 px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleClusterMember(cluster.id, n.id)}
                                className="h-3.5 w-3.5 rounded border-slate-300"
                              />
                              <span className="text-xs text-slate-900 dark:text-white truncate">
                                {nodeLabel(n.id)}
                              </span>
                              <span className="text-[10px] text-slate-400 font-mono ml-auto">{n.ipAddress}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                  {t("topology.clusterStyleTitle")}
                </h3>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.clusterBorderColor")}</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="color"
                        value={cluster.style.borderColor}
                        onChange={(e) => updateClusterStyle(cluster.id, { borderColor: e.target.value })}
                        className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={cluster.style.borderColor}
                        onChange={(e) => updateClusterStyle(cluster.id, { borderColor: e.target.value })}
                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-[10px] font-mono"
                      />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.clusterBorderWidth")}</label>
                    <input
                      type="number"
                      step={0.5}
                      min={0}
                      max={10}
                      value={cluster.style.borderWidth}
                      onChange={(e) => updateClusterStyle(cluster.id, { borderWidth: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.edgeDash")}</label>
                    <select
                      value={cluster.style.dash}
                      onChange={(e) => updateClusterStyle(cluster.id, { dash: e.target.value as ClusterStyle["dash"] })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                    >
                      {EDGE_DASH_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.clusterFillColor")}</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="color"
                        disabled={cluster.style.transparent}
                        value={cluster.style.fillColor}
                        onChange={(e) => updateClusterStyle(cluster.id, { fillColor: e.target.value })}
                        className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5 disabled:opacity-40"
                      />
                      <input
                        type="text"
                        disabled={cluster.style.transparent}
                        value={cluster.style.fillColor}
                        onChange={(e) => updateClusterStyle(cluster.id, { fillColor: e.target.value })}
                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-[10px] font-mono disabled:opacity-40"
                      />
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                  <input
                    type="checkbox"
                    checked={cluster.style.transparent}
                    onChange={(e) => updateClusterStyle(cluster.id, { transparent: e.target.checked })}
                    className="h-3.5 w-3.5 rounded border-slate-300"
                  />
                  {t("topology.clusterTransparent")}
                </label>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.clusterShape")}</label>
                    <select
                      value={cluster.style.shape ?? "rectangle"}
                      onChange={(e) => updateClusterStyle(cluster.id, { shape: e.target.value as ClusterStyle["shape"] })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                    >
                      {CLUSTER_SHAPES.map((o) => (
                        <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.clusterPadding")}</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={cluster.style.padding}
                      onChange={(e) => updateClusterStyle(cluster.id, { padding: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.clusterRadius")}</label>
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      value={cluster.style.borderRadius}
                      onChange={(e) => updateClusterStyle(cluster.id, { borderRadius: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.clusterLabelVisibility")}</label>
                    <div className="flex items-center gap-2 h-[30px]">
                      <input
                        type="checkbox"
                        checked={cluster.style.labelPosition !== "none"}
                        onChange={(e) => updateClusterStyle(cluster.id, {
                          labelPosition: e.target.checked ? "top" : "none",
                        })}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      {cluster.style.labelPosition !== "none" ? (
                        <select
                          value={cluster.style.labelPosition}
                          onChange={(e) => updateClusterStyle(cluster.id, { labelPosition: e.target.value as ClusterStyle["labelPosition"] })}
                          className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-xs"
                        >
                          <option value="top">{t("topology.clusterLabelTop")}</option>
                          <option value="bottom">{t("topology.clusterLabelBottom")}</option>
                        </select>
                      ) : (
                        <span className="text-xs text-slate-400">{t("topology.clusterLabelHidden")}</span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.aggregateLabelFontSize")}</label>
                    <input
                      type="number"
                      min={4}
                      max={32}
                      step={1}
                      value={cluster.style.labelFontSize}
                      onChange={(e) => updateClusterStyle(cluster.id, { labelFontSize: Number(e.target.value) })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                    />
                  </div>
                </div>

                {cluster.style.labelPosition !== "none" && (
                  <div className="space-y-1 max-w-xs">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.aggregateLabelColor")}</label>
                    <div className="flex items-center gap-1">
                      <input
                        type="color"
                        value={cluster.style.labelColor}
                        onChange={(e) => updateClusterStyle(cluster.id, { labelColor: e.target.value })}
                        className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        value={cluster.style.labelColor}
                        onChange={(e) => updateClusterStyle(cluster.id, { labelColor: e.target.value })}
                        className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-[10px] font-mono"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  onClick={async () => {
                    await deleteCluster(cluster.id);
                    setEditingClusterId(null);
                  }}
                  className="flex items-center gap-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 px-3 py-1.5 rounded-lg"
                >
                  <Trash2 className="h-4 w-4" />
                  {t("topology.delete")}
                </button>
                <button
                  onClick={() => setEditingClusterId(null)}
                  className="rounded-lg bg-slate-900 dark:bg-white px-4 py-1.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100"
                >
                  {t("common.close")}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {tab === "protocols" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {protocols.length} {t("topology.protocolsLabel")}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => {
                  setEditingProtocolId(null);
                  setProtocolWorkflowMode("create");
                }}
                disabled={memberIds.size < 2}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-3 py-1.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title={memberIds.size < 2 ? t("topology.linkNeedTwoMembers") : ""}
              >
                <Plus className="h-4 w-4" />
                {t("topology.protocolAdd")}
              </button>
            </div>
          </div>

          {protocols.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-12 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("topology.protocolsEmpty")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <table className="w-full">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-2">{t("topology.protocolName")}</th>
                    <th className="px-4 py-2">{t("topology.protocolType")}</th>
                    <th className="px-4 py-2">{t("topology.protocolCategory")}</th>
                    <th className="px-4 py-2">{t("topology.protocolLastGen")}</th>
                    <th className="px-4 py-2 text-right">{t("topology.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {protocols.map((p) => (
                    <tr
                      key={p.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      onClick={() => {
                        setEditingProtocolId(p.id);
                        setProtocolWorkflowMode("edit");
                      }}
                    >
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-white">{p.name}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 uppercase">{p.type}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                        {p.inventoryCategoryName ?? <span className="italic text-amber-600">{t("topology.protocolNoCategory")}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                        {p.lastGeneratedAt ? new Date(p.lastGeneratedAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); generateProtocol(p.id); }}
                            disabled={!p.inventoryCategoryId || !p.mapping.destNodeColumn || generatingProtocolId === p.id}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {generatingProtocolId === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            {t("topology.protocolGenerate")}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteProtocol(p.id); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                            title={t("common.delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {generateResult && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {t("topology.protocolGenerateResult")
                .replace("{created}", String(generateResult.created))
                .replace("{skipped}", String(generateResult.skipped))}
            </div>
          )}
        </div>
      )}

      {tab === "clusterRules" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-slate-600 dark:text-slate-300">
              {clusterRules.length} {t("topology.clusterRulesLabel")}
            </div>
            <button
              onClick={async () => {
                const created = await createClusterRule();
                if (created) setEditingClusterRuleId(created.id);
              }}
              disabled={memberIds.size < 1}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-3 py-1.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("topology.clusterRuleAdd")}
            </button>
          </div>

          {clusterRules.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/50 p-12 text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400">{t("topology.clusterRulesEmpty")}</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <table className="w-full">
                <thead className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    <th className="px-4 py-2">{t("topology.protocolName")}</th>
                    <th className="px-4 py-2">{t("topology.protocolCategory")}</th>
                    <th className="px-4 py-2">{t("topology.clusterRuleGroupByColumn")}</th>
                    <th className="px-4 py-2">{t("topology.protocolLastGen")}</th>
                    <th className="px-4 py-2 text-right">{t("topology.colActions")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {clusterRules.map((r) => (
                    <tr
                      key={r.id}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer transition-colors"
                      onClick={() => setEditingClusterRuleId(r.id)}
                    >
                      <td className="px-4 py-2.5 text-sm font-medium text-slate-900 dark:text-white">{r.name}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                        {r.inventoryCategoryName ?? <span className="italic text-amber-600">{t("topology.protocolNoCategory")}</span>}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {r.groupByColumn || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-slate-500 dark:text-slate-400">
                        {r.lastGeneratedAt ? new Date(r.lastGeneratedAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); generateClusterRule(r.id); }}
                            disabled={!r.inventoryCategoryId || !r.groupByColumn || generatingClusterRuleId === r.id}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                          >
                            {generatingClusterRuleId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                            {t("topology.protocolGenerate")}
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); deleteClusterRule(r.id); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                            title={t("common.delete")}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {clusterRuleResult && (
            <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              {t("topology.clusterRuleGenerateResult")
                .replace("{created}", String(clusterRuleResult.created))
                .replace("{members}", String(clusterRuleResult.members))}
            </div>
          )}
        </div>
      )}

      {editingClusterRuleId !== null && (() => {
        const r = clusterRules.find((x) => x.id === editingClusterRuleId);
        if (!r) return null;
        const cols = inventoryColsForRule(r);
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setEditingClusterRuleId(null)}
          >
            <div
              className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-4">
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
                  {t("topology.clusterRuleEdit")}
                </h2>
                <button
                  onClick={() => setEditingClusterRuleId(null)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="space-y-4 px-6 py-4">
                <div className="space-y-1">
                  <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.protocolName")}</label>
                  <input
                    type="text"
                    value={r.name}
                    onChange={(e) => updateClusterRule(r.id, { name: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.protocolCategory")}</label>
                    <select
                      value={r.inventoryCategoryId ?? ""}
                      onChange={(e) => updateClusterRule(r.id, {
                        inventoryCategoryId: e.target.value ? Number(e.target.value) : null,
                        inventoryCategoryName: e.target.value
                          ? (inventoryCategories.find((c) => c.id === Number(e.target.value))?.name ?? null)
                          : null,
                        groupByColumn: "",
                      })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm"
                    >
                      <option value="">—</option>
                      {inventoryCategories.filter((c) => c.id !== null).map((c) => (
                        <option key={c.id ?? ""} value={c.id ?? ""}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.clusterRuleGroupByColumn")}</label>
                    <select
                      value={r.groupByColumn}
                      onChange={(e) => updateClusterRule(r.id, { groupByColumn: e.target.value })}
                      disabled={cols.length === 0}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2.5 py-1.5 text-sm disabled:opacity-40"
                    >
                      <option value="">—</option>
                      {cols.map((col) => <option key={col} value={col}>{col}</option>)}
                    </select>
                  </div>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {t("topology.clusterRuleHint")}
                </p>

                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <h3 className="text-xs font-semibold text-slate-700 dark:text-slate-200">
                    {t("topology.clusterStyleTitle")}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="space-y-1">
                      <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.clusterShape")}</label>
                      <select
                        value={r.clusterStyle.shape ?? "rectangle"}
                        onChange={(e) => updateClusterRule(r.id, { clusterStyle: { shape: e.target.value as ClusterStyle["shape"] } })}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                      >
                        {CLUSTER_SHAPES.map((o) => (
                          <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.clusterBorderColor")}</label>
                      <input
                        type="color"
                        value={r.clusterStyle.borderColor ?? "#ef4444"}
                        onChange={(e) => updateClusterRule(r.id, { clusterStyle: { borderColor: e.target.value, fillColor: e.target.value, labelColor: e.target.value } })}
                        className="h-7 w-full rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.clusterPadding")}</label>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        step={1}
                        value={r.clusterStyle.padding ?? 5}
                        onChange={(e) => updateClusterRule(r.id, { clusterStyle: { padding: Number(e.target.value) } })}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.clusterLabelPosition")}</label>
                      <select
                        value={r.clusterStyle.labelPosition ?? "none"}
                        onChange={(e) => updateClusterRule(r.id, { clusterStyle: { labelPosition: e.target.value as ClusterStyle["labelPosition"] } })}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                      >
                        {CLUSTER_LABEL_POSITIONS.map((o) => (
                          <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {protocolWorkflowMode !== null && (() => {
        const editing =
          protocolWorkflowMode === "edit" && editingProtocolId !== null
            ? protocols.find((p) => p.id === editingProtocolId) ?? null
            : null;
        const initial: ProtocolDraft | undefined = editing
          ? {
              name: editing.name,
              type: editing.type,
              inventoryCategoryId: editing.inventoryCategoryId,
              inventoryCategoryName: editing.inventoryCategoryName,
              mapping: { ...editing.mapping },
              edgeStyle: { ...editing.edgeStyle },
            }
          : undefined;
        return (
          <ProtocolWorkflowModal
            mode={protocolWorkflowMode}
            initial={initial}
            inventoryCategories={inventoryCategories}
            aggregateParallelLinksEnabled={mapOptions.aggregateParallelLinks ?? false}
            onCancel={() => {
              setProtocolWorkflowMode(null);
              setEditingProtocolId(null);
            }}
            onSubmit={async (draft) => {
              if (protocolWorkflowMode === "edit" && editing) {
                await updateProtocol(editing.id, {
                  name: draft.name.trim() || editing.name,
                  inventoryCategoryId: draft.inventoryCategoryId,
                  inventoryCategoryName: draft.inventoryCategoryName,
                  mapping: draft.mapping as ProtocolMapping,
                  edgeStyle: draft.edgeStyle as Partial<EdgeStyle>,
                });
              } else {
                await createProtocolFromDraft(draft);
              }
              setProtocolWorkflowMode(null);
              setEditingProtocolId(null);
            }}
          />
        );
      })()}

    </div>
  );
}

function defaultDesign(): NodeDesign {
  return {
    shape: "round-rectangle",
    width: 100,
    height: 40,
    borderWidth: 0.5,
    borderColor: "#94a3b8",
    bgColor: "#ffffff",
    labelElements: [],
  };
}
