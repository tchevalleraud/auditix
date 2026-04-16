"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useI18n } from "@/components/I18nProvider";
import { RotateCcw, Loader2 } from "lucide-react";

interface ViewportFrame {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ViewportFrameSelectorProps {
  mapId: number;
  protocol: string;
  frame: ViewportFrame | null;
  onFrameChange: (frame: ViewportFrame | null) => void;
}

interface GraphNode {
  id: string;
  position: { x: number; y: number } | null;
  styleOverride?: { bgColor?: string; shape?: string; width?: number; height?: number } | null;
}

interface GraphEdge {
  id: string;
  source: string;
  target: string;
  protocol: string;
}

interface GraphZone {
  id: string;
  type?: string;
  width?: number;
  height?: number;
  position?: { x: number; y: number } | null;
  style?: { bgColor?: string; bgOpacity?: number; borderColor?: string; borderRadius?: number };
  label?: string;
}

interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  zones: GraphZone[];
  designConfig: {
    node?: { width?: number; height?: number; bgColor?: string; borderColor?: string; shape?: string };
    edge?: { color?: string };
  };
}

const PROTOCOL_COLORS: Record<string, string> = {
  lldp: "#6366f1",
  stp: "#0ea5e9",
  ospf: "#10b981",
  bgp: "#f59e0b",
  isis: "#ec4899",
  manual: "#94a3b8",
};

const MIN_FRAME_SIZE = 50;

type DragMode = "none" | "draw" | "move" | "resize";
type ResizeHandle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w";

export default function ViewportFrameSelector({ mapId, protocol, frame, onFrameChange }: ViewportFrameSelectorProps) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement>(null);
  const [graphData, setGraphData] = useState<GraphData | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragMode, setDragMode] = useState<DragMode>("none");
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [dragFrameStart, setDragFrameStart] = useState<ViewportFrame | null>(null);
  const [resizeHandle, setResizeHandle] = useState<ResizeHandle | null>(null);
  const [tempFrame, setTempFrame] = useState<ViewportFrame | null>(null);

  // Fetch graph data
  useEffect(() => {
    setLoading(true);
    const url = `/api/topology-maps/${mapId}/graph` + (protocol ? `?protocol=${protocol}` : "");
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setGraphData(data))
      .catch(() => setGraphData(null))
      .finally(() => setLoading(false));
  }, [mapId, protocol]);

  // Compute bounding box of the full topology
  const computeBounds = useCallback(() => {
    if (!graphData) return null;
    const nodeConf = graphData.designConfig?.node ?? {};
    const nodeW = nodeConf.width ?? 40;
    const nodeH = nodeConf.height ?? 40;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasPositioned = false;

    for (const n of graphData.nodes) {
      if (!n.position) continue;
      hasPositioned = true;
      const w = (n.styleOverride?.width ?? nodeW) / 2;
      const h = (n.styleOverride?.height ?? nodeH) / 2;
      minX = Math.min(minX, n.position.x - w);
      minY = Math.min(minY, n.position.y - h);
      maxX = Math.max(maxX, n.position.x + w);
      maxY = Math.max(maxY, n.position.y + h);
    }

    for (const z of graphData.zones) {
      const pos = z.position;
      if (!pos) continue;
      const zw = (z.width ?? 200) / 2;
      const zh = (z.height ?? 150) / 2;
      minX = Math.min(minX, pos.x - zw);
      minY = Math.min(minY, pos.y - zh);
      maxX = Math.max(maxX, pos.x + zw);
      maxY = Math.max(maxY, pos.y + zh);
      if (!hasPositioned) hasPositioned = true;
    }

    if (!hasPositioned) return null;

    const pad = 60;
    return { x: minX - pad, y: minY - pad, width: maxX - minX + pad * 2, height: maxY - minY + pad * 2 };
  }, [graphData]);

  const bounds = computeBounds();

  // Convert mouse event to topology coordinates using SVG's built-in matrix
  const toTopoCoords = useCallback(
    (e: React.MouseEvent) => {
      const svg = svgRef.current;
      if (!svg) return { x: 0, y: 0 };
      const ctm = svg.getScreenCTM();
      if (!ctm) return { x: 0, y: 0 };
      const pt = svg.createSVGPoint();
      pt.x = e.clientX;
      pt.y = e.clientY;
      const svgPt = pt.matrixTransform(ctm.inverse());
      return { x: svgPt.x, y: svgPt.y };
    },
    [],
  );

  // Current displayed frame (temp during drag, or saved)
  const displayFrame = tempFrame ?? frame;

  // Detect which handle is under the cursor
  const hitTestHandle = useCallback(
    (tx: number, ty: number): ResizeHandle | null => {
      if (!displayFrame || !bounds) return null;
      const handleSize = bounds.width * 0.02;
      const f = displayFrame;
      const checks: { handle: ResizeHandle; hx: number; hy: number }[] = [
        { handle: "nw", hx: f.x, hy: f.y },
        { handle: "n", hx: f.x + f.width / 2, hy: f.y },
        { handle: "ne", hx: f.x + f.width, hy: f.y },
        { handle: "e", hx: f.x + f.width, hy: f.y + f.height / 2 },
        { handle: "se", hx: f.x + f.width, hy: f.y + f.height },
        { handle: "s", hx: f.x + f.width / 2, hy: f.y + f.height },
        { handle: "sw", hx: f.x, hy: f.y + f.height },
        { handle: "w", hx: f.x, hy: f.y + f.height / 2 },
      ];
      for (const c of checks) {
        if (Math.abs(tx - c.hx) < handleSize && Math.abs(ty - c.hy) < handleSize) return c.handle;
      }
      return null;
    },
    [displayFrame, bounds],
  );

  const isInsideFrame = useCallback(
    (tx: number, ty: number): boolean => {
      if (!displayFrame) return false;
      return tx >= displayFrame.x && tx <= displayFrame.x + displayFrame.width && ty >= displayFrame.y && ty <= displayFrame.y + displayFrame.height;
    },
    [displayFrame],
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const pt = toTopoCoords(e);

      // Check resize handles first
      const handle = hitTestHandle(pt.x, pt.y);
      if (handle && displayFrame) {
        setDragMode("resize");
        setResizeHandle(handle);
        setDragStart(pt);
        setDragFrameStart({ ...displayFrame });
        setTempFrame({ ...displayFrame });
        return;
      }

      // Check if inside frame -> move
      if (isInsideFrame(pt.x, pt.y) && displayFrame) {
        setDragMode("move");
        setDragStart(pt);
        setDragFrameStart({ ...displayFrame });
        setTempFrame({ ...displayFrame });
        return;
      }

      // Otherwise -> draw new frame
      setDragMode("draw");
      setDragStart(pt);
      setTempFrame({ x: pt.x, y: pt.y, width: 0, height: 0 });
    },
    [toTopoCoords, hitTestHandle, isInsideFrame, displayFrame],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (dragMode === "none" || !dragStart) return;
      e.preventDefault();
      const pt = toTopoCoords(e);

      if (dragMode === "draw") {
        const x = Math.min(dragStart.x, pt.x);
        const y = Math.min(dragStart.y, pt.y);
        const w = Math.abs(pt.x - dragStart.x);
        const h = Math.abs(pt.y - dragStart.y);
        setTempFrame({ x, y, width: w, height: h });
      } else if (dragMode === "move" && dragFrameStart) {
        const dx = pt.x - dragStart.x;
        const dy = pt.y - dragStart.y;
        setTempFrame({
          x: dragFrameStart.x + dx,
          y: dragFrameStart.y + dy,
          width: dragFrameStart.width,
          height: dragFrameStart.height,
        });
      } else if (dragMode === "resize" && dragFrameStart && resizeHandle) {
        const dx = pt.x - dragStart.x;
        const dy = pt.y - dragStart.y;
        const f = { ...dragFrameStart };

        if (resizeHandle.includes("w")) {
          f.x = dragFrameStart.x + dx;
          f.width = dragFrameStart.width - dx;
        }
        if (resizeHandle.includes("e")) {
          f.width = dragFrameStart.width + dx;
        }
        if (resizeHandle.includes("n")) {
          f.y = dragFrameStart.y + dy;
          f.height = dragFrameStart.height - dy;
        }
        if (resizeHandle.includes("s")) {
          f.height = dragFrameStart.height + dy;
        }

        // Ensure minimum size
        if (f.width < MIN_FRAME_SIZE) {
          if (resizeHandle.includes("w")) f.x = dragFrameStart.x + dragFrameStart.width - MIN_FRAME_SIZE;
          f.width = MIN_FRAME_SIZE;
        }
        if (f.height < MIN_FRAME_SIZE) {
          if (resizeHandle.includes("n")) f.y = dragFrameStart.y + dragFrameStart.height - MIN_FRAME_SIZE;
          f.height = MIN_FRAME_SIZE;
        }

        setTempFrame(f);
      }
    },
    [dragMode, dragStart, dragFrameStart, resizeHandle, toTopoCoords],
  );

  const handleMouseUp = useCallback(() => {
    if (dragMode === "none") return;

    if (tempFrame && tempFrame.width >= MIN_FRAME_SIZE && tempFrame.height >= MIN_FRAME_SIZE) {
      onFrameChange({
        x: Math.round(tempFrame.x),
        y: Math.round(tempFrame.y),
        width: Math.round(tempFrame.width),
        height: Math.round(tempFrame.height),
      });
    } else if (dragMode === "draw") {
      // Too small, ignore the draw
    }

    setDragMode("none");
    setDragStart(null);
    setDragFrameStart(null);
    setResizeHandle(null);
    setTempFrame(null);
  }, [dragMode, tempFrame, onFrameChange]);

  // Cursor style
  const getCursor = useCallback(
    (e: React.MouseEvent): string => {
      if (dragMode === "move") return "grabbing";
      if (dragMode === "draw") return "crosshair";
      if (dragMode === "resize") {
        if (resizeHandle === "nw" || resizeHandle === "se") return "nwse-resize";
        if (resizeHandle === "ne" || resizeHandle === "sw") return "nesw-resize";
        if (resizeHandle === "n" || resizeHandle === "s") return "ns-resize";
        return "ew-resize";
      }
      const pt = toTopoCoords(e);
      const h = hitTestHandle(pt.x, pt.y);
      if (h) {
        if (h === "nw" || h === "se") return "nwse-resize";
        if (h === "ne" || h === "sw") return "nesw-resize";
        if (h === "n" || h === "s") return "ns-resize";
        return "ew-resize";
      }
      if (isInsideFrame(pt.x, pt.y)) return "grab";
      return "crosshair";
    },
    [dragMode, resizeHandle, toTopoCoords, hitTestHandle, isInsideFrame],
  );

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-400 py-4 justify-center">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t("common.loading")}
      </div>
    );
  }

  if (!graphData || !bounds) return null;

  const nodeConf = graphData.designConfig?.node ?? {};
  const defaultNodeW = nodeConf.width ?? 40;
  const defaultNodeH = nodeConf.height ?? 40;
  const defaultNodeBg = nodeConf.bgColor ?? "#e2e8f0";
  const defaultNodeBorder = nodeConf.borderColor ?? "#3b82f6";
  const defaultShape = nodeConf.shape ?? "ellipse";
  const defaultEdgeColor = graphData.designConfig?.edge?.color ?? "";

  // Build a position lookup for edges
  const posMap = new Map<string, { x: number; y: number }>();
  for (const n of graphData.nodes) {
    if (n.position) posMap.set(n.id, n.position);
  }

  // SVG aspect ratio
  const aspectRatio = bounds.height / bounds.width;
  const svgHeight = Math.min(250, 300 * aspectRatio);

  // Handle sizes in topology coordinates
  const handleRadius = bounds.width * 0.012;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
          {t("structure.topologyViewportFrame")}
        </label>
        {frame && (
          <button
            type="button"
            onClick={() => onFrameChange(null)}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            title={t("structure.topologyViewportFrameReset")}
          >
            <RotateCcw className="h-3 w-3" />
            {t("structure.topologyViewportFrameReset")}
          </button>
        )}
      </div>

      <div
        className="relative rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-900"
        style={{ userSelect: "none" }}
      >
        <svg
          ref={svgRef}
          viewBox={`${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`}
          width="100%"
          style={{ height: svgHeight, display: "block" }}
          onMouseDown={handleMouseDown}
          onMouseMove={(e) => {
            handleMouseMove(e);
            // Update cursor dynamically
            const svg = svgRef.current;
            if (svg) svg.style.cursor = getCursor(e);
          }}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          {/* Background */}
          <rect x={bounds.x} y={bounds.y} width={bounds.width} height={bounds.height} fill="white" className="dark:fill-slate-900" />

          {/* Zones */}
          {graphData.zones.map((z) => {
            if (!z.position) return null;
            const zw = z.width ?? 200;
            const zh = z.height ?? 150;
            const style = z.style ?? {};
            const bg = style.bgColor ?? "#dbeafe";
            const bgOp = style.bgOpacity ?? 0.3;
            const bc = style.borderColor ?? "#3b82f6";
            const br = style.borderRadius ?? 12;
            if (z.type === "ellipse") {
              return (
                <ellipse
                  key={z.id}
                  cx={z.position.x}
                  cy={z.position.y}
                  rx={zw / 2}
                  ry={zh / 2}
                  fill={bg}
                  fillOpacity={bgOp}
                  stroke={bc}
                  strokeWidth={1.5}
                />
              );
            }
            return (
              <rect
                key={z.id}
                x={z.position.x - zw / 2}
                y={z.position.y - zh / 2}
                width={zw}
                height={zh}
                rx={br}
                fill={bg}
                fillOpacity={bgOp}
                stroke={bc}
                strokeWidth={1.5}
              />
            );
          })}

          {/* Edges */}
          {graphData.edges.map((edge) => {
            const sp = posMap.get(edge.source);
            const tp = posMap.get(edge.target);
            if (!sp || !tp) return null;
            const color = PROTOCOL_COLORS[edge.protocol] ?? (defaultEdgeColor || "#94a3b8");
            return <line key={edge.id} x1={sp.x} y1={sp.y} x2={tp.x} y2={tp.y} stroke={color} strokeWidth={1.5} strokeOpacity={0.6} />;
          })}

          {/* Nodes */}
          {graphData.nodes.map((node) => {
            if (!node.position) return null;
            const so = node.styleOverride;
            const w = (so?.width ?? defaultNodeW) / 2;
            const h = (so?.height ?? defaultNodeH) / 2;
            const bg = so?.bgColor ?? defaultNodeBg;
            const shape = so?.shape ?? defaultShape;
            if (shape === "ellipse") {
              return (
                <ellipse
                  key={node.id}
                  cx={node.position.x}
                  cy={node.position.y}
                  rx={w}
                  ry={h}
                  fill={bg}
                  stroke={defaultNodeBorder}
                  strokeWidth={1.5}
                />
              );
            }
            return (
              <rect
                key={node.id}
                x={node.position.x - w}
                y={node.position.y - h}
                width={w * 2}
                height={h * 2}
                rx={shape === "round-rectangle" ? 6 : 0}
                fill={bg}
                stroke={defaultNodeBorder}
                strokeWidth={1.5}
              />
            );
          })}

          {/* Dimming overlay outside the frame */}
          {displayFrame && (
            <>
              {/* Top */}
              <rect x={bounds.x} y={bounds.y} width={bounds.width} height={Math.max(0, displayFrame.y - bounds.y)} fill="black" fillOpacity={0.25} />
              {/* Bottom */}
              <rect
                x={bounds.x}
                y={displayFrame.y + displayFrame.height}
                width={bounds.width}
                height={Math.max(0, bounds.y + bounds.height - (displayFrame.y + displayFrame.height))}
                fill="black"
                fillOpacity={0.25}
              />
              {/* Left */}
              <rect
                x={bounds.x}
                y={displayFrame.y}
                width={Math.max(0, displayFrame.x - bounds.x)}
                height={displayFrame.height}
                fill="black"
                fillOpacity={0.25}
              />
              {/* Right */}
              <rect
                x={displayFrame.x + displayFrame.width}
                y={displayFrame.y}
                width={Math.max(0, bounds.x + bounds.width - (displayFrame.x + displayFrame.width))}
                height={displayFrame.height}
                fill="black"
                fillOpacity={0.25}
              />

              {/* Frame border */}
              <rect
                x={displayFrame.x}
                y={displayFrame.y}
                width={displayFrame.width}
                height={displayFrame.height}
                fill="none"
                stroke="#3b82f6"
                strokeWidth={bounds.width * 0.004}
                strokeDasharray={`${bounds.width * 0.01} ${bounds.width * 0.006}`}
              />

              {/* Resize handles */}
              {[
                { handle: "nw" as const, hx: displayFrame.x, hy: displayFrame.y },
                { handle: "n" as const, hx: displayFrame.x + displayFrame.width / 2, hy: displayFrame.y },
                { handle: "ne" as const, hx: displayFrame.x + displayFrame.width, hy: displayFrame.y },
                { handle: "e" as const, hx: displayFrame.x + displayFrame.width, hy: displayFrame.y + displayFrame.height / 2 },
                { handle: "se" as const, hx: displayFrame.x + displayFrame.width, hy: displayFrame.y + displayFrame.height },
                { handle: "s" as const, hx: displayFrame.x + displayFrame.width / 2, hy: displayFrame.y + displayFrame.height },
                { handle: "sw" as const, hx: displayFrame.x, hy: displayFrame.y + displayFrame.height },
                { handle: "w" as const, hx: displayFrame.x, hy: displayFrame.y + displayFrame.height / 2 },
              ].map(({ handle, hx, hy }) => (
                <circle key={handle} cx={hx} cy={hy} r={handleRadius} fill="white" stroke="#3b82f6" strokeWidth={bounds.width * 0.003} />
              ))}
            </>
          )}
        </svg>
      </div>

      <p className="text-xs text-slate-400 dark:text-slate-500">
        {displayFrame ? t("structure.topologyViewportFrameActive") : t("structure.topologyViewportFrameHint")}
      </p>
    </div>
  );
}
