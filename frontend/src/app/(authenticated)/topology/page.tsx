"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Loader2,
  Network,
  RefreshCw,
  Search,
  Info,
  X,
  Maximize2,
  ChevronDown,
  Settings,
  Save,
  Server,
  Check,
  Link2,
  Play,
  Trash2,
  Plus,
  Palette,
  Square,
  AlignStartVertical,
  AlignEndVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  AlignCenterVertical,
  AlignCenterHorizontal,
  GripHorizontal,
  GripVertical,
  Move,
} from "lucide-react";
import LabelEditor, {
  type LabelElement,
  migrateLabelToElements,
} from "@/components/topology/LabelEditor";
import ContextMenu, { type ContextMenuItem } from "@/components/topology/ContextMenu";
import ManualLinkCreator from "@/components/topology/ManualLinkCreator";

interface TopologyMapItem {
  id: number;
  name: string;
  description: string | null;
  defaultProtocol: string | null;
  deviceCount: number;
  linkCount: number;
}

interface GraphNode {
  id: string;
  name: string;
  isExternal: boolean;
  nodeId: number | null;
  nodeName: string | null;
  nodeHostname: string | null;
  nodeIp: string | null;
  nodeManufacturer: string | null;
  nodeModel: string | null;
  chassisId: string | null;
  mgmtAddress: string | null;
  sysDescr: string | null;
  isReachable: boolean | null;
  score: string | null;
  styleOverride: Record<string, string | number> | null;
  position: { x: number; y: number } | null;
  isisAreas?: string[];
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  protocol: string;
  sourcePort: string | null;
  targetPort: string | null;
  status: string | null;
  weight: number | null;
  isManual: boolean;
  styleOverride: Record<string, string | number> | null;
}

interface TopologyZone {
  id: string;
  type: "rectangle" | "ellipse";
  label: string;
  width: number;
  height: number;
  style: {
    bgColor: string;
    bgOpacity: number;
    borderColor: string;
    borderWidth: number;
    borderStyle: "solid" | "dashed" | "dotted";
    borderRadius: number;
    labelColor: string;
    labelSize: number;
    labelWeight: number;
    labelPosition: "top" | "center" | "bottom";
    labelHalign?: "left" | "center" | "right";
    labelOffsetX?: number;
    labelOffsetY?: number;
  };
  layer: number;
  position?: { x: number; y: number } | null;
}

interface GraphData {
  map: TopologyMapItem;
  nodes: GraphNode[];
  edges: GraphEdge[];
  zones: TopologyZone[];
  availableProtocols: string[];
  designConfig: Record<string, unknown>;
  isisAreas?: string[];
}

const PROTOCOL_COLORS: Record<string, string> = {
  lldp: "#6366f1",
  stp: "#0ea5e9",
  ospf: "#10b981",
  bgp: "#f59e0b",
  isis: "#ec4899",
  manual: "#94a3b8",
};

export default function TopologyPage() {
  const { t } = useI18n();
  const { current } = useAppContext();
  const containerRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cyRef = useRef<any>(null);

  // Map selection
  const [maps, setMaps] = useState<TopologyMapItem[]>([]);
  const [selectedMapId, setSelectedMapId] = useState<number | null>(null);
  const [mapDropdownOpen, setMapDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Graph state
  const [data, setData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(true);
  const [protocolFilter, setProtocolFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [multiSelectedNodeIds, setMultiSelectedNodeIds] = useState<string[]>([]);
  const [layoutDirty, setLayoutDirty] = useState(false);
  const layoutSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Create modal
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createDescription, setCreateDescription] = useState("");
  const [createProtocol, setCreateProtocol] = useState("");
  const [creating, setCreating] = useState(false);

  // Edit modal
  const [editOpen, setEditOpen] = useState(false);
  const [editTab, setEditTab] = useState("settings");
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDefaultProtocol, setEditDefaultProtocol] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editSaved, setEditSaved] = useState(false);

  // Nodes tab
  interface ContextNode { id: number; name: string | null; hostname: string | null; ipAddress: string; manufacturer: { name: string } | null; model: { name: string } | null }
  const [allNodes, setAllNodes] = useState<ContextNode[]>([]);
  const [assignedNodeIds, setAssignedNodeIds] = useState<Set<number>>(new Set());
  const [nodesLoading, setNodesLoading] = useState(false);
  const [nodesSaving, setNodesSaving] = useState(false);
  const [nodesSearch, setNodesSearch] = useState("");

  // Links tab
  interface LinkRule {
    protocol: string; inventoryCategoryId: number | null;
    destNodeColumn: string; nodeMatchField: string;
    localPortColumn: string; remotePortColumn: string;
    sourceInterfaceColumn: string; metricColumn: string;
    areaCategoryId: number | null; areaColumn: string;
    includeExternalNeighbors: boolean;
    // Legacy backward compat
    remoteNameColumn: string; chassisIdColumn: string; mgmtAddressColumn: string; weightColumn: string;
  }
  interface InvCategory { id: number; name: string }
  const [linkRules, setLinkRules] = useState<LinkRule[]>([]);
  const [categories, setCategories] = useState<InvCategory[]>([]);
  const [columnsByCategory, setColumnsByCategory] = useState<Record<number, string[]>>({});
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{ linksCreated: number; linksUpdated: number } | null>(null);

  // Manual link creator
  const [manualLinkOpen, setManualLinkOpen] = useState(false);

  // Design config
  interface StyleRule { condition: string; conditionValue: string; inventoryCategoryId?: number; inventoryColumn?: string; style: Record<string, string | number> }
  interface DesignConfig {
    node: { shape: string; bgColor: string; borderColor: string; borderWidth: number; width: number; height: number };
    label: { elements: LabelElement[] };
    edge: { width: number; color: string; style: string; labelSize: number; labelColor: string };
    styleRules: StyleRule[];
  }
  const defaultDesign: DesignConfig = {
    node: { shape: "ellipse", bgColor: "#e2e8f0", borderColor: "#3b82f6", borderWidth: 2.5, width: 40, height: 40 },
    label: { elements: [{ field: "name", x: 0, y: 32, fontSize: 11, color: "#1e293b", fontWeight: 600, fontFamily: "sans-serif" }] },
    edge: { width: 2.5, color: "", style: "solid", labelSize: 9, labelColor: "#64748b" },
    styleRules: [],
  };
  const [design, setDesign] = useState<DesignConfig>(defaultDesign);
  const updateDesignNode = (p: Partial<DesignConfig["node"]>) => setDesign((d) => ({ ...d, node: { ...d.node, ...p } }));
  const updateLabelElements = (elements: LabelElement[]) => setDesign((d) => ({ ...d, label: { elements } }));
  const updateDesignEdge = (p: Partial<DesignConfig["edge"]>) => setDesign((d) => ({ ...d, edge: { ...d.edge, ...p } }));
  const addStyleRule = () => setDesign((d) => ({ ...d, styleRules: [...d.styleRules, { condition: "protocol", conditionValue: "lldp", style: { "line-color": "#6366f1" } }] }));
  const updateStyleRule = (idx: number, patch: Partial<StyleRule>) => setDesign((d) => ({ ...d, styleRules: d.styleRules.map((r, i) => i === idx ? { ...r, ...patch } : r) }));
  const removeStyleRule = (idx: number) => setDesign((d) => ({ ...d, styleRules: d.styleRules.filter((_, i) => i !== idx) }));

  // Zones
  const [zones, setZones] = useState<TopologyZone[]>([]);
  const addZone = () => {
    setZones((prev) => [...prev, {
      id: `zone_${Date.now()}`,
      type: "rectangle",
      label: t("topology.newZoneLabel"),
      width: 300,
      height: 200,
      style: {
        bgColor: "#dbeafe", bgOpacity: 0.3,
        borderColor: "#3b82f6", borderWidth: 2, borderStyle: "dashed", borderRadius: 12,
        labelColor: "#1e40af", labelSize: 14, labelWeight: 600, labelPosition: "top",
      },
      layer: 0,
    }]);
  };
  const updateZone = (idx: number, patch: Partial<TopologyZone>) => setZones((prev) => prev.map((z, i) => i === idx ? { ...z, ...patch } : z));
  const updateZoneStyle = (idx: number, patch: Partial<TopologyZone["style"]>) => setZones((prev) => prev.map((z, i) => i === idx ? { ...z, style: { ...z.style, ...patch } } : z));
  const removeZone = (idx: number) => setZones((prev) => prev.filter((_, i) => i !== idx));

  // Selected zone for resize handles
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!mapDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setMapDropdownOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [mapDropdownOpen]);

  // Load map list
  const loadMaps = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/topology-maps?context=${current.id}`);
    if (res.ok) {
      const list: TopologyMapItem[] = await res.json();
      setMaps(list);
      if (list.length > 0 && !selectedMapId) {
        setSelectedMapId(list[0].id);
      }
    }
    setLoading(false);
  }, [current, selectedMapId]);

  useEffect(() => { loadMaps(); }, [loadMaps]);

  // Load graph when map changes
  const loadGraph = useCallback(async (mapId: number, proto: string) => {
    setLoading(true);
    const url = proto
      ? `/api/topology-maps/${mapId}/graph?protocol=${proto}`
      : `/api/topology-maps/${mapId}/graph`;
    const res = await fetch(url);
    if (res.ok) {
      const d: GraphData = await res.json();
      setData(d);
      setZones(d.zones ?? []);
      // Sync design state from API so that zone operations don't overwrite with defaults
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dc = (d.designConfig ?? {}) as any;
      const nodeConf = { ...defaultDesign.node, ...dc.node };
      setDesign({
        node: nodeConf,
        label: { elements: migrateLabelToElements(dc.label, nodeConf.height) },
        edge: { ...defaultDesign.edge, ...dc.edge },
        styleRules: dc.styleRules ?? [],
      });
      if (!proto && d.map.defaultProtocol) {
        setProtocolFilter(d.map.defaultProtocol);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (selectedMapId) {
      setData(null);
      setSelectedNode(null);
      setProtocolFilter("");
      loadGraph(selectedMapId, "");
    }
  }, [selectedMapId, loadGraph]);

  // Re-fetch on protocol filter change
  const initialProto = useRef(true);
  useEffect(() => {
    if (initialProto.current) { initialProto.current = false; return; }
    if (selectedMapId) loadGraph(selectedMapId, protocolFilter);
  }, [protocolFilter, selectedMapId, loadGraph]);

  // Init cytoscape
  useEffect(() => {
    if (!data || !containerRef.current) return;

    let destroyed = false;

    (async () => {
      const cytoscape = (await import("cytoscape")).default;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fcose = (await import("cytoscape-fcose")).default as any;
      try { cytoscape.use(fcose); } catch { /* already registered */ }

      if (destroyed || !containerRef.current) return;

      // Resolve label elements from designConfig
      const dcRaw = data.designConfig ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const labelElements: LabelElement[] = migrateLabelToElements((dcRaw as any).label, ((dcRaw as any).node?.height ?? 40));

      // Build zone elements (sorted by layer, added first = behind)
      const zoneElements = [...(data.zones ?? [])]
        .sort((a, b) => a.layer - b.layer)
        .map((z) => ({
          data: {
            id: z.id,
            label: z.label,
            isZone: true,
            zoneLayer: z.layer,
          },
          position: z.position ?? { x: 0, y: 0 },
          style: {
            shape: z.type === "ellipse" ? "ellipse" : "round-rectangle",
            width: z.width,
            height: z.height,
            "background-color": z.style.bgColor,
            "background-opacity": z.style.bgOpacity,
            "border-color": z.style.borderColor,
            "border-width": z.style.borderWidth,
            "border-style": z.style.borderStyle,
            "corner-radius": z.style.borderRadius,
            label: z.label,
            color: z.style.labelColor,
            "font-size": z.style.labelSize,
            "font-weight": z.style.labelWeight,
            "text-valign": z.style.labelPosition,
            "text-halign": z.style.labelHalign ?? "center",
            "text-margin-x": z.style.labelOffsetX ?? 0,
            "text-margin-y": (z.style.labelOffsetY ?? 0) + (z.style.labelPosition === "top" ? 10 : z.style.labelPosition === "bottom" ? -10 : 0),
            "z-index": z.layer,
          },
        }));

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const elements: any[] = [
        ...zoneElements,
        ...data.nodes.map((n) => {
          return { data: {
            id: n.id,
            label: "",
            isExternal: n.isExternal,
            nodeId: n.nodeId,
            nodeName: n.nodeName ?? "",
            nodeHostname: n.nodeHostname ?? "",
            nodeIp: n.nodeIp ?? n.mgmtAddress ?? "",
            nodeManufacturer: n.nodeManufacturer ?? "",
            nodeModel: n.nodeModel ?? "",
            chassisId: n.chassisId ?? "",
            mgmtAddress: n.mgmtAddress ?? "",
            sysDescr: n.sysDescr ?? "",
            isReachable: n.isReachable,
            score: n.score ?? "",
            protocol: "",
          },
          ...(n.position ? { position: n.position } : {}),
        }; }),
        ...data.edges.map((e) => {
          const portsLabel = [e.sourcePort, e.targetPort].filter(Boolean).join(" — ");
          const weightLabel = e.weight != null ? ` · ${e.weight}` : "";
          // Collect inv_* fields from the edge for inventory-based style rules
          const invData: Record<string, string> = {};
          for (const [k, v] of Object.entries(e as unknown as Record<string, unknown>)) {
            if (k.startsWith("inv_") && v != null) invData[k] = String(v);
          }
          return {
            data: {
              id: `e${e.id}`,
              source: e.source,
              target: e.target,
              protocol: e.protocol,
              status: e.status ?? "unknown",
              isManual: e.isManual,
              label: portsLabel + weightLabel,
              color: PROTOCOL_COLORS[e.protocol] ?? "#94a3b8",
              ...invData,
            },
          };
        }),
      ];

      if (cyRef.current) cyRef.current.destroy();

      // Merge design config from API with defaults
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dn = (dcRaw as any).node ?? {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const de = (dcRaw as any).edge ?? {};

      const nodeShape = dn.shape ?? "ellipse";
      const nodeBg = dn.bgColor ?? "#e2e8f0";
      const nodeBorder = dn.borderColor ?? "#3b82f6";
      const nodeBorderW = dn.borderWidth ?? 2.5;
      const nodeW = dn.width ?? 40;
      const nodeH = dn.height ?? 40;
      const edgeW = de.width ?? 2.5;
      const edgeColor = de.color ?? "";
      const edgeStyle = de.style ?? "solid";
      const edgeLblSize = de.labelSize ?? 9;
      const edgeLblColor = de.labelColor ?? "#64748b";

      const cy = cytoscape({
        container: containerRef.current,
        elements,
        wheelSensitivity: 0.2,
        boxSelectionEnabled: true,
        selectionType: "additive",
        style: [
          {
            selector: "node",
            style: {
              "background-color": nodeBg,
              "border-width": nodeBorderW,
              "border-color": nodeBorder,
              "label": "",
              "width": nodeW,
              "height": nodeH,
              "shape": nodeShape,
              "z-index": 10,
            },
          },
          // Zone nodes: visual areas behind devices
          {
            selector: "node[?isZone]",
            style: {
              "label": "data(label)",
              "text-wrap": "wrap",
              "text-max-width": "400px",
              "text-background-color": "#ffffff",
              "text-background-opacity": 0.6,
              "text-background-padding": "4px",
              "text-background-shape": "roundrectangle",
              "z-index": 0,
              "overlay-padding": 6,
            },
          },
          { selector: "node[?isZone]:selected", style: { "border-width": 3, "border-color": "#f59e0b" } },
          { selector: "node[?isExternal]", style: { "border-color": "#94a3b8", "border-style": "dashed" } },
          { selector: "node:selected:not([isZone])", style: { "border-width": nodeBorderW + 2, "border-color": "#f59e0b" } },
          {
            selector: "edge",
            style: {
              "width": edgeW,
              "line-color": edgeColor || "data(color)",
              "line-style": edgeStyle as "solid" | "dashed" | "dotted",
              "curve-style": "bezier",
              "label": "data(label)",
              "font-size": edgeLblSize,
              "color": edgeLblColor,
              "text-rotation": "autorotate",
              "text-margin-y": -8,
              "text-background-color": "#ffffff",
              "text-background-opacity": 0.85,
              "text-background-padding": "2px",
              "text-background-shape": "roundrectangle",
            },
          },
          ...(edgeColor ? [] : [{ selector: "edge", style: { "line-color": "data(color)" as string } }]),
          { selector: "edge[status = 'down']", style: { "line-style": "dashed" as const, "opacity": 0.4 } },
          { selector: "edge[status = 'unknown']", style: { "line-style": "dotted" as const, "opacity": 0.6 } },
          { selector: "edge:selected", style: { "width": edgeW + 2 } },
          { selector: ".dimmed", style: { "opacity": 0.15 } },
          // Dynamic style rules from designConfig
          // Per-node style overrides from API
          ...data.nodes.filter((n) => n.styleOverride).map((n) => ({
            selector: `node[id = "${n.id}"]`,
            style: Object.fromEntries(
              Object.entries(n.styleOverride!).map(([k, v]) => {
                const keyMap: Record<string, string> = { bgColor: "background-color", borderColor: "border-color", borderWidth: "border-width", shape: "shape", width: "width", height: "height" };
                return [keyMap[k] ?? k, v];
              })
            ),
          })),
          // Per-link style overrides from API
          ...data.edges.filter((e) => e.styleOverride).map((e) => ({
            selector: `edge[id = "e${e.id}"]`,
            style: Object.fromEntries(
              Object.entries(e.styleOverride!).map(([k, v]) => {
                const keyMap: Record<string, string> = { color: "line-color", width: "width", style: "line-style" };
                return [keyMap[k] ?? k, v];
              })
            ),
          })),
          // Conditional style rules from designConfig
          ...((dcRaw as { styleRules?: StyleRule[] })?.styleRules ?? []).map((rule: StyleRule) => {
            const sel = rule.condition === "protocol"
              ? `edge[protocol = "${rule.conditionValue}"]`
              : rule.condition === "isExternal"
                ? (rule.conditionValue === "true" ? "node[?isExternal]" : "node[^isExternal]")
                : rule.condition === "nodeModel"
                  ? `node[nodeModel = "${rule.conditionValue}"]`
                  : rule.condition === "nodeManufacturer"
                    ? `node[nodeManufacturer = "${rule.conditionValue}"]`
                    : rule.condition === "linkInventory" && rule.inventoryColumn
                      ? `edge[inv_${rule.inventoryColumn} = "${rule.conditionValue}"]`
                      : "node"; // fallback
            return { selector: sel, style: rule.style };
          }),
        ],
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        layout: ({
          // Saved positions → preset (exact placement); otherwise fcose or grid
          ...(data.nodes.some((n) => n.position)
            ? { name: "preset" }
            : data.edges.length > 0
              ? { name: "fcose", randomize: true, animate: false, nodeSeparation: 120, idealEdgeLength: 120, nodeRepulsion: 8000, edgeElasticity: 0.45, exclude: (node: { data: (k: string) => unknown }) => node.data("isZone") }
              : { name: "grid" }
          ),
        }) as any,
      });

      // Fit all elements into view after layout, with generous padding
      cy.fit(undefined, 100);
      // Zoom out a bit more for comfort
      cy.zoom(cy.zoom() * 0.8);
      cy.center();

      cy.on("tap", "node", (evt) => {
        const n = evt.target.data();
        if (n.isZone) return;
        setSelectedNode({
          id: n.id, name: n.nodeName || n.nodeHostname || n.nodeIp || n.id, isExternal: n.isExternal,
          nodeId: n.nodeId, nodeName: n.nodeName ?? null, nodeHostname: n.nodeHostname ?? null,
          nodeIp: n.nodeIp, nodeManufacturer: n.nodeManufacturer, nodeModel: n.nodeModel,
          chassisId: n.chassisId, mgmtAddress: n.mgmtAddress,
          sysDescr: n.sysDescr, isReachable: n.isReachable === "true" || n.isReachable === true ? true : n.isReachable === "false" || n.isReachable === false ? false : null,
          score: n.score || null, styleOverride: null, position: null,
        });
        setNodeStyleEdit(false);
      });
      cy.on("tap", (evt) => { if (evt.target === cy) { setSelectedNode(null); setCtxMenu(null); setSelectedZoneId(null); setMultiSelectedNodeIds([]); } });

      // Context menu (right-click)
      cy.on("cxttap", "node", (evt) => {
        const d = evt.target.data();
        const rp = evt.renderedPosition || evt.position;
        const rect = containerRef.current!.getBoundingClientRect();
        if (d.isZone) {
          setCtxMenu({ x: rect.left + rp.x, y: rect.top + rp.y, type: "zone", targetId: evt.target.id(), targetData: d });
        } else {
          setCtxMenu({ x: rect.left + rp.x, y: rect.top + rp.y, type: "node", targetId: evt.target.id(), targetData: d });
        }
      });
      cy.on("cxttap", "edge", (evt) => {
        const d = evt.target.data();
        const rp = evt.renderedPosition || evt.position;
        const rect = containerRef.current!.getBoundingClientRect();
        setCtxMenu({ x: rect.left + rp.x, y: rect.top + rp.y, type: "edge", targetId: evt.target.id(), targetData: d });
      });

      // Track zone selection for resize handles
      cy.on("select", "node[?isZone]", (evt) => { setSelectedZoneId(evt.target.id()); });
      cy.on("unselect", "node[?isZone]", () => { setSelectedZoneId(null); });

      // Track multi-selection for alignment tools
      const syncMultiSelection = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const selected = cy.nodes(":selected").filter((n: any) => !n.data("isZone"));
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const ids = selected.map((n: any) => n.id());
        setMultiSelectedNodeIds(ids.length >= 2 ? ids : []);
      };
      cy.on("select", "node", syncMultiSelection);
      cy.on("unselect", "node", syncMultiSelection);

      // Prevent native context menu on cytoscape container
      const preventCtx = (e: Event) => e.preventDefault();
      containerRef.current.addEventListener("contextmenu", preventCtx);

      // Grouped zone + children drag: move contained nodes with the zone
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let zoneDragChildren: { node: any; offsetX: number; offsetY: number }[] = [];
      let zoneDragStartPos: { x: number; y: number } | null = null;

      cy.on("grab", "node[?isZone]", (evt) => {
        const zone = evt.target;
        const zp = zone.position();
        const zw = zone.width();
        const zh = zone.height();
        const left = zp.x - zw / 2;
        const right = zp.x + zw / 2;
        const top = zp.y - zh / 2;
        const bottom = zp.y + zh / 2;
        zoneDragStartPos = { x: zp.x, y: zp.y };
        zoneDragChildren = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cy.nodes().filter((n: any) => !n.data("isZone")).forEach((n: any) => {
          const np = n.position();
          if (np.x >= left && np.x <= right && np.y >= top && np.y <= bottom) {
            zoneDragChildren.push({ node: n, offsetX: np.x - zp.x, offsetY: np.y - zp.y });
          }
        });
      });

      cy.on("drag", "node[?isZone]", (evt) => {
        if (!zoneDragStartPos || zoneDragChildren.length === 0) return;
        const zp = evt.target.position();
        zoneDragChildren.forEach(({ node, offsetX, offsetY }) => {
          node.position({ x: zp.x + offsetX, y: zp.y + offsetY });
        });
      });

      cy.on("free", "node[?isZone]", () => {
        zoneDragChildren = [];
        zoneDragStartPos = null;
      });

      // Save positions on drag
      cy.on("dragfree", "node", () => {
        setLayoutDirty(true);
        if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
        layoutSaveTimer.current = setTimeout(() => {
          const layout: Record<string, { x: number; y: number }> = {};
          cy.nodes().forEach((n: { id: () => string; position: () => { x: number; y: number } }) => {
            const pos = n.position();
            layout[n.id()] = { x: Math.round(pos.x), y: Math.round(pos.y) };
          });
          fetch(`/api/topology-maps/${selectedMapId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ layout }),
          }).then(() => setLayoutDirty(false)).catch(() => { /* ignore */ });
        }, 800);
      });

      // --- ISIS area data ---
      const ISIS_AREA_COLORS = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#6366f1", "#a855f7", "#ec4899", "#14b8a6", "#f43f5e"];
      const isisAreaList = data.isisAreas ?? [];
      const nodeAreasMap: Record<string, string[]> = {};
      if (protocolFilter === "isis") {
        data.nodes.forEach((n) => { if (n.isisAreas?.length) nodeAreasMap[n.id] = n.isisAreas; });
      }

      // --- ISIS area polygon overlay ---
      // isolation:isolate creates a new stacking context so mix-blend-mode
      // only blends area shapes with each other, not with the Cytoscape nodes below.
      const areaSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      areaSvg.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;z-index:1;isolation:isolate;";
      containerRef.current.style.position = "relative";
      containerRef.current.appendChild(areaSvg);

      // Convex hull (Andrew's monotone chain)
      const convexHull = (pts: { x: number; y: number }[]): { x: number; y: number }[] => {
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
      };

      // Expand hull outward from centroid
      const expandHull = (hull: { x: number; y: number }[], padding: number): { x: number; y: number }[] => {
        if (hull.length === 0) return hull;
        const cx = hull.reduce((s, p) => s + p.x, 0) / hull.length;
        const cy = hull.reduce((s, p) => s + p.y, 0) / hull.length;
        return hull.map((p) => {
          const dx = p.x - cx;
          const dy = p.y - cy;
          const d = Math.sqrt(dx * dx + dy * dy) || 1;
          return { x: p.x + (dx / d) * padding, y: p.y + (dy / d) * padding };
        });
      };

      // Rounded hull path: arcs at vertices with a given corner radius
      const roundedHullPath = (pts: { x: number; y: number }[], radius: number): string => {
        if (pts.length < 2) return "";
        const n = pts.length;
        // Helper: unit vector from a to b
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
          // Clamp radius so arcs don't overlap neighboring segments
          const r = Math.min(radius, u1.len / 2, u2.len / 2);
          const p1 = { x: cur.x + u1.x * r, y: cur.y + u1.y * r };
          const p2 = { x: cur.x + u2.x * r, y: cur.y + u2.y * r };
          if (i === 0) {
            d += `M ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
          } else {
            d += ` L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
          }
          // Quadratic bezier through the vertex for a smooth rounded corner
          d += ` Q ${cur.x.toFixed(1)} ${cur.y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
        }
        return `<path d="${d} Z" />`;
      };

      // Darken a hex color by given ratio (0-1)
      const darken = (hex: string, ratio: number): string => {
        const n = parseInt(hex.replace("#", ""), 16);
        const r = Math.max(0, Math.round(((n >> 16) & 0xff) * (1 - ratio)));
        const g = Math.max(0, Math.round(((n >> 8) & 0xff) * (1 - ratio)));
        const b = Math.max(0, Math.round((n & 0xff) * (1 - ratio)));
        return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
      };

      const renderAreaPolygons = () => {
        if (protocolFilter !== "isis" || isisAreaList.length === 0) {
          areaSvg.innerHTML = "";
          return;
        }
        const zoom = cy.zoom();
        const pan = cy.pan();
        // Adaptive padding: scales with zoom for visual consistency
        const PADDING = Math.max(40 * Math.sqrt(zoom), 30);
        const CORNER = Math.max(30 * Math.sqrt(zoom), 20);

        // Group screen positions by area, and keep a full map of node screen positions
        const areaNodes: Record<string, { x: number; y: number; nid: string }[]> = {};
        const nodePos: Record<string, { x: number; y: number }> = {};
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cy.nodes().filter((n: any) => !n.data("isZone")).forEach((node: any) => {
          const nid = node.data("id") as string;
          const areas = nodeAreasMap[nid];
          const pos = node.position();
          const sx = pos.x * zoom + pan.x;
          const sy = pos.y * zoom + pan.y;
          nodePos[nid] = { x: sx, y: sy };
          if (!areas) return;
          for (const area of areas) {
            if (!areaNodes[area]) areaNodes[area] = [];
            areaNodes[area].push({ x: sx, y: sy, nid });
          }
        });

        let defs = "";
        const areaShapes: string[] = [];
        const areaLabels: string[] = [];

        // Build a mask that cuts out each node's actual shape, so area fills don't tint nodes
        let maskShapes = '<rect x="-100000" y="-100000" width="200000" height="200000" fill="white"/>';
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        cy.nodes().filter((n: any) => !n.data("isZone")).forEach((node: any) => {
          const pos = node.position();
          const sx = pos.x * zoom + pan.x;
          const sy = pos.y * zoom + pan.y;
          const w = node.outerWidth() * zoom;
          const h = node.outerHeight() * zoom;
          const shape = String(node.style("shape") ?? "ellipse");
          if (shape === "ellipse") {
            maskShapes += `<ellipse cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" rx="${(w / 2).toFixed(1)}" ry="${(h / 2).toFixed(1)}" fill="black"/>`;
          } else {
            const rx = shape === "round-rectangle" ? Math.min(w, h) * 0.15 : 0;
            maskShapes += `<rect x="${(sx - w / 2).toFixed(1)}" y="${(sy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${rx.toFixed(1)}" fill="black"/>`;
          }
        });
        defs += `<mask id="isisNodeMask" maskUnits="userSpaceOnUse">${maskShapes}</mask>`;

        isisAreaList.forEach((area) => {
          const pts = areaNodes[area];
          if (!pts || pts.length === 0) return;
          const color = ISIS_AREA_COLORS[isisAreaList.indexOf(area) % ISIS_AREA_COLORS.length];
          const darkColor = darken(color, 0.15);
          const gradId = `isisGrad_${isisAreaList.indexOf(area)}`;
          const fs = Math.max(12 * Math.sqrt(zoom), 10);

          defs += `<radialGradient id="${gradId}" cx="50%" cy="50%" r="60%"><stop offset="0%" stop-color="${color}" stop-opacity="0.22"/><stop offset="100%" stop-color="${color}" stop-opacity="0.08"/></radialGradient>`;

          let shapeSvg = "";
          let labelX = 0, labelY = 0;

          if (pts.length === 1) {
            // Single-node area: if this node belongs to other areas with more nodes,
            // offset the small circle outward from those other areas' centroids.
            const nid = pts[0].nid;
            const otherAreas = (nodeAreasMap[nid] || []).filter((a) => a !== area);
            let offsetX = 0, offsetY = 0;
            if (otherAreas.length > 0) {
              // Combined centroid of all nodes in the node's other areas
              const otherNodeIds = new Set<string>();
              for (const oa of otherAreas) {
                const oaPts = areaNodes[oa];
                if (!oaPts) continue;
                for (const p of oaPts) otherNodeIds.add(p.nid);
              }
              otherNodeIds.delete(nid);
              if (otherNodeIds.size > 0) {
                let cx = 0, cy2 = 0;
                otherNodeIds.forEach((id) => { cx += nodePos[id].x; cy2 += nodePos[id].y; });
                cx /= otherNodeIds.size;
                cy2 /= otherNodeIds.size;
                const dx = pts[0].x - cx;
                const dy = pts[0].y - cy2;
                const d = Math.sqrt(dx * dx + dy * dy) || 1;
                // Push the circle outward by (radius + gap)
                const push = PADDING * 1.3;
                offsetX = (dx / d) * push;
                offsetY = (dy / d) * push;
              }
            }
            const r = PADDING;
            const cx = pts[0].x + offsetX;
            const cy2 = pts[0].y + offsetY;
            shapeSvg = `<circle cx="${cx.toFixed(1)}" cy="${cy2.toFixed(1)}" r="${r}" fill="url(#${gradId})" stroke="${darkColor}" stroke-opacity="0.7" stroke-width="1.5" stroke-dasharray="5 4" />`;
            // If offset, also draw a thin link from node to the offset circle
            if (offsetX !== 0 || offsetY !== 0) {
              shapeSvg = `<line x1="${pts[0].x.toFixed(1)}" y1="${pts[0].y.toFixed(1)}" x2="${cx.toFixed(1)}" y2="${cy2.toFixed(1)}" stroke="${darkColor}" stroke-opacity="0.5" stroke-width="1" stroke-dasharray="3 3" />` + shapeSvg;
            }
            labelX = cx;
            labelY = cy2;
          } else if (pts.length === 2) {
            const mx = (pts[0].x + pts[1].x) / 2;
            const my = (pts[0].y + pts[1].y) / 2;
            const dx = pts[1].x - pts[0].x;
            const dy = pts[1].y - pts[0].y;
            const dist = Math.sqrt(dx * dx + dy * dy) / 2;
            const rx = dist + PADDING;
            const ry = PADDING;
            const angle = Math.atan2(dy, dx) * 180 / Math.PI;
            shapeSvg = `<ellipse cx="${mx}" cy="${my}" rx="${rx}" ry="${ry}" transform="rotate(${angle} ${mx} ${my})" fill="url(#${gradId})" stroke="${darkColor}" stroke-opacity="0.7" stroke-width="1.5" stroke-dasharray="5 4" />`;
            labelX = mx;
            labelY = my;
          } else {
            const hull = convexHull(pts);
            const expanded = expandHull(hull, PADDING);
            shapeSvg = roundedHullPath(expanded, CORNER).replace("<path ", `<path fill="url(#${gradId})" stroke="${darkColor}" stroke-opacity="0.7" stroke-width="1.5" stroke-dasharray="5 4" `);
            // Label at centroid of expanded hull
            let sx2 = 0, sy2 = 0;
            for (const p of expanded) { sx2 += p.x; sy2 += p.y; }
            labelX = sx2 / expanded.length;
            labelY = sy2 / expanded.length;
          }

          areaShapes.push(shapeSvg);

          // Pill-style label, centered on (labelX, labelY)
          const labelText = area;
          const padX = 8 * Math.sqrt(zoom);
          const padY = 3 * Math.sqrt(zoom);
          const approxW = labelText.length * fs * 0.55 + padX * 2;
          const h = fs + padY * 2;
          const rectX = labelX - approxW / 2;
          const rectY = labelY - h / 2;
          const textY = labelY + fs * 0.35;
          areaLabels.push(
            `<g>` +
              `<rect x="${rectX.toFixed(1)}" y="${rectY.toFixed(1)}" width="${approxW.toFixed(1)}" height="${h.toFixed(1)}" rx="${(h / 2).toFixed(1)}" fill="${color}" stroke="${darkColor}" stroke-width="1" />` +
              `<text x="${labelX.toFixed(1)}" y="${textY.toFixed(1)}" text-anchor="middle" fill="white" font-size="${fs.toFixed(1)}" font-weight="700" font-family="system-ui,sans-serif" style="letter-spacing:0.3px">${labelText}</text>` +
            `</g>`
          );
        });

        // defs + blended shapes (masked to cut out nodes) + labels on top
        areaSvg.innerHTML =
          `<defs>${defs}</defs>` +
          `<g mask="url(#isisNodeMask)" style="mix-blend-mode:multiply">${areaShapes.join("")}</g>` +
          `<g>${areaLabels.join("")}</g>`;
      };

      // --- Label overlay ---
      const overlayDiv = document.createElement("div");
      overlayDiv.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:1;";
      containerRef.current.appendChild(overlayDiv);

      const dataFieldMap: Record<string, (d: Record<string, string>) => string> = {
        name: (d) => d.nodeName || d.nodeHostname || d.label || "",
        hostname: (d) => d.nodeHostname || "",
        ipAddress: (d) => d.nodeIp || d.mgmtAddress || "",
        manufacturer: (d) => d.nodeManufacturer || "",
        model: (d) => d.nodeModel || "",
        chassisId: (d) => d.chassisId || "",
        sysDescr: (d) => d.sysDescr || "",
      };

      const GRADE_COLORS: Record<string, string> = { A: "#22c55e", B: "#84cc16", C: "#f59e0b", D: "#f97316", E: "#ef4444", F: "#dc2626" };

      let overlayRaf: number | null = null;
      const renderOverlay = () => {
        overlayRaf = null;
        const zoom = cy.zoom();
        const pan = cy.pan();
        let html = "";

        cy.nodes().filter((n: { data: (k: string) => unknown }) => !n.data("isZone")).forEach((node: { position: () => { x: number; y: number }; data: (k?: string) => Record<string, string> }) => {
          const pos = node.position();
          const sx = pos.x * zoom + pan.x;
          const sy = pos.y * zoom + pan.y;

          const nd = node.data() as Record<string, string>;

          labelElements.forEach((el) => {
            const lx = sx + el.x * zoom;
            const ly = sy + el.y * zoom;

            if (el.field === "badge:monitoring") {
              // Monitoring badge
              const reachable = nd.isReachable;
              if (reachable === undefined || reachable === null || reachable === "") return;
              const color = reachable === "true" || reachable === (true as unknown as string) ? "#22c55e" : "#ef4444";
              const bs = Math.max(el.fontSize * zoom, 4);
              html += `<div style="position:absolute;left:${lx.toFixed(1)}px;top:${ly.toFixed(1)}px;transform:translate(-50%,-50%);width:${bs.toFixed(1)}px;height:${bs.toFixed(1)}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);pointer-events:none;"></div>`;
            } else if (el.field === "badge:compliance") {
              // Compliance badge
              const grade = nd.score;
              if (!grade) return;
              const color = GRADE_COLORS[grade] ?? "#94a3b8";
              const bs = Math.max(el.fontSize * zoom, 4);
              const fs = Math.max(bs * 0.65, 6);
              html += `<div style="position:absolute;left:${lx.toFixed(1)}px;top:${ly.toFixed(1)}px;transform:translate(-50%,-50%);width:${bs.toFixed(1)}px;height:${bs.toFixed(1)}px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;pointer-events:none;"><span style="color:white;font-size:${fs.toFixed(1)}px;font-weight:700;line-height:1;">${grade}</span></div>`;
            } else {
              // Text label
              const value = dataFieldMap[el.field]?.(nd) ?? "";
              if (!value) return;
              const fs = Math.max(el.fontSize * zoom, 1);
              const align = el.textAlign ?? "center";
              const tx = align === "left" ? "translate(0,-50%)" : align === "right" ? "translate(-100%,-50%)" : "translate(-50%,-50%)";
              const fst = el.fontStyle === "italic" ? "font-style:italic;" : "";
              html += `<div style="position:absolute;left:${lx.toFixed(1)}px;top:${ly.toFixed(1)}px;transform:${tx};font-size:${fs.toFixed(1)}px;color:${el.color};font-weight:${el.fontWeight};font-family:${el.fontFamily};${fst}white-space:nowrap;text-shadow:0 0 3px rgba(255,255,255,0.9),0 0 3px rgba(255,255,255,0.9);pointer-events:none;line-height:1;">${value}</div>`;
            }
          });

        });

        overlayDiv.innerHTML = html;
        renderAreaPolygons();
      };

      const scheduleOverlay = () => {
        if (overlayRaf) return;
        overlayRaf = requestAnimationFrame(renderOverlay);
      };

      cy.on("viewport", scheduleOverlay);
      cy.on("position", "node", scheduleOverlay);
      // Initial render
      renderOverlay();

      cyRef.current = cy;
    })();

    return () => {
      destroyed = true;
      if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
      if (cyRef.current) { cyRef.current.destroy(); cyRef.current = null; }
      // Clean up overlays
      containerRef.current?.querySelectorAll("[style*='pointer-events:none']").forEach((el) => el.remove());
    };
  }, [data, selectedMapId]);

  // Zone resize handles overlay
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy || !containerRef.current) return;

    const container = containerRef.current;
    let resizeOverlay = container.querySelector(".zone-resize-overlay") as HTMLDivElement | null;
    if (!resizeOverlay) {
      resizeOverlay = document.createElement("div");
      resizeOverlay.className = "zone-resize-overlay";
      resizeOverlay.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:2;";
      container.appendChild(resizeOverlay);
    }

    if (!selectedZoneId) {
      resizeOverlay.innerHTML = "";
      return;
    }

    const zoneNode = cy.$(`#${selectedZoneId}`);
    if (zoneNode.length === 0) {
      resizeOverlay.innerHTML = "";
      return;
    }

    const HANDLE_SIZE = 8;
    const handles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    const cursors: Record<string, string> = { nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize", e: "ew-resize", se: "nwse-resize", s: "ns-resize", sw: "nesw-resize", w: "ew-resize" };

    const zoneData = zones.find((z) => z.id === selectedZoneId);

    const renderHandles = () => {
      const zoom = cy.zoom();
      const pan = cy.pan();
      const pos = zoneNode.position();
      const w = zoneNode.width() * zoom;
      const h = zoneNode.height() * zoom;
      const cx = pos.x * zoom + pan.x;
      const cy2 = pos.y * zoom + pan.y;

      const positions: Record<string, { x: number; y: number }> = {
        nw: { x: cx - w / 2, y: cy2 - h / 2 },
        n: { x: cx, y: cy2 - h / 2 },
        ne: { x: cx + w / 2, y: cy2 - h / 2 },
        e: { x: cx + w / 2, y: cy2 },
        se: { x: cx + w / 2, y: cy2 + h / 2 },
        s: { x: cx, y: cy2 + h / 2 },
        sw: { x: cx - w / 2, y: cy2 + h / 2 },
        w: { x: cx - w / 2, y: cy2 },
      };

      let html = "";
      handles.forEach((h) => {
        const p = positions[h];
        html += `<div data-handle="${h}" style="position:absolute;left:${p.x - HANDLE_SIZE / 2}px;top:${p.y - HANDLE_SIZE / 2}px;width:${HANDLE_SIZE}px;height:${HANDLE_SIZE}px;background:#f59e0b;border:1px solid #d97706;border-radius:2px;cursor:${cursors[h]};pointer-events:auto;z-index:10;"></div>`;
      });

      // Label drag handle — read live position from Cytoscape style
      if (zoneData) {
        const valign = zoneData.style.labelPosition;
        const halign = zoneNode.style("text-halign") || "center";
        const baseY = valign === "top" ? cy2 - h / 2 : valign === "bottom" ? cy2 + h / 2 : cy2;
        const baseX = halign === "left" ? cx - w / 2 : halign === "right" ? cx + w / 2 : cx;
        const liveMx = (parseFloat(zoneNode.style("text-margin-x")) || 0) * zoom;
        const liveMy = (parseFloat(zoneNode.style("text-margin-y")) || 0) * zoom;
        const lx = baseX + liveMx;
        const ly = baseY + liveMy;
        html += `<div data-handle="label" style="position:absolute;left:${lx - 7}px;top:${ly - 7}px;width:14px;height:14px;background:#6366f1;border:2px solid #4f46e5;border-radius:50%;cursor:move;pointer-events:auto;z-index:11;display:flex;align-items:center;justify-content:center;" title="Drag to move label"><span style="color:white;font-size:8px;font-weight:bold;line-height:1;">T</span></div>`;
      }

      resizeOverlay!.innerHTML = html;
    };

    renderHandles();

    // Re-render on viewport changes
    const onViewport = () => renderHandles();
    cy.on("viewport", onViewport);
    cy.on("position", `#${selectedZoneId}`, onViewport);

    // Handle drag for resize and label
    let dragging: string | null = null;
    let startX = 0, startY = 0, startW = 0, startH = 0;
    let startLabelOffsetX = 0, startLabelOffsetY = 0;
    let currentLabelOffsetX = 0, currentLabelOffsetY = 0;

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const handle = target.dataset?.handle ?? (target.parentElement as HTMLElement)?.dataset?.handle;
      if (!handle) return;
      e.preventDefault();
      e.stopPropagation();
      dragging = handle;
      startX = e.clientX;
      startY = e.clientY;
      if (handle === "label" && zoneData) {
        startLabelOffsetX = zoneData.style.labelOffsetX ?? 0;
        startLabelOffsetY = zoneData.style.labelOffsetY ?? 0;
        currentLabelOffsetX = startLabelOffsetX;
        currentLabelOffsetY = startLabelOffsetY;
      } else {
        startW = zoneNode.width();
        startH = zoneNode.height();
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const zoom = cy.zoom();
      const dx = (e.clientX - startX) / zoom;
      const dy = (e.clientY - startY) / zoom;

      if (dragging === "label") {
        currentLabelOffsetX = Math.round(startLabelOffsetX + dx);
        currentLabelOffsetY = Math.round(startLabelOffsetY + dy);
        const valign = zoneData?.style.labelPosition ?? "top";
        const defaultMy = valign === "top" ? 10 : valign === "bottom" ? -10 : 0;
        zoneNode.style({ "text-margin-x": currentLabelOffsetX, "text-margin-y": currentLabelOffsetY + defaultMy });
        renderHandles();
      } else {
        let newW = startW, newH = startH;
        if (dragging.includes("e")) newW = Math.max(50, startW + dx);
        if (dragging.includes("w")) newW = Math.max(50, startW - dx);
        if (dragging.includes("s")) newH = Math.max(50, startH + dy);
        if (dragging.includes("n")) newH = Math.max(50, startH - dy);
        zoneNode.style({ width: newW, height: newH });
        renderHandles();
      }
    };

    const onMouseUp = () => {
      if (!dragging) return;
      const wasDragging = dragging;
      dragging = null;

      if (wasDragging === "label") {
        setZones((prev) => {
          const updated = prev.map((z) => z.id === selectedZoneId
            ? { ...z, style: { ...z.style, labelOffsetX: currentLabelOffsetX, labelOffsetY: currentLabelOffsetY } }
            : z);
          if (selectedMapId) {
            fetch(`/api/topology-maps/${selectedMapId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ designConfig: { ...design, zones: updated } }),
            });
          }
          return updated;
        });
      } else {
        const newW = Math.round(zoneNode.width());
        const newH = Math.round(zoneNode.height());
        setZones((prev) => {
          const updated = prev.map((z) => z.id === selectedZoneId ? { ...z, width: newW, height: newH } : z);
          if (selectedMapId) {
            fetch(`/api/topology-maps/${selectedMapId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ designConfig: { ...design, zones: updated } }),
            });
          }
          return updated;
        });
      }
    };

    resizeOverlay.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);

    return () => {
      cy.off("viewport", onViewport);
      cy.off("position", `#${selectedZoneId}`, onViewport);
      resizeOverlay!.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
      resizeOverlay!.innerHTML = "";
    };
  }, [selectedZoneId, selectedMapId, design, zones]);

  // Search highlighting
  useEffect(() => {
    if (!cyRef.current) return;
    const cy = cyRef.current;
    if (!search.trim()) { cy.elements().removeClass("dimmed"); return; }
    const q = search.toLowerCase();
    cy.elements().addClass("dimmed");
    // Keep zones visible during search
    cy.nodes().filter((n: { data: (k: string) => unknown }) => n.data("isZone")).removeClass("dimmed");
    const matches = cy.nodes().filter((n: { data: (k: string) => string }) => {
      if (n.data("isZone")) return false;
      const name = n.data("nodeName") || n.data("nodeHostname") || n.data("nodeIp") || "";
      return name.toLowerCase().includes(q);
    });
    matches.removeClass("dimmed");
    matches.connectedEdges().removeClass("dimmed");
    matches.connectedEdges().connectedNodes().removeClass("dimmed");
  }, [search]);

  // Per-node style editing
  const [nodeStyleEdit, setNodeStyleEdit] = useState(false);
  const [nodeStyle, setNodeStyle] = useState<Record<string, string>>({});

  // Context menu
  const [ctxMenu, setCtxMenu] = useState<{
    x: number; y: number;
    type: "node" | "edge" | "zone";
    targetId: string;
    targetData: Record<string, unknown>;
  } | null>(null);

  // Link style editor (floating panel)
  const [editingLink, setEditingLink] = useState<{
    id: string; mapId: number;
    position: { x: number; y: number };
    style: Record<string, string>;
  } | null>(null);

  // Zone property editor (floating panel)
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [editingZonePos, setEditingZonePos] = useState<{ x: number; y: number } | null>(null);

  const openNodeStyleEdit = () => {
    if (!selectedNode) return;
    const existing = data?.nodes.find((n) => n.id === selectedNode.id)?.styleOverride ?? {};
    setNodeStyle(Object.fromEntries(Object.entries(existing).map(([k, v]) => [k, String(v)])));
    setNodeStyleEdit(true);
  };

  const saveNodeStyle = async () => {
    if (!selectedMapId || !selectedNode) return;
    const override = Object.keys(nodeStyle).length > 0
      ? Object.fromEntries(Object.entries(nodeStyle).filter(([, v]) => v !== ""))
      : null;
    await fetch(`/api/topology-maps/${selectedMapId}/devices/${selectedNode.id}/style`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ styleOverride: override && Object.keys(override).length > 0 ? override : null }),
    });
    setNodeStyleEdit(false);
    loadGraph(selectedMapId, protocolFilter);
  };

  const fitView = () => { if (cyRef.current) cyRef.current.fit(undefined, 40); };
  const refresh = () => { if (selectedMapId) loadGraph(selectedMapId, protocolFilter); };

  // Alignment & distribution helpers
  const getSelectedCyNodes = () => {
    const cy = cyRef.current;
    if (!cy || multiSelectedNodeIds.length < 2) return [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return multiSelectedNodeIds.map((id) => cy.$(`#${id}`)).filter((col: any) => col.length > 0).map((col: any) => col[0]);
  };

  const triggerLayoutSave = () => {
    const cy = cyRef.current;
    if (!cy || !selectedMapId) return;
    setLayoutDirty(true);
    if (layoutSaveTimer.current) clearTimeout(layoutSaveTimer.current);
    layoutSaveTimer.current = setTimeout(() => {
      const layout: Record<string, { x: number; y: number }> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      cy.nodes().forEach((n: any) => {
        const pos = n.position();
        layout[n.id()] = { x: Math.round(pos.x), y: Math.round(pos.y) };
      });
      fetch(`/api/topology-maps/${selectedMapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ layout }),
      }).then(() => setLayoutDirty(false)).catch(() => { /* ignore */ });
    }, 400);
  };

  const alignNodes = (axis: "left" | "right" | "top" | "bottom" | "centerH" | "centerV") => {
    const nodes = getSelectedCyNodes();
    if (nodes.length < 2) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positions = nodes.map((n: any) => ({ n, ...n.position() }));

    if (axis === "left") {
      const min = Math.min(...positions.map((p) => p.x));
      positions.forEach((p) => p.n.position({ x: min, y: p.y }));
    } else if (axis === "right") {
      const max = Math.max(...positions.map((p) => p.x));
      positions.forEach((p) => p.n.position({ x: max, y: p.y }));
    } else if (axis === "top") {
      const min = Math.min(...positions.map((p) => p.y));
      positions.forEach((p) => p.n.position({ x: p.x, y: min }));
    } else if (axis === "bottom") {
      const max = Math.max(...positions.map((p) => p.y));
      positions.forEach((p) => p.n.position({ x: p.x, y: max }));
    } else if (axis === "centerH") {
      const avg = positions.reduce((s, p) => s + p.x, 0) / positions.length;
      positions.forEach((p) => p.n.position({ x: avg, y: p.y }));
    } else if (axis === "centerV") {
      const avg = positions.reduce((s, p) => s + p.y, 0) / positions.length;
      positions.forEach((p) => p.n.position({ x: p.x, y: avg }));
    }
    triggerLayoutSave();
  };

  const distributeNodes = (axis: "horizontal" | "vertical") => {
    const nodes = getSelectedCyNodes();
    if (nodes.length < 3) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const positions = nodes.map((n: any) => ({ n, ...n.position() }));

    if (axis === "horizontal") {
      positions.sort((a, b) => a.x - b.x);
      const min = positions[0].x;
      const max = positions[positions.length - 1].x;
      const step = (max - min) / (positions.length - 1);
      positions.forEach((p, i) => p.n.position({ x: min + step * i, y: p.y }));
    } else {
      positions.sort((a, b) => a.y - b.y);
      const min = positions[0].y;
      const max = positions[positions.length - 1].y;
      const step = (max - min) / (positions.length - 1);
      positions.forEach((p, i) => p.n.position({ x: p.x, y: min + step * i }));
    }
    triggerLayoutSave();
  };

  const currentMap = maps.find((m) => m.id === selectedMapId);

  const openCreate = () => {
    setCreateName("");
    setCreateDescription("");
    setCreateProtocol("");
    setCreateOpen(true);
  };

  const createMap = async () => {
    if (!current || !createName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch(`/api/topology-maps?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: createName.trim(),
          description: createDescription.trim() || null,
          defaultProtocol: createProtocol || null,
        }),
      });
      if (res.ok) {
        const newMap: TopologyMapItem = await res.json();
        setMaps((prev) => [...prev, newMap]);
        setSelectedMapId(newMap.id);
        setCreateOpen(false);
      }
    } finally {
      setCreating(false);
    }
  };

  const openEdit = async () => {
    if (!currentMap || !current || !selectedMapId) return;
    setEditName(currentMap.name);
    setEditDescription(currentMap.description ?? "");
    setEditDefaultProtocol(currentMap.defaultProtocol ?? "");
    setEditTab("settings");
    setEditSaved(false);
    setNodesSearch("");
    setEditOpen(true);

    // Load nodes, assignments, categories in parallel
    setNodesLoading(true);
    setGenerateResult(null);
    try {
      const [nodesRes, assignedRes, catsRes, mapRes] = await Promise.all([
        fetch(`/api/nodes?context=${current.id}`),
        fetch(`/api/topology-maps/${selectedMapId}/nodes`),
        fetch(`/api/inventory-categories?context=${current.id}`),
        fetch(`/api/topology-maps/${selectedMapId}`),
      ]);
      if (nodesRes.ok) setAllNodes(await nodesRes.json());
      if (assignedRes.ok) {
        const ids: number[] = await assignedRes.json();
        setAssignedNodeIds(new Set(ids));
      }
      if (catsRes.ok) setCategories(await catsRes.json());
      if (mapRes.ok) {
        const mapData = await mapRes.json();
        const rules = (mapData.linkRules?.length ? mapData.linkRules : []).map(normalizeLinkRule);
        setLinkRules(rules);
        const dc = mapData.designConfig ?? {};
        const nodeConf = { ...defaultDesign.node, ...dc.node };
        setDesign({
          node: nodeConf,
          label: { elements: migrateLabelToElements(dc.label, nodeConf.height) },
          edge: { ...defaultDesign.edge, ...dc.edge },
          styleRules: dc.styleRules ?? [],
        });
        setZones(dc.zones ?? []);
        // Pre-load columns for categories already configured in existing rules
        const catIdsToLoad = new Set<number>();
        for (const r of rules) {
          if (r.inventoryCategoryId) catIdsToLoad.add(r.inventoryCategoryId);
          if (r.areaCategoryId) catIdsToLoad.add(r.areaCategoryId);
        }
        for (const catId of catIdsToLoad) {
          fetch(`/api/inventory-categories/${catId}/columns`)
            .then((res) => res.ok ? res.json() : [])
            .then((cols: string[]) => setColumnsByCategory((prev) => ({ ...prev, [catId]: cols })));
        }
      }
    } finally {
      setNodesLoading(false);
    }
  };

  const saveEdit = async () => {
    if (!selectedMapId || !editName.trim()) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/topology-maps/${selectedMapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDescription.trim() || null,
          defaultProtocol: editDefaultProtocol || null,
        }),
      });
      if (res.ok) {
        setEditSaved(true);
        setTimeout(() => setEditSaved(false), 2000);
        // Refresh the map list to pick up the new name
        setMaps((prev) => prev.map((m) =>
          m.id === selectedMapId
            ? { ...m, name: editName.trim(), description: editDescription.trim() || null, defaultProtocol: editDefaultProtocol || null }
            : m
        ));
      }
    } finally {
      setEditSaving(false);
    }
  };

  const toggleNode = (nodeId: number) => {
    setAssignedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId); else next.add(nodeId);
      return next;
    });
  };

  const toggleAllNodes = () => {
    const filtered = filteredNodes;
    const allSelected = filtered.every((n) => assignedNodeIds.has(n.id));
    setAssignedNodeIds((prev) => {
      const next = new Set(prev);
      filtered.forEach((n) => { if (allSelected) next.delete(n.id); else next.add(n.id); });
      return next;
    });
  };

  const saveNodes = async () => {
    if (!selectedMapId) return;
    setNodesSaving(true);
    try {
      const res = await fetch(`/api/topology-maps/${selectedMapId}/nodes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeIds: Array.from(assignedNodeIds) }),
      });
      if (res.ok) {
        setEditSaved(true);
        setTimeout(() => setEditSaved(false), 2000);
        // Reload graph to show updated nodes
        loadGraph(selectedMapId, protocolFilter);
      }
    } finally {
      setNodesSaving(false);
    }
  };

  // Link rules helpers
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalizeLinkRule = (rule: any): LinkRule => ({
    protocol: rule.protocol ?? "lldp",
    inventoryCategoryId: rule.inventoryCategoryId ?? null,
    destNodeColumn: rule.destNodeColumn || rule.remoteNameColumn || "",
    nodeMatchField: rule.nodeMatchField || "auto",
    localPortColumn: rule.localPortColumn ?? "",
    remotePortColumn: rule.remotePortColumn ?? "",
    sourceInterfaceColumn: rule.sourceInterfaceColumn ?? "",
    metricColumn: rule.metricColumn || rule.weightColumn || "",
    areaCategoryId: rule.areaCategoryId ?? null,
    areaColumn: rule.areaColumn ?? "",
    includeExternalNeighbors: rule.includeExternalNeighbors !== false,
    remoteNameColumn: rule.remoteNameColumn ?? "",
    chassisIdColumn: rule.chassisIdColumn ?? "",
    mgmtAddressColumn: rule.mgmtAddressColumn ?? "",
    weightColumn: rule.weightColumn ?? "",
  });

  const addLinkRule = () => {
    setLinkRules((prev) => [...prev, normalizeLinkRule({ protocol: "lldp" })]);
  };

  const updateLinkRule = (idx: number, patch: Partial<LinkRule>) => {
    setLinkRules((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const removeLinkRule = (idx: number) => {
    setLinkRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const loadColumns = async (categoryId: number) => {
    // Always fetch — use functional setter to check if already loaded
    const res = await fetch(`/api/inventory-categories/${categoryId}/columns`);
    if (res.ok) {
      const cols: string[] = await res.json();
      setColumnsByCategory((prev) => ({ ...prev, [categoryId]: cols }));
    }
  };

  const prepareLinkRulesForSave = () => linkRules.map((r) => ({
    ...r,
    remoteNameColumn: r.destNodeColumn,
    weightColumn: r.protocol === "isis" ? r.metricColumn : r.weightColumn,
  }));

  const saveLinkRules = async () => {
    if (!selectedMapId) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/topology-maps/${selectedMapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkRules: prepareLinkRulesForSave() }),
      });
      if (res.ok) {
        setEditSaved(true);
        setTimeout(() => setEditSaved(false), 2000);
      }
    } finally {
      setEditSaving(false);
    }
  };

  const generateLinks = async () => {
    if (!selectedMapId) return;
    setGenerating(true);
    setGenerateResult(null);
    try {
      // Save rules first
      await fetch(`/api/topology-maps/${selectedMapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkRules: prepareLinkRulesForSave() }),
      });
      // Then generate
      const res = await fetch(`/api/topology-maps/${selectedMapId}/generate-links`, { method: "POST" });
      if (res.ok) {
        const result = await res.json();
        setGenerateResult(result);
        // Reload graph
        loadGraph(selectedMapId, protocolFilter);
      }
    } finally {
      setGenerating(false);
    }
  };

  const saveDesign = async () => {
    if (!selectedMapId) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/topology-maps/${selectedMapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ designConfig: { ...design, zones } }),
      });
      if (res.ok) {
        setEditSaved(true);
        setTimeout(() => setEditSaved(false), 2000);
        // Reload graph to apply new design
        loadGraph(selectedMapId, protocolFilter);
      }
    } finally {
      setEditSaving(false);
    }
  };

  const filteredNodes = allNodes.filter((n) => {
    if (!nodesSearch.trim()) return true;
    const q = nodesSearch.toLowerCase();
    return (
      (n.name ?? "").toLowerCase().includes(q) ||
      (n.hostname ?? "").toLowerCase().includes(q) ||
      n.ipAddress.toLowerCase().includes(q) ||
      (n.manufacturer?.name ?? "").toLowerCase().includes(q) ||
      (n.model?.name ?? "").toLowerCase().includes(q)
    );
  });

  const CreateMapModal = () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={() => setCreateOpen(false)} />
      <div className="relative z-10 w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("topology.newMap")}</h2>
          <button onClick={() => setCreateOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("topology.colName")} <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={createName}
              onChange={(e) => setCreateName(e.target.value)}
              placeholder={t("topology.namePlaceholder")}
              autoFocus
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("topology.description")}</label>
            <textarea
              value={createDescription}
              onChange={(e) => setCreateDescription(e.target.value)}
              placeholder={t("topology.descriptionPlaceholder")}
              rows={2}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors resize-none"
            />
          </div>
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("topology.defaultProtocol")}</label>
            <select
              value={createProtocol}
              onChange={(e) => setCreateProtocol(e.target.value)}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
            >
              <option value="">{t("topology.protocolAll")}</option>
              <option value="lldp">LLDP</option>
              <option value="stp">STP</option>
              <option value="ospf">OSPF</option>
              <option value="bgp">BGP</option>
              <option value="isis">ISIS</option>
            </select>
          </div>
        </div>
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={() => setCreateOpen(false)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={createMap}
            disabled={creating || !createName.trim()}
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {t("topology.createMap")}
          </button>
        </div>
      </div>
    </div>
  );

  // No maps yet
  if (!loading && maps.length === 0) {
    return (
      <>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Network className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
          <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">{t("topology.noMaps")}</h2>
          <button
            onClick={openCreate}
            className="mt-4 flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("topology.newMap")}
          </button>
        </div>
        {createOpen && <CreateMapModal />}
      </>
    );
  }

  return (
    <div className="relative -m-6" style={{ height: "calc(100vh - 4rem)" }}>
      {/* Full-screen graph container */}
      <div ref={containerRef} style={{ width: "100%", height: "100%", background: "#f8fafc" }} />

      {/* Empty state */}
      {data && data.nodes.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 pointer-events-none">
          <Network className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400 font-medium">{t("topology.emptyMap")}</p>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{t("topology.emptyMapHint")}</p>
        </div>
      )}

      {/* Loading spinner */}
      {loading && !data && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-slate-950/80">
          <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
        </div>
      )}

      {/* TOP-LEFT: Map selector + controls */}
      <div className="absolute top-3 left-3 flex items-center gap-2 z-10">
        {/* Map dropdown */}
        <div ref={dropdownRef} className="relative">
          <button
            onClick={() => setMapDropdownOpen(!mapDropdownOpen)}
            className="flex items-center gap-2 rounded-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 px-3 py-2 shadow-sm hover:bg-white dark:hover:bg-slate-900 transition-colors"
          >
            <Network className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-semibold text-slate-900 dark:text-slate-100 max-w-[200px] truncate">
              {currentMap?.name ?? t("topology.selectMap")}
            </span>
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${mapDropdownOpen ? "rotate-180" : ""}`} />
          </button>
          {mapDropdownOpen && maps.length > 0 && (
            <div className="absolute top-full left-0 mt-1 w-72 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden z-20">
              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {maps.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setSelectedMapId(m.id); setMapDropdownOpen(false); }}
                    className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${
                      m.id === selectedMapId ? "bg-slate-50 dark:bg-slate-800" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{m.name}</span>
                      {m.id === selectedMapId && (
                        <span className="h-2 w-2 rounded-full bg-blue-500 shrink-0 ml-2" />
                      )}
                    </div>
                    {m.description && (
                      <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">{m.description}</p>
                    )}
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-slate-400 dark:text-slate-500">
                      <span>{m.deviceCount} {t("topology.devices")}</span>
                      <span>·</span>
                      <span>{m.linkCount} {t("topology.links")}</span>
                    </div>
                  </button>
                ))}
              </div>
              {/* Create new map from dropdown */}
              <button
                onClick={() => { setMapDropdownOpen(false); openCreate(); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                {t("topology.newMap")}
              </button>
            </div>
          )}
        </div>

        {/* New map button */}
        <button
          onClick={openCreate}
          title={t("topology.newMap")}
          className="p-2 rounded-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <Plus className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        </button>

        {/* Edit button */}
        {currentMap && (
          <button
            onClick={openEdit}
            title={t("topology.editMap")}
            className="p-2 rounded-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 shadow-sm hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <Settings className="h-4 w-4 text-slate-500 dark:text-slate-400" />
          </button>
        )}

        {/* Layout saving indicator */}
        {layoutDirty && (
          <span className="flex items-center gap-1 rounded-lg bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 px-2.5 py-1.5 text-[10px] text-slate-400 dark:text-slate-500 shadow-sm">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
            {t("topology.savingLayout")}
          </span>
        )}
      </div>

      {/* TOP-RIGHT: Search, protocol filter, controls */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t("topology.searchDevice")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur py-1.5 pl-8 pr-3 text-xs text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors w-44 shadow-sm"
          />
        </div>
        {data && data.availableProtocols.length > 0 && (
          <select
            value={protocolFilter}
            onChange={(e) => setProtocolFilter(e.target.value)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur py-1.5 px-3 text-xs font-medium text-slate-700 dark:text-slate-200 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors shadow-sm"
          >
            <option value="">{t("topology.protocolAll")}</option>
            {data.availableProtocols.map((p) => (
              <option key={p} value={p}>{p.toUpperCase()}</option>
            ))}
          </select>
        )}
        <button onClick={fitView} title={t("topology.fitView")} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm">
          <Maximize2 className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
        </button>
        <button onClick={refresh} title={t("topology.reloadGraph")} className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shadow-sm">
          <RefreshCw className={`h-3.5 w-3.5 text-slate-500 dark:text-slate-400 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* BOTTOM-CENTER: Alignment & distribution toolbar */}
      {multiSelectedNodeIds.length >= 2 && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur border border-slate-200 dark:border-slate-700 shadow-lg px-2 py-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 px-1.5">{multiSelectedNodeIds.length} {t("topology.selectedNodes")}</span>
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <button onClick={() => alignNodes("left")} title={t("topology.alignLeft")} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <AlignStartVertical className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          </button>
          <button onClick={() => alignNodes("centerH")} title={t("topology.alignCenterH")} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <AlignCenterVertical className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          </button>
          <button onClick={() => alignNodes("right")} title={t("topology.alignRight")} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <AlignEndVertical className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          </button>
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
          <button onClick={() => alignNodes("top")} title={t("topology.alignTop")} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <AlignStartHorizontal className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          </button>
          <button onClick={() => alignNodes("centerV")} title={t("topology.alignCenterV")} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <AlignCenterHorizontal className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          </button>
          <button onClick={() => alignNodes("bottom")} title={t("topology.alignBottom")} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <AlignEndHorizontal className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
          </button>
          {multiSelectedNodeIds.length >= 3 && (
            <>
              <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
              <button onClick={() => distributeNodes("horizontal")} title={t("topology.distributeH")} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <GripVertical className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              </button>
              <button onClick={() => distributeNodes("vertical")} title={t("topology.distributeV")} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <GripHorizontal className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" />
              </button>
            </>
          )}
        </div>
      )}

      {/* BOTTOM-LEFT: Legend */}
      {data && data.availableProtocols.length > 0 && (
        <div className="absolute bottom-3 left-3 rounded-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-700 px-3 py-2 shadow-sm z-10">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{t("topology.legend")}</p>
          <div className="flex flex-col gap-1">
            {data.availableProtocols.map((p) => (
              <div key={p} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                <span className="h-0.5 w-4 rounded" style={{ backgroundColor: PROTOCOL_COLORS[p] ?? "#94a3b8" }} />
                {p.toUpperCase()}
              </div>
            ))}
          </div>
          {protocolFilter === "isis" && data.isisAreas && data.isisAreas.length > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-700">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">{t("topology.isisAreas")}</p>
              <div className="flex flex-col gap-1">
                {data.isisAreas.map((area, i) => (
                  <div key={area} className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#6366f1", "#a855f7", "#ec4899", "#14b8a6", "#f43f5e"][i % 10] }} />
                    {area}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* BOTTOM-RIGHT: Stats */}
      {data && data.nodes.length > 0 && (
        <div className="absolute bottom-3 right-3 rounded-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs text-slate-600 dark:text-slate-300 shadow-sm z-10">
          <span className="font-semibold">{data.nodes.length}</span> {t("topology.devices")} · <span className="font-semibold">{data.edges.length}</span> {t("topology.links")}
        </div>
      )}

      {/* RIGHT: Side panel */}
      {selectedNode && (
        <div className="absolute top-3 right-3 mt-12 w-72 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg z-10">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <Info className="h-4 w-4 text-slate-400 shrink-0" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{selectedNode.name}</h3>
            </div>
            <button onClick={() => setSelectedNode(null)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-3.5 w-3.5 text-slate-400" />
            </button>
          </div>
          <div className="p-4 space-y-2 text-xs">
            {selectedNode.isExternal && (
              <span className="inline-flex items-center rounded-full bg-amber-50 dark:bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium text-amber-600 dark:text-amber-400">
                {t("topology.externalNeighbor")}
              </span>
            )}
            <DetailRow label={t("topology.nodeIp")} value={selectedNode.nodeIp ?? selectedNode.mgmtAddress} />
            <DetailRow label={t("topology.manufacturer")} value={selectedNode.nodeManufacturer} />
            <DetailRow label={t("topology.model")} value={selectedNode.nodeModel} />
            <DetailRow label={t("topology.chassisId")} value={selectedNode.chassisId} mono />
            <DetailRow label={t("topology.sysDescr")} value={selectedNode.sysDescr} />
            {/* Monitoring & compliance badges */}
            {selectedNode.isReachable !== null && (
              <div className="flex items-center gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${selectedNode.isReachable ? "bg-emerald-500" : "bg-red-500"}`} />
                <span className="text-xs text-slate-600 dark:text-slate-300">
                  {selectedNode.isReachable ? t("topology.reachable") : t("topology.unreachable")}
                </span>
              </div>
            )}
            {selectedNode.score && (
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-bold text-white ${
                  selectedNode.score === "A" ? "bg-emerald-500" : selectedNode.score === "B" ? "bg-lime-500" : selectedNode.score === "C" ? "bg-amber-500" : selectedNode.score === "D" ? "bg-orange-500" : "bg-red-500"
                }`}>
                  {selectedNode.score}
                </span>
                <span className="text-xs text-slate-600 dark:text-slate-300">{t("topology.complianceGrade")}</span>
              </div>
            )}
            {protocolFilter === "isis" && (() => {
              const nodeAreas = data?.nodes.find((n) => n.id === selectedNode.id)?.isisAreas;
              if (!nodeAreas?.length) return null;
              const allAreas = data?.isisAreas ?? [];
              const areaColors = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#6366f1", "#a855f7", "#ec4899", "#14b8a6", "#f43f5e"];
              return (
                <div className="pt-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t("topology.isisAreas")}</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {nodeAreas.map((a) => (
                      <span key={a} className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold text-white" style={{ backgroundColor: areaColors[allAreas.indexOf(a) % areaColors.length] }}>
                        {a}
                      </span>
                    ))}
                    {nodeAreas.length >= 2 && (
                      <span className="inline-flex items-center rounded-full bg-slate-200 dark:bg-slate-700 px-2 py-0.5 text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                        {t("topology.isisBoundary")}
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
            {selectedNode.nodeId && (
              <Link
                href={`/nodes/${selectedNode.nodeId}`}
                className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
              >
                {t("topology.openNode")} →
              </Link>
            )}

            {/* Custom style button */}
            <button
              onClick={openNodeStyleEdit}
              className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <Palette className="h-3.5 w-3.5" />
              {t("topology.customizeStyle")}
            </button>

            {/* Inline style editor */}
            {nodeStyleEdit && (
              <div className="mt-2 pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.designBgColor")}</label>
                  <div className="flex items-center gap-1.5">
                    <input type="color" value={nodeStyle.bgColor || design.node.bgColor} onChange={(e) => setNodeStyle({ ...nodeStyle, bgColor: e.target.value })} className="h-6 w-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0" />
                    <input type="text" value={nodeStyle.bgColor || ""} onChange={(e) => setNodeStyle({ ...nodeStyle, bgColor: e.target.value })} placeholder={design.node.bgColor} className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-mono" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.designBorderColor")}</label>
                  <div className="flex items-center gap-1.5">
                    <input type="color" value={nodeStyle.borderColor || design.node.borderColor} onChange={(e) => setNodeStyle({ ...nodeStyle, borderColor: e.target.value })} className="h-6 w-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0" />
                    <input type="text" value={nodeStyle.borderColor || ""} onChange={(e) => setNodeStyle({ ...nodeStyle, borderColor: e.target.value })} placeholder={design.node.borderColor} className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-mono" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.designShape")}</label>
                  <select value={nodeStyle.shape || ""} onChange={(e) => setNodeStyle({ ...nodeStyle, shape: e.target.value })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
                    <option value="">{t("topology.defaultStyle")}</option>
                    <option value="ellipse">Circle</option>
                    <option value="rectangle">Rectangle</option>
                    <option value="round-rectangle">Rounded</option>
                    <option value="diamond">Diamond</option>
                    <option value="hexagon">Hexagon</option>
                    <option value="triangle">Triangle</option>
                    <option value="star">Star</option>
                  </select>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <button onClick={saveNodeStyle} className="flex-1 rounded-lg bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
                    {t("common.save")}
                  </button>
                  <button onClick={() => { setNodeStyle({}); saveNodeStyle(); }} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    {t("topology.resetStyle")}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Context menu */}
      {ctxMenu && ctxMenu.type === "node" && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} items={[
          {
            label: t("topology.ctxViewDetails"),
            icon: <Info className="h-4 w-4" />,
            onClick: () => {
              const d = ctxMenu.targetData;
              setSelectedNode({
                id: d.id as string, name: (d.nodeName || d.nodeHostname || d.nodeIp || d.id) as string,
                isExternal: d.isExternal as boolean, nodeId: (d.nodeId ?? null) as number | null,
                nodeName: (d.nodeName ?? null) as string | null, nodeHostname: (d.nodeHostname ?? null) as string | null,
                nodeIp: (d.nodeIp ?? null) as string | null, nodeManufacturer: (d.nodeManufacturer ?? null) as string | null,
                nodeModel: (d.nodeModel ?? null) as string | null, chassisId: (d.chassisId ?? null) as string | null,
                mgmtAddress: (d.mgmtAddress ?? null) as string | null, sysDescr: (d.sysDescr ?? null) as string | null,
                isReachable: d.isReachable === "true" || d.isReachable === true ? true : d.isReachable === "false" || d.isReachable === false ? false : null,
                score: (d.score as string) || null, styleOverride: null, position: null,
              });
            },
          },
          {
            label: t("topology.ctxEditStyle"),
            icon: <Palette className="h-4 w-4" />,
            onClick: () => {
              const d = ctxMenu.targetData;
              setSelectedNode({
                id: d.id as string, name: (d.nodeName || d.nodeHostname || d.nodeIp || d.id) as string,
                isExternal: d.isExternal as boolean, nodeId: (d.nodeId ?? null) as number | null,
                nodeName: (d.nodeName ?? null) as string | null, nodeHostname: (d.nodeHostname ?? null) as string | null,
                nodeIp: (d.nodeIp ?? null) as string | null, nodeManufacturer: (d.nodeManufacturer ?? null) as string | null,
                nodeModel: (d.nodeModel ?? null) as string | null, chassisId: (d.chassisId ?? null) as string | null,
                mgmtAddress: (d.mgmtAddress ?? null) as string | null, sysDescr: (d.sysDescr ?? null) as string | null,
                isReachable: null, score: null, styleOverride: null, position: null,
              });
              setTimeout(() => openNodeStyleEdit(), 50);
            },
          },
          ...((ctxMenu.targetData.nodeId) ? [{
            label: t("topology.ctxOpenNode"),
            icon: <Server className="h-4 w-4" />,
            separator: true,
            onClick: () => { window.location.href = `/nodes/${ctxMenu.targetData.nodeId}`; },
          }] : []),
        ]} />
      )}

      {ctxMenu && ctxMenu.type === "zone" && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} items={[
          {
            label: t("topology.ctxEditZone"),
            icon: <Settings className="h-4 w-4" />,
            onClick: () => {
              setEditingZoneId(ctxMenu.targetId);
              setEditingZonePos({ x: ctxMenu.x, y: ctxMenu.y });
            },
          },
          {
            label: t("topology.ctxDeleteZone"),
            icon: <Trash2 className="h-4 w-4" />,
            separator: true,
            onClick: async () => {
              const zoneId = ctxMenu.targetId;
              const updatedZones = zones.filter((z) => z.id !== zoneId);
              setZones(updatedZones);
              if (selectedMapId) {
                await fetch(`/api/topology-maps/${selectedMapId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ designConfig: { ...design, zones: updatedZones } }),
                });
                loadGraph(selectedMapId, protocolFilter);
              }
            },
          },
        ]} />
      )}

      {ctxMenu && ctxMenu.type === "edge" && (
        <ContextMenu x={ctxMenu.x} y={ctxMenu.y} onClose={() => setCtxMenu(null)} items={[
          {
            label: t("topology.ctxEditLinkStyle"),
            icon: <Palette className="h-4 w-4" />,
            onClick: () => {
              const d = ctxMenu.targetData;
              const existing = data?.edges.find((e) => `e${e.id}` === ctxMenu.targetId)?.styleOverride ?? {};
              setEditingLink({
                id: (d.id as string).replace(/^e/, ""),
                mapId: selectedMapId!,
                position: { x: ctxMenu.x, y: ctxMenu.y },
                style: Object.fromEntries(Object.entries(existing).map(([k, v]) => [k, String(v)])),
              });
            },
          },
          ...((ctxMenu.targetData.isManual) ? [{
            label: t("topology.ctxDeleteLink"),
            icon: <Trash2 className="h-4 w-4" />,
            separator: true,
            onClick: async () => {
              const linkId = (ctxMenu.targetData.id as string).replace(/^e/, "");
              if (selectedMapId) {
                await fetch(`/api/topology-maps/${selectedMapId}/links/${linkId}`, { method: "DELETE" });
                loadGraph(selectedMapId, protocolFilter);
              }
            },
          }] : []),
        ]} />
      )}

      {/* Floating link style editor */}
      {editingLink && (
        <div
          className="fixed z-[90] w-72 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-4 space-y-3"
          style={{ left: Math.min(editingLink.position.x, window.innerWidth - 320), top: Math.min(editingLink.position.y, window.innerHeight - 300) }}
        >
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("topology.editLinkStyle")}</h3>
            <button onClick={() => setEditingLink(null)} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
              <X className="h-4 w-4 text-slate-400" />
            </button>
          </div>
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.designEdgeColor")}</label>
              <div className="flex items-center gap-1.5">
                <input type="color" value={editingLink.style.color || design.edge.color || "#94a3b8"} onChange={(e) => setEditingLink({ ...editingLink, style: { ...editingLink.style, color: e.target.value } })} className="h-6 w-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0" />
                <input type="text" value={editingLink.style.color || ""} onChange={(e) => setEditingLink({ ...editingLink, style: { ...editingLink.style, color: e.target.value } })} placeholder={design.edge.color || "#94a3b8"} className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-mono" />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.designEdgeWidth")}</label>
              <input type="range" min={0.5} max={10} step={0.5} value={editingLink.style.width || design.edge.width} onChange={(e) => setEditingLink({ ...editingLink, style: { ...editingLink.style, width: e.target.value } })} className="w-full" />
              <span className="text-[10px] text-slate-400">{editingLink.style.width || design.edge.width}</span>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.designEdgeStyle")}</label>
              <select value={editingLink.style.style || ""} onChange={(e) => setEditingLink({ ...editingLink, style: { ...editingLink.style, style: e.target.value } })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
                <option value="">{t("topology.defaultStyle")}</option>
                <option value="solid">Solid</option>
                <option value="dashed">Dashed</option>
                <option value="dotted">Dotted</option>
              </select>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-1">
            <button
              onClick={async () => {
                const override = Object.keys(editingLink.style).length > 0
                  ? Object.fromEntries(Object.entries(editingLink.style).filter(([, v]) => v !== ""))
                  : null;
                await fetch(`/api/topology-maps/${editingLink.mapId}/links/${editingLink.id}/style`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ styleOverride: override && Object.keys(override).length > 0 ? override : null }),
                });
                setEditingLink(null);
                if (selectedMapId) loadGraph(selectedMapId, protocolFilter);
              }}
              className="flex-1 rounded-lg bg-slate-900 dark:bg-white px-3 py-1.5 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              {t("common.save")}
            </button>
            <button
              onClick={async () => {
                await fetch(`/api/topology-maps/${editingLink.mapId}/links/${editingLink.id}/style`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ styleOverride: null }),
                });
                setEditingLink(null);
                if (selectedMapId) loadGraph(selectedMapId, protocolFilter);
              }}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {t("topology.resetStyle")}
            </button>
          </div>
        </div>
      )}

      {/* Floating zone property editor */}
      {editingZoneId && editingZonePos && (() => {
        const zoneIdx = zones.findIndex((z) => z.id === editingZoneId);
        if (zoneIdx < 0) return null;
        const zone = zones[zoneIdx];
        const updateZ = (patch: Partial<TopologyZone>) => {
          setZones((prev) => prev.map((z, i) => i === zoneIdx ? { ...z, ...patch } : z));
        };
        const updateZS = (patch: Partial<TopologyZone["style"]>) => {
          setZones((prev) => prev.map((z, i) => i === zoneIdx ? { ...z, style: { ...z.style, ...patch } } : z));
        };
        return (
          <div
            className="fixed z-[90] w-80 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl p-4 space-y-4"
            style={{ left: Math.min(editingZonePos.x, window.innerWidth - 350), top: Math.min(editingZonePos.y, window.innerHeight - 400) }}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("topology.ctxEditZone")}</h3>
              <button onClick={() => { setEditingZoneId(null); setEditingZonePos(null); }} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4 text-slate-400" />
              </button>
            </div>
            {/* Label + Type */}
            <div className="space-y-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneLabelPlaceholder")}</label>
                <input type="text" value={zone.label} onChange={(e) => updateZ({ label: e.target.value })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-sm" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneTypeRectangle")}</label>
                  <select value={zone.type} onChange={(e) => updateZ({ type: e.target.value as "rectangle" | "ellipse" })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
                    <option value="rectangle">{t("topology.zoneTypeRectangle")}</option>
                    <option value="ellipse">{t("topology.zoneTypeEllipse")}</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneLayer")}</label>
                  <input type="number" min={-10} max={10} value={zone.layer} onChange={(e) => updateZ({ layer: Number(e.target.value) })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs" />
                </div>
              </div>
            </div>
            {/* Size */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneWidth")}</label>
                <input type="number" min={50} max={2000} step={10} value={zone.width} onChange={(e) => updateZ({ width: Number(e.target.value) })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneHeight")}</label>
                <input type="number" min={50} max={2000} step={10} value={zone.height} onChange={(e) => updateZ({ height: Number(e.target.value) })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs" />
              </div>
            </div>
            {/* Background */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneBgColor")}</label>
                <div className="flex items-center gap-1">
                  <input type="color" value={zone.style.bgColor} onChange={(e) => updateZS({ bgColor: e.target.value })} className="h-6 w-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0" />
                  <input type="text" value={zone.style.bgColor} onChange={(e) => updateZS({ bgColor: e.target.value })} className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-1 text-[10px] font-mono" />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneBgOpacity")}</label>
                <input type="range" min={0} max={1} step={0.05} value={zone.style.bgOpacity} onChange={(e) => updateZS({ bgOpacity: Number(e.target.value) })} className="w-full" />
              </div>
            </div>
            {/* Border */}
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneBorderColor")}</label>
                  <div className="flex items-center gap-1">
                    <input type="color" value={zone.style.borderColor} onChange={(e) => updateZS({ borderColor: e.target.value })} className="h-6 w-6 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0" />
                    <input type="text" value={zone.style.borderColor} onChange={(e) => updateZS({ borderColor: e.target.value })} className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-1 text-[10px] font-mono" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneBorderWidth")}</label>
                  <input type="range" min={0} max={10} step={0.5} value={zone.style.borderWidth} onChange={(e) => updateZS({ borderWidth: Number(e.target.value) })} className="w-full" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneBorderStyle")}</label>
                  <select value={zone.style.borderStyle} onChange={(e) => updateZS({ borderStyle: e.target.value as "solid" | "dashed" | "dotted" })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
                    <option value="solid">Solid</option>
                    <option value="dashed">Dashed</option>
                    <option value="dotted">Dotted</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneBorderRadius")}</label>
                  <input type="range" min={0} max={50} step={2} value={zone.style.borderRadius} onChange={(e) => updateZS({ borderRadius: Number(e.target.value) })} className="w-full" />
                </div>
              </div>
            </div>
            {/* Label styling */}
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneLabelColor")}</label>
                <input type="color" value={zone.style.labelColor} onChange={(e) => updateZS({ labelColor: e.target.value })} className="h-6 w-full rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneLabelSize")}</label>
                <input type="number" min={8} max={32} value={zone.style.labelSize} onChange={(e) => updateZS({ labelSize: Number(e.target.value) })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneLabelPosition")}</label>
                <select value={zone.style.labelPosition} onChange={(e) => updateZS({ labelPosition: e.target.value as "top" | "center" | "bottom" })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
                  <option value="top">Top</option>
                  <option value="center">Center</option>
                  <option value="bottom">Bottom</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneLabelHalign")}</label>
                <select value={zone.style.labelHalign ?? "center"} onChange={(e) => updateZS({ labelHalign: e.target.value as "left" | "center" | "right" })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
                  <option value="left">{t("topology.labelAlignLeft")}</option>
                  <option value="center">{t("topology.labelAlignCenter")}</option>
                  <option value="right">{t("topology.labelAlignRight")}</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneLabelOffsetX")}</label>
                <input type="number" value={zone.style.labelOffsetX ?? 0} onChange={(e) => updateZS({ labelOffsetX: Number(e.target.value) })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs" />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-slate-400">{t("topology.zoneLabelOffsetY")}</label>
                <input type="number" value={zone.style.labelOffsetY ?? 0} onChange={(e) => updateZS({ labelOffsetY: Number(e.target.value) })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs" />
              </div>
            </div>
            {/* Apply button */}
            <div className="flex items-center justify-end pt-2 border-t border-slate-100 dark:border-slate-800">
              <button
                onClick={async () => {
                  if (!selectedMapId) return;
                  await fetch(`/api/topology-maps/${selectedMapId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ designConfig: { ...design, zones } }),
                  });
                  setEditingZoneId(null);
                  setEditingZonePos(null);
                  loadGraph(selectedMapId, protocolFilter);
                }}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-xs font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
              >
                <Save className="h-3.5 w-3.5" />
                {t("common.save")}
              </button>
            </div>
          </div>
        );
      })()}

      {/* Manual link creator modal */}
      {manualLinkOpen && selectedMapId && data && (
        <ManualLinkCreator
          mapId={selectedMapId}
          devices={data.nodes.map((n) => ({
            id: n.id,
            name: n.name || n.nodeName || n.nodeHostname || n.nodeIp || n.id,
            nodeIp: n.nodeIp,
            nodeHostname: n.nodeHostname,
            nodeManufacturer: n.nodeManufacturer,
            chassisId: n.chassisId,
            mgmtAddress: n.mgmtAddress,
            isExternal: n.isExternal,
          }))}
          onCreated={() => loadGraph(selectedMapId, protocolFilter)}
          onClose={() => setManualLinkOpen(false)}
          t={t}
        />
      )}

      {/* Create modal */}
      {createOpen && <CreateMapModal />}

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={() => setEditOpen(false)} />
          <div className="relative z-10 flex flex-col bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl" style={{ width: "90vw", height: "90vh" }}>
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("topology.editMap")}</h2>
              <div className="flex items-center gap-3">
                {editSaved && (
                  <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                    <Save className="h-3.5 w-3.5" />
                    {t("topology.saved")}
                  </span>
                )}
                <button onClick={() => setEditOpen(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <X className="h-5 w-5 text-slate-400" />
                </button>
              </div>
            </div>

            {/* Tabs + content */}
            <div className="flex flex-1 min-h-0">
              {/* Left: tabs */}
              <div className="w-52 shrink-0 border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 overflow-y-auto">
                <nav className="p-2 space-y-0.5">
                  {(() => {
                    const isDesignTab = ["design-node", "design-link", "design-label", "design-conditional"].includes(editTab);
                    const tabBtn = (key: string, label: string, icon: React.ReactNode, indent?: boolean) => (
                      <button
                        key={key}
                        onClick={() => setEditTab(key)}
                        className={`w-full flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${indent ? "pl-8" : ""} ${
                          editTab === key
                            ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm border border-slate-200 dark:border-slate-700"
                            : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800"
                        }`}
                      >
                        {icon}
                        {label}
                      </button>
                    );

                    return (
                      <>
                        {tabBtn("nodes", t("topology.tabNodes"), <Server className="h-4 w-4" />)}
                        {tabBtn("links", t("topology.tabLinks"), <Link2 className="h-4 w-4" />)}
                        {tabBtn("zones", t("topology.tabZones"), <Square className="h-4 w-4" />)}

                        {/* Design parent */}
                        <button
                          onClick={() => { if (!isDesignTab) setEditTab("design-node"); }}
                          className={`w-full flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                            isDesignTab
                              ? "text-slate-900 dark:text-white"
                              : "text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/50 dark:hover:bg-slate-800"
                          }`}
                        >
                          <span className="flex items-center gap-2.5">
                            <Palette className="h-4 w-4" />
                            {t("topology.tabDesign")}
                          </span>
                          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isDesignTab ? "" : "-rotate-90"}`} />
                        </button>

                        {/* Design sub-items */}
                        {isDesignTab && (
                          <div className="space-y-0.5">
                            {tabBtn("design-node", t("topology.tabDesignNode"), <span className="h-4 w-4 flex items-center justify-center text-[10px]">●</span>, true)}
                            {tabBtn("design-link", t("topology.tabDesignLink"), <span className="h-4 w-4 flex items-center justify-center text-[10px]">─</span>, true)}
                            {tabBtn("design-label", t("topology.tabDesignLabel"), <span className="h-4 w-4 flex items-center justify-center text-[10px]">A</span>, true)}
                            {tabBtn("design-conditional", t("topology.tabDesignConditional"), <span className="h-4 w-4 flex items-center justify-center text-[10px]">?</span>, true)}
                          </div>
                        )}

                        {tabBtn("settings", t("topology.tabSettings"), <Settings className="h-4 w-4" />)}
                      </>
                    );
                  })()}
                </nav>
              </div>

              {/* Right: tab content */}
              <div className="flex-1 overflow-y-auto p-6">
                {/* Nodes tab */}
                {editTab === "nodes" && (
                  <div className="space-y-4 h-full flex flex-col">
                    <div className="flex items-center justify-between gap-3 shrink-0">
                      <div className="relative flex-1 max-w-sm">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder={t("topology.nodesSearchPlaceholder")}
                          value={nodesSearch}
                          onChange={(e) => setNodesSearch(e.target.value)}
                          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                        />
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{assignedNodeIds.size}</span> / {allNodes.length} {t("topology.nodesSelected")}
                        </span>
                        <button
                          onClick={saveNodes}
                          disabled={nodesSaving}
                          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
                        >
                          {nodesSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {t("common.save")}
                        </button>
                      </div>
                    </div>

                    {nodesLoading ? (
                      <div className="flex-1 flex items-center justify-center">
                        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
                      </div>
                    ) : (
                      <div className="flex-1 min-h-0 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
                        <div className="overflow-y-auto h-full">
                          <table className="w-full text-sm">
                            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800/80 backdrop-blur z-10">
                              <tr className="border-b border-slate-200 dark:border-slate-700">
                                <th className="w-10 px-3 py-2.5 text-center">
                                  <input
                                    type="checkbox"
                                    checked={filteredNodes.length > 0 && filteredNodes.every((n) => assignedNodeIds.has(n.id))}
                                    onChange={toggleAllNodes}
                                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-500 cursor-pointer"
                                  />
                                </th>
                                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("topology.colNodeName")}</th>
                                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("topology.colNodeIp")}</th>
                                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("topology.colNodeManufacturer")}</th>
                                <th className="px-3 py-2.5 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("topology.colNodeModel")}</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                              {filteredNodes.map((n) => {
                                const checked = assignedNodeIds.has(n.id);
                                return (
                                  <tr
                                    key={n.id}
                                    onClick={() => toggleNode(n.id)}
                                    className={`cursor-pointer transition-colors ${
                                      checked
                                        ? "bg-blue-50/50 dark:bg-blue-500/5"
                                        : "hover:bg-slate-50 dark:hover:bg-slate-800/50"
                                    }`}
                                  >
                                    <td className="px-3 py-2.5 text-center">
                                      <input
                                        type="checkbox"
                                        checked={checked}
                                        onChange={() => toggleNode(n.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-blue-600 focus:ring-blue-500 cursor-pointer"
                                      />
                                    </td>
                                    <td className="px-3 py-2.5">
                                      <div className="flex items-center gap-2">
                                        {checked && <Check className="h-3.5 w-3.5 text-blue-500 shrink-0" />}
                                        <span className={`font-medium ${checked ? "text-slate-900 dark:text-slate-100" : "text-slate-600 dark:text-slate-300"}`}>
                                          {n.name || n.hostname || n.ipAddress}
                                        </span>
                                      </div>
                                    </td>
                                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400 font-mono text-xs">{n.ipAddress}</td>
                                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{n.manufacturer?.name ?? "—"}</td>
                                    <td className="px-3 py-2.5 text-slate-500 dark:text-slate-400">{n.model?.name ?? "—"}</td>
                                  </tr>
                                );
                              })}
                              {filteredNodes.length === 0 && (
                                <tr>
                                  <td colSpan={5} className="px-3 py-8 text-center text-sm text-slate-400 dark:text-slate-500">
                                    {nodesSearch ? t("topology.nodesNoResult") : t("topology.nodesEmpty")}
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Links tab */}
                {editTab === "links" && (
                  <div className="space-y-5">
                    {/* Manual links section */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("topology.manualLinksTitle")}</h3>
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t("topology.manualLinksDesc")}</p>
                        </div>
                        <button onClick={() => setManualLinkOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                          <Plus className="h-3.5 w-3.5" /> {t("topology.createManualLink")}
                        </button>
                      </div>
                      {data && data.edges.filter((e) => e.isManual).length > 0 ? (
                        <div className="space-y-2">
                          {data.edges.filter((e) => e.isManual).map((edge) => {
                            const srcNode = data.nodes.find((n) => n.id === edge.source);
                            const tgtNode = data.nodes.find((n) => n.id === edge.target);
                            return (
                              <div key={edge.id} className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 shadow-sm">
                                <div className="flex items-center gap-2 text-sm">
                                  <span className="font-medium text-slate-700 dark:text-slate-200">{srcNode?.name || edge.source}</span>
                                  {edge.sourcePort && <span className="text-[10px] text-slate-400 font-mono">:{edge.sourcePort}</span>}
                                  <span className="text-slate-300 dark:text-slate-600">→</span>
                                  <span className="font-medium text-slate-700 dark:text-slate-200">{tgtNode?.name || edge.target}</span>
                                  {edge.targetPort && <span className="text-[10px] text-slate-400 font-mono">:{edge.targetPort}</span>}
                                  <span className="rounded-full bg-slate-100 dark:bg-slate-800 px-2 py-0.5 text-[10px] uppercase font-semibold text-slate-500 dark:text-slate-400">{edge.protocol}</span>
                                </div>
                                <button
                                  onClick={async () => {
                                    if (!selectedMapId) return;
                                    await fetch(`/api/topology-maps/${selectedMapId}/links/${edge.id}`, { method: "DELETE" });
                                    loadGraph(selectedMapId, protocolFilter);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center">
                          <p className="text-xs text-slate-400 dark:text-slate-500">{t("topology.noManualLinks")}</p>
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-200 dark:border-slate-800" />

                    {/* Auto link rules section */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("topology.linkRulesTitle")}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t("topology.linkRulesDesc")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={addLinkRule} className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                          <Plus className="h-3.5 w-3.5" /> {t("topology.addLinkRule")}
                        </button>
                        <button
                          onClick={generateLinks}
                          disabled={generating || linkRules.length === 0 || linkRules.every((r) => !r.inventoryCategoryId)}
                          className="flex items-center gap-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-3 py-1.5 text-xs font-medium text-white transition-colors"
                        >
                          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                          {t("topology.generateLinks")}
                        </button>
                      </div>
                    </div>

                    {generateResult && (
                      <div className="rounded-lg border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 text-xs text-emerald-700 dark:text-emerald-300">
                        <Check className="h-3.5 w-3.5 inline mr-1.5" />
                        {generateResult.linksCreated} {t("topology.linksCreatedLabel")}, {generateResult.linksUpdated} {t("topology.linksUpdatedLabel")}
                      </div>
                    )}

                    {linkRules.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
                        <Link2 className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                        <p className="text-sm text-slate-400 dark:text-slate-500">{t("topology.noLinkRules")}</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {linkRules.map((rule, idx) => {
                          const cols = rule.inventoryCategoryId ? (columnsByCategory[rule.inventoryCategoryId] ?? []) : [];
                          const areaCols = rule.areaCategoryId ? (columnsByCategory[rule.areaCategoryId] ?? []) : [];
                          const catName = categories.find((c) => c.id === rule.inventoryCategoryId)?.name;
                          const selectCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
                          return (
                            <div key={idx} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                              <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                                <div className="flex items-center gap-3">
                                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">#{idx + 1}</span>
                                  <select
                                    value={rule.protocol}
                                    onChange={(e) => updateLinkRule(idx, { protocol: e.target.value })}
                                    className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
                                  >
                                    <option value="lldp">LLDP</option>
                                    <option value="cdp">CDP</option>
                                    <option value="stp">STP</option>
                                    <option value="ospf">OSPF</option>
                                    <option value="bgp">BGP</option>
                                    <option value="isis">ISIS</option>
                                  </select>
                                  {catName && <span className="text-xs text-slate-500 dark:text-slate-400">{catName}</span>}
                                </div>
                                <button onClick={() => removeLinkRule(idx)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
                                </button>
                              </div>
                              <div className="p-5 space-y-4">
                                {/* Inventory category */}
                                <div className="space-y-1.5">
                                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("topology.inventoryCategory")}</label>
                                  <select
                                    value={rule.inventoryCategoryId ?? ""}
                                    onChange={(e) => {
                                      const catId = e.target.value ? Number(e.target.value) : null;
                                      updateLinkRule(idx, { inventoryCategoryId: catId, destNodeColumn: "", localPortColumn: "", remotePortColumn: "", sourceInterfaceColumn: "", metricColumn: "", remoteNameColumn: "", chassisIdColumn: "", mgmtAddressColumn: "", weightColumn: "" });
                                      if (catId) loadColumns(catId);
                                    }}
                                    className={selectCls}
                                  >
                                    <option value="">{t("topology.selectCategory")}</option>
                                    {categories.map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </select>
                                </div>

                                {rule.inventoryCategoryId && columnsByCategory[rule.inventoryCategoryId] !== undefined && cols.length > 0 && (
                                  <>
                                    {/* Common: dest node + match field */}
                                    <div className="grid grid-cols-2 gap-3">
                                      <ColSelect label={t("topology.colDestNode")} required value={rule.destNodeColumn} cols={cols} onChange={(v) => updateLinkRule(idx, { destNodeColumn: v })} />
                                      <div className="space-y-1">
                                        <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("topology.nodeMatchField")}</label>
                                        <select value={rule.nodeMatchField} onChange={(e) => updateLinkRule(idx, { nodeMatchField: e.target.value })} className={selectCls}>
                                          <option value="auto">{t("topology.matchAuto")}</option>
                                          <option value="name">{t("topology.matchName")}</option>
                                          <option value="hostname">{t("topology.matchHostname")}</option>
                                          <option value="ipAddress">{t("topology.matchIp")}</option>
                                          <option value="chassisId">{t("topology.matchChassisId")}</option>
                                          <option value="mgmtAddress">{t("topology.matchMgmtAddress")}</option>
                                        </select>
                                      </div>
                                    </div>

                                    {/* External neighbors toggle */}
                                    <label className="flex items-start gap-2 cursor-pointer">
                                      <input
                                        type="checkbox"
                                        checked={rule.includeExternalNeighbors}
                                        onChange={(e) => updateLinkRule(idx, { includeExternalNeighbors: e.target.checked })}
                                        className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20"
                                      />
                                      <span className="text-xs text-slate-700 dark:text-slate-300">
                                        <span className="font-medium">{t("topology.includeExternalNeighbors")}</span>
                                        <span className="block text-[11px] text-slate-400 dark:text-slate-500">{t("topology.includeExternalNeighborsHelp")}</span>
                                      </span>
                                    </label>

                                    {/* Standard protocols: local port + remote port */}
                                    {rule.protocol !== "isis" && (
                                      <div className="grid grid-cols-2 gap-3">
                                        <ColSelect label={t("topology.colLocalPort")} value={rule.localPortColumn} cols={cols} onChange={(v) => updateLinkRule(idx, { localPortColumn: v })} placeholder={t("topology.useEntryKey")} />
                                        <ColSelect label={t("topology.colRemotePort")} value={rule.remotePortColumn} cols={cols} onChange={(v) => updateLinkRule(idx, { remotePortColumn: v })} />
                                      </div>
                                    )}

                                    {/* ISIS: source interface + metric */}
                                    {rule.protocol === "isis" && (
                                      <>
                                        <div className="grid grid-cols-2 gap-3">
                                          <ColSelect label={t("topology.colSourceInterface")} value={rule.sourceInterfaceColumn} cols={cols} onChange={(v) => updateLinkRule(idx, { sourceInterfaceColumn: v })} placeholder={t("topology.useEntryKey")} />
                                          <ColSelect label={t("topology.colMetric")} value={rule.metricColumn} cols={cols} onChange={(v) => updateLinkRule(idx, { metricColumn: v })} />
                                        </div>
                                        {/* ISIS area config */}
                                        <div className="border-t border-slate-100 dark:border-slate-800 pt-4 mt-2">
                                          <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-3">{t("topology.isisAreaConfig")}</h4>
                                          <div className="grid grid-cols-2 gap-3">
                                            <div className="space-y-1">
                                              <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("topology.areaCategory")}</label>
                                              <select
                                                value={rule.areaCategoryId ?? ""}
                                                onChange={(e) => {
                                                  const catId = e.target.value ? Number(e.target.value) : null;
                                                  updateLinkRule(idx, { areaCategoryId: catId, areaColumn: "" });
                                                  if (catId) loadColumns(catId);
                                                }}
                                                className={selectCls}
                                              >
                                                <option value="">{t("topology.selectCategory")}</option>
                                                {categories.map((c) => (
                                                  <option key={c.id} value={c.id}>{c.name}</option>
                                                ))}
                                              </select>
                                            </div>
                                            {rule.areaCategoryId && areaCols.length > 0 && (
                                              <ColSelect label={t("topology.colArea")} value={rule.areaColumn} cols={areaCols} onChange={(v) => updateLinkRule(idx, { areaColumn: v })} />
                                            )}
                                          </div>
                                        </div>
                                      </>
                                    )}
                                  </>
                                )}

                                {rule.inventoryCategoryId && columnsByCategory[rule.inventoryCategoryId] === undefined && (
                                  <p className="text-xs text-slate-400 italic">{t("topology.loadingColumns")}</p>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {linkRules.length > 0 && (
                      <div className="flex items-center justify-end pt-2">
                        <button onClick={saveLinkRules} disabled={editSaving} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                          {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {t("common.save")}
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Zones tab */}
                {editTab === "zones" && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("topology.zonesTitle")}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t("topology.zonesDesc")}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button onClick={addZone} className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                          <Plus className="h-3.5 w-3.5" /> {t("topology.addZone")}
                        </button>
                        <button
                          onClick={async () => {
                            if (!selectedMapId) return;
                            setEditSaving(true);
                            try {
                              const res = await fetch(`/api/topology-maps/${selectedMapId}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ designConfig: { ...design, zones } }),
                              });
                              if (res.ok) {
                                setEditSaved(true);
                                setTimeout(() => setEditSaved(false), 2000);
                                loadGraph(selectedMapId, protocolFilter);
                              }
                            } finally { setEditSaving(false); }
                          }}
                          disabled={editSaving}
                          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
                        >
                          {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {t("common.save")}
                        </button>
                      </div>
                    </div>

                    {zones.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
                        <Square className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                        <p className="text-sm text-slate-400 dark:text-slate-500">{t("topology.noZones")}</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {zones.map((zone, idx) => (
                          <div key={zone.id} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
                            {/* Zone header */}
                            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100 dark:border-slate-800">
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <div className="h-4 w-4 rounded" style={{ backgroundColor: zone.style.bgColor, opacity: zone.style.bgOpacity + 0.3, border: `2px ${zone.style.borderStyle} ${zone.style.borderColor}` }} />
                                <input
                                  type="text"
                                  value={zone.label}
                                  onChange={(e) => updateZone(idx, { label: e.target.value })}
                                  placeholder={t("topology.zoneLabelPlaceholder")}
                                  className="flex-1 bg-transparent text-sm font-medium text-slate-900 dark:text-slate-100 border-none outline-none placeholder:text-slate-400"
                                />
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <select value={zone.type} onChange={(e) => updateZone(idx, { type: e.target.value as "rectangle" | "ellipse" })} className="rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs font-medium text-slate-700 dark:text-slate-200">
                                  <option value="rectangle">{t("topology.zoneTypeRectangle")}</option>
                                  <option value="ellipse">{t("topology.zoneTypeEllipse")}</option>
                                </select>
                                <button onClick={() => removeZone(idx)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                                  <Trash2 className="h-3.5 w-3.5 text-slate-400 hover:text-red-500" />
                                </button>
                              </div>
                            </div>
                            {/* Zone body */}
                            <div className="p-5 space-y-4">
                              {/* Size + Layer */}
                              <div className="grid grid-cols-3 gap-3">
                                <DesignNumber label={t("topology.zoneWidth")} value={zone.width} min={50} max={1000} step={10} onChange={(v) => updateZone(idx, { width: v })} />
                                <DesignNumber label={t("topology.zoneHeight")} value={zone.height} min={50} max={1000} step={10} onChange={(v) => updateZone(idx, { height: v })} />
                                <DesignNumber label={t("topology.zoneLayer")} value={zone.layer} min={-10} max={10} step={1} onChange={(v) => updateZone(idx, { layer: v })} />
                              </div>
                              {/* Background */}
                              <div className="grid grid-cols-2 gap-3">
                                <DesignColor label={t("topology.zoneBgColor")} value={zone.style.bgColor} onChange={(v) => updateZoneStyle(idx, { bgColor: v })} />
                                <DesignNumber label={t("topology.zoneBgOpacity")} value={zone.style.bgOpacity} min={0} max={1} step={0.05} onChange={(v) => updateZoneStyle(idx, { bgOpacity: v })} />
                              </div>
                              {/* Border */}
                              <div className="grid grid-cols-3 gap-3">
                                <DesignColor label={t("topology.zoneBorderColor")} value={zone.style.borderColor} onChange={(v) => updateZoneStyle(idx, { borderColor: v })} />
                                <DesignNumber label={t("topology.zoneBorderWidth")} value={zone.style.borderWidth} min={0} max={10} step={0.5} onChange={(v) => updateZoneStyle(idx, { borderWidth: v })} />
                                <DesignSelect label={t("topology.zoneBorderStyle")} value={zone.style.borderStyle} onChange={(v) => updateZoneStyle(idx, { borderStyle: v as "solid" | "dashed" | "dotted" })} options={[["solid","Solid"],["dashed","Dashed"],["dotted","Dotted"]]} />
                              </div>
                              <div className="grid grid-cols-2 gap-3">
                                <DesignNumber label={t("topology.zoneBorderRadius")} value={zone.style.borderRadius} min={0} max={50} step={2} onChange={(v) => updateZoneStyle(idx, { borderRadius: v })} />
                              </div>
                              {/* Label style */}
                              <div className="grid grid-cols-3 gap-3">
                                <DesignColor label={t("topology.zoneLabelColor")} value={zone.style.labelColor} onChange={(v) => updateZoneStyle(idx, { labelColor: v })} />
                                <DesignNumber label={t("topology.zoneLabelSize")} value={zone.style.labelSize} min={8} max={32} step={1} onChange={(v) => updateZoneStyle(idx, { labelSize: v })} />
                                <DesignSelect label={t("topology.zoneLabelPosition")} value={zone.style.labelPosition} onChange={(v) => updateZoneStyle(idx, { labelPosition: v as "top" | "center" | "bottom" })} options={[["top","Top"],["center","Center"],["bottom","Bottom"]]} />
                              </div>
                              <div className="grid grid-cols-3 gap-3">
                                <DesignSelect label={t("topology.zoneLabelHalign")} value={zone.style.labelHalign ?? "center"} onChange={(v) => updateZoneStyle(idx, { labelHalign: v as "left" | "center" | "right" })} options={[["left",t("topology.labelAlignLeft")],["center",t("topology.labelAlignCenter")],["right",t("topology.labelAlignRight")]]} />
                                <DesignNumber label={t("topology.zoneLabelOffsetX")} value={zone.style.labelOffsetX ?? 0} min={-500} max={500} step={5} onChange={(v) => updateZoneStyle(idx, { labelOffsetX: v })} />
                                <DesignNumber label={t("topology.zoneLabelOffsetY")} value={zone.style.labelOffsetY ?? 0} min={-500} max={500} step={5} onChange={(v) => updateZoneStyle(idx, { labelOffsetY: v })} />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Design tab */}
                {/* Design > Node */}
                {editTab === "design-node" && (
                  <div className="flex gap-6 h-full">
                    <div className="flex-1 space-y-5 overflow-y-auto min-w-0">
                      <div className="grid grid-cols-2 gap-3">
                        <DesignSelect label={t("topology.designShape")} value={design.node.shape} onChange={(v) => updateDesignNode({ shape: v })}
                          options={[["ellipse","Circle"],["rectangle","Rectangle"],["round-rectangle","Rounded"],["diamond","Diamond"],["hexagon","Hexagon"],["triangle","Triangle"],["star","Star"]]} />
                        <DesignNumber label={t("topology.designNodeWidth")} value={design.node.width} min={10} max={120} step={5} onChange={(v) => updateDesignNode({ width: v })} />
                        <DesignColor label={t("topology.designBgColor")} value={design.node.bgColor} onChange={(v) => updateDesignNode({ bgColor: v })} />
                        <DesignColor label={t("topology.designBorderColor")} value={design.node.borderColor} onChange={(v) => updateDesignNode({ borderColor: v })} />
                        <DesignNumber label={t("topology.designBorderWidth")} value={design.node.borderWidth} min={0} max={10} step={0.5} onChange={(v) => updateDesignNode({ borderWidth: v })} />
                        <DesignNumber label={t("topology.designNodeHeight")} value={design.node.height} min={10} max={120} step={5} onChange={(v) => updateDesignNode({ height: v })} />
                      </div>
                      <div className="flex items-center justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
                        <button onClick={saveDesign} disabled={editSaving} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                          {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {t("common.save")}
                        </button>
                      </div>
                    </div>
                    <div className="w-72 shrink-0">
                      <div className="sticky top-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shadow-sm overflow-hidden">
                        <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("topology.designPreview")}</h3>
                        </div>
                        <DesignPreview design={design} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Design > Link */}
                {editTab === "design-link" && (
                  <div className="flex gap-6 h-full">
                    <div className="flex-1 space-y-5 overflow-y-auto min-w-0">
                      <div className="grid grid-cols-2 gap-3">
                        <DesignNumber label={t("topology.designEdgeWidth")} value={design.edge.width} min={0.5} max={10} step={0.5} onChange={(v) => updateDesignEdge({ width: v })} />
                        <DesignSelect label={t("topology.designEdgeStyle")} value={design.edge.style} onChange={(v) => updateDesignEdge({ style: v })}
                          options={[["solid","Solid"],["dashed","Dashed"],["dotted","Dotted"]]} />
                        <DesignColor label={t("topology.designEdgeColor")} value={design.edge.color} onChange={(v) => updateDesignEdge({ color: v })} />
                        <DesignColor label={t("topology.designEdgeLabelColor")} value={design.edge.labelColor} onChange={(v) => updateDesignEdge({ labelColor: v })} />
                        <DesignNumber label={t("topology.designEdgeLabelSize")} value={design.edge.labelSize} min={6} max={18} step={1} onChange={(v) => updateDesignEdge({ labelSize: v })} />
                      </div>
                      <div className="flex items-center justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
                        <button onClick={saveDesign} disabled={editSaving} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                          {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                          {t("common.save")}
                        </button>
                      </div>
                    </div>
                    <div className="w-72 shrink-0">
                      <div className="sticky top-0 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 shadow-sm overflow-hidden">
                        <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t("topology.designPreview")}</h3>
                        </div>
                        <DesignPreview design={design} />
                      </div>
                    </div>
                  </div>
                )}

                {/* Design > Label */}
                {editTab === "design-label" && (
                  <div className="space-y-5">
                    <LabelEditor
                      elements={design.label.elements}
                      onChange={updateLabelElements}
                      node={design.node}
                    />

                    <div className="flex items-center justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
                      <button onClick={saveDesign} disabled={editSaving} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                        {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t("common.save")}
                      </button>
                    </div>
                  </div>
                )}

                {/* Design > Conditional */}
                {editTab === "design-conditional" && (
                  <div className="space-y-5">
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("topology.designStyleRules")}</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{t("topology.designNoRules")}</p>
                      </div>
                      <button onClick={addStyleRule} className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                        <Plus className="h-3.5 w-3.5" /> {t("topology.designAddRule")}
                      </button>
                    </div>
                    {design.styleRules.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
                        <p className="text-xs text-slate-400 dark:text-slate-500">{t("topology.designNoRulesEmpty")}</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {design.styleRules.map((rule, idx) => (
                          <div key={idx} className="flex items-start gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
                            <div className="flex-1 space-y-3">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-slate-500">{t("topology.designRuleIf")}</span>
                                <select value={rule.condition} onChange={(e) => updateStyleRule(idx, { condition: e.target.value, conditionValue: "", inventoryCategoryId: undefined, inventoryColumn: undefined })} className={`${dInputCls} text-xs w-auto`}>
                                  <option value="protocol">{t("topology.designRuleProtocol")}</option>
                                  <option value="isExternal">{t("topology.designRuleExternal")}</option>
                                  <option value="nodeModel">{t("topology.designRuleModel")}</option>
                                  <option value="nodeManufacturer">{t("topology.designRuleManufacturer")}</option>
                                  <option value="linkInventory">{t("topology.designRuleLinkInventory")}</option>
                                </select>
                                <span className="text-xs text-slate-400">=</span>
                                {rule.condition === "linkInventory" ? (
                                  <div className="flex items-center gap-2 flex-wrap flex-1">
                                    <select value={rule.inventoryCategoryId ?? ""} onChange={(e) => {
                                      const catId = e.target.value ? Number(e.target.value) : undefined;
                                      updateStyleRule(idx, { inventoryCategoryId: catId, inventoryColumn: undefined });
                                      if (catId) loadColumns(catId);
                                    }} className={`${dInputCls} text-xs w-auto`}>
                                      <option value="">{t("topology.selectCategory")}</option>
                                      {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                    {rule.inventoryCategoryId && (columnsByCategory[rule.inventoryCategoryId] ?? []).length > 0 && (
                                      <select value={rule.inventoryColumn ?? ""} onChange={(e) => updateStyleRule(idx, { inventoryColumn: e.target.value || undefined })} className={`${dInputCls} text-xs w-auto`}>
                                        <option value="">{t("topology.selectColumn")}</option>
                                        {(columnsByCategory[rule.inventoryCategoryId] ?? []).map((col) => <option key={col} value={col}>{col}</option>)}
                                      </select>
                                    )}
                                    {rule.inventoryColumn && (
                                      <input type="text" value={rule.conditionValue} onChange={(e) => updateStyleRule(idx, { conditionValue: e.target.value })} placeholder={t("topology.conditionValue")} className={`${dInputCls} text-xs flex-1`} />
                                    )}
                                  </div>
                                ) : rule.condition === "isExternal" ? (
                                  <select value={rule.conditionValue} onChange={(e) => updateStyleRule(idx, { conditionValue: e.target.value })} className={`${dInputCls} text-xs w-auto`}>
                                    <option value="true">{t("topology.designRuleYes")}</option>
                                    <option value="false">{t("topology.designRuleNo")}</option>
                                  </select>
                                ) : rule.condition === "protocol" ? (
                                  <select value={rule.conditionValue} onChange={(e) => updateStyleRule(idx, { conditionValue: e.target.value })} className={`${dInputCls} text-xs w-auto`}>
                                    <option value="lldp">LLDP</option>
                                    <option value="cdp">CDP</option>
                                    <option value="stp">STP</option>
                                    <option value="ospf">OSPF</option>
                                    <option value="bgp">BGP</option>
                                    <option value="isis">ISIS</option>
                                  </select>
                                ) : (
                                  <input type="text" value={rule.conditionValue} onChange={(e) => updateStyleRule(idx, { conditionValue: e.target.value })} placeholder="..." className={`${dInputCls} text-xs flex-1`} />
                                )}
                              </div>
                              <div className="flex items-center gap-3 flex-wrap">
                                <span className="text-xs font-semibold text-slate-500">{t("topology.designRuleThen")}</span>
                                <div className="flex items-center gap-1.5">
                                  <input type="color" value={(rule.style["line-color"] ?? rule.style["background-color"] ?? "#6366f1") as string} onChange={(e) => {
                                    const key = (rule.condition === "protocol" || rule.condition === "linkInventory") ? "line-color" : "background-color";
                                    updateStyleRule(idx, { style: { ...rule.style, [key]: e.target.value } });
                                  }} className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
                                  <span className="text-[10px] text-slate-400">{t("topology.designRuleColor")}</span>
                                </div>
                                {rule.condition === "linkInventory" && (
                                  <div className="flex items-center gap-1.5">
                                    <input type="number" min={0.5} max={20} step={0.5} value={(rule.style["width"] ?? "") as number} onChange={(e) => {
                                      const newStyle = { ...rule.style };
                                      if (e.target.value) newStyle["width"] = Number(e.target.value); else delete newStyle["width"];
                                      updateStyleRule(idx, { style: newStyle });
                                    }} className={`${dInputCls} text-xs w-16`} placeholder="width" />
                                    <span className="text-[10px] text-slate-400">{t("topology.designEdgeWidth")}</span>
                                  </div>
                                )}
                                <select value={(rule.style["line-style"] ?? rule.style["border-style"] ?? "") as string} onChange={(e) => {
                                  const key = (rule.condition === "protocol" || rule.condition === "linkInventory") ? "line-style" : "border-style";
                                  const newStyle = { ...rule.style };
                                  if (e.target.value) newStyle[key] = e.target.value; else delete newStyle[key];
                                  updateStyleRule(idx, { style: newStyle });
                                }} className={`${dInputCls} text-xs w-auto`}>
                                  <option value="">—</option>
                                  <option value="solid">Solid</option>
                                  <option value="dashed">Dashed</option>
                                  <option value="dotted">Dotted</option>
                                </select>
                              </div>
                            </div>
                            <button onClick={() => removeStyleRule(idx)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors shrink-0">
                              <Trash2 className="h-4 w-4 text-slate-400 hover:text-red-500" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-center justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
                      <button onClick={saveDesign} disabled={editSaving} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                        {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t("common.save")}
                      </button>
                    </div>
                  </div>
                )}

                {/* Settings tab */}
                {editTab === "settings" && (
                  <div className="max-w-2xl space-y-6">
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("topology.colName")}</label>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder={t("topology.namePlaceholder")}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("topology.description")}</label>
                      <textarea
                        value={editDescription}
                        onChange={(e) => setEditDescription(e.target.value)}
                        placeholder={t("topology.descriptionPlaceholder")}
                        rows={3}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors resize-none"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">{t("topology.defaultProtocol")}</label>
                      <select
                        value={editDefaultProtocol}
                        onChange={(e) => setEditDefaultProtocol(e.target.value)}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                      >
                        <option value="">{t("topology.protocolAll")}</option>
                        <option value="lldp">LLDP</option>
                        <option value="stp">STP</option>
                        <option value="ospf">OSPF</option>
                        <option value="bgp">BGP</option>
                        <option value="isis">ISIS</option>
                      </select>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{t("topology.defaultProtocolHint")}</p>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                      <button
                        onClick={async () => {
                          if (!selectedMapId || !currentMap) return;
                          if (!confirm(t("topology.confirmDelete", { name: currentMap.name }))) return;
                          const res = await fetch(`/api/topology-maps/${selectedMapId}`, { method: "DELETE" });
                          if (res.ok) {
                            setEditOpen(false);
                            setMaps((prev) => prev.filter((m) => m.id !== selectedMapId));
                            setSelectedMapId(maps.find((m) => m.id !== selectedMapId)?.id ?? null);
                          }
                        }}
                        className="flex items-center gap-2 rounded-lg border border-red-200 dark:border-red-500/20 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("topology.deleteMap")}
                      </button>
                      <button
                        onClick={saveEdit}
                        disabled={editSaving || !editName.trim()}
                        className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
                      >
                        {editSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t("common.save")}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</p>
      <p className={`text-xs text-slate-700 dark:text-slate-200 ${mono ? "font-mono" : ""} break-all`}>{value}</p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function DesignPreview({ design }: { design: any }) {
  const n = design.node;
  const labelEls: LabelElement[] = design.label?.elements ?? [];
  const e = design.edge;

  const svgW = 300;
  const svgH = 320;
  const nodeAx = 90, nodeAy = 100;
  const nodeBx = 210, nodeBy = 200;

  const sampleA: Record<string, string> = { name: "RTR-CORE1", hostname: "RTR-CORE1-01", ipAddress: "10.201.100.41", manufacturer: "Extreme", model: "5520-24T", chassisId: "0c:2d:3d:ab", sysDescr: "VOSS 8.10" };
  const sampleB: Record<string, string> = { name: "RTR-ACCESS1", hostname: "RTR-ACCESS1-01", ipAddress: "10.201.100.43", manufacturer: "Extreme", model: "5520-24T", chassisId: "0c:fa:b2:98", sysDescr: "VOSS 8.10" };

  const renderShape = (cx: number, cy: number) => {
    const w = n.width, h = n.height;
    switch (n.shape) {
      case "rectangle": return <rect x={cx-w/2} y={cy-h/2} width={w} height={h} fill={n.bgColor} stroke={n.borderColor} strokeWidth={n.borderWidth} />;
      case "round-rectangle": return <rect x={cx-w/2} y={cy-h/2} width={w} height={h} rx={8} ry={8} fill={n.bgColor} stroke={n.borderColor} strokeWidth={n.borderWidth} />;
      case "diamond": return <polygon points={`${cx},${cy-h/2} ${cx+w/2},${cy} ${cx},${cy+h/2} ${cx-w/2},${cy}`} fill={n.bgColor} stroke={n.borderColor} strokeWidth={n.borderWidth} />;
      case "hexagon": { const r=w/2; return <polygon points={Array.from({length:6},(_,i)=>{const a=(Math.PI/3)*i-Math.PI/6; return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`;}).join(" ")} fill={n.bgColor} stroke={n.borderColor} strokeWidth={n.borderWidth} />; }
      case "triangle": return <polygon points={`${cx},${cy-h/2} ${cx+w/2},${cy+h/2} ${cx-w/2},${cy+h/2}`} fill={n.bgColor} stroke={n.borderColor} strokeWidth={n.borderWidth} />;
      case "star": { const o=w/2,inn=w/4; return <polygon points={Array.from({length:10},(_,i)=>{const a=(Math.PI/5)*i-Math.PI/2; const r=i%2===0?o:inn; return `${cx+r*Math.cos(a)},${cy+r*Math.sin(a)}`;}).join(" ")} fill={n.bgColor} stroke={n.borderColor} strokeWidth={n.borderWidth} />; }
      default: return <ellipse cx={cx} cy={cy} rx={w/2} ry={h/2} fill={n.bgColor} stroke={n.borderColor} strokeWidth={n.borderWidth} />;
    }
  };

  const renderNodeWithLabels = (cx: number, cy: number, sample: Record<string, string>) => (
    <g>
      {renderShape(cx, cy)}
      {labelEls.map((el, i) => {
        const text = sample[el.field] ?? "";
        if (!text) return null;
        const anchor = el.textAlign === "left" ? "start" : el.textAlign === "right" ? "end" : "middle";
        return (
          <text key={i} x={cx + el.x} y={cy + el.y} textAnchor={anchor} dominantBaseline="central"
            fill={el.color} fontSize={el.fontSize} fontWeight={el.fontWeight} fontFamily={el.fontFamily}
            fontStyle={el.fontStyle === "italic" ? "italic" : "normal"}>
            {text}
          </text>
        );
      })}
    </g>
  );

  const dashArray = e.style === "dashed" ? "8,4" : e.style === "dotted" ? "2,4" : undefined;

  return (
    <svg width={svgW} height={svgH} viewBox={`0 0 ${svgW} ${svgH}`} className="w-full">
      <rect width={svgW} height={svgH} fill="transparent" />
      <line x1={nodeAx} y1={nodeAy} x2={nodeBx} y2={nodeBy} stroke={e.color || "#6366f1"} strokeWidth={e.width} strokeDasharray={dashArray} />
      <text x={(nodeAx+nodeBx)/2} y={(nodeAy+nodeBy)/2 - 8} textAnchor="middle" fill={e.labelColor} fontSize={e.labelSize} fontFamily="sans-serif">1/1 — 1/3</text>
      {renderNodeWithLabels(nodeAx, nodeAy, sampleA)}
      {renderNodeWithLabels(nodeBx, nodeBy, sampleB)}
    </svg>
  );
}

const dInputCls = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const dLabelCls = "block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1";

function DesignColor({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={dLabelCls}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="color" value={value || "#000000"} onChange={(e) => onChange(e.target.value)} className="h-9 w-9 rounded-md border border-slate-200 dark:border-slate-700 cursor-pointer bg-transparent p-0.5" />
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder="#000000" className={`${dInputCls} flex-1 font-mono text-xs`} />
      </div>
    </div>
  );
}

function DesignNumber({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className={dLabelCls}>{label}</label>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 accent-blue-600" />
        <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-8 text-right">{value}</span>
      </div>
    </div>
  );
}

function DesignSelect({ label, value, options, onChange }: { label: string; value: string; options: string[][]; onChange: (v: string) => void }) {
  return (
    <div>
      <label className={dLabelCls}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)} className={dInputCls}>
        {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
      </select>
    </div>
  );
}

function ColSelect({ label, value, cols, onChange, required, placeholder }: { label: string; value: string; cols: string[]; onChange: (v: string) => void; required?: boolean; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
      >
        <option value="">{placeholder ?? "—"}</option>
        {cols.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}
