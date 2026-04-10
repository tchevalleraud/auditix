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
} from "lucide-react";
import LabelEditor, {
  type LabelElement,
  migrateLabelToElements,
} from "@/components/topology/LabelEditor";

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
}

const PROTOCOL_COLORS: Record<string, string> = {
  lldp: "#6366f1",
  stp: "#0ea5e9",
  ospf: "#10b981",
  bgp: "#f59e0b",
  isis: "#ec4899",
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
  interface LinkRule { protocol: string; inventoryCategoryId: number | null; remoteNameColumn: string; remotePortColumn: string; chassisIdColumn: string; mgmtAddressColumn: string; weightColumn: string }
  interface InvCategory { id: number; name: string }
  const [linkRules, setLinkRules] = useState<LinkRule[]>([]);
  const [categories, setCategories] = useState<InvCategory[]>([]);
  const [columnsByCategory, setColumnsByCategory] = useState<Record<number, string[]>>({});
  const [generating, setGenerating] = useState(false);
  const [generateResult, setGenerateResult] = useState<{ linksCreated: number; linksUpdated: number } | null>(null);

  // Design config
  interface StyleRule { condition: string; conditionValue: string; style: Record<string, string | number> }
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
            "text-halign": "center",
            "text-margin-y": z.style.labelPosition === "top" ? 10 : z.style.labelPosition === "bottom" ? -10 : 0,
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
          return {
            data: {
              id: `e${e.id}`,
              source: e.source,
              target: e.target,
              protocol: e.protocol,
              status: e.status ?? "unknown",
              label: portsLabel + weightLabel,
              color: PROTOCOL_COLORS[e.protocol] ?? "#94a3b8",
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
      cy.on("tap", (evt) => { if (evt.target === cy) setSelectedNode(null); });

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

      // --- Label overlay ---
      const overlayDiv = document.createElement("div");
      overlayDiv.style.cssText = "position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:hidden;z-index:1;";
      containerRef.current.style.position = "relative";
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
      // Clean up overlay
      const overlay = containerRef.current?.querySelector("[style*='pointer-events:none']");
      if (overlay) overlay.remove();
    };
  }, [data, selectedMapId]);

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
        const rules = mapData.linkRules?.length ? mapData.linkRules : [];
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
        for (const r of rules) {
          if (r.inventoryCategoryId && !columnsByCategory[r.inventoryCategoryId]) {
            fetch(`/api/inventory-categories/${r.inventoryCategoryId}/columns`)
              .then((res) => res.ok ? res.json() : [])
              .then((cols: string[]) => setColumnsByCategory((prev) => ({ ...prev, [r.inventoryCategoryId]: cols })));
          }
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
  const addLinkRule = () => {
    setLinkRules((prev) => [...prev, { protocol: "lldp", inventoryCategoryId: null, remoteNameColumn: "", remotePortColumn: "", chassisIdColumn: "", mgmtAddressColumn: "", weightColumn: "" }]);
  };

  const updateLinkRule = (idx: number, patch: Partial<LinkRule>) => {
    setLinkRules((prev) => prev.map((r, i) => i === idx ? { ...r, ...patch } : r));
  };

  const removeLinkRule = (idx: number) => {
    setLinkRules((prev) => prev.filter((_, i) => i !== idx));
  };

  const loadColumns = async (categoryId: number) => {
    if (columnsByCategory[categoryId]) return;
    const res = await fetch(`/api/inventory-categories/${categoryId}/columns`);
    if (res.ok) {
      const cols: string[] = await res.json();
      setColumnsByCategory((prev) => ({ ...prev, [categoryId]: cols }));
    }
  };

  const saveLinkRules = async () => {
    if (!selectedMapId) return;
    setEditSaving(true);
    try {
      const res = await fetch(`/api/topology-maps/${selectedMapId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ linkRules }),
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
        body: JSON.stringify({ linkRules }),
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
                          const catName = categories.find((c) => c.id === rule.inventoryCategoryId)?.name;
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
                                <div className="space-y-1.5">
                                  <label className="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("topology.inventoryCategory")}</label>
                                  <select
                                    value={rule.inventoryCategoryId ?? ""}
                                    onChange={(e) => {
                                      const catId = e.target.value ? Number(e.target.value) : null;
                                      updateLinkRule(idx, { inventoryCategoryId: catId, remoteNameColumn: "", remotePortColumn: "", chassisIdColumn: "", mgmtAddressColumn: "", weightColumn: "" });
                                      if (catId) loadColumns(catId);
                                    }}
                                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                                  >
                                    <option value="">{t("topology.selectCategory")}</option>
                                    {categories.map((c) => (
                                      <option key={c.id} value={c.id}>{c.name}</option>
                                    ))}
                                  </select>
                                </div>

                                {rule.inventoryCategoryId && cols.length > 0 && (
                                  <div className="grid grid-cols-2 gap-3">
                                    <ColSelect label={t("topology.colRemoteName")} required value={rule.remoteNameColumn} cols={cols} onChange={(v) => updateLinkRule(idx, { remoteNameColumn: v })} />
                                    <ColSelect label={t("topology.colRemotePort")} value={rule.remotePortColumn} cols={cols} onChange={(v) => updateLinkRule(idx, { remotePortColumn: v })} />
                                    <ColSelect label={t("topology.colChassisId")} value={rule.chassisIdColumn} cols={cols} onChange={(v) => updateLinkRule(idx, { chassisIdColumn: v })} />
                                    <ColSelect label={t("topology.colMgmtAddress")} value={rule.mgmtAddressColumn} cols={cols} onChange={(v) => updateLinkRule(idx, { mgmtAddressColumn: v })} />
                                    <ColSelect label={t("topology.colWeight")} value={rule.weightColumn} cols={cols} onChange={(v) => updateLinkRule(idx, { weightColumn: v })} />
                                  </div>
                                )}

                                {rule.inventoryCategoryId && cols.length === 0 && (
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
                                <select value={rule.condition} onChange={(e) => updateStyleRule(idx, { condition: e.target.value })} className={`${dInputCls} text-xs w-auto`}>
                                  <option value="protocol">{t("topology.designRuleProtocol")}</option>
                                  <option value="isExternal">{t("topology.designRuleExternal")}</option>
                                  <option value="nodeModel">{t("topology.designRuleModel")}</option>
                                  <option value="nodeManufacturer">{t("topology.designRuleManufacturer")}</option>
                                </select>
                                <span className="text-xs text-slate-400">=</span>
                                {rule.condition === "isExternal" ? (
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
                                    const key = rule.condition === "protocol" ? "line-color" : "background-color";
                                    updateStyleRule(idx, { style: { ...rule.style, [key]: e.target.value } });
                                  }} className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
                                  <span className="text-[10px] text-slate-400">{t("topology.designRuleColor")}</span>
                                </div>
                                <select value={(rule.style["line-style"] ?? rule.style["border-style"] ?? "") as string} onChange={(e) => {
                                  const key = rule.condition === "protocol" ? "line-style" : "border-style";
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

                    <div className="flex items-center justify-end pt-4 border-t border-slate-200 dark:border-slate-800">
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

function ColSelect({ label, value, cols, onChange, required }: { label: string; value: string; cols: string[]; onChange: (v: string) => void; required?: boolean }) {
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
        <option value="">—</option>
        {cols.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}
