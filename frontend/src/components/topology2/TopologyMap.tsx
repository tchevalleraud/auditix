"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  BringToFront,
  ChevronDown,
  ChevronUp,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Minus,
  Plus,
  RefreshCw,
  SendToBack,
  Settings,
  Square,
  Trash2,
  Type as TypeIcon,
  UnfoldHorizontal,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import type { LabelElement, NodeDesign } from "@/components/topology2/NodeLabelEditor";

interface GraphNode {
  nodeId: number;
  name: string | null;
  hostname: string | null;
  ipAddress: string;
  manufacturer: string | null;
  model: string | null;
  complianceScore: string | null;
  isReachable: boolean | null;
  styleOverride: NodeDesign | null;
  inventory: Record<string, Record<string, Record<string, string | null>>>;
  position: { x: number; y: number } | null;
}

interface GraphEdgeLabel {
  text: string;
  position: "source" | "middle" | "target";
  offset?: number;
  fontSize?: number;
  color?: string;
  fontWeight?: number;
  background?: boolean;
  // Coloured background pill — used by STP/MSTP port role badges. When set,
  // the label is rendered as a filled rounded rect with white text.
  backgroundColor?: string;
  // Small coloured pill rendered NEXT TO the main text (same horizontal line)
  // — used by STP/MSTP to keep [role-badge] [port (priority)] aligned in a
  // single row. The pill sits on the node side of the text (left at source,
  // right at target). `borderWidth` carves a margin of the surrounding
  // background colour around the coloured rect (default 1).
  pill?: { text: string; bgColor: string; textColor?: string; borderWidth?: number };
  // Extra shift ALONG the edge's tangent — useful to fan out several labels
  // anchored at the same position (e.g. port label + cost label both placed
  // near "source"). Positive moves toward the centre of the link.
  tangentOffset?: number;
}

interface GraphEdgeStyle {
  type: "straight" | "orthogonal" | "curved";
  color: string;
  width: number;
  dash: "solid" | "dashed" | "dotted";
  curveTension?: number;
  // Perpendicular gap (px) between parallel links of the same node pair. When
  // set on any edge of a pair, it overrides the default PARALLEL_SPACING for the
  // whole pair. Lets the user widen the spacing to avoid label overlap.
  parallelSpacing?: number;
  labels?: GraphEdgeLabel[];
  aggregationGroup?: string;
  aggregationLabel?: string;
  // ISIS protocol only: areas the link belongs to (one entry per area).
  // When 1 area, the edge is drawn in that area's color; when 2+ areas, the
  // edge is rendered as a zebra-dashed pattern alternating between colors.
  isisAreas?: string[];
  // STP/MSTP-specific
  stpState?: string;          // aggregated state (worst of both sides)
  stpStateLocal?: string;
  stpStateRemote?: string;
  stpRoleLocal?: string;
  stpRoleRemote?: string;
  metric?: number;
  // MSTP: per-instance state, populated by generateMstpEdges
  stpInstances?: {
    instance: string;
    state: string;
    stateLocal?: string | null;
    stateRemote?: string | null;
    roleLocal?: string | null;
    roleRemote?: string | null;
    cost?: number | null;
    costLocal?: number | null;
    costRemote?: number | null;
    priorityLocal?: number | null;
    priorityRemote?: number | null;
  }[];
}

interface GraphEdge {
  id: number;
  sourceNodeId: number;
  targetNodeId: number;
  style: GraphEdgeStyle;
  protocolId: number | null;
}

interface GraphProtocol {
  id: number;
  name: string;
  type: string;
}

interface GraphClusterStyle {
  // - rectangle: axis-aligned bounding box with rounded corners
  // - polygon:   convex hull of every node's bbox corners — looks like a
  //              rectangle when nodes line up, gains diagonal edges when they
  //              don't, so the outline always hugs the actual nodes
  // - hull:      smooth rounded hull passing through the node centres (used
  //              for ISIS area zones)
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
  // Free-form offset applied to the auto-computed label anchor. Lets the user drag
  // the area label to a custom spot relative to the cluster centroid.
  labelOffset?: { dx: number; dy: number };
  // STP/MSTP: marks the cluster as a "Root bridge" marker, used by the map to
  // crown the wrapped node instead of drawing a hull. stpInstance is the MSTI
  // ID for MSTP; null for plain STP.
  stpRoot?: boolean;
  stpInstance?: string | null;
}

interface GraphCluster {
  id: number;
  name: string;
  style: GraphClusterStyle;
  nodeIds: number[];
  protocolId: number | null;
}

interface AnnotationTextData {
  text: string;
  fontSize: number;
  color: string;
  fontFamily: string;
  fontWeight: number;
  textAlign: "left" | "center" | "right";
  bgColor: string | null;
  padding: number;
}
interface AnnotationImageData {
  url: string;
  opacity: number;
}
interface AnnotationShapeData {
  kind: "rectangle" | "ellipse";
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash: "solid" | "dashed" | "dotted";
  opacity: number;
  fillOpacity: number;
  borderRadius: number;
}
type AnnotationData = AnnotationTextData | AnnotationImageData | AnnotationShapeData;

interface Annotation {
  id: number;
  type: "text" | "image" | "shape";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  data: AnnotationData;
}

const COMPLIANCE_COLORS: Record<string, string> = {
  A: "#22c55e", B: "#84cc16", C: "#eab308", D: "#f97316", E: "#ef4444", F: "#7f1d1d",
};

interface MapOptions {
  aggregateParallelLinks?: boolean;
  aggregateBorderColor?: string;
  aggregateBorderWidth?: number;
  aggregateFillColor?: string;
  aggregateTransparent?: boolean;
  aggregateLabelPosition?: "center" | "above" | "below";
  aggregateLabelFontSize?: number;
  aggregateLabelColor?: string;
  defaultProtocolFilter?: "all" | "manual" | number;
  // STP/MSTP — global toggle for the Root bridge badge. The badge's position,
  // size and colours are configured per-topology via the Label layout
  // (badge:stp_root LabelElement). This flag just hides every instance of the
  // badge from the map without removing the LabelElement.
  stpShowRootBadge?: boolean;            // default true
  // STP/MSTP — role badges (R/D/A/B/M/-) on each edge end
  stpShowPortRoles?: boolean;            // default true
  stpPortRoleFontSize?: number;          // default 7
  stpPortRoleBorderWidth?: number;       // default 1 — white margin around the coloured pill
  // Legend overlay (adapts to filtered protocol)
  stpShowLegend?: boolean;               // default true
  stpLegendPosition?: "tl" | "tr" | "bl" | "br";  // default "br"
}

interface TopologyDetail {
  id: number;
  name: string;
  nodeDesign: NodeDesign;
  layout: Record<string, { x: number; y: number }> | null;
  viewport: { pan: { x: number; y: number }; zoom: number } | null;
  mapOptions: MapOptions | null;
}

interface GraphResponse {
  topology: TopologyDetail;
  nodes: GraphNode[];
  edges: GraphEdge[];
  clusters: GraphCluster[];
  annotations: Annotation[];
  protocols: GraphProtocol[];
}

interface TopologySummary {
  id: number;
  name: string;
  isPrimary: boolean;
}

interface Props {
  topologyId: number;
}

const parseInventoryField = (f: string): { category: string; key: string; column: string } | null => {
  if (!f.startsWith("inventory:")) return null;
  const rest = f.slice("inventory:".length);
  const i1 = rest.indexOf(":");
  if (i1 === -1) return null;
  const after = rest.slice(i1 + 1);
  const i2 = after.indexOf(":");
  if (i2 === -1) return null;
  return {
    category: rest.slice(0, i1),
    key: after.slice(0, i2),
    column: after.slice(i2 + 1),
  };
};

const resolveField = (field: string, n: GraphNode): string => {
  const inv = parseInventoryField(field);
  if (inv) {
    return n.inventory?.[inv.category]?.[inv.key]?.[inv.column] ?? "";
  }
  switch (field) {
    case "name": return n.name ?? "";
    case "hostname": return n.hostname ?? "";
    case "ipAddress": return n.ipAddress;
    case "manufacturer": return n.manufacturer ?? "";
    case "model": return n.model ?? "";
    default: return "";
  }
};

const SAVE_DEBOUNCE_MS = 800;

export default function TopologyMap({ topologyId }: Props) {
  const { t } = useI18n();
  const router = useRouter();
  const { current } = useAppContext();
  const [data, setData] = useState<GraphResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);
  const [positions, setPositions] = useState<Record<number, { x: number; y: number }>>({});
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [allTopologies, setAllTopologies] = useState<TopologySummary[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<number | null>(null);
  // selectedNodeIds carries the full multi-selection. selectedNodeId remains the
  // "primary" (last-clicked) — that's what the design panel binds to and what
  // single-node operations target. Keeping both lets us add multi-select on top
  // of the existing single-selection flows without rewriting them.
  const [selectedNodeIds, setSelectedNodeIds] = useState<Set<number>>(new Set());
  const [selectedEdgeId, setSelectedEdgeId] = useState<number | null>(null);
  const [selectedAnnotationId, setSelectedAnnotationId] = useState<number | null>(null);
  // "manual" = manual only, otherwise specific protocol id. "All" was removed because
  // it tends to overcrowd the map; the user explicitly picks a focus.
  const [protocolFilter, setProtocolFilter] = useState<"manual" | number>("manual");
  // MSTP: when the active protocol is MSTP, this picks which instance drives
  // the edge colouring and which root cluster is shown. null = "all instances"
  // (edges fall back to their aggregated state, every root is shown).
  const [mstpInstance, setMstpInstance] = useState<string | null>(null);
  const viewportSavedRef = useRef(false);

  // Annotation drag state — kept in refs to avoid re-renders on every mouse move.
  const draggingAnnotationId = useRef<number | null>(null);
  const annotDragStart = useRef<{ x: number; y: number; ax: number; ay: number } | null>(null);
  const annotDragMoved = useRef(false);
  // Resize state
  const resizingAnnotationId = useRef<number | null>(null);
  const resizeCorner = useRef<"nw" | "ne" | "sw" | "se" | null>(null);
  const resizeStart = useRef<{ x: number; y: number; ax: number; ay: number; aw: number; ah: number } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const draggingNodeId = useRef<number | null>(null);
  // groupStarts: snapshot of every selected node's start position so group drag
  // moves them by an absolute delta from t=0 rather than accumulating per-frame
  // (which would cause the passive nodes to drift exponentially).
  const dragStart = useRef<{ x: number; y: number; nx: number; ny: number; groupStarts: Record<number, { x: number; y: number }> } | null>(null);
  const dragMoved = useRef(false);
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Cluster label drag state. Tracks the original offset at mousedown so we can
  // accumulate the cursor delta without quantizing each move.
  const draggingClusterLabelId = useRef<number | null>(null);
  const clusterLabelDragStart = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const clusterLabelDragMoved = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    viewportSavedRef.current = false;
    try {
      // Auto-regenerate enabled protocols before loading the graph so freshly-collected
      // inventory data is reflected in the rendered links.
      await fetch(`/api/topologies/${topologyId}/protocols/generate-all`, { method: "POST" })
        .catch(() => { /* non-blocking */ });
      const res = await fetch(`/api/topologies/${topologyId}/graph`);
      if (res.ok) {
        const g: GraphResponse = await res.json();
        setData(g);
        // Resolve the initial filter:
        //  1. honor the persisted default if it still maps to a known protocol or "manual"
        //  2. else fall back to the first protocol if any, otherwise "manual"
        const def = g.topology.mapOptions?.defaultProtocolFilter;
        let initial: "manual" | number;
        if (def === "manual") {
          initial = "manual";
        } else if (typeof def === "number" && g.protocols.some((p) => p.id === def)) {
          initial = def;
        } else if (g.protocols.length > 0) {
          initial = g.protocols[0].id;
        } else {
          initial = "manual";
        }
        setProtocolFilter(initial);
        const initialPositions: Record<number, { x: number; y: number }> = {};
        const cols = Math.max(1, Math.ceil(Math.sqrt(g.nodes.length)));
        g.nodes.forEach((n, i) => {
          if (n.position) {
            initialPositions[n.nodeId] = n.position;
          } else {
            const colIdx = i % cols;
            const rowIdx = Math.floor(i / cols);
            initialPositions[n.nodeId] = {
              x: (colIdx - (cols - 1) / 2) * 160,
              y: (rowIdx - (cols - 1) / 2) * 90,
            };
          }
        });
        setPositions(initialPositions);
        if (g.topology.viewport) {
          setPan(g.topology.viewport.pan ?? { x: 0, y: 0 });
          setZoom(g.topology.viewport.zoom ?? 1);
          viewportSavedRef.current = true;
        }
      }
    } finally {
      setLoading(false);
    }
  }, [topologyId]);

  useEffect(() => { load(); }, [load]);

  // Center the viewport on first render when no saved viewport exists.
  useEffect(() => {
    if (!data || viewportSavedRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    setPan({ x: rect.width / 2, y: rect.height / 2 });
  }, [data]);

  useEffect(() => {
    if (!current) return;
    fetch(`/api/topologies?context=${current.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((items: TopologySummary[]) => setAllTopologies(items))
      .catch(() => setAllTopologies([]));
  }, [current]);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = () => setPickerOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [pickerOpen]);

  const scheduleSave = useCallback((nextPositions: Record<number, { x: number; y: number }>, nextPan?: { x: number; y: number }, nextZoom?: number) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const layout: Record<string, { x: number; y: number }> = {};
      Object.entries(nextPositions).forEach(([id, p]) => { layout[id] = p; });
      await fetch(`/api/topologies/${topologyId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          layout,
          viewport: { pan: nextPan ?? pan, zoom: nextZoom ?? zoom },
        }),
      });
    }, SAVE_DEBOUNCE_MS);
  }, [topologyId, pan, zoom]);

  const toSVGPoint = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const handleNodeMouseDown = (nodeId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const p = toSVGPoint(e.clientX, e.clientY);
    const pos = positions[nodeId];
    if (!pos) return;
    // Shift+click toggles membership in the multi-selection without starting a
    // drag. Plain click on an unselected node resets the selection to that one
    // node; click on an already-selected node keeps the existing set so the
    // drag can move the whole group.
    if (e.shiftKey) {
      setSelectedNodeIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) next.delete(nodeId);
        else next.add(nodeId);
        return next;
      });
      setSelectedNodeId(nodeId);
      setSelectedEdgeId(null);
      setSelectedAnnotationId(null);
      return;
    }
    let groupIds: Set<number>;
    if (!selectedNodeIds.has(nodeId)) {
      groupIds = new Set([nodeId]);
      setSelectedNodeIds(groupIds);
    } else {
      groupIds = selectedNodeIds;
    }
    const groupStarts: Record<number, { x: number; y: number }> = {};
    for (const id of groupIds) {
      const gp = positions[id];
      if (gp) groupStarts[id] = { x: gp.x, y: gp.y };
    }
    draggingNodeId.current = nodeId;
    dragStart.current = { x: p.x, y: p.y, nx: pos.x, ny: pos.y, groupStarts };
    dragMoved.current = false;
  };

  const handleClusterLabelMouseDown = (clusterId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data) return;
    const cluster = data.clusters?.find((c) => c.id === clusterId);
    if (!cluster) return;
    const p = toSVGPoint(e.clientX, e.clientY);
    const off = cluster.style.labelOffset ?? { dx: 0, dy: 0 };
    draggingClusterLabelId.current = clusterId;
    clusterLabelDragStart.current = { x: p.x, y: p.y, ox: off.dx, oy: off.dy };
    clusterLabelDragMoved.current = false;
  };

  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const target = e.target as SVGElement;
    if (target.closest("[data-node]") || target.closest("[data-edge]") || target.closest("[data-annotation]")) return;
    const p = toSVGPoint(e.clientX, e.clientY);
    panStart.current = { x: p.x, y: p.y, px: pan.x, py: pan.y };
    // clicking the empty background clears any selection
    setSelectedNodeId(null);
    setSelectedNodeIds(new Set());
    setSelectedEdgeId(null);
    setSelectedAnnotationId(null);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (resizingAnnotationId.current !== null && resizeStart.current && resizeCorner.current) {
      const p = toSVGPoint(e.clientX, e.clientY);
      const dx = (p.x - resizeStart.current.x) / zoom;
      const dy = (p.y - resizeStart.current.y) / zoom;
      const start = resizeStart.current;
      let nx = start.ax, ny = start.ay, nw = start.aw, nh = start.ah;
      const corner = resizeCorner.current;
      if (corner === "se") { nw = Math.max(10, start.aw + dx); nh = Math.max(10, start.ah + dy); }
      else if (corner === "sw") { nw = Math.max(10, start.aw - dx); nh = Math.max(10, start.ah + dy); nx = start.ax + (start.aw - nw); }
      else if (corner === "ne") { nw = Math.max(10, start.aw + dx); nh = Math.max(10, start.ah - dy); ny = start.ay + (start.ah - nh); }
      else if (corner === "nw") { nw = Math.max(10, start.aw - dx); nh = Math.max(10, start.ah - dy); nx = start.ax + (start.aw - nw); ny = start.ay + (start.ah - nh); }
      setData((prev) => prev ? {
        ...prev,
        annotations: prev.annotations.map((a) => a.id === resizingAnnotationId.current ? { ...a, x: nx, y: ny, width: nw, height: nh } : a),
      } : prev);
      return;
    }
    if (draggingAnnotationId.current !== null && annotDragStart.current) {
      const p = toSVGPoint(e.clientX, e.clientY);
      const dx = (p.x - annotDragStart.current.x) / zoom;
      const dy = (p.y - annotDragStart.current.y) / zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) annotDragMoved.current = true;
      const nx = annotDragStart.current.ax + dx;
      const ny = annotDragStart.current.ay + dy;
      setData((prev) => prev ? {
        ...prev,
        annotations: prev.annotations.map((a) => a.id === draggingAnnotationId.current ? { ...a, x: nx, y: ny } : a),
      } : prev);
      return;
    }
    if (draggingNodeId.current !== null && dragStart.current) {
      const p = toSVGPoint(e.clientX, e.clientY);
      const dx = (p.x - dragStart.current.x) / zoom;
      const dy = (p.y - dragStart.current.y) / zoom;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved.current = true;
      const draggedId = draggingNodeId.current as number;
      const nx = Math.round(dragStart.current.nx + dx);
      const ny = Math.round(dragStart.current.ny + dy);
      // Group drag: when the dragged node belongs to a multi-selection, every
      // other selected node moves by the same absolute delta from its starting
      // position (snapshot in dragStart.groupStarts). Computing the delta from
      // the frozen snapshot — not from the live state — avoids any per-frame
      // drift on the passive nodes. We snapshot dragStart synchronously: the
      // updater may run after mouseup has cleared dragStart.current.
      const starts = dragStart.current.groupStarts;
      const baseNx = dragStart.current.nx;
      const baseNy = dragStart.current.ny;
      setPositions((prev) => {
        const ids = Object.keys(starts);
        if (ids.length <= 1) {
          return { ...prev, [draggedId]: { x: nx, y: ny } };
        }
        const rdx = nx - baseNx;
        const rdy = ny - baseNy;
        const next: Record<number, { x: number; y: number }> = { ...prev };
        for (const idStr of ids) {
          const id = Number(idStr);
          const startPos = starts[id];
          next[id] = id === draggedId
            ? { x: nx, y: ny }
            : { x: Math.round(startPos.x + rdx), y: Math.round(startPos.y + rdy) };
        }
        return next;
      });
      return;
    }
    if (draggingClusterLabelId.current !== null && clusterLabelDragStart.current) {
      const p = toSVGPoint(e.clientX, e.clientY);
      const dx = (p.x - clusterLabelDragStart.current.x) / zoom;
      const dy = (p.y - clusterLabelDragStart.current.y) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) clusterLabelDragMoved.current = true;
      const ndx = clusterLabelDragStart.current.ox + dx;
      const ndy = clusterLabelDragStart.current.oy + dy;
      setData((prev) => prev ? {
        ...prev,
        clusters: prev.clusters.map((c) => c.id === draggingClusterLabelId.current
          ? { ...c, style: { ...c.style, labelOffset: { dx: ndx, dy: ndy } } }
          : c),
      } : prev);
      return;
    }
    if (panStart.current) {
      const p = toSVGPoint(e.clientX, e.clientY);
      const dx = p.x - panStart.current.x;
      const dy = p.y - panStart.current.y;
      setPan({ x: panStart.current.px + dx, y: panStart.current.py + dy });
    }
  };

  const handleMouseUp = () => {
    if (resizingAnnotationId.current !== null) {
      const id = resizingAnnotationId.current;
      resizingAnnotationId.current = null;
      resizeCorner.current = null;
      resizeStart.current = null;
      if (data) {
        const ann = data.annotations.find((a) => a.id === id);
        if (ann) {
          fetch(`/api/topologies/${topologyId}/annotations/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ x: ann.x, y: ann.y, width: ann.width, height: ann.height }),
          });
        }
      }
    }
    if (draggingAnnotationId.current !== null) {
      const wasClick = !annotDragMoved.current;
      const id = draggingAnnotationId.current;
      draggingAnnotationId.current = null;
      annotDragStart.current = null;
      if (wasClick) {
        setSelectedAnnotationId(id);
        setSelectedNodeId(null);
        setSelectedEdgeId(null);
      } else if (data) {
        const ann = data.annotations.find((a) => a.id === id);
        if (ann) {
          fetch(`/api/topologies/${topologyId}/annotations/${id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ x: ann.x, y: ann.y }),
          });
        }
      }
    }
    if (draggingNodeId.current !== null) {
      const wasClick = !dragMoved.current;
      const clickedNodeId = draggingNodeId.current;
      draggingNodeId.current = null;
      dragStart.current = null;
      if (wasClick) {
        setSelectedNodeId(clickedNodeId);
        setSelectedNodeIds(new Set([clickedNodeId]));
        setSelectedEdgeId(null);
      } else {
        scheduleSave(positions);
      }
    }
    if (draggingClusterLabelId.current !== null) {
      const movedClusterId = draggingClusterLabelId.current;
      const moved = clusterLabelDragMoved.current;
      draggingClusterLabelId.current = null;
      clusterLabelDragStart.current = null;
      clusterLabelDragMoved.current = false;
      if (moved && data) {
        const cluster = data.clusters?.find((c) => c.id === movedClusterId);
        if (cluster) {
          fetch(`/api/topologies/${topologyId}/clusters/${movedClusterId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ style: { labelOffset: cluster.style.labelOffset ?? { dx: 0, dy: 0 } } }),
          });
        }
      }
    }
    if (panStart.current) {
      panStart.current = null;
      scheduleSave(positions, pan, zoom);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    const delta = -e.deltaY * 0.001;
    const next = Math.max(0.2, Math.min(3, zoom * (1 + delta)));
    setZoom(next);
    scheduleSave(positions, pan, next);
  };

  const resetView = () => {
    const el = containerRef.current;
    const center = el
      ? { x: el.getBoundingClientRect().width / 2, y: el.getBoundingClientRect().height / 2 }
      : { x: 0, y: 0 };
    setPan(center);
    setZoom(1);
    scheduleSave(positions, center, 1);
  };

  const zoomBy = (factor: number) => {
    const next = Math.max(0.2, Math.min(3, zoom * factor));
    setZoom(next);
    scheduleSave(positions, pan, next);
  };

  const getDesign = useCallback((n: GraphNode): NodeDesign => {
    return n.styleOverride ?? data?.topology.nodeDesign ?? defaultDesign();
  }, [data]);

  const saveNodeOverride = async (nodeId: number, override: NodeDesign | null) => {
    await fetch(`/api/topologies/${topologyId}/nodes/${nodeId}/style`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(override),
    });
    setData((prev) => prev ? {
      ...prev,
      nodes: prev.nodes.map((n) => n.nodeId === nodeId ? { ...n, styleOverride: override } : n),
    } : prev);
  };

  const saveEdgeStyle = async (edgeId: number, patch: Partial<GraphEdgeStyle>) => {
    if (!data) return;
    const current = data.edges.find((e) => e.id === edgeId);
    if (!current) return;
    const mergedStyle: GraphEdgeStyle = { ...current.style, ...patch };
    setData((prev) => prev ? {
      ...prev,
      edges: prev.edges.map((e) => e.id === edgeId ? { ...e, style: mergedStyle } : e),
    } : prev);
    await fetch(`/api/topologies/${topologyId}/edges/${edgeId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ style: mergedStyle }),
    });
  };

  // When exactly two nodes are selected and they share 2+ parallel links, expose
  // a control to widen/narrow the gap between those links (avoids label overlap).
  const selectedPair = useMemo(() => {
    if (selectedNodeIds.size !== 2 || !data) return null;
    const [a, b] = Array.from(selectedNodeIds);
    const edges = data.edges.filter((e) =>
      (e.sourceNodeId === a && e.targetNodeId === b) || (e.sourceNodeId === b && e.targetNodeId === a),
    );
    if (edges.length < 2) return null;
    let spacing = PARALLEL_SPACING;
    for (const e of edges) {
      if (typeof e.style.parallelSpacing === "number") { spacing = e.style.parallelSpacing; break; }
    }
    return { edges, spacing };
  }, [selectedNodeIds, data]);

  const setPairSpacing = async (value: number) => {
    if (!selectedPair) return;
    const v = Math.max(2, Math.min(120, Math.round(value)));
    for (const e of selectedPair.edges) {
      await saveEdgeStyle(e.id, { parallelSpacing: v });
    }
  };

  // Centroid of every visible node, used to push cluster labels outward (toward map edges)
  const mapCentroid = useMemo<{ x: number; y: number } | null>(() => {
    if (!data) return null;
    let sx = 0, sy = 0, n = 0;
    for (const node of data.nodes) {
      const p = positions[node.nodeId];
      if (!p) continue;
      sx += p.x; sy += p.y; n++;
    }
    if (n === 0) return null;
    return { x: sx / n, y: sy / n };
  }, [data, positions]);

  /**
   * Apply a layout operation to the currently selected nodes and persist the
   * result. The op receives every selected node's current rect (incl. width /
   * height from its effective design) and must return the patched position.
   * Alignments work on 2+ nodes; distributions need 3+ to be meaningful.
   */
  const applyLayoutOp = useCallback((
    op: (rects: { id: number; x: number; y: number; w: number; h: number }[]) => Record<number, { x: number; y: number }>,
  ) => {
    if (!data) return;
    const rects = Array.from(selectedNodeIds)
      .map((id) => {
        const pos = positions[id];
        const node = data.nodes.find((n) => n.nodeId === id);
        if (!pos || !node) return null;
        const d = getDesign(node);
        return { id, x: pos.x, y: pos.y, w: d.width, h: d.height };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    if (rects.length < 2) return;
    const patch = op(rects);
    setPositions((prev) => {
      const next = { ...prev };
      for (const [idStr, p] of Object.entries(patch)) next[Number(idStr)] = p;
      scheduleSave(next);
      return next;
    });
  }, [data, selectedNodeIds, positions, getDesign, scheduleSave]);

  const alignLeft = useCallback(() => applyLayoutOp((rects) => {
    const minLeft = Math.min(...rects.map((r) => r.x - r.w / 2));
    return Object.fromEntries(rects.map((r) => [r.id, { x: Math.round(minLeft + r.w / 2), y: r.y }]));
  }), [applyLayoutOp]);

  const alignRight = useCallback(() => applyLayoutOp((rects) => {
    const maxRight = Math.max(...rects.map((r) => r.x + r.w / 2));
    return Object.fromEntries(rects.map((r) => [r.id, { x: Math.round(maxRight - r.w / 2), y: r.y }]));
  }), [applyLayoutOp]);

  const alignTop = useCallback(() => applyLayoutOp((rects) => {
    const minTop = Math.min(...rects.map((r) => r.y - r.h / 2));
    return Object.fromEntries(rects.map((r) => [r.id, { x: r.x, y: Math.round(minTop + r.h / 2) }]));
  }), [applyLayoutOp]);

  const alignBottom = useCallback(() => applyLayoutOp((rects) => {
    const maxBottom = Math.max(...rects.map((r) => r.y + r.h / 2));
    return Object.fromEntries(rects.map((r) => [r.id, { x: r.x, y: Math.round(maxBottom - r.h / 2) }]));
  }), [applyLayoutOp]);

  // Centre on a vertical axis = same X for everyone (= align centres horizontally)
  const alignCenterX = useCallback(() => applyLayoutOp((rects) => {
    const cx = rects.reduce((s, r) => s + r.x, 0) / rects.length;
    return Object.fromEntries(rects.map((r) => [r.id, { x: Math.round(cx), y: r.y }]));
  }), [applyLayoutOp]);

  // Centre on a horizontal axis = same Y for everyone (= align centres vertically)
  const alignCenterY = useCallback(() => applyLayoutOp((rects) => {
    const cy = rects.reduce((s, r) => s + r.y, 0) / rects.length;
    return Object.fromEntries(rects.map((r) => [r.id, { x: r.x, y: Math.round(cy) }]));
  }), [applyLayoutOp]);

  // Distribute centres: extremes stay put, intermediates land on a uniform grid.
  // Needs 3+ nodes — 2 nodes are by definition already evenly distributed.
  const distributeH = useCallback(() => applyLayoutOp((rects) => {
    if (rects.length < 3) return {};
    const sorted = [...rects].sort((a, b) => a.x - b.x);
    const minX = sorted[0].x;
    const maxX = sorted[sorted.length - 1].x;
    const step = (maxX - minX) / (sorted.length - 1);
    return Object.fromEntries(sorted.map((r, i) => [r.id, { x: Math.round(minX + step * i), y: r.y }]));
  }), [applyLayoutOp]);

  const distributeV = useCallback(() => applyLayoutOp((rects) => {
    if (rects.length < 3) return {};
    const sorted = [...rects].sort((a, b) => a.y - b.y);
    const minY = sorted[0].y;
    const maxY = sorted[sorted.length - 1].y;
    const step = (maxY - minY) / (sorted.length - 1);
    return Object.fromEntries(sorted.map((r, i) => [r.id, { x: r.x, y: Math.round(minY + step * i) }]));
  }), [applyLayoutOp]);

  const selectedNode = data && selectedNodeId !== null ? data.nodes.find((n) => n.nodeId === selectedNodeId) ?? null : null;
  const selectedEdge = data && selectedEdgeId !== null ? data.edges.find((e) => e.id === selectedEdgeId) ?? null : null;
  const selectedAnnotation = data && selectedAnnotationId !== null ? data.annotations.find((a) => a.id === selectedAnnotationId) ?? null : null;

  const addAnnotation = async (type: Annotation["type"]) => {
    // Drop the new annotation near the visible center of the viewport
    const el = containerRef.current;
    const rect = el?.getBoundingClientRect();
    const cx = rect ? (rect.width / 2 - pan.x) / zoom : 0;
    const cy = rect ? (rect.height / 2 - pan.y) / zoom : 0;
    const defaults = type === "text"
      ? { width: 140, height: 36 }
      : type === "image"
      ? { width: 160, height: 120 }
      : { width: 200, height: 120 };
    const res = await fetch(`/api/topologies/${topologyId}/annotations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type,
        x: cx - defaults.width / 2,
        y: cy - defaults.height / 2,
        width: defaults.width,
        height: defaults.height,
      }),
    });
    if (res.ok) {
      const created: Annotation = await res.json();
      setData((prev) => prev ? { ...prev, annotations: [...prev.annotations, created] } : prev);
      setSelectedAnnotationId(created.id);
      setSelectedNodeId(null);
      setSelectedEdgeId(null);
    }
  };

  const updateAnnotation = async (id: number, patch: Omit<Partial<Annotation>, "data"> & { data?: Partial<AnnotationData> }) => {
    if (!data) return;
    const current = data.annotations.find((a) => a.id === id);
    if (!current) return;
    const next: Annotation = {
      ...current,
      ...patch,
      data: patch.data ? { ...current.data, ...patch.data } as AnnotationData : current.data,
    };
    setData((prev) => prev ? { ...prev, annotations: prev.annotations.map((a) => a.id === id ? next : a) } : prev);
    await fetch(`/api/topologies/${topologyId}/annotations/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  };

  const deleteAnnotation = async (id: number) => {
    await fetch(`/api/topologies/${topologyId}/annotations/${id}`, { method: "DELETE" });
    setData((prev) => prev ? { ...prev, annotations: prev.annotations.filter((a) => a.id !== id) } : prev);
    if (selectedAnnotationId === id) setSelectedAnnotationId(null);
  };

  const handleAnnotationMouseDown = (annotationId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data) return;
    const ann = data.annotations.find((a) => a.id === annotationId);
    if (!ann) return;
    const p = toSVGPoint(e.clientX, e.clientY);
    draggingAnnotationId.current = annotationId;
    annotDragStart.current = { x: p.x, y: p.y, ax: ann.x, ay: ann.y };
    annotDragMoved.current = false;
  };

  const handleAnnotationResizeStart = (annotationId: number, corner: "nw" | "ne" | "sw" | "se", e: React.MouseEvent) => {
    e.stopPropagation();
    if (!data) return;
    const ann = data.annotations.find((a) => a.id === annotationId);
    if (!ann) return;
    const p = toSVGPoint(e.clientX, e.clientY);
    resizingAnnotationId.current = annotationId;
    resizeCorner.current = corner;
    resizeStart.current = { x: p.x, y: p.y, ax: ann.x, ay: ann.y, aw: ann.width, ah: ann.height };
  };

  const visibleEdges = useMemo<GraphEdge[]>(() => {
    if (!data) return [];
    if (protocolFilter === "manual") return data.edges.filter((e) => e.protocolId == null);
    return data.edges.filter((e) => e.protocolId === protocolFilter);
  }, [data, protocolFilter]);

  // edgeOffsets: signed offset index per edge so parallel edges (same pair) don't overlap visually.
  // aggregationGroups: edges grouped by explicit `aggregationGroup` (+ pair), rendered as capsules.
  const { edgeOffsets, aggregationGroups } = useMemo(() => {
    const offsets = new Map<number, number>();
    const aggGroups: {
      key: string;
      sourceNodeId: number;
      targetNodeId: number;
      members: GraphEdge[];
      label: string;
    }[] = [];

    const pairKey = (a: number, b: number) => a < b ? `${a}_${b}` : `${b}_${a}`;

    // Spread all parallel edges (same pair) across the perpendicular axis so they remain visible.
    const byPair = new Map<string, GraphEdge[]>();
    for (const e of visibleEdges) {
      const k = pairKey(e.sourceNodeId, e.targetNodeId);
      const arr = byPair.get(k) ?? [];
      arr.push(e);
      byPair.set(k, arr);
    }
    for (const group of byPair.values()) {
      group.sort((a, b) => a.id - b.id);
      const n = group.length;
      // Per-pair spacing: honour an explicit parallelSpacing set on any edge of
      // the pair, otherwise use the default. Stored as a px perpendicular offset.
      let spacing = PARALLEL_SPACING;
      for (const e of group) {
        if (typeof e.style.parallelSpacing === "number") { spacing = e.style.parallelSpacing; break; }
      }
      group.forEach((edge, i) => offsets.set(edge.id, (i - (n - 1) / 2) * spacing));
    }

    // Build explicit aggregation groups, keyed by (pair, aggregationGroup).
    const byAgg = new Map<string, GraphEdge[]>();
    for (const e of visibleEdges) {
      const g = e.style.aggregationGroup?.trim();
      if (!g) continue;
      const k = `${pairKey(e.sourceNodeId, e.targetNodeId)}|${g}`;
      const arr = byAgg.get(k) ?? [];
      arr.push(e);
      byAgg.set(k, arr);
    }
    for (const [k, members] of byAgg.entries()) {
      // A single link is not an aggregation; no capsule needed.
      if (members.length < 2) continue;
      members.sort((a, b) => a.id - b.id);
      const first = members[0];
      const labelEdge = members.find((m) => m.style.aggregationLabel?.trim());
      aggGroups.push({
        key: k,
        sourceNodeId: first.sourceNodeId,
        targetNodeId: first.targetNodeId,
        members,
        label: labelEdge?.style.aggregationLabel?.trim() || first.style.aggregationGroup!.trim(),
      });
    }

    return { edgeOffsets: offsets, aggregationGroups: aggGroups };
  }, [visibleEdges]);

  // For ISIS protocols: map of areaName -> border color, derived from the
  // matching protocol's clusters (one cluster per area). Used by renderEdge
  // to color edges with their area's colour, and to render multi-area edges
  // as a zebra-dashed pattern of N stacked lines.
  const isisAreaColors = useMemo<Map<string, string>>(() => {
    const m = new Map<string, string>();
    if (!data) return m;
    const isisProtocolIds = new Set(
      data.protocols.filter((p) => p.type === "isis").map((p) => p.id),
    );
    for (const c of data.clusters) {
      if (c.protocolId == null || !isisProtocolIds.has(c.protocolId)) continue;
      const color = c.style?.borderColor;
      if (color) m.set(c.name, color);
    }
    return m;
  }, [data]);

  const isisProtocolIdSet = useMemo<Set<number>>(() => {
    if (!data) return new Set();
    return new Set(data.protocols.filter((p) => p.type === "isis").map((p) => p.id));
  }, [data]);

  // MSTP support: which protocol is currently filtered + what instances it
  // carries (derived from the edges' style.stpInstances metadata).
  const activeProtocol = useMemo(() => {
    if (!data || typeof protocolFilter !== "number") return null;
    return data.protocols.find((p) => p.id === protocolFilter) ?? null;
  }, [data, protocolFilter]);

  const isMstpFiltered = activeProtocol?.type === "mstp";
  const isStpFiltered = activeProtocol?.type === "stp" || activeProtocol?.type === "mstp";

  const mstpInstances = useMemo<string[]>(() => {
    if (!data || !isMstpFiltered) return [];
    const set = new Set<string>();
    for (const e of data.edges) {
      if (e.protocolId !== protocolFilter) continue;
      for (const i of e.style.stpInstances ?? []) set.add(i.instance);
    }
    // Numeric-aware sort: 0,1,2,…,10 not 0,1,10,2
    return Array.from(set).sort((a, b) => {
      const an = Number(a), bn = Number(b);
      const ok = !Number.isNaN(an) && !Number.isNaN(bn);
      return ok ? an - bn : a.localeCompare(b);
    });
  }, [data, protocolFilter, isMstpFiltered]);

  // MSTP filter must always have an instance selected (no "all" — it would
  // produce zebra-coloured edges that don't reflect any real topology state).
  // Default to the smallest instance ID, which by MSTP convention is the CIST.
  useEffect(() => {
    if (!isMstpFiltered) {
      setMstpInstance(null);
      return;
    }
    if (mstpInstances.length === 0) return;
    if (mstpInstance === null || !mstpInstances.includes(mstpInstance)) {
      setMstpInstance(mstpInstances[0]);
    }
  }, [isMstpFiltered, mstpInstance, mstpInstances]);

  // Per-instance colour palette for MSTP zebra rendering in "all" mode.
  const mstpInstanceColors = useMemo<Map<string, string>>(() => {
    const palette = ["#dc2626", "#f97316", "#eab308", "#84cc16", "#0ea5e9", "#6366f1", "#a855f7", "#ec4899"];
    const m = new Map<string, string>();
    mstpInstances.forEach((inst, i) => m.set(inst, palette[i % palette.length]));
    return m;
  }, [mstpInstances]);

  // Root bridge node IDs for the currently visible STP/MSTP context.
  // - STP filtered: include every root cluster of that protocol (typically one)
  // - MSTP filtered + instance selected: include only that instance's root
  // - MSTP filtered + "all": include every instance's root
  const stpRootNodeIds = useMemo<Set<number>>(() => {
    const out = new Set<number>();
    if (!data || !isStpFiltered) return out;
    for (const c of data.clusters) {
      if (c.protocolId !== protocolFilter) continue;
      if (!c.style?.stpRoot) continue;
      if (isMstpFiltered && mstpInstance !== null && c.style.stpInstance !== mstpInstance) continue;
      for (const nid of c.nodeIds) out.add(nid);
    }
    return out;
  }, [data, isStpFiltered, isMstpFiltered, mstpInstance, protocolFilter]);

  // Per-node "this is root for instance X" labels, used for the crown tooltip
  // when MSTP is filtered without an instance focus.
  const stpRootInstancesByNode = useMemo<Map<number, string[]>>(() => {
    const m = new Map<number, string[]>();
    if (!data || !isStpFiltered) return m;
    for (const c of data.clusters) {
      if (c.protocolId !== protocolFilter) continue;
      if (!c.style?.stpRoot) continue;
      const label = c.style.stpInstance ?? "";
      for (const nid of c.nodeIds) {
        const list = m.get(nid) ?? [];
        if (label !== "" && !list.includes(label)) list.push(label);
        m.set(nid, list);
      }
    }
    return m;
  }, [data, isStpFiltered, protocolFilter]);

  const renderShape = (d: NodeDesign) => {
    const w = d.width, h = d.height;
    const fill = d.bgColor, stroke = d.borderColor, sw = d.borderWidth;
    switch (d.shape) {
      case "rectangle": return <rect x={-w/2} y={-h/2} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case "round-rectangle": return <rect x={-w/2} y={-h/2} width={w} height={h} rx={8} ry={8} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case "diamond": return <polygon points={`0,${-h/2} ${w/2},0 0,${h/2} ${-w/2},0`} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case "hexagon": { const r=w/2; return <polygon points={Array.from({length:6},(_,i)=>{const a=(Math.PI/3)*i-Math.PI/6;return`${r*Math.cos(a)},${r*Math.sin(a)}`;}).join(" ")} fill={fill} stroke={stroke} strokeWidth={sw} />; }
      case "triangle": return <polygon points={`0,${-h/2} ${w/2},${h/2} ${-w/2},${h/2}`} fill={fill} stroke={stroke} strokeWidth={sw} />;
      default: return <ellipse cx={0} cy={0} rx={w/2} ry={h/2} fill={fill} stroke={stroke} strokeWidth={sw} />;
    }
  };

  const renderLabel = (el: LabelElement, n: GraphNode) => {
    if (el.field === "badge:compliance" || el.field === "badge:monitoring" || el.field === "badge:stp_root") {
      const isCompliance = el.field === "badge:compliance";
      const isMonitoring = el.field === "badge:monitoring";
      const isStpRoot = el.field === "badge:stp_root";

      // STP root badge only renders on nodes that ARE the root for the
      // currently-filtered context, and only when the toggle is enabled.
      if (isStpRoot) {
        if ((data?.topology.mapOptions?.stpShowRootBadge ?? true) === false) return null;
        if (!stpRootNodeIds.has(n.nodeId)) return null;
      }

      const diameter = el.badgeSize ?? el.fontSize;
      const r = diameter / 2;
      let autoColor = "#94a3b8";
      let letter = "";
      if (isCompliance) {
        const score = n.complianceScore;
        if (score && COMPLIANCE_COLORS[score]) autoColor = COMPLIANCE_COLORS[score];
        if (el.badgeShowLabel !== false && score) letter = score;
      } else if (isMonitoring) {
        if (n.isReachable === true) autoColor = "#22c55e";
        else if (n.isReachable === false) autoColor = "#ef4444";
      } else if (isStpRoot) {
        autoColor = "#dc2626";
        if (el.badgeShowLabel !== false) letter = "R";
      }
      const fill = el.badgeBgColor || autoColor;
      const rootInstances = isStpRoot ? (stpRootInstancesByNode.get(n.nodeId) ?? []) : [];
      return (
        <g style={{ pointerEvents: "none" }}>
          <circle
            cx={el.x}
            cy={el.y}
            r={r}
            fill={fill}
            stroke={el.badgeBorderColor ?? "#ffffff"}
            strokeWidth={el.badgeBorderWidth ?? 2}
            style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}
          />
          {letter && (
            <text
              x={el.x}
              y={el.y}
              textAnchor="middle"
              dominantBaseline="central"
              fill={el.color || "#ffffff"}
              fontSize={r * 1.2}
              fontWeight={700}
              style={{ pointerEvents: "none", userSelect: "none" }}
            >
              {letter}
            </text>
          )}
          {isStpRoot && (
            <title>
              {isMstpFiltered
                ? `Root bridge (MSTI ${rootInstances.join(", ")})`
                : "Root bridge"}
            </title>
          )}
        </g>
      );
    }

    const text = resolveField(el.field, n);
    if (!text) return null;
    const anchor = el.textAlign === "left" ? "start" : el.textAlign === "right" ? "end" : "middle";
    return (
      <text
        x={el.x}
        y={el.y}
        textAnchor={anchor}
        dominantBaseline="central"
        fill={el.color}
        fontSize={el.fontSize}
        fontWeight={el.fontWeight}
        fontFamily={el.fontFamily}
        fontStyle={el.fontStyle === "italic" ? "italic" : "normal"}
        style={{ pointerEvents: "none", userSelect: "none" }}
      >
        {text}
      </text>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }
  if (!data) return null;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950">
        <div className="relative flex items-center gap-2">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setPickerOpen((o) => !o); }}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-sm font-semibold text-slate-900 dark:text-white hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {data.topology.name}
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${pickerOpen ? "rotate-180" : ""}`} />
          </button>
          <span className="text-xs font-normal text-slate-400">
            {data.nodes.length} {t("topology.nodesLabel")}
          </span>
          {pickerOpen && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute left-0 top-full mt-1 w-72 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-30 overflow-hidden"
            >
              <div className="max-h-72 overflow-y-auto">
                {allTopologies.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-slate-400 italic">{t("topology.listEmpty")}</p>
                ) : (
                  allTopologies.map((tp) => {
                    const active = tp.id === topologyId;
                    return (
                      <button
                        key={tp.id}
                        type="button"
                        onClick={() => { setPickerOpen(false); router.push(`/topology/${tp.id}`); }}
                        className={`w-full flex items-center justify-between gap-2 px-3 py-2 text-xs transition-colors ${
                          active
                            ? "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium"
                            : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        <span className="truncate">{tp.name}</span>
                        {tp.isPrimary && (
                          <span className="shrink-0 rounded-full bg-amber-100 dark:bg-amber-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                            {t("topology.isPrimary")}
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
              <div className="border-t border-slate-100 dark:border-slate-800">
                <Link
                  href="/topology/list"
                  onClick={() => setPickerOpen(false)}
                  className="block px-3 py-2 text-xs text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {t("topology.manageAll")}
                </Link>
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => addAnnotation("text")} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={t("topology.addText")}>
            <TypeIcon className="h-4 w-4" />
          </button>
          <button onClick={() => addAnnotation("image")} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={t("topology.addImage")}>
            <ImageIcon className="h-4 w-4" />
          </button>
          <button onClick={() => addAnnotation("shape")} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={t("topology.addShape")}>
            <Square className="h-4 w-4" />
          </button>
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
          <button onClick={() => zoomBy(1.2)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={t("topology.zoomIn")}>
            <ZoomIn className="h-4 w-4" />
          </button>
          <button onClick={() => zoomBy(0.83)} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={t("topology.zoomOut")}>
            <ZoomOut className="h-4 w-4" />
          </button>
          <button onClick={resetView} className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title={t("topology.resetView")}>
            <Maximize2 className="h-4 w-4" />
          </button>
          <div className="ml-2 flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={typeof protocolFilter === "number" ? String(protocolFilter) : protocolFilter}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "manual") setProtocolFilter("manual");
                else setProtocolFilter(Number(v));
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
              title={t("topology.filterProtocols")}
            >
              <option value="manual">{t("topology.filterManual")}</option>
              {(data?.protocols ?? []).map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {isMstpFiltered && mstpInstances.length > 0 && (
              <select
                value={mstpInstance ?? mstpInstances[0]}
                onChange={(e) => setMstpInstance(e.target.value)}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                title={t("topology.mstpInstance")}
              >
                {mstpInstances.map((inst) => (
                  <option key={inst} value={inst}>{t("topology.mstpInstancePrefix")} {inst}</option>
                ))}
              </select>
            )}
          </div>
          <button
            type="button"
            onClick={async () => {
              if (regenerating) return;
              setRegenerating(true);
              try {
                await fetch(`/api/topologies/${topologyId}/protocols/generate-all`, { method: "POST" });
                // Refresh edges/clusters without touching positions or viewport.
                const res = await fetch(`/api/topologies/${topologyId}/graph`);
                if (res.ok) {
                  const g: GraphResponse = await res.json();
                  setData(g);
                }
              } finally {
                setRegenerating(false);
              }
            }}
            disabled={regenerating}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed"
            title={t("topology.regenerateProtocols")}
          >
            {regenerating
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <RefreshCw className="h-3.5 w-3.5" />}
            {t("topology.regenerateProtocols")}
          </button>
          <Link
            href={`/topology/${topologyId}/configure`}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Settings className="h-3.5 w-3.5" />
            {t("topology.configure")}
          </Link>
        </div>
      </div>

      <div ref={containerRef} className="flex-1 relative overflow-hidden bg-slate-50 dark:bg-slate-950">
        {selectedNodeIds.size >= 2 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-0.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg px-1.5 py-1">
            <span className="px-2 text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {selectedNodeIds.size} {t("topology.nodesLabel")}
            </span>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
            <button onClick={alignLeft} className="p-1.5 rounded text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800" title={t("topology.alignLeft")}>
              <AlignStartVertical className="h-4 w-4" />
            </button>
            <button onClick={alignCenterX} className="p-1.5 rounded text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800" title={t("topology.alignCenterX")}>
              <AlignCenterVertical className="h-4 w-4" />
            </button>
            <button onClick={alignRight} className="p-1.5 rounded text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800" title={t("topology.alignRight")}>
              <AlignEndVertical className="h-4 w-4" />
            </button>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
            <button onClick={alignTop} className="p-1.5 rounded text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800" title={t("topology.alignTop")}>
              <AlignStartHorizontal className="h-4 w-4" />
            </button>
            <button onClick={alignCenterY} className="p-1.5 rounded text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800" title={t("topology.alignCenterY")}>
              <AlignCenterHorizontal className="h-4 w-4" />
            </button>
            <button onClick={alignBottom} className="p-1.5 rounded text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800" title={t("topology.alignBottom")}>
              <AlignEndHorizontal className="h-4 w-4" />
            </button>
            <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
            <button
              onClick={distributeH}
              disabled={selectedNodeIds.size < 3}
              className="p-1.5 rounded text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
              title={t("topology.distributeH")}
            >
              <AlignHorizontalDistributeCenter className="h-4 w-4" />
            </button>
            <button
              onClick={distributeV}
              disabled={selectedNodeIds.size < 3}
              className="p-1.5 rounded text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30 disabled:cursor-not-allowed"
              title={t("topology.distributeV")}
            >
              <AlignVerticalDistributeCenter className="h-4 w-4" />
            </button>
            {selectedPair && (
              <>
                <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
                <UnfoldHorizontal className="h-4 w-4 text-slate-400 mx-0.5" />
                <button
                  onClick={() => setPairSpacing(selectedPair.spacing - 4)}
                  className="p-1.5 rounded text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={t("topology.linkSpacingDecrease")}
                >
                  <Minus className="h-4 w-4" />
                </button>
                <span className="px-0.5 text-[11px] tabular-nums text-slate-600 dark:text-slate-300 min-w-[34px] text-center" title={t("topology.linkSpacing")}>
                  {Math.round(selectedPair.spacing)}px
                </span>
                <button
                  onClick={() => setPairSpacing(selectedPair.spacing + 4)}
                  className="p-1.5 rounded text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
                  title={t("topology.linkSpacingIncrease")}
                >
                  <Plus className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        )}
        <svg
          ref={svgRef}
          className="absolute inset-0 w-full h-full"
          onMouseDown={handleSvgMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onWheel={handleWheel}
          style={{ cursor: draggingNodeId.current ? "grabbing" : panStart.current ? "grabbing" : "default" }}
        >
          <defs>
            <pattern id="map-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#e2e8f0" strokeWidth="0.5" opacity="0.5" />
            </pattern>
          </defs>
          <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#map-grid)" />

          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {data.annotations.filter((a) => a.zIndex < 0).map((annotation) => renderAnnotation(
              annotation,
              selectedAnnotationId === annotation.id,
              (e) => handleAnnotationMouseDown(annotation.id, e),
              (corner, e) => handleAnnotationResizeStart(annotation.id, corner, e),
            ))}
            {(data.clusters ?? [])
              .filter((cluster) => cluster.protocolId == null || cluster.protocolId === protocolFilter)
              // STP/MSTP "root" clusters are rendered as a per-node crown badge,
              // not as a hull/zone, so skip them here.
              .filter((cluster) => !cluster.style?.stpRoot)
              .map((cluster) => renderCluster(cluster, positions, data.nodes, getDesign, mapCentroid, data.clusters ?? [], handleClusterLabelMouseDown))}
            {data.topology.mapOptions?.aggregateParallelLinks && aggregationGroups.map((g) => {
              const sp = positions[g.sourceNodeId];
              const tp = positions[g.targetNodeId];
              if (!sp || !tp) return null;
              const dx = tp.x - sp.x;
              const dy = tp.y - sp.y;
              const len = Math.sqrt(dx * dx + dy * dy) || 1;
              const px = -dy / len;
              const py = dx / len;

              // Compute the actual midpoint of each member edge (accounting for its parallel offset).
              const midpoints = g.members.map((edge) => {
                const offset = edgeOffsets.get(edge.id) ?? 0;
                const style: GraphEdgeStyle = {
                  type: edge.style.type ?? "straight",
                  color: edge.style.color ?? "#94a3b8",
                  width: edge.style.width ?? 1.5,
                  dash: edge.style.dash ?? "solid",
                  curveTension: edge.style.curveTension ?? 0.3,
                };
                return pointAt(style, sp.x, sp.y, tp.x, tp.y, 0.5, offset);
              });
              const cx = midpoints.reduce((s, p) => s + p.x, 0) / midpoints.length;
              const cy = midpoints.reduce((s, p) => s + p.y, 0) / midpoints.length;

              // Spread of midpoints perpendicular to the source→target axis determines halfMinor.
              let maxPerp = 0;
              for (const p of midpoints) {
                const perp = Math.abs((p.x - cx) * px + (p.y - cy) * py);
                if (perp > maxPerp) maxPerp = perp;
              }
              const halfMinor = Math.max(10, maxPerp + 6);
              const labelText = g.label;
              const labelPos = data.topology.mapOptions?.aggregateLabelPosition ?? "center";
              const labelInside = labelPos === "center";
              const labelFontSize = data.topology.mapOptions?.aggregateLabelFontSize ?? 6;
              const labelHalfWidth = labelText ? labelText.length * labelFontSize * 0.32 + 3 : 0;
              const halfMajor = labelInside ? Math.max(5, labelHalfWidth) : 5;
              const angleRad = Math.atan2(dy, dx);
              const angle = (angleRad * 180) / Math.PI;
              const transparent = data.topology.mapOptions?.aggregateTransparent ?? false;
              const fill = data.topology.mapOptions?.aggregateFillColor ?? "#ffffff";
              const stroke = data.topology.mapOptions?.aggregateBorderColor ?? "#94a3b8";
              const strokeWidthVal = data.topology.mapOptions?.aggregateBorderWidth ?? 0.5;
              const labelFill = data.topology.mapOptions?.aggregateLabelColor || stroke;

              // Place the label perpendicular to the source→target axis (= along the capsule's minor axis).
              // "above" = on the side reached by rotating the source→target vector 90° counter-clockwise,
              // "below" = the opposite side. Visually:
              //   - horizontal pair  → "above" is screen-up, "below" is screen-down
              //   - vertical pair    → "above" is one side, "below" is the other
              let textX = cx, textY = cy;
              if (!labelInside && labelText) {
                // halfMinor = capsule edge, fontSize*0.7 = label half-height, +8 = breathing room
                const padding = halfMinor + 8 + labelFontSize * 0.7;
                const sign = labelPos === "above" ? -1 : 1;
                textX = cx + sign * px * padding;
                textY = cy + sign * py * padding;
              }

              return (
                <g key={`agg-${g.key}`} style={{ pointerEvents: "none" }}>
                  <ellipse
                    cx={cx}
                    cy={cy}
                    rx={halfMajor}
                    ry={halfMinor}
                    fill={transparent ? "none" : fill}
                    fillOpacity={transparent ? 0 : 0.95}
                    stroke={stroke}
                    strokeWidth={strokeWidthVal}
                    transform={`rotate(${angle} ${cx} ${cy})`}
                  />
                  {labelText && !labelInside && (
                    <>
                      <rect
                        x={textX - labelHalfWidth - 1}
                        y={textY - labelFontSize * 0.7}
                        width={labelHalfWidth * 2 + 2}
                        height={labelFontSize * 1.3}
                        fill="white"
                        fillOpacity={0.95}
                        rx={2}
                      />
                      <text
                        x={textX}
                        y={textY}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={labelFill}
                        fontSize={labelFontSize}
                        fontWeight={600}
                        style={{ userSelect: "none" }}
                      >
                        {labelText}
                      </text>
                    </>
                  )}
                  {labelText && labelInside && (
                    <text
                      x={cx}
                      y={cy}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fill={labelFill}
                      fontSize={labelFontSize}
                      fontWeight={600}
                      style={{ userSelect: "none" }}
                    >
                      {labelText}
                    </text>
                  )}
                </g>
              );
            })}
            {visibleEdges.map((edge) => {
              // ISIS: zebra dash across area colours
              const isIsis = edge.protocolId != null && isisProtocolIdSet.has(edge.protocolId);
              const areas = isIsis ? edge.style.isisAreas ?? [] : [];
              let stripeColors = areas
                .map((a) => isisAreaColors.get(a))
                .filter((c): c is string => !!c);

              // MSTP: edge presentation depends on the instance selector.
              //  - instance chosen → recolour with that instance's per-state palette,
              //    annotate port labels with priority and add a cost label
              //  - "all" + multi-instance edge → zebra dash, one stripe per instance colour
              let effectiveEdge = edge;
              if (isMstpFiltered && edge.protocolId === protocolFilter) {
                const instances = edge.style.stpInstances ?? [];
                if (mstpInstance !== null) {
                  const found = instances.find((i) => i.instance === mstpInstance);
                  if (!found) return null;
                  const hint = stpStatePalette(found.state);

                  // Build a single-row label per end:
                  //   [role pill] [port (priority)]    [cost (if asymmetric)]
                  // Pill sits closest to the node; cost is pushed along the
                  // tangent so it lands next to the port label on the SAME line.
                  // Symmetric cost stays as a single centred label.
                  const baseLabels = edge.style.labels ?? [];
                  const showRoles = data.topology.mapOptions?.stpShowPortRoles ?? true;
                  const roleFs = data.topology.mapOptions?.stpPortRoleFontSize ?? 7;
                  const roleBw = data.topology.mapOptions?.stpPortRoleBorderWidth ?? 1;
                  const roleL = showRoles ? stpRoleBadge(found.roleLocal) : null;
                  const roleR = showRoles ? stpRoleBadge(found.roleRemote) : null;
                  const annotated: typeof baseLabels = baseLabels.map((lbl) => {
                    if (lbl.position === "source") {
                      return {
                        ...lbl,
                        text: found.priorityLocal != null ? `${lbl.text} (${found.priorityLocal})` : lbl.text,
                        ...(roleL ? { pill: { text: roleL.letter, bgColor: roleL.color, borderWidth: roleBw }, fontSize: roleFs } : {}),
                      };
                    }
                    if (lbl.position === "target") {
                      return {
                        ...lbl,
                        text: found.priorityRemote != null ? `${lbl.text} (${found.priorityRemote})` : lbl.text,
                        ...(roleR ? { pill: { text: roleR.letter, bgColor: roleR.color, borderWidth: roleBw }, fontSize: roleFs } : {}),
                      };
                    }
                    return lbl;
                  });

                  const cl = found.costLocal ?? null;
                  const cr = found.costRemote ?? null;
                  if (cl !== null && cr !== null && cl !== cr) {
                    // Asymmetric cost: each side gets its own red label,
                    // shifted along the tangent so it lands next to (not on
                    // top of) the port label. Distance derived from the
                    // actual port-label width — long port names (e.g. an
                    // Extreme "1/24") need more clearance than short ones.
                    const portSrc = annotated.find((l) => l.position === "source");
                    const portTgt = annotated.find((l) => l.position === "target");
                    const blockWidth = (lbl: typeof annotated[number] | undefined): number => {
                      if (!lbl) return 0;
                      const fs = lbl.fontSize ?? 6;
                      const textW = (lbl.text?.length ?? 0) * 0.58 * fs;
                      if (!lbl.pill) return textW;
                      const pillW = lbl.pill.text.length * 0.58 * fs + 4;
                      return pillW + 3 + textW;
                    };
                    const costFs = 6;
                    const costLW = String(cl).length * 0.58 * costFs;
                    const costRW = String(cr).length * 0.58 * costFs;
                    const gap = 4;
                    // When the port label carries a pill, it has been pushed
                    // a full portWidth/2 + nodeMargin away from pt. Cost
                    // label is then portWidth/2 + gap + costHalf further out.
                    const nodeMargin = 2;
                    const hasPortPill = !!(roleL || roleR);
                    const portW_src = blockWidth(portSrc);
                    const portW_tgt = blockWidth(portTgt);
                    const tlSource = (hasPortPill ? portW_src + nodeMargin : portW_src / 2) + gap + costLW / 2;
                    const tlTarget = (hasPortPill ? portW_tgt + nodeMargin : portW_tgt / 2) + gap + costRW / 2;
                    annotated.push({
                      text: String(cl), position: "source", fontSize: costFs,
                      color: "#dc2626", fontWeight: 700, tangentOffset: tlSource,
                    });
                    annotated.push({
                      text: String(cr), position: "target", fontSize: costFs,
                      color: "#dc2626", fontWeight: 700, tangentOffset: -tlTarget,
                    });
                  } else if (cl !== null || cr !== null) {
                    const c = cl ?? cr;
                    annotated.push({ text: String(c), position: "middle", fontSize: 6, color: "#475569", fontWeight: 600 });
                  }

                  effectiveEdge = {
                    ...edge,
                    style: { ...edge.style, color: hint.color, dash: hint.dash, labels: annotated },
                  };
                } else if (instances.length >= 2) {
                  stripeColors = instances
                    .map((i) => mstpInstanceColors.get(i.instance))
                    .filter((c): c is string => !!c);
                }
              }
              return renderEdge(
                effectiveEdge,
                positions,
                getDesign,
                data.nodes,
                edgeOffsets.get(edge.id) ?? 0,
                selectedEdgeId === edge.id,
                (id) => { setSelectedEdgeId(id); setSelectedNodeId(null); },
                stripeColors,
              );
            })}
            {data.nodes.map((n) => {
              const pos = positions[n.nodeId];
              if (!pos) return null;
              const d = getDesign(n);
              const labels = d.labelElements ?? [];
              const isSelected = selectedNodeIds.has(n.nodeId) || selectedNodeId === n.nodeId;
              return (
                <g
                  key={n.nodeId}
                  data-node={n.nodeId}
                  transform={`translate(${pos.x}, ${pos.y})`}
                  style={{ cursor: "grab" }}
                  onMouseDown={(e) => handleNodeMouseDown(n.nodeId, e)}
                >
                  {isSelected && (
                    <rect
                      x={-d.width / 2 - 4}
                      y={-d.height / 2 - 4}
                      width={d.width + 8}
                      height={d.height + 8}
                      rx={d.shape === "round-rectangle" ? 10 : 0}
                      ry={d.shape === "round-rectangle" ? 10 : 0}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={1.5}
                      strokeDasharray="4,3"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  {renderShape(d)}
                  {labels.map((el, idx) => (
                    <g key={idx}>{renderLabel(el, n)}</g>
                  ))}
                  {/* Root badge is now rendered via the badge:stp_root LabelElement (see renderLabel). */}
                </g>
              );
            })}
            {data.annotations.filter((a) => a.zIndex >= 0).map((annotation) => renderAnnotation(
              annotation,
              selectedAnnotationId === annotation.id,
              (e) => handleAnnotationMouseDown(annotation.id, e),
              (corner, e) => handleAnnotationResizeStart(annotation.id, corner, e),
            ))}
          </g>
        </svg>

        {(data.topology.mapOptions?.stpShowLegend ?? true) && (() => {
          const pos = data.topology.mapOptions?.stpLegendPosition ?? "br";
          const cls =
            pos === "tl" ? "top-3 left-3" :
            pos === "tr" ? "top-3 right-3" :
            pos === "bl" ? "bottom-3 left-3" :
                           "bottom-3 right-3";

          if (isStpFiltered) {
            const STATES: { state: string; key: string }[] = [
              { state: "forwarding", key: "topology.legendStateForwarding" },
              { state: "blocking",   key: "topology.legendStateBlocking" },
              { state: "discarding", key: "topology.legendStateDiscarding" },
              { state: "learning",   key: "topology.legendStateLearning" },
              { state: "listening",  key: "topology.legendStateListening" },
              { state: "disabled",   key: "topology.legendStateDisabled" },
              { state: "mixed",      key: "topology.legendStateMixed" },
            ];
            const ROLES = ["Root", "Designated", "Alternate", "Backup", "Master", "Disabled"];
            return (
              <div className={`absolute ${cls} z-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-3 py-2 shadow-md text-xs text-slate-700 dark:text-slate-300 backdrop-blur max-w-[260px] pointer-events-none`}>
                <div className="font-semibold text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  {isMstpFiltered ? t("topology.legendTitleMstp") : t("topology.legendTitleStp")}
                </div>
                <div className="mb-2">
                  <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                    {t("topology.legendStateSection")}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {STATES.map(({ state, key }) => {
                      const p = stpStatePalette(state);
                      return (
                        <div key={state} className="flex items-center gap-1.5">
                          <svg width="18" height="3"><line x1="0" y1="1.5" x2="18" y2="1.5" stroke={p.color} strokeWidth={2.5} strokeDasharray={p.dash === "dashed" ? "3,2" : p.dash === "dotted" ? "1,2" : undefined} /></svg>
                          <span className="text-[10.5px]">{t(key)}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="mb-2">
                  <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                    {t("topology.legendRoleSection")}
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {ROLES.map((r) => {
                      const b = stpRoleBadge(r)!;
                      return (
                        <div key={r} className="flex items-center gap-1.5">
                          <span className="inline-flex items-center justify-center w-4 h-4 rounded text-[9px] font-bold text-white" style={{ background: b.color }}>{b.letter}</span>
                          <span className="text-[10.5px]">{b.full}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1">
                    {t("topology.legendBridgeSection")}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-flex items-center justify-center rounded-full text-[9px] font-bold text-white"
                          style={{ background: "#dc2626", width: 14, height: 14 }}>R</span>
                    <span className="text-[10.5px]">{t("topology.legendRootBridge")}</span>
                  </div>
                </div>
              </div>
            );
          }

          if (typeof protocolFilter === "number" && isisProtocolIdSet.has(protocolFilter)) {
            const areas = Array.from(isisAreaColors.entries());
            if (areas.length === 0) return null;
            return (
              <div className={`absolute ${cls} z-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 px-3 py-2 shadow-md text-xs text-slate-700 dark:text-slate-300 backdrop-blur max-w-[260px] pointer-events-none`}>
                <div className="font-semibold text-[10px] uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                  {t("topology.legendTitleIsis")}
                </div>
                <div className="grid grid-cols-1 gap-y-0.5">
                  {areas.map(([area, color]) => (
                    <div key={area} className="flex items-center gap-1.5">
                      <svg width="18" height="3"><line x1="0" y1="1.5" x2="18" y2="1.5" stroke={color} strokeWidth={3} /></svg>
                      <span className="text-[10.5px] font-mono">{area}</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          return null;
        })()}

        {data.nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center">
              <p className="text-sm text-slate-500 dark:text-slate-400 mb-3">{t("topology.noMembersHint")}</p>
              <Link
                href={`/topology/${topologyId}/configure`}
                className="pointer-events-auto inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900"
              >
                <Settings className="h-4 w-4" />
                {t("topology.configure")}
              </Link>
            </div>
          </div>
        )}

        {selectedNode && (
          <NodeOverridePanel
            node={selectedNode}
            topologyDesign={data.topology.nodeDesign}
            onChange={(override) => saveNodeOverride(selectedNode.nodeId, override)}
            onClose={() => setSelectedNodeId(null)}
            t={t}
          />
        )}
        {selectedEdge && (
          <EdgeStylePanel
            edge={selectedEdge}
            nodes={data.nodes}
            onChange={(patch) => saveEdgeStyle(selectedEdge.id, patch)}
            onClose={() => setSelectedEdgeId(null)}
            t={t}
          />
        )}
        {selectedAnnotation && (
          <AnnotationPanel
            annotation={selectedAnnotation}
            onChange={(patch) => updateAnnotation(selectedAnnotation.id, patch)}
            onDelete={() => deleteAnnotation(selectedAnnotation.id)}
            onClose={() => setSelectedAnnotationId(null)}
            t={t}
          />
        )}
      </div>
    </div>
  );
}

function renderAnnotation(
  a: Annotation,
  isSelected: boolean,
  onMouseDown: (e: React.MouseEvent) => void,
  onResizeStart: (corner: "nw" | "ne" | "sw" | "se", e: React.MouseEvent) => void,
): React.ReactNode {
  const dashFor = (dash: string, w: number): string | undefined =>
    dash === "dashed" ? `${w * 4},${w * 3}` : dash === "dotted" ? `${w},${w * 2}` : undefined;

  let content: React.ReactNode = null;
  if (a.type === "text") {
    const td = a.data as AnnotationTextData;
    const anchor = td.textAlign === "left" ? "start" : td.textAlign === "right" ? "end" : "middle";
    const tx = td.textAlign === "left" ? td.padding : td.textAlign === "right" ? a.width - td.padding : a.width / 2;
    content = (
      <>
        {td.bgColor && (
          <rect x={0} y={0} width={a.width} height={a.height} fill={td.bgColor} rx={2} />
        )}
        <text
          x={tx}
          y={a.height / 2}
          textAnchor={anchor}
          dominantBaseline="central"
          fill={td.color}
          fontSize={td.fontSize}
          fontWeight={td.fontWeight}
          fontFamily={td.fontFamily}
          style={{ userSelect: "none" }}
        >
          {td.text}
        </text>
      </>
    );
  } else if (a.type === "image") {
    const id = a.data as AnnotationImageData;
    content = id.url ? (
      <image href={id.url} width={a.width} height={a.height} opacity={id.opacity} preserveAspectRatio="xMidYMid meet" />
    ) : (
      <rect width={a.width} height={a.height} fill="#f1f5f9" stroke="#cbd5e1" strokeDasharray="3,3" />
    );
  } else {
    const sd = a.data as AnnotationShapeData;
    const dashArr = dashFor(sd.dash, sd.strokeWidth);
    if (sd.kind === "ellipse") {
      content = (
        <ellipse
          cx={a.width / 2}
          cy={a.height / 2}
          rx={a.width / 2}
          ry={a.height / 2}
          fill={sd.fill}
          fillOpacity={sd.fillOpacity}
          stroke={sd.stroke}
          strokeWidth={sd.strokeWidth}
          strokeDasharray={dashArr}
          opacity={sd.opacity}
        />
      );
    } else {
      content = (
        <rect
          width={a.width}
          height={a.height}
          rx={sd.borderRadius}
          ry={sd.borderRadius}
          fill={sd.fill}
          fillOpacity={sd.fillOpacity}
          stroke={sd.stroke}
          strokeWidth={sd.strokeWidth}
          strokeDasharray={dashArr}
          opacity={sd.opacity}
        />
      );
    }
  }

  return (
    <g
      key={`annot-${a.id}`}
      data-annotation={a.id}
      transform={`translate(${a.x}, ${a.y}) rotate(${a.rotation} ${a.width / 2} ${a.height / 2})`}
      style={{ cursor: "move" }}
      onMouseDown={onMouseDown}
    >
      {isSelected && (
        <>
          <rect
            x={-2}
            y={-2}
            width={a.width + 4}
            height={a.height + 4}
            fill="none"
            stroke="#3b82f6"
            strokeWidth={1.5}
            strokeDasharray="4,3"
            style={{ pointerEvents: "none" }}
          />
          {(["nw", "ne", "sw", "se"] as const).map((corner) => {
            const hx = corner === "nw" || corner === "sw" ? 0 : a.width;
            const hy = corner === "nw" || corner === "ne" ? 0 : a.height;
            const cursor = corner === "nw" || corner === "se" ? "nwse-resize" : "nesw-resize";
            return (
              <rect
                key={corner}
                x={hx - 4}
                y={hy - 4}
                width={8}
                height={8}
                fill="#ffffff"
                stroke="#3b82f6"
                strokeWidth={1.5}
                style={{ cursor }}
                onMouseDown={(e) => onResizeStart(corner, e)}
              />
            );
          })}
        </>
      )}
      {content}
    </g>
  );
}

function ImageAnnotationFields({
  data,
  onChange,
  t,
}: {
  data: AnnotationImageData;
  onChange: (patch: Partial<AnnotationImageData>) => void;
  t: (k: string) => string;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (file: File) => {
    setUploading(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("image", file);
      const res = await fetch("/api/topology-annotation-images", { method: "POST", body: form });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        setError(err?.error ?? `HTTP ${res.status}`);
        return;
      }
      const { url } = await res.json();
      onChange({ url });
    } finally {
      setUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleUpload(file);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRemove = () => {
    onChange({ url: "" });
  };

  return (
    <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
      <div className="space-y-1">
        <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.annotationImage")}</label>
        {data.url ? (
          <div className="space-y-2">
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 overflow-hidden">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={data.url} alt="" className="w-full h-24 object-contain" />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                {uploading ? t("common.loading") : t("topology.annotationImageReplace")}
              </button>
              <button
                type="button"
                onClick={handleRemove}
                className="rounded-lg border border-red-200 dark:border-red-500/20 px-2 py-1.5 text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                {t("topology.annotationImageRemove")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-full rounded-lg border border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-950 px-3 py-4 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
          >
            {uploading ? t("common.loading") : t("topology.annotationImageUpload")}
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif,image/svg+xml"
          onChange={handleFileChange}
          className="hidden"
        />
        {error && <p className="text-[10px] text-red-600 dark:text-red-400">{error}</p>}
      </div>

      <div className="space-y-1">
        <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.annotationOpacity")}</label>
        <div className="flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={data.opacity}
            onChange={(e) => onChange({ opacity: Number(e.target.value) })}
            className="flex-1 accent-blue-600"
          />
          <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-10 text-right">
            {Math.round(data.opacity * 100)}%
          </span>
        </div>
      </div>
    </div>
  );
}

function AnnotationPanel({
  annotation,
  onChange,
  onDelete,
  onClose,
  t,
}: PanelProps & {
  annotation: Annotation;
  onChange: (patch: Omit<Partial<Annotation>, "data"> & { data?: Partial<AnnotationData> }) => void;
  onDelete: () => void;
}) {
  const title = annotation.type === "text"
    ? t("topology.annotationTitleText")
    : annotation.type === "image"
    ? t("topology.annotationTitleImage")
    : t("topology.annotationTitleShape");

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-xl overflow-y-auto z-20">
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.annotationTitle")}</div>
          <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{title}</div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.designWidth")}</label>
            <input
              type="number"
              min={10}
              step={1}
              value={Math.round(annotation.width)}
              onChange={(e) => onChange({ width: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.designHeight")}</label>
            <input
              type="number"
              min={10}
              step={1}
              value={Math.round(annotation.height)}
              onChange={(e) => onChange({ height: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.annotationRotation")}</label>
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={annotation.rotation}
              onChange={(e) => onChange({ rotation: Number(e.target.value) })}
              className="flex-1 accent-blue-600"
            />
            <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-10 text-right">{Math.round(annotation.rotation)}°</span>
          </div>
        </div>

        {annotation.type === "text" && (() => {
          const td = annotation.data as AnnotationTextData;
          return (
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.annotationText")}</label>
                <textarea
                  rows={2}
                  value={td.text}
                  onChange={(e) => onChange({ data: { text: e.target.value } })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs resize-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.labelFontSize")}</label>
                  <input
                    type="number"
                    min={4}
                    max={120}
                    value={td.fontSize}
                    onChange={(e) => onChange({ data: { fontSize: Number(e.target.value) } })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.labelColor")}</label>
                  <input
                    type="color"
                    value={td.color}
                    onChange={(e) => onChange({ data: { color: e.target.value } })}
                    className="h-7 w-full rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.annotationTextAlign")}</label>
                <select
                  value={td.textAlign}
                  onChange={(e) => onChange({ data: { textAlign: e.target.value as AnnotationTextData["textAlign"] } })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                >
                  <option value="left">{t("topology.labelAlignLeft")}</option>
                  <option value="center">{t("topology.labelAlignCenter")}</option>
                  <option value="right">{t("topology.labelAlignRight")}</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.annotationBgColor")}</label>
                <div className="flex items-center gap-1">
                  <input
                    type="color"
                    value={td.bgColor ?? "#ffffff"}
                    onChange={(e) => onChange({ data: { bgColor: e.target.value } })}
                    className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                  />
                  <input
                    type="text"
                    placeholder={t("topology.annotationBgNone")}
                    value={td.bgColor ?? ""}
                    onChange={(e) => onChange({ data: { bgColor: e.target.value || null } })}
                    className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-[10px] font-mono"
                  />
                  {td.bgColor && (
                    <button
                      onClick={() => onChange({ data: { bgColor: null } })}
                      className="px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title={t("topology.annotationBgNone")}
                    >↺</button>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {annotation.type === "image" && (
          <ImageAnnotationFields
            data={annotation.data as AnnotationImageData}
            onChange={(patch) => onChange({ data: patch })}
            t={t}
          />
        )}

        {annotation.type === "shape" && (() => {
          const sd = annotation.data as AnnotationShapeData;
          return (
            <div className="space-y-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.annotationShapeKind")}</label>
                <select
                  value={sd.kind}
                  onChange={(e) => onChange({ data: { kind: e.target.value as AnnotationShapeData["kind"] } })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                >
                  <option value="rectangle">{t("topology.shapeRect")}</option>
                  <option value="ellipse">{t("topology.shapeEllipse")}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.designBorderColor")}</label>
                  <input
                    type="color"
                    value={sd.stroke}
                    onChange={(e) => onChange({ data: { stroke: e.target.value } })}
                    className="h-7 w-full rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.designBgColor")}</label>
                  <input
                    type="color"
                    value={sd.fill}
                    onChange={(e) => onChange({ data: { fill: e.target.value } })}
                    className="h-7 w-full rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.designBorderWidth")}</label>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    max={20}
                    value={sd.strokeWidth}
                    onChange={(e) => onChange({ data: { strokeWidth: Number(e.target.value) } })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.edgeDash")}</label>
                  <select
                    value={sd.dash}
                    onChange={(e) => onChange({ data: { dash: e.target.value as AnnotationShapeData["dash"] } })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                  >
                    <option value="solid">{t("topology.edgeDashSolid")}</option>
                    <option value="dashed">{t("topology.edgeDashDashed")}</option>
                    <option value="dotted">{t("topology.edgeDashDotted")}</option>
                  </select>
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.annotationFillOpacity")}</label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={sd.fillOpacity}
                    onChange={(e) => onChange({ data: { fillOpacity: Number(e.target.value) } })}
                    className="flex-1 accent-blue-600"
                  />
                  <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-10 text-right">
                    {Math.round(sd.fillOpacity * 100)}%
                  </span>
                </div>
              </div>
              {sd.kind === "rectangle" && (
                <div className="space-y-1">
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.clusterRadius")}</label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    step={1}
                    value={sd.borderRadius}
                    onChange={(e) => onChange({ data: { borderRadius: Number(e.target.value) } })}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
                  />
                </div>
              )}
            </div>
          );
        })()}

        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.annotationZOrder")}</label>
          <div className="grid grid-cols-4 gap-1.5">
            <button
              onClick={() => onChange({ zIndex: 1000 })}
              title={t("topology.annotationBringFront")}
              className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <BringToFront className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </button>
            <button
              onClick={() => onChange({ zIndex: annotation.zIndex + 1 })}
              title={t("topology.annotationBringForward")}
              className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ChevronUp className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </button>
            <button
              onClick={() => onChange({ zIndex: annotation.zIndex - 1 })}
              title={t("topology.annotationSendBackward")}
              className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <ChevronDown className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </button>
            <button
              onClick={() => onChange({ zIndex: -1 })}
              title={t("topology.annotationSendBack")}
              className="flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <SendToBack className="h-4 w-4 text-slate-600 dark:text-slate-300" />
            </button>
          </div>
          <p className="text-[10px] text-slate-400">{t("topology.annotationZOrderHint")}</p>
        </div>

        <button
          onClick={onDelete}
          className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-200 dark:border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors mt-3"
        >
          <Trash2 className="h-3.5 w-3.5" />
          {t("topology.annotationDelete")}
        </button>
      </div>
    </div>
  );
}

interface PanelProps {
  onClose: () => void;
  t: (k: string) => string;
}

const SHAPE_OPTIONS_PANEL = [
  { value: "round-rectangle", labelKey: "topology.shapeRoundRect" },
  { value: "rectangle", labelKey: "topology.shapeRect" },
  { value: "ellipse", labelKey: "topology.shapeEllipse" },
  { value: "diamond", labelKey: "topology.shapeDiamond" },
  { value: "hexagon", labelKey: "topology.shapeHexagon" },
  { value: "triangle", labelKey: "topology.shapeTriangle" },
];

function NodeOverridePanel({
  node,
  topologyDesign,
  onChange,
  onClose,
  t,
}: PanelProps & {
  node: GraphNode;
  topologyDesign: NodeDesign;
  onChange: (override: NodeDesign | null) => void;
}) {
  const hasOverride = node.styleOverride !== null;
  const effective: NodeDesign = node.styleOverride ?? topologyDesign;
  const title = node.hostname || node.name || node.ipAddress;

  const apply = (patch: Partial<NodeDesign>) => {
    const base = node.styleOverride ?? { ...topologyDesign };
    onChange({ ...base, ...patch });
  };

  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-xl overflow-y-auto z-20">
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.overrideNodeTitle")}</div>
          <div className="text-sm font-bold text-slate-900 dark:text-white truncate">{title}</div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          ✕
        </button>
      </div>

      {!hasOverride && (
        <div className="px-4 py-2.5 border-b border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-950">
          {t("topology.overrideInheritsHint")}
        </div>
      )}

      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.designShape")}</label>
          <select
            value={effective.shape}
            onChange={(e) => apply({ shape: e.target.value })}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
          >
            {SHAPE_OPTIONS_PANEL.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.designWidth")}</label>
            <input
              type="number"
              min={20}
              max={400}
              value={effective.width}
              onChange={(e) => apply({ width: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
            />
          </div>
          <div className="space-y-1">
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.designHeight")}</label>
            <input
              type="number"
              min={20}
              max={400}
              value={effective.height}
              onChange={(e) => apply({ height: Number(e.target.value) })}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.designBorderWidth")}</label>
          <input
            type="number"
            step={0.1}
            min={0}
            max={10}
            value={effective.borderWidth}
            onChange={(e) => apply({ borderWidth: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.designBorderColor")}</label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={effective.borderColor}
              onChange={(e) => apply({ borderColor: e.target.value })}
              className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={effective.borderColor}
              onChange={(e) => apply({ borderColor: e.target.value })}
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-[10px] font-mono"
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.designBgColor")}</label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={effective.bgColor}
              onChange={(e) => apply({ bgColor: e.target.value })}
              className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={effective.bgColor}
              onChange={(e) => apply({ bgColor: e.target.value })}
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-[10px] font-mono"
            />
          </div>
        </div>

        {hasOverride && (
          <button
            onClick={() => onChange(null)}
            className="w-full mt-2 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            {t("topology.overrideReset")}
          </button>
        )}
      </div>
    </div>
  );
}

const EDGE_TYPE_OPTIONS_PANEL = [
  { value: "straight", labelKey: "topology.edgeTypeStraight" },
  { value: "orthogonal", labelKey: "topology.edgeTypeOrthogonal" },
  { value: "curved", labelKey: "topology.edgeTypeCurved" },
];
const EDGE_DASH_OPTIONS_PANEL = [
  { value: "solid", labelKey: "topology.edgeDashSolid" },
  { value: "dashed", labelKey: "topology.edgeDashDashed" },
  { value: "dotted", labelKey: "topology.edgeDashDotted" },
];

function EdgeStylePanel({
  edge,
  nodes,
  onChange,
  onClose,
  t,
}: PanelProps & {
  edge: GraphEdge;
  nodes: GraphNode[];
  onChange: (patch: Partial<GraphEdgeStyle>) => void;
}) {
  const findName = (id: number) => {
    const n = nodes.find((x) => x.nodeId === id);
    return n ? (n.hostname || n.name || n.ipAddress) : `#${id}`;
  };
  const style = edge.style;
  return (
    <div className="absolute top-0 right-0 bottom-0 w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-xl overflow-y-auto z-20">
      <div className="sticky top-0 z-10 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.overrideEdgeTitle")}</div>
          <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
            {findName(edge.sourceNodeId)} → {findName(edge.targetNodeId)}
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-3">
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.edgeType")}</label>
          <select
            value={style.type ?? "straight"}
            onChange={(e) => onChange({ type: e.target.value as GraphEdgeStyle["type"] })}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
          >
            {EDGE_TYPE_OPTIONS_PANEL.map((o) => (
              <option key={o.value} value={o.value}>{t(o.labelKey)}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.edgeDash")}</label>
          <select
            value={style.dash ?? "solid"}
            onChange={(e) => onChange({ dash: e.target.value as GraphEdgeStyle["dash"] })}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
          >
            {EDGE_DASH_OPTIONS_PANEL.map((o) => (
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
            value={style.width ?? 0.5}
            onChange={(e) => onChange({ width: Number(e.target.value) })}
            className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1.5 text-xs"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.edgeColor")}</label>
          <div className="flex items-center gap-1">
            <input
              type="color"
              value={style.color ?? "#94a3b8"}
              onChange={(e) => onChange({ color: e.target.value })}
              className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
            />
            <input
              type="text"
              value={style.color ?? "#94a3b8"}
              onChange={(e) => onChange({ color: e.target.value })}
              className="flex-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-2 py-1 text-[10px] font-mono"
            />
          </div>
        </div>
        {style.type === "curved" && (
          <div className="space-y-1">
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.edgeCurveTension")}</label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={style.curveTension ?? 0.3}
                onChange={(e) => onChange({ curveTension: Number(e.target.value) })}
                className="flex-1 accent-blue-600"
              />
              <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-10 text-right">
                {(style.curveTension ?? 0.3).toFixed(2)}
              </span>
            </div>
          </div>
        )}
        <p className="text-[10px] text-slate-400 pt-2 border-t border-slate-100 dark:border-slate-800">
          {t("topology.overrideEdgeHint")}
        </p>
      </div>
    </div>
  );
}

function dashArrayFor(style: GraphEdgeStyle): string | undefined {
  if (style.dash === "dashed") return `${style.width * 4},${style.width * 3}`;
  if (style.dash === "dotted") return `${style.width},${style.width * 2}`;
  return undefined;
}

// Default perpendicular gap (px) between parallel links of the same node pair.
// Overridable per pair via GraphEdgeStyle.parallelSpacing (see edgeOffsets memo).
const PARALLEL_SPACING = 18;

// Compute the Bezier control point (cx, cy) used when an edge has a perpendicular
// offset (curved-by-design OR straight-but-parallel-to-a-sibling). `offset` is a
// signed perpendicular distance in px (already scaled by the pair's spacing).
function bezierControl(
  sx: number, sy: number, tx: number, ty: number,
  curveTension: number, offset: number,
): { cx: number; cy: number; len: number; px: number; py: number } {
  const dx = tx - sx;
  const dy = ty - sy;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len; // perpendicular unit vector
  const py = dx / len;
  const totalOffset = len * curveTension + offset;
  return {
    cx: (sx + tx) / 2 + px * totalOffset,
    cy: (sy + ty) / 2 + py * totalOffset,
    len, px, py,
  };
}

function buildPath(style: GraphEdgeStyle, sx: number, sy: number, tx: number, ty: number, offset = 0): string {
  if (style.type === "orthogonal") {
    const mx = (sx + tx) / 2 + offset;
    return `M ${sx} ${sy} L ${mx} ${sy} L ${mx} ${ty} L ${tx} ${ty}`;
  }
  if (style.type === "curved") {
    const { cx, cy } = bezierControl(sx, sy, tx, ty, style.curveTension ?? 0.3, offset);
    return `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
  }
  // straight: regular line when no offset, otherwise gentle curve to separate parallel edges
  if (offset === 0) {
    return `M ${sx} ${sy} L ${tx} ${ty}`;
  }
  const { cx, cy } = bezierControl(sx, sy, tx, ty, 0, offset);
  return `M ${sx} ${sy} Q ${cx} ${cy} ${tx} ${ty}`;
}

function pointAt(
  style: GraphEdgeStyle,
  sx: number, sy: number, tx: number, ty: number,
  ratio: number,
  offset = 0,
): { x: number; y: number } {
  if (style.type === "orthogonal") {
    const mx = (sx + tx) / 2 + offset;
    const seg1 = Math.abs(mx - sx);
    const seg2 = Math.abs(ty - sy);
    const seg3 = Math.abs(tx - mx);
    const total = seg1 + seg2 + seg3 || 1;
    const target = ratio * total;
    if (target <= seg1) {
      const r = seg1 === 0 ? 0 : target / seg1;
      return { x: sx + (mx - sx) * r, y: sy };
    }
    if (target <= seg1 + seg2) {
      const r = seg2 === 0 ? 0 : (target - seg1) / seg2;
      return { x: mx, y: sy + (ty - sy) * r };
    }
    const r = seg3 === 0 ? 0 : (target - seg1 - seg2) / seg3;
    return { x: mx + (tx - mx) * r, y: ty };
  }
  // straight w/ offset → behave as bezier; curved → bezier
  const isBezier = style.type === "curved" || (style.type === "straight" && offset !== 0);
  if (isBezier) {
    const tension = style.type === "curved" ? (style.curveTension ?? 0.3) : 0;
    const { cx, cy } = bezierControl(sx, sy, tx, ty, tension, offset);
    const u = 1 - ratio;
    return {
      x: u * u * sx + 2 * u * ratio * cx + ratio * ratio * tx,
      y: u * u * sy + 2 * u * ratio * cy + ratio * ratio * ty,
    };
  }
  return { x: sx + (tx - sx) * ratio, y: sy + (ty - sy) * ratio };
}

interface Box { minX: number; maxX: number; minY: number; maxY: number; }

function nodeBoxFor(
  nodeId: number,
  positions: Record<number, { x: number; y: number }>,
  nodes: GraphNode[],
  getDesign: (n: GraphNode) => NodeDesign,
): Box | null {
  const pos = positions[nodeId];
  const n = nodes.find((x) => x.nodeId === nodeId);
  if (!pos || !n) return null;
  const d = getDesign(n);
  return {
    minX: pos.x - d.width / 2,
    maxX: pos.x + d.width / 2,
    minY: pos.y - d.height / 2,
    maxY: pos.y + d.height / 2,
  };
}

function insideBox(p: { x: number; y: number }, box: Box, margin: number): boolean {
  return p.x >= box.minX - margin
    && p.x <= box.maxX + margin
    && p.y >= box.minY - margin
    && p.y <= box.maxY + margin;
}

function findLabelRatio(
  style: GraphEdgeStyle,
  sp: { x: number; y: number },
  tp: { x: number; y: number },
  position: "source" | "middle" | "target",
  sourceBox: Box | null,
  targetBox: Box | null,
  offsetIndex: number,
): number {
  if (position === "middle") return 0.5;
  const margin = 4;
  const NUM = 40;
  if (position === "source") {
    for (let i = 1; i <= NUM; i++) {
      const r = i / NUM;
      const p = pointAt(style, sp.x, sp.y, tp.x, tp.y, r, offsetIndex);
      if (sourceBox && insideBox(p, sourceBox, margin)) continue;
      if (targetBox && insideBox(p, targetBox, margin)) break;
      return Math.min(r + 1 / NUM, 0.45);
    }
    return 0.15;
  }
  for (let i = 1; i <= NUM; i++) {
    const r = 1 - i / NUM;
    const p = pointAt(style, sp.x, sp.y, tp.x, tp.y, r, offsetIndex);
    if (targetBox && insideBox(p, targetBox, margin)) continue;
    if (sourceBox && insideBox(p, sourceBox, margin)) break;
    return Math.max(r - 1 / NUM, 0.55);
  }
  return 0.85;
}

function stpRoleBadge(role: string | null | undefined): { letter: string; color: string; full: string } | null {
  if (!role) return null;
  const r = role.toLowerCase();
  if (r.startsWith("root"))       return { letter: "R", color: "#22c55e", full: "Root" };
  if (r.startsWith("desig"))      return { letter: "D", color: "#3b82f6", full: "Designated" };
  if (r.startsWith("alt"))        return { letter: "A", color: "#f59e0b", full: "Alternate" };
  if (r.startsWith("back"))       return { letter: "B", color: "#eab308", full: "Backup" };
  if (r.startsWith("master"))     return { letter: "M", color: "#a855f7", full: "Master" };
  if (r.startsWith("disab")
   || r.startsWith("dis")
   || r === "-")                  return { letter: "-", color: "#94a3b8", full: "Disabled" };
  // Fallback: first letter, neutral colour
  return { letter: role.charAt(0).toUpperCase(), color: "#64748b", full: role };
}

function stpStatePalette(state: string): { color: string; dash: "solid" | "dashed" | "dotted" } {
  switch (state) {
    case "forwarding": return { color: "#22c55e", dash: "solid" };
    case "learning":   return { color: "#f59e0b", dash: "dashed" };
    case "listening":  return { color: "#fbbf24", dash: "dashed" };
    case "blocking":   return { color: "#ef4444", dash: "dotted" };
    case "discarding": return { color: "#ef4444", dash: "dotted" };
    case "disabled":   return { color: "#94a3b8", dash: "dotted" };
    case "mixed":      return { color: "#f97316", dash: "dashed" };
    default:           return { color: "#94a3b8", dash: "solid" };
  }
}

function renderEdge(
  edge: GraphEdge,
  positions: Record<number, { x: number; y: number }>,
  getDesign: (n: GraphNode) => NodeDesign,
  nodes: GraphNode[],
  offsetIndex: number,
  isSelected: boolean,
  onSelect: (edgeId: number) => void,
  areaColors: string[] = [],
): React.ReactNode {
  const sp = positions[edge.sourceNodeId];
  const tp = positions[edge.targetNodeId];
  if (!sp || !tp) return null;
  // Defensive defaults: an old edge in DB may be missing fields if it was created before backend merge fix
  const baseColor = edge.style.color ?? "#94a3b8";
  // Single area: paint the edge with the area colour. Multi-area: keep the
  // base colour for fallbacks (selection halo, etc.) — the zebra strokes
  // below carry the real per-area colours.
  const strokeColor = areaColors.length === 1 ? areaColors[0] : baseColor;
  const style: GraphEdgeStyle = {
    type: edge.style.type ?? "straight",
    color: strokeColor,
    width: edge.style.width ?? 1.5,
    dash: edge.style.dash ?? "solid",
    curveTension: edge.style.curveTension ?? 0.3,
    labels: edge.style.labels ?? [],
  };
  const path = buildPath(style, sp.x, sp.y, tp.x, tp.y, offsetIndex);
  const dashArray = dashArrayFor(style);
  // Zebra dash for multi-area ISIS links: N overlapping dashed strokes share
  // the same period (n × dashLen) but each uses a different dashoffset, so
  // every Nth dash slot is filled by exactly one colour — yielding an
  // interleaved hatched look. dashLen is in SVG units (the parent <g> handles
  // zoom), tuned to match the visual density of the legacy renderer.
  const isZebra = areaColors.length >= 2;
  const zebraDashLen = Math.max(style.width * 4, 6);
  const zebraDashArray = isZebra
    ? `${zebraDashLen} ${zebraDashLen * (areaColors.length - 1)}`
    : undefined;

  const sourceBox = nodeBoxFor(edge.sourceNodeId, positions, nodes, getDesign);
  const targetBox = nodeBoxFor(edge.targetNodeId, positions, nodes, getDesign);

  // Labels are placed where the path exits the node's bounding box (source/target)
  // or at 50% of the path (middle).
  const labels = (style.labels ?? []).map((label, idx) => {
    const ratio = findLabelRatio(style, sp, tp, label.position, sourceBox, targetBox, offsetIndex);
    const p = pointAt(style, sp.x, sp.y, tp.x, tp.y, ratio, offsetIndex);
    // Tangent: derivative approximation around the label position
    const eps = 0.01;
    const r1 = Math.max(0, ratio - eps);
    const r2 = Math.min(1, ratio + eps);
    const pA = pointAt(style, sp.x, sp.y, tp.x, tp.y, r1, offsetIndex);
    const pB = pointAt(style, sp.x, sp.y, tp.x, tp.y, r2, offsetIndex);
    let labelAngle = (Math.atan2(pB.y - pA.y, pB.x - pA.x) * 180) / Math.PI;
    // Keep text upright (never read upside-down). The flip thresholds are STRICT (> 90 / < -90),
    // so labels follow the natural tangent direction: parallel links curving slightly left/right
    // get a head-left / head-right rotation respectively, matching how a reader would tilt.
    // `flipped` lets directional labels (pills) know that the local x axis got
    // mirrored — without that, the role badge ends up on the wrong side of
    // the port label whenever the edge points right-to-left.
    const flipped = labelAngle > 90 || labelAngle < -90;
    if (labelAngle > 90) labelAngle -= 180;
    else if (labelAngle < -90) labelAngle += 180;

    const offset = label.offset ?? 0;
    const text = label.text;
    if (!text) return null;
    const fontSize = label.fontSize ?? 10;
    const charW = fontSize * 0.58;
    const textW = text.length * charW;
    const h = fontSize * 1.3;

    // Optional inline pill — same horizontal line as the main text. We try to
    // keep the pill closest to the node, so at "source" it sits to the left,
    // at "target" to the right, at "middle" to the left by default. When the
    // tangent flips (right-to-left edge), the local x axis is mirrored, so we
    // flip the pill side too — otherwise it lands on the wrong end.
    const pill = label.pill ?? null;
    const pillText = pill?.text ?? "";
    const pillW = pill ? pillText.length * (fontSize * 0.58) + 4 : 0;
    const pillGap = pill ? 3 : 0;
    const pillOnLeft = flipped
      ? label.position === "target"
      : label.position !== "target";

    // Background rect spans pill + text. Origin (0,0) is the centre of the
    // composite block; the inner shifts below place pill/text on each side.
    const totalW = pillW + pillGap + textW;
    const blockHalf = totalW / 2;
    const textShiftX = pill ? (pillOnLeft ? (pillW + pillGap) / 2 : -(pillW + pillGap) / 2) : 0;
    const pillCenterX = pill
      ? (pillOnLeft ? -blockHalf + pillW / 2 : blockHalf - pillW / 2)
      : 0;

    // Auto-shift the WHOLE block (pill + gap + text) entirely outside the
    // node's bounding box. findLabelRatio puts the centre at the node edge,
    // which would leave the role pill (R/D/A/B/M) buried inside the node.
    // Shifting by half the total width pushes the node-side edge of the
    // block flush with the node edge, plus a small margin so the pill stays
    // visibly detached.
    const totalWForShift = pillW + pillGap + textW;
    const nodeMargin = 2;
    const pillAutoShift = pill
      ? (totalWForShift / 2 + nodeMargin) * (label.position === "target" ? -1 : 1)
      : 0;
    const canonicalTangent = (label.tangentOffset ?? 0) + pillAutoShift;
    const tangentOffset = canonicalTangent * (flipped ? -1 : 1);

    return (
      <g
        key={`l${idx}`}
        transform={`translate(${p.x}, ${p.y}) rotate(${labelAngle}) translate(${tangentOffset}, ${offset})`}
        style={{ pointerEvents: "none" }}
      >
        <rect
          x={-blockHalf - 3}
          y={-h / 2}
          width={totalW + 6}
          height={h}
          fill={label.backgroundColor ?? "white"}
          fillOpacity={label.backgroundColor ? 1 : 0.9}
          rx={2}
        />
        {pill && (() => {
          // `borderWidth` carves white margin around the coloured pill rect.
          // The pill keeps its layout footprint (pillW × h) so the surrounding
          // label geometry doesn't shift — only the inner coloured rect
          // shrinks. Clamp to non-negative dimensions.
          const bw = pill.borderWidth ?? 1;
          const innerW = Math.max(0, pillW - 2 * bw);
          const innerH = Math.max(0, h - 2 * bw);
          return (
            <>
              <rect
                x={pillCenterX - innerW / 2}
                y={-innerH / 2}
                width={innerW}
                height={innerH}
                fill={pill.bgColor}
                rx={2}
              />
              <text
                x={pillCenterX}
                y={0}
                textAnchor="middle"
                dominantBaseline="central"
                fill={pill.textColor ?? "#ffffff"}
                fontSize={fontSize * 0.95}
                fontWeight={800}
                style={{ userSelect: "none" }}
              >
                {pillText}
              </text>
            </>
          );
        })()}
        <text
          x={textShiftX}
          textAnchor="middle"
          dominantBaseline="central"
          fill={label.color ?? "#475569"}
          fontSize={fontSize}
          fontWeight={label.fontWeight ?? 400}
          style={{ userSelect: "none" }}
        >
          {text}
        </text>
      </g>
    );
  });

  return (
    <g key={`edge-${edge.id}`} data-edge={edge.id}>
      {/* invisible wide hit area for easier click targeting */}
      <path
        d={path}
        fill="none"
        stroke="transparent"
        strokeWidth={Math.max(style.width * 6, 12)}
        onClick={(e) => { e.stopPropagation(); onSelect(edge.id); }}
        style={{ cursor: "pointer" }}
      />
      {isSelected && (
        <path
          d={path}
          fill="none"
          stroke="#3b82f6"
          strokeWidth={style.width + 3}
          strokeLinejoin="round"
          strokeLinecap="round"
          opacity={0.35}
          style={{ pointerEvents: "none" }}
        />
      )}
      {isZebra ? (
        areaColors.map((color, i) => (
          <path
            key={`zebra-${i}`}
            d={path}
            fill="none"
            stroke={color}
            strokeWidth={style.width}
            strokeDasharray={zebraDashArray}
            strokeDashoffset={-i * zebraDashLen}
            strokeLinejoin="round"
            strokeLinecap="butt"
            style={{ pointerEvents: "none" }}
          />
        ))
      ) : (
        <path
          d={path}
          fill="none"
          stroke={style.color}
          strokeWidth={style.width}
          strokeDasharray={dashArray}
          strokeLinejoin="round"
          strokeLinecap="round"
          style={{ pointerEvents: "none" }}
        />
      )}
      {labels}
    </g>
  );
}

// Convex hull (Andrew's monotone chain) of an array of 2D points.
function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  if (pts.length <= 1) return [...pts];
  const sorted = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
    upper.push(p);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

function expandHull(hull: { x: number; y: number }[], padding: number): { x: number; y: number }[] {
  if (hull.length === 0) return hull;
  const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
  const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
  return hull.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: p.x + (dx / d) * padding, y: p.y + (dy / d) * padding };
  });
}

function roundedHullPath(pts: { x: number; y: number }[], radius: number): string {
  if (pts.length < 2) return "";
  const n = pts.length;
  const unit = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const d = Math.sqrt(dx * dx + dy * dy) || 1;
    return { x: dx / d, y: dy / d, len: d };
  };
  let d = "";
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n];
    const cur = pts[i];
    const next = pts[(i + 1) % n];
    const u1 = unit(cur, prev);
    const u2 = unit(cur, next);
    const r = Math.min(radius, u1.len / 2, u2.len / 2);
    const p1 = { x: cur.x + u1.x * r, y: cur.y + u1.y * r };
    const p2 = { x: cur.x + u2.x * r, y: cur.y + u2.y * r };
    if (i === 0) d += `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    else d += ` L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
    d += ` Q ${cur.x.toFixed(1)} ${cur.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d + " Z";
}

/**
 * For each node of this cluster, return the anchor point the cluster's outline must touch:
 *   - exclusive node → its centre
 *   - shared node    → its centre pushed in the direction opposite to the average centroid of the
 *                      OTHER clusters sharing this node. The hull of cluster A and cluster B then
 *                      "lean" away from each other across the shared node.
 */
function computeClusterAnchors(
  cluster: GraphCluster,
  positions: Record<number, { x: number; y: number }>,
  allClusters: GraphCluster[],
  pushDistance: number,
): { x: number; y: number }[] {
  const anchors: { x: number; y: number }[] = [];
  const memberSet = new Set(cluster.nodeIds);
  for (const nodeId of cluster.nodeIds) {
    const pos = positions[nodeId];
    if (!pos) continue;
    const otherClusters = allClusters.filter((c) => c.id !== cluster.id && c.nodeIds.includes(nodeId));
    if (otherClusters.length === 0) {
      anchors.push({ x: pos.x, y: pos.y });
      continue;
    }
    // Centroid of the OTHER clusters' members (excluding the shared node itself)
    let sx = 0, sy = 0, n = 0;
    for (const oc of otherClusters) {
      for (const oid of oc.nodeIds) {
        if (oid === nodeId) continue;
        const op = positions[oid];
        if (!op) continue;
        // Skip points that are also in our own cluster (they don't represent "other" zones)
        if (memberSet.has(oid)) continue;
        sx += op.x; sy += op.y; n++;
      }
    }
    if (n === 0) {
      anchors.push({ x: pos.x, y: pos.y });
      continue;
    }
    const ocx = sx / n, ocy = sy / n;
    let dx = pos.x - ocx, dy = pos.y - ocy;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 1) {
      anchors.push({ x: pos.x, y: pos.y });
    } else {
      dx /= dist; dy /= dist;
      anchors.push({ x: pos.x + dx * pushDistance, y: pos.y + dy * pushDistance });
    }
  }
  return anchors;
}

function renderCluster(
  cluster: GraphCluster,
  positions: Record<number, { x: number; y: number }>,
  nodes: GraphNode[],
  getDesign: (n: GraphNode) => NodeDesign,
  mapCentroid: { x: number; y: number } | null,
  allClusters: GraphCluster[],
  onLabelMouseDown: (clusterId: number, e: React.MouseEvent) => void,
): React.ReactNode {
  const memberPositions = cluster.nodeIds
    .map((nid) => {
      const pos = positions[nid];
      const node = nodes.find((n) => n.nodeId === nid);
      if (!pos || !node) return null;
      const d = getDesign(node);
      return { nid, pos, w: d.width, h: d.height };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  if (memberPositions.length === 0) return null;

  const style = cluster.style;
  const shape = style.shape ?? "rectangle";
  if (shape !== "hull" && memberPositions.length < 2) return null;
  const pad = style.padding ?? 20;
  const dashArray = style.dash === "dashed"
    ? `${style.borderWidth * 4},${style.borderWidth * 3}`
    : style.dash === "dotted"
    ? `${style.borderWidth},${style.borderWidth * 2}`
    : undefined;
  const fillProps = style.transparent
    ? { fill: "none" as const, fillOpacity: 0 }
    : { fill: style.fillColor, fillOpacity: 0.18 };
  const fontSize = style.labelFontSize ?? 10;
  const labelText = style.labelPosition !== "none" ? cluster.name : null;

  // Cluster centroid (used as both label anchor and outward-direction origin)
  let centerX = 0, centerY = 0;
  for (const m of memberPositions) { centerX += m.pos.x; centerY += m.pos.y; }
  centerX /= memberPositions.length;
  centerY /= memberPositions.length;

  // Direction in which to push the label outside the cluster. If the cluster sits roughly
  // on top of the global map centroid (e.g. an "all-nodes" enclosing area), keep the label
  // at the centroid instead — that matches how the legacy view rendered it.
  let outDx = 0, outDy = 0, outDist = 0;
  if (mapCentroid) {
    outDx = centerX - mapCentroid.x;
    outDy = centerY - mapCentroid.y;
    outDist = Math.sqrt(outDx * outDx + outDy * outDy);
    if (outDist > 1) { outDx /= outDist; outDy /= outDist; } else { outDx = 0; outDy = 0; }
  }

  let pathOrShape: React.ReactNode;
  let labelCx = centerX, labelCy = centerY;

  if (shape === "polygon") {
    // Tight enclosing polygon: enlarge each node's bbox by `pad` in every
    // direction first, then convex-hull every corner. Inflating per-node
    // (instead of expanding the hull from its centroid) keeps the padding
    // uniform on all four sides even when nodes are spread far apart on one
    // axis — otherwise top/bottom padding collapses for horizontally aligned
    // clusters. Result: straight edges, rectangle when nodes line up,
    // diagonal sides when they don't.
    const corners: { x: number; y: number }[] = [];
    for (const m of memberPositions) {
      const hx = m.w / 2 + pad;
      const hy = m.h / 2 + pad;
      corners.push({ x: m.pos.x - hx, y: m.pos.y - hy });
      corners.push({ x: m.pos.x + hx, y: m.pos.y - hy });
      corners.push({ x: m.pos.x + hx, y: m.pos.y + hy });
      corners.push({ x: m.pos.x - hx, y: m.pos.y + hy });
    }
    const expanded = convexHull(corners);
    const pts = expanded.map((p) => `${p.x},${p.y}`).join(" ");
    pathOrShape = (
      <polygon
        points={pts}
        {...fillProps}
        stroke={style.borderColor}
        strokeWidth={style.borderWidth}
        strokeDasharray={dashArray}
        strokeLinejoin="round"
      />
    );
    // Label placement matches the rectangle case: top/bottom of the bbox of
    // the polygon so the pill never overlaps the diagonal edges.
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const p of expanded) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }
    labelCx = minX + 12;
    labelCy = style.labelPosition === "top" ? minY - fontSize * 0.4 - 2 : maxY + fontSize * 1.0 + 2;
  } else if (shape === "hull") {
    // pushDistance: how far a shared node pulls the cluster outline away from its sibling clusters
    const pushDistance = pad;
    const anchors = computeClusterAnchors(cluster, positions, allClusters, pushDistance);

    if (anchors.length === 1) {
      // Single-node area: circle centered on the (possibly pushed) anchor
      const a = anchors[0];
      const r = pad;
      pathOrShape = (
        <circle cx={a.x} cy={a.y} r={r} {...fillProps} stroke={style.borderColor} strokeWidth={style.borderWidth} strokeDasharray={dashArray} />
      );
      if (outDist > 1) {
        labelCx = a.x + outDx * (r + fontSize * 0.8);
        labelCy = a.y + outDy * (r + fontSize * 0.8);
      } else {
        labelCx = a.x;
        labelCy = a.y - r - fontSize * 0.8;
      }
    } else if (anchors.length === 2) {
      // Two-node area: ellipse passing through both anchors with a modest minor axis
      const [a, b] = anchors;
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const half = Math.sqrt(dx * dx + dy * dy) / 2;
      const rx = half + pad * 0.5;
      const ry = pad;
      const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
      pathOrShape = (
        <ellipse
          cx={cx} cy={cy} rx={rx} ry={ry}
          transform={`rotate(${angle} ${cx} ${cy})`}
          {...fillProps}
          stroke={style.borderColor}
          strokeWidth={style.borderWidth}
          strokeDasharray={dashArray}
        />
      );
      if (outDist > 1) {
        const angRad = Math.atan2(dy, dx);
        const cosA = Math.cos(-angRad);
        const sinA = Math.sin(-angRad);
        const localX = outDx * cosA - outDy * sinA;
        const localY = outDx * sinA + outDy * cosA;
        const norm = Math.sqrt((localX / rx) ** 2 + (localY / ry) ** 2) || 1;
        const ex = localX / norm;
        const ey = localY / norm;
        const cosB = Math.cos(angRad);
        const sinB = Math.sin(angRad);
        const boundaryX = cx + ex * cosB - ey * sinB;
        const boundaryY = cy + ex * sinB + ey * cosB;
        labelCx = boundaryX + outDx * (fontSize * 0.6);
        labelCy = boundaryY + outDy * (fontSize * 0.6);
      } else {
        labelCx = cx;
        labelCy = cy;
      }
    } else {
      // 3+ nodes: convex hull through the (possibly pushed) anchors, then a small expand
      // and rounded path. The hull effectively "passes through the node centres".
      const hull = convexHull(anchors);
      const expanded = expandHull(hull, pad * 0.4);
      const corner = style.borderRadius ?? 18;
      const d = roundedHullPath(expanded, corner);
      pathOrShape = (
        <path
          d={d}
          {...fillProps}
          stroke={style.borderColor}
          strokeWidth={style.borderWidth}
          strokeDasharray={dashArray}
          strokeLinejoin="round"
        />
      );
      const hullCx = expanded.reduce((s, p) => s + p.x, 0) / expanded.length;
      const hullCy = expanded.reduce((s, p) => s + p.y, 0) / expanded.length;
      if (outDist > 1) {
        let bestDot = -Infinity;
        let bestPt = expanded[0];
        for (const p of expanded) {
          const dot = (p.x - hullCx) * outDx + (p.y - hullCy) * outDy;
          if (dot > bestDot) { bestDot = dot; bestPt = p; }
        }
        labelCx = bestPt.x + outDx * (fontSize * 0.6);
        labelCy = bestPt.y + outDy * (fontSize * 0.6);
      } else {
        labelCx = hullCx;
        labelCy = hullCy;
      }
    }
  } else {
    // Legacy rectangle behavior
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const { pos, w, h } of memberPositions) {
      if (pos.x - w / 2 < minX) minX = pos.x - w / 2;
      if (pos.x + w / 2 > maxX) maxX = pos.x + w / 2;
      if (pos.y - h / 2 < minY) minY = pos.y - h / 2;
      if (pos.y + h / 2 > maxY) maxY = pos.y + h / 2;
    }
    const rx = minX - pad;
    const ry = minY - pad;
    const rw = maxX - minX + pad * 2;
    const rh = maxY - minY + pad * 2;
    pathOrShape = (
      <rect
        x={rx} y={ry} width={rw} height={rh}
        rx={style.borderRadius ?? 12} ry={style.borderRadius ?? 12}
        {...fillProps}
        stroke={style.borderColor}
        strokeWidth={style.borderWidth}
        strokeDasharray={dashArray}
      />
    );
    labelCx = rx + 12;
    labelCy = style.labelPosition === "top" ? ry - fontSize * 0.4 - 2 : ry + rh + fontSize * 1.0 + 2;
  }

  // Apply user-controlled label offset (set via drag) on top of the auto-computed anchor.
  const labelOff = style.labelOffset ?? { dx: 0, dy: 0 };
  labelCx += labelOff.dx;
  labelCy += labelOff.dy;

  // Compute label pill (colored, mid-opacity background + readable text)
  let labelNode: React.ReactNode = null;
  if (labelText) {
    const charW = fontSize * 0.55;
    const textW = labelText.length * charW;
    const padX = fontSize * 0.7;
    const padY = fontSize * 0.35;
    const pillW = textW + padX * 2;
    const pillH = fontSize + padY * 2;
    // Hull clusters centre the label on the pill anchor; rectangle and polygon
    // anchor the pill at its top-left corner so the label hangs off the side
    // instead of being centred over the shape.
    const centerOnLabelAnchor = shape === "hull";
    const pillX = centerOnLabelAnchor ? labelCx - pillW / 2 : labelCx;
    const pillY = labelCy - pillH / 2;
    labelNode = (
      <g
        style={{ pointerEvents: "auto", cursor: "move" }}
        onMouseDown={(e) => onLabelMouseDown(cluster.id, e)}
      >
        <rect
          x={pillX}
          y={pillY}
          width={pillW}
          height={pillH}
          rx={pillH / 2}
          ry={pillH / 2}
          fill={style.fillColor}
          fillOpacity={0.95}
          stroke={style.borderColor}
          strokeWidth={Math.max(0.5, style.borderWidth * 0.6)}
        />
        <text
          x={pillX + pillW / 2}
          y={pillY + pillH / 2}
          textAnchor="middle"
          dominantBaseline="central"
          fill="#ffffff"
          fontSize={fontSize}
          fontWeight={600}
          style={{ userSelect: "none" }}
        >
          {labelText}
        </text>
      </g>
    );
  }

  return (
    <g key={`cluster-${cluster.id}`} style={{ pointerEvents: "none" }}>
      {pathOrShape}
      {labelNode}
    </g>
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
