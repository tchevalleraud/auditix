"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  ArrowDown,
  ArrowDownToLine,
  ArrowRight,
  ArrowUp,
  ArrowUpToLine,
  BringToFront,
  ChevronLeft,
  Circle as CircleIcon,
  Copy,
  Diamond as DiamondIcon,
  Download,
  Hexagon as HexagonIcon,
  Image as ImageIcon,
  Loader2,
  MousePointer2,
  Minus,
  Pencil,
  Redo2,
  SendToBack,
  Settings2,
  Shapes,
  X,
  Spline,
  Square as SquareIcon,
  Trash2,
  Triangle as TriangleIcon,
  Type as TypeIcon,
  Undo2,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import { PluginManagedBanner } from "@/components/PluginManagedBanner";
import ShapeLibraryPanel, { type ShapeLibraryDto, type ShapeLibraryItemDto, type SaveTarget, SHAPE_DND_MIME } from "./ShapeLibraryPanel";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ToolKind =
  | "select"
  | "rectangle"
  | "ellipse"
  | "diamond"
  | "triangle"
  | "hexagon"
  | "line"
  | "arrow"
  | "freedraw"
  | "bezier"
  | "text"
  | "image"
  | "data_label"
  | "node_card_styled"
  | "node_card_table";

type ShapeKind = "rectangle" | "ellipse" | "diamond" | "triangle" | "hexagon";

type DashKind = "solid" | "dashed" | "dotted";
type FillStyleKind = "solid" | "hachure" | "cross-hatch";
type SloppinessKind = "architect" | "artist" | "cartoonist";
type AnchorPosition = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";

const ANCHORS: AnchorPosition[] = ["n", "ne", "e", "se", "s", "sw", "w", "nw"];
const ANCHOR_SNAP_PX = 12;       // world-coord radius for snapping to an anchor
const PARALLEL_LINE_GAP = 8;     // world-coord spacing between parallel lines at same anchor

interface ShapeStyle {
  fill: string;
  stroke: string;
  strokeWidth: number;
  dash: DashKind;
  opacity: number;
  fillOpacity: number;
  borderRadius: number;
  fillStyle?: FillStyleKind;
  sloppiness?: SloppinessKind;
}

interface LineStyle {
  stroke: string;
  strokeWidth: number;
  dash: DashKind;
  opacity: number;
  sloppiness?: SloppinessKind;
}

export interface ShapeElement {
  id: string;
  kind: "shape";
  shape: ShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  style: ShapeStyle;
}

export interface TextElement {
  id: string;
  kind: "text";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  text: string;
  fontSize: number;
  color: string;
  fontFamily: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  textAlign: "left" | "center" | "right";
  bgColor: string | null;
  padding: number;
}

export interface ImageElement {
  id: string;
  kind: "image";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  url: string;
  opacity: number;
}

export type LabelComparisonOperator =
  | "equals" | "not_equals"
  | "contains" | "not_contains"
  | "matches"
  | "greater_than" | "less_than"
  | "is_empty" | "is_not_empty"
  | "exists" | "not_exists";

/**
 * A reference to a node + a field. The `field` follows the same convention
 * as elsewhere in the editor: a builtin name ("hostname", "ipAddress", ...)
 * or "inventory:cat:key:col".
 */
export interface LineLabelDataBinding {
  nodeId: number | null;
  field: string;
}

/**
 * A conditional rule for the pill color. Evaluated top-down — the first rule
 * whose `source` resolves to a value matching `operator`/`value` wins.
 * If no rule matches, the label falls back to `pillColor`.
 */
export interface LineLabelColorRule {
  id: string;
  source: LineLabelDataBinding;
  operator: LabelComparisonOperator;
  value?: string;
  color: string;
}

export interface LineLabel {
  id: string;
  /**
   * "text" = regular text, optionally with a rectangular background (badge).
   * "pill" = small colored pill, fixed size circle/oval.
   */
  kind?: "text" | "pill";
  /** Position along the line, expressed as 0..1 (0 = source endpoint, 1 = target endpoint). */
  t: number;
  /** Static text. Ignored when `dataBinding` is set. */
  text: string;
  /**
   * When set, the label's displayed value is resolved from this node + field
   * (overrides `text`). Eliminates the need for %placeholder% templates.
   */
  dataBinding?: LineLabelDataBinding | null;
  /** Optional explicit node binding for legacy template placeholders. */
  nodeId?: number | null;
  /** Perpendicular offset from the line (positive = below, negative = above, in world units). */
  offset?: number;
  fontSize: number;
  color: string;
  fontWeight: number;
  fontStyle?: "normal" | "italic";
  /** When set, renders the text label with a rounded-rect background. Ignored for kind="pill". */
  bgColor?: string | null;
  /** Stroke around the badge or pill (optional). */
  borderColor?: string | null;
  borderRadius?: number;
  padding?: number;
  /** Pill-specific: fixed diameter (overrides text width). */
  pillSize?: number;
  /** Pill-specific: default fill color (used when no `pillColorRules` matches). */
  pillColor?: string;
  /** Pill-specific: conditional color rules — first matching rule wins. */
  pillColorRules?: LineLabelColorRule[];
}

export interface LineElement {
  id: string;
  kind: "line";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  zIndex: number;
  style: LineStyle;
  arrowStart: boolean;
  arrowEnd: boolean;
  // Anchor binding — when set, x1/y1 (resp. x2/y2) is resolved at render time
  // from the bounded element's anchor instead of being read literally.
  sourceId?: string;
  sourceAnchor?: AnchorPosition;
  targetId?: string;
  targetAnchor?: AnchorPosition;
  labels?: LineLabel[];
}

export interface FreedrawElement {
  id: string;
  kind: "freedraw";
  points: { x: number; y: number }[];
  zIndex: number;
  style: { stroke: string; strokeWidth: number; opacity: number; sloppiness?: SloppinessKind };
}

export interface BezierElement {
  id: string;
  kind: "bezier";
  points: { x: number; y: number; cx1?: number; cy1?: number; cx2?: number; cy2?: number }[];
  zIndex: number;
  style: { stroke: string; strokeWidth: number; dash: DashKind; opacity: number; sloppiness?: SloppinessKind };
}

export interface NodeCardStyledElement {
  id: string;
  kind: "node_card_styled";
  nodeId: number | null;
  x: number;
  y: number;
  zIndex: number;
  design: {
    shape: string;
    width: number;
    height: number;
    bgColor: string;
    borderColor: string;
    borderWidth: number;
    dash?: DashKind;
    fillStyle?: FillStyleKind;
    sloppiness?: SloppinessKind;
    fillOpacity?: number;
    opacity?: number;
    labelElements: Array<{
      field: string;
      x: number;
      y: number;
      fontSize: number;
      color: string;
      fontWeight: number;
      fontFamily: string;
      fontStyle?: string;
      textAlign?: string;
    }>;
  };
}

export interface DataLabelElement {
  id: string;
  kind: "data_label";
  nodeId: number | null;
  field: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  prefix?: string;
  suffix?: string;
  fontSize: number;
  color: string;
  fontFamily: string;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  textAlign: "left" | "center" | "right";
  bgColor: string | null;
  padding: number;
}

export interface NodeCardTableRow {
  field: string;
  label?: string;
  style?: {
    color?: string;
    fontSize?: number;
    fontWeight?: number;
    labelColor?: string;
    monospaced?: boolean;
  };
}

export interface NodeCardTableTitle {
  visible?: boolean;
  template?: string;   // ex: "%hostname% (%ipAddress%)" — %field% placeholders
  color?: string;      // text color (default white)
  fontSize?: number;
  fontWeight?: number;
  bgColor?: string;    // header band background
  align?: "left" | "center" | "right";
}

export interface NodeCardTableElement {
  id: string;
  kind: "node_card_table";
  nodeId: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  rows: NodeCardTableRow[];
  title?: NodeCardTableTitle;
  style: {
    fill: string;
    stroke: string;
    headerColor: string;
    rowFontSize: number;
  };
}

export type SchemaElement =
  | ShapeElement
  | TextElement
  | ImageElement
  | LineElement
  | FreedrawElement
  | BezierElement
  | DataLabelElement
  | NodeCardStyledElement
  | NodeCardTableElement;

interface SchemaPayload {
  id: number;
  name: string;
  description: string | null;
  managedByPlugin: string | null;
  viewport: { pan?: { x: number; y: number }; zoom?: number } | null;
  canvasSize: { width: number; height: number } | null;
  gridSize: number;
  snapToGrid: boolean;
  elements: SchemaElement[];
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SAVE_DEBOUNCE_MS = 800;
const HANDLE_SIZE = 8;
const SELECT_THRESHOLD_PX = 4;

let _idCounter = 0;
const genId = (): string => {
  _idCounter += 1;
  return `el-${Date.now().toString(36)}-${_idCounter.toString(36)}`;
};

const dashFor = (dash: DashKind, w: number): string | undefined => {
  if (dash === "dashed") return `${w * 4},${w * 3}`;
  if (dash === "dotted") return `${w},${w * 2}`;
  return undefined;
};

// Normalise the position of a label to a 0..1 ratio along the line.
// Accepts either the new `t` field or the legacy `position` enum.
const labelT = (label: LineLabel & { position?: "source" | "middle" | "target" }): number => {
  if (typeof label.t === "number") return Math.max(0, Math.min(1, label.t));
  if (label.position === "source") return 0.15;
  if (label.position === "target") return 0.85;
  return 0.5;
};

// For a line label using the LEGACY %placeholder% template mode, resolve which
// node should provide field values (the new dataBinding path skips this).
const resolveLineLabelNodeId = (label: LineLabel, line: LineElement, elementsById: Record<string, SchemaElement>): number | null => {
  if (label.nodeId != null) return label.nodeId;
  const t = labelT(label);
  const bindingId = t < 0.5 ? (line.sourceId ?? line.targetId) : (line.targetId ?? line.sourceId);
  if (!bindingId) return null;
  const el = elementsById[bindingId];
  if (!el) return null;
  if (el.kind === "node_card_styled" || el.kind === "node_card_table") return el.nodeId ?? null;
  return null;
};

// Compare a resolved value against the rule using the same semantics as
// ConditionTreeEvaluator::compareValue() on the backend.
const compareLabelValue = (fieldValue: string | null, operator: LabelComparisonOperator, compareValue: string | undefined): boolean => {
  const fv = fieldValue;
  switch (operator) {
    case "equals":       return String(fv) === String(compareValue ?? "");
    case "not_equals":   return String(fv) !== String(compareValue ?? "");
    case "exists":       return fv !== null;
    case "not_exists":   return fv === null;
    case "contains":     return typeof fv === "string" && fv.includes(String(compareValue ?? ""));
    case "not_contains": return typeof fv !== "string" || !fv.includes(String(compareValue ?? ""));
    case "matches": {
      if (typeof fv !== "string") return false;
      try { return new RegExp(String(compareValue ?? "")).test(fv); } catch { return false; }
    }
    case "greater_than": {
      const a = parseFloat(String(fv));
      const b = parseFloat(String(compareValue ?? ""));
      return !isNaN(a) && !isNaN(b) && a > b;
    }
    case "less_than": {
      const a = parseFloat(String(fv));
      const b = parseFloat(String(compareValue ?? ""));
      return !isNaN(a) && !isNaN(b) && a < b;
    }
    case "is_empty":     return fv === null || fv === "";
    case "is_not_empty": return fv !== null && fv !== "";
  }
};

// Resolve the displayed text of a label.
// - If `dataBinding` is set: read the value directly from the bound node+field
// - Otherwise: keep the legacy %placeholder% template behaviour
const resolveLabelText = (
  label: LineLabel,
  line: LineElement,
  elementsById: Record<string, SchemaElement>,
  resolvedByNode: Record<number, ResolvedNodeData>,
): string => {
  if (label.dataBinding && label.dataBinding.nodeId != null) {
    const nd = resolvedByNode[label.dataBinding.nodeId] ?? null;
    return resolveField(label.dataBinding.field, nd);
  }
  const nodeId = resolveLineLabelNodeId(label, line, elementsById);
  const nd = nodeId != null ? resolvedByNode[nodeId] ?? null : null;
  return resolveTemplate(label.text || "", nd) || label.text || "";
};

// Resolve the pill color, evaluating conditional rules first.
const resolvePillColor = (label: LineLabel, resolvedByNode: Record<number, ResolvedNodeData>): string => {
  const rules = label.pillColorRules ?? [];
  for (const rule of rules) {
    if (rule.source.nodeId == null) continue;
    const nd = resolvedByNode[rule.source.nodeId] ?? null;
    const fv = nd ? resolveField(rule.source.field, nd) : "";
    if (compareLabelValue(fv === "" ? null : fv, rule.operator, rule.value)) {
      return rule.color;
    }
  }
  return label.pillColor ?? "#22c55e";
};

// Bounding box of an element in world coordinates. Returns null for elements
// that don't support anchors (lines, freedraw, bezier, data_label can't be the
// target of an anchored link).
const anchorableBounds = (el: SchemaElement): { x: number; y: number; w: number; h: number } | null => {
  switch (el.kind) {
    case "shape":
    case "image":
    case "node_card_table":
    case "text":
      return { x: el.x, y: el.y, w: el.width, h: el.height };
    case "node_card_styled":
      return { x: el.x - el.design.width / 2, y: el.y - el.design.height / 2, w: el.design.width, h: el.design.height };
    default:
      return null;
  }
};

const isAnchorable = (el: SchemaElement | undefined | null): boolean => !!el && anchorableBounds(el) !== null;

// World coordinates for a given anchor on an element.
const anchorablePoint = (el: SchemaElement, anchor: AnchorPosition): { x: number; y: number } | null => {
  const b = anchorableBounds(el);
  if (!b) return null;
  switch (anchor) {
    case "n":  return { x: b.x + b.w / 2, y: b.y };
    case "ne": return { x: b.x + b.w,     y: b.y };
    case "e":  return { x: b.x + b.w,     y: b.y + b.h / 2 };
    case "se": return { x: b.x + b.w,     y: b.y + b.h };
    case "s":  return { x: b.x + b.w / 2, y: b.y + b.h };
    case "sw": return { x: b.x,           y: b.y + b.h };
    case "w":  return { x: b.x,           y: b.y + b.h / 2 };
    case "nw": return { x: b.x,           y: b.y };
  }
};

// Find the closest anchor of an element at world (x, y), within ANCHOR_SNAP_PX.
const findClosestAnchor = (el: SchemaElement, x: number, y: number, zoom: number): AnchorPosition | null => {
  let best: { anchor: AnchorPosition; d2: number } | null = null;
  const r = ANCHOR_SNAP_PX / Math.max(zoom, 0.1);
  for (const a of ANCHORS) {
    const p = anchorablePoint(el, a);
    if (!p) continue;
    const dx = p.x - x;
    const dy = p.y - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < r * r && (best === null || d2 < best.d2)) best = { anchor: a, d2 };
  }
  return best?.anchor ?? null;
};

// Find the element under (x, y) — only anchorable ones, top-most by zIndex.
const findAnchorableUnder = (elements: SchemaElement[], x: number, y: number): SchemaElement | null => {
  let best: SchemaElement | null = null;
  for (const el of elements) {
    const b = anchorableBounds(el);
    if (!b) continue;
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) {
      if (!best || el.zIndex > best.zIndex) best = el;
    }
  }
  return best;
};

// Perpendicular unit vector for an anchor — used to spread parallel lines.
// For side anchors (n/s/e/w) the tangent is along the side; for corners it's
// at 45° tangent. We return a direction (dx, dy) along which to offset.
const anchorTangent = (anchor: AnchorPosition): { dx: number; dy: number } => {
  switch (anchor) {
    case "n":  return { dx: 1,  dy: 0 };
    case "s":  return { dx: 1,  dy: 0 };
    case "e":  return { dx: 0,  dy: 1 };
    case "w":  return { dx: 0,  dy: 1 };
    case "ne": return { dx: -0.707, dy: 0.707 };
    case "nw": return { dx: 0.707,  dy: 0.707 };
    case "se": return { dx: -0.707, dy: -0.707 };
    case "sw": return { dx: 0.707,  dy: -0.707 };
  }
};

const defaultLabelForField = (field: string): string => {
  if (field.startsWith("inventory:")) {
    const parts = field.slice("inventory:".length).split(":");
    const col = parts[2] ?? "";
    if (col === "__key__") return `${parts[1] ?? ""} (clé)`;
    return parts[1] ?? field;
  }
  return ({
    hostname: "Hostname",
    ipAddress: "IP",
    manufacturer: "Manufacturer",
    model: "Model",
    name: "Name",
  } as Record<string, string>)[field] ?? field;
};

const elementBounds = (el: SchemaElement): { x: number; y: number; w: number; h: number } => {
  switch (el.kind) {
    case "shape":
    case "text":
    case "image":
    case "node_card_table":
    case "data_label":
      return { x: el.x, y: el.y, w: el.width, h: el.height };
    case "node_card_styled":
      return {
        x: el.x - el.design.width / 2,
        y: el.y - el.design.height / 2,
        w: el.design.width,
        h: el.design.height,
      };
    case "line": {
      const x = Math.min(el.x1, el.x2);
      const y = Math.min(el.y1, el.y2);
      return { x, y, w: Math.abs(el.x2 - el.x1), h: Math.abs(el.y2 - el.y1) };
    }
    case "freedraw":
    case "bezier": {
      if (el.points.length === 0) return { x: 0, y: 0, w: 0, h: 0 };
      const xs = el.points.map((p) => p.x);
      const ys = el.points.map((p) => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      return { x: minX, y: minY, w: Math.max(...xs) - minX, h: Math.max(...ys) - minY };
    }
  }
};

/**
 * Strip node-specific data bindings so a saved stencil behaves as a reusable
 * template — the user rebinds nodes after dropping it onto a schema.
 */
const neutralizeNodeBinding = (el: SchemaElement): SchemaElement => {
  if (el.kind === "node_card_styled" || el.kind === "node_card_table" || el.kind === "data_label") {
    return { ...el, nodeId: null } as SchemaElement;
  }
  if (el.kind === "line" && el.labels) {
    return {
      ...el,
      labels: el.labels.map((l) => ({
        ...l,
        nodeId: l.nodeId !== undefined ? null : l.nodeId,
        dataBinding: l.dataBinding ? { ...l.dataBinding, nodeId: null } : l.dataBinding,
      })),
    };
  }
  return el;
};

const translateElement = (el: SchemaElement, dx: number, dy: number): SchemaElement => {
  switch (el.kind) {
    case "shape":
    case "text":
    case "image":
    case "node_card_table":
    case "data_label":
    case "node_card_styled":
      return { ...el, x: el.x + dx, y: el.y + dy } as SchemaElement;
    case "line":
      return { ...el, x1: el.x1 + dx, y1: el.y1 + dy, x2: el.x2 + dx, y2: el.y2 + dy };
    case "freedraw":
      return { ...el, points: el.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) };
    case "bezier":
      return {
        ...el,
        points: el.points.map((p) => ({
          x: p.x + dx,
          y: p.y + dy,
          cx1: p.cx1 !== undefined ? p.cx1 + dx : undefined,
          cy1: p.cy1 !== undefined ? p.cy1 + dy : undefined,
          cx2: p.cx2 !== undefined ? p.cx2 + dx : undefined,
          cy2: p.cy2 !== undefined ? p.cy2 + dy : undefined,
        })),
      };
  }
};

const defaultShapeStyle = (): ShapeStyle => ({
  fill: "#3b82f6",
  stroke: "#1e40af",
  strokeWidth: 1.5,
  dash: "solid",
  opacity: 1,
  fillOpacity: 0.18,
  borderRadius: 6,
  fillStyle: "solid",
  sloppiness: "architect",
});

const defaultLineStyle = (): LineStyle => ({
  stroke: "#1e293b",
  strokeWidth: 2,
  dash: "solid",
  opacity: 1,
  sloppiness: "architect",
});

// Excalidraw-style preset palettes
const STROKE_PALETTE = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00"];
const FILL_PALETTE = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99"];
const TEXT_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#ffffff"];
const STROKE_WIDTH_PRESETS = [1, 2, 4];
const FONT_SIZE_PRESETS = [12, 16, 24, 36];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface Props {
  schemaId: number;
}

interface NodeSummary {
  id: number;
  name: string | null;
  hostname: string | null;
  ipAddress: string;
}

interface InventoryCategoryOption {
  id: number | null;
  name: string;
  keys: string[];
  columns: string[];
}

interface ResolvedNodeData {
  hostname: string | null;
  ipAddress: string;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  inventory: Record<string, Record<string, Record<string, string | null>>>;
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

const resolveField = (field: string, nd: ResolvedNodeData | null): string => {
  if (!nd) return "";
  const inv = parseInventoryField(field);
  if (inv) {
    // Special sentinel: "__key__" returns the key itself (useful when the key
    // carries the meaningful data, e.g. an interface name or a route prefix).
    if (inv.column === "__key__") return inv.key || "";
    return nd.inventory?.[inv.category]?.[inv.key]?.[inv.column] ?? "";
  }
  switch (field) {
    case "hostname": return nd.hostname ?? "";
    case "ipAddress": return nd.ipAddress;
    case "manufacturer": return nd.manufacturer ?? "";
    case "model": return nd.model ?? "";
    case "name": return nd.name ?? "";
    default: return "";
  }
};

// Resolve %placeholder% inside a string template. Placeholders accept any field
// supported by resolveField (builtin or inventory:cat:key:col).
const resolveTemplate = (tpl: string, nd: ResolvedNodeData | null): string => {
  if (!tpl) return "";
  return tpl.replace(/%([^%\s][^%]*)%/g, (_match, field: string) => {
    const value = resolveField(field, nd);
    return value || "";
  });
};

export default function SchemaEditor({ schemaId }: Props) {
  const { t } = useI18n();
  const { current } = useAppContext();

  const [data, setData] = useState<SchemaPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [tool, setTool] = useState<ToolKind>("select");
  const [nodes, setNodes] = useState<NodeSummary[]>([]);
  const [inventoryCategories, setInventoryCategories] = useState<InventoryCategoryOption[]>([]);
  const [resolvedByNode, setResolvedByNode] = useState<Record<number, ResolvedNodeData>>({});

  const [elements, setElements] = useState<SchemaElement[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [past, setPast] = useState<SchemaElement[][]>([]);
  const [future, setFuture] = useState<SchemaElement[][]>([]);
  const clipboard = useRef<SchemaElement[] | null>(null);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [saving, setSaving] = useState(false);
  const [libraries, setLibraries] = useState<ShapeLibraryDto[]>([]);
  const [libraryPanelOpen, setLibraryPanelOpen] = useState(false);

  // Interactions state (refs to avoid re-renders during drag)
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const panStart = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const createStart = useRef<{ x: number; y: number; id: string } | null>(null);
  const dragStart = useRef<{ x: number; y: number; snapshots: Record<string, SchemaElement> } | null>(null);
  const resizeStart = useRef<{ x: number; y: number; corner: "nw" | "ne" | "sw" | "se"; el: SchemaElement } | null>(null);
  const lassoStart = useRef<{ x: number; y: number } | null>(null);
  const [lassoRect, setLassoRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const freedrawCurrent = useRef<string | null>(null);
  // Anchor visualization state — used while line/arrow tool is active OR while
  // dragging a line endpoint.
  const [anchorHover, setAnchorHover] = useState<{ elementId: string; anchor: AnchorPosition | null } | null>(null);
  // Line endpoint drag — repositions one extremity of a selected line, with snap-to-anchor.
  const endpointDrag = useRef<{ lineId: string; end: "src" | "tgt" } | null>(null);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------------------
  // Load
  // ---------------------------------------------------------------------------
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetch(`/api/report-schemas/${schemaId}`)
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((payload: SchemaPayload) => {
        if (!alive) return;
        setData(payload);
        setElements(payload.elements ?? []);
        if (payload.viewport?.pan) setPan(payload.viewport.pan);
        if (typeof payload.viewport?.zoom === "number") setZoom(payload.viewport.zoom);
      })
      .catch(() => { /* not found */ })
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [schemaId]);

  // Load nodes + inventory in one shot for the current context.
  useEffect(() => {
    if (!current) return;
    let alive = true;
    fetch(`/api/report-schemas/nodes?context=${current.id}`)
      .then((r) => r.ok ? r.json() : [])
      .then((rows: Array<NodeSummary & { manufacturer: string | null; model: string | null; inventory: ResolvedNodeData["inventory"] }>) => {
        if (!alive) return;
        const summaries: NodeSummary[] = rows.map((r) => ({ id: r.id, name: r.name, hostname: r.hostname, ipAddress: r.ipAddress }));
        const map: Record<number, ResolvedNodeData> = {};
        for (const r of rows) {
          map[r.id] = {
            hostname: r.hostname,
            ipAddress: r.ipAddress,
            name: r.name,
            manufacturer: r.manufacturer,
            model: r.model,
            inventory: (r.inventory ?? {}) as ResolvedNodeData["inventory"],
          };
        }
        setNodes(summaries);
        setResolvedByNode(map);
      })
      .catch(() => { if (alive) { setNodes([]); setResolvedByNode({}); } });
    fetch(`/api/topologies/inventory-fields?context=${current.id}`)
      .then((r) => r.ok ? r.json() : [])
      .then((rows: InventoryCategoryOption[]) => { if (alive) setInventoryCategories(rows); })
      .catch(() => { if (alive) setInventoryCategories([]); });
    return () => { alive = false; };
  }, [current]);

  // Load reusable shape libraries (stencils) for the current context.
  const refreshLibraries = useCallback(() => {
    if (!current) return;
    fetch(`/api/shape-libraries?context=${current.id}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: ShapeLibraryDto[]) => setLibraries(Array.isArray(rows) ? rows : []))
      .catch(() => setLibraries([]));
  }, [current]);

  useEffect(() => { refreshLibraries(); }, [refreshLibraries]);

  // ---------------------------------------------------------------------------
  // Save (debounced)
  // ---------------------------------------------------------------------------
  const scheduleSave = useCallback((nextElements: SchemaElement[], nextPan?: { x: number; y: number }, nextZoom?: number) => {
    if (!data || data.managedByPlugin) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaving(true);
    saveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/report-schemas/${schemaId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            elements: nextElements,
            viewport: { pan: nextPan ?? pan, zoom: nextZoom ?? zoom },
          }),
        });
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [data, schemaId, pan, zoom]);

  // Update schema-level metadata (name, description) with the same debounce as element saves.
  const metaSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateSchemaMeta = useCallback((patch: { name?: string; description?: string | null }) => {
    let blocked = false;
    setData((cur) => {
      if (!cur || cur.managedByPlugin) { blocked = true; return cur; }
      return { ...cur, ...patch };
    });
    if (blocked) return;
    if (metaSaveTimer.current) clearTimeout(metaSaveTimer.current);
    setSaving(true);
    metaSaveTimer.current = setTimeout(async () => {
      try {
        await fetch(`/api/report-schemas/${schemaId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
  }, [schemaId]);

  const commitElements = useCallback((next: SchemaElement[], pushHistory = true) => {
    if (pushHistory) {
      setPast((p) => [...p.slice(-49), elements]);
      setFuture([]);
    }
    setElements(next);
    scheduleSave(next);
  }, [elements, scheduleSave]);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [elements, ...f.slice(0, 49)]);
      setElements(prev);
      scheduleSave(prev);
      return p.slice(0, -1);
    });
  }, [elements, scheduleSave]);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p.slice(-49), elements]);
      setElements(next);
      scheduleSave(next);
      return f.slice(1);
    });
  }, [elements, scheduleSave]);

  // ---------------------------------------------------------------------------
  // Coordinate transforms
  // ---------------------------------------------------------------------------
  const toWorld = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const w = pt.matrixTransform(ctm.inverse());
    return { x: (w.x - pan.x) / zoom, y: (w.y - pan.y) / zoom };
  }, [pan, zoom]);

  // ---------------------------------------------------------------------------
  // Selection helpers
  // ---------------------------------------------------------------------------
  const selectOnly = useCallback((id: string | null) => {
    setSelectedIds(id ? new Set([id]) : new Set());
  }, []);

  const toggleSelection = useCallback((id: string) => {
    setSelectedIds((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectedElements = useMemo(
    () => elements.filter((el) => selectedIds.has(el.id)),
    [elements, selectedIds],
  );
  const primarySelected = selectedElements[0] ?? null;

  // Map elements by id for O(1) lookup when resolving anchored line endpoints.
  const elementsById = useMemo(() => {
    const m: Record<string, SchemaElement> = {};
    for (const el of elements) m[el.id] = el;
    return m;
  }, [elements]);

  // Index per (elementId|anchor) of how many lines connect there, plus each
  // line's offset slot. Used to spread parallel lines centered on the anchor.
  const anchorOffsets = useMemo(() => {
    type Slot = { line: string; end: "src" | "tgt"; index: number; count: number };
    const slots: Record<string, Slot[]> = {};
    const keyOf = (id: string, anchor: AnchorPosition) => `${id}|${anchor}`;
    for (const el of elements) {
      if (el.kind !== "line") continue;
      if (el.sourceId && el.sourceAnchor) {
        const k = keyOf(el.sourceId, el.sourceAnchor);
        (slots[k] ??= []).push({ line: el.id, end: "src", index: 0, count: 0 });
      }
      if (el.targetId && el.targetAnchor) {
        const k = keyOf(el.targetId, el.targetAnchor);
        (slots[k] ??= []).push({ line: el.id, end: "tgt", index: 0, count: 0 });
      }
    }
    // Assign stable index per slot (sort by line id for determinism)
    const result: Record<string, { offsetIndex: number; count: number }> = {};
    for (const k of Object.keys(slots)) {
      const arr = slots[k];
      arr.sort((a, b) => a.line.localeCompare(b.line));
      const n = arr.length;
      arr.forEach((s, i) => {
        result[`${s.line}|${s.end}`] = { offsetIndex: i - (n - 1) / 2, count: n };
      });
    }
    return result;
  }, [elements]);

  // Resolve the geometric endpoints of a line element, applying anchor lookup
  // and parallel-line offset along the anchor's tangent.
  const resolveLineGeometry = useCallback((line: LineElement) => {
    const resolveEnd = (id: string | undefined, anchor: AnchorPosition | undefined, end: "src" | "tgt", fallback: { x: number; y: number }) => {
      if (!id || !anchor) return fallback;
      const el = elementsById[id];
      if (!el) return fallback;
      const p = anchorablePoint(el, anchor);
      if (!p) return fallback;
      const slot = anchorOffsets[`${line.id}|${end}`];
      if (!slot || slot.count <= 1) return p;
      const t = anchorTangent(anchor);
      return { x: p.x + t.dx * slot.offsetIndex * PARALLEL_LINE_GAP, y: p.y + t.dy * slot.offsetIndex * PARALLEL_LINE_GAP };
    };
    const start = resolveEnd(line.sourceId, line.sourceAnchor, "src", { x: line.x1, y: line.y1 });
    const finish = resolveEnd(line.targetId, line.targetAnchor, "tgt", { x: line.x2, y: line.y2 });
    return { x1: start.x, y1: start.y, x2: finish.x, y2: finish.y };
  }, [elementsById, anchorOffsets]);

  // Collect every (color × fillStyle) pair currently used by hachure/cross-hatch shapes or
  // node_card_styled, so we can emit one <pattern> per unique combination in <defs>.
  const fillPatterns = useMemo(() => {
    const set = new Map<string, { color: string; kind: FillStyleKind }>();
    const addPattern = (color: string, fs: FillStyleKind) => {
      if (fs === "solid") return;
      const id = `${fs}-${color.replace(/[^a-z0-9]/gi, "")}`;
      if (!set.has(id)) set.set(id, { color, kind: fs });
    };
    for (const el of elements) {
      if (el.kind === "shape") {
        addPattern(el.style.fill, el.style.fillStyle ?? "solid");
      } else if (el.kind === "node_card_styled") {
        addPattern(el.design.bgColor, el.design.fillStyle ?? "solid");
      }
    }
    return Array.from(set.entries()).map(([id, v]) => ({ id, ...v }));
  }, [elements]);

  // ---------------------------------------------------------------------------
  // Element CRUD
  // ---------------------------------------------------------------------------
  const pushHistory = useCallback(() => {
    setPast((p) => [...p.slice(-49), elements]);
    setFuture([]);
  }, [elements]);

  const updateElement = useCallback((id: string, patch: Partial<SchemaElement>) => {
    pushHistory();
    setElements((cur) => {
      const next = cur.map((el) => (el.id === id ? ({ ...el, ...patch } as SchemaElement) : el));
      scheduleSave(next);
      return next;
    });
  }, [pushHistory, scheduleSave]);

  const deleteSelection = useCallback(() => {
    if (selectedIds.size === 0) return;
    const next = elements.filter((el) => !selectedIds.has(el.id));
    pushHistory();
    setElements(next);
    setSelectedIds(new Set());
    scheduleSave(next);
  }, [elements, selectedIds, scheduleSave, pushHistory]);

  const duplicateSelection = useCallback(() => {
    if (selectedIds.size === 0) return;
    const clones: SchemaElement[] = elements
      .filter((el) => selectedIds.has(el.id))
      .map((el) => ({ ...translateElement(el, 20, 20), id: genId(), zIndex: el.zIndex + 1 } as SchemaElement));
    const next = [...elements, ...clones];
    pushHistory();
    setElements(next);
    setSelectedIds(new Set(clones.map((c) => c.id)));
    scheduleSave(next);
  }, [elements, selectedIds, pushHistory, scheduleSave]);

  const copySelection = useCallback(() => {
    if (selectedIds.size === 0) return;
    clipboard.current = elements.filter((el) => selectedIds.has(el.id));
  }, [elements, selectedIds]);

  const pasteFromClipboard = useCallback(() => {
    if (!clipboard.current || clipboard.current.length === 0) return;
    const clones: SchemaElement[] = clipboard.current.map((el) => ({ ...translateElement(el, 20, 20), id: genId() } as SchemaElement));
    const next = [...elements, ...clones];
    pushHistory();
    setElements(next);
    setSelectedIds(new Set(clones.map((c) => c.id)));
    scheduleSave(next);
  }, [elements, pushHistory, scheduleSave]);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(elements.map((el) => el.id)));
  }, [elements]);

  const bringToFront = useCallback(() => {
    if (selectedIds.size === 0) return;
    const maxZ = Math.max(0, ...elements.map((el) => el.zIndex));
    const next = elements.map((el) => (selectedIds.has(el.id) ? ({ ...el, zIndex: maxZ + 1 } as SchemaElement) : el));
    pushHistory();
    setElements(next);
    scheduleSave(next);
  }, [elements, selectedIds, pushHistory, scheduleSave]);

  const sendToBack = useCallback(() => {
    if (selectedIds.size === 0) return;
    const minZ = Math.min(0, ...elements.map((el) => el.zIndex));
    const next = elements.map((el) => (selectedIds.has(el.id) ? ({ ...el, zIndex: minZ - 1 } as SchemaElement) : el));
    pushHistory();
    setElements(next);
    scheduleSave(next);
  }, [elements, selectedIds, pushHistory, scheduleSave]);

  const bringForward = useCallback(() => {
    if (selectedIds.size === 0) return;
    const next = elements.map((el) => (selectedIds.has(el.id) ? ({ ...el, zIndex: el.zIndex + 1 } as SchemaElement) : el));
    pushHistory();
    setElements(next);
    scheduleSave(next);
  }, [elements, selectedIds, pushHistory, scheduleSave]);

  const sendBackward = useCallback(() => {
    if (selectedIds.size === 0) return;
    const next = elements.map((el) => (selectedIds.has(el.id) ? ({ ...el, zIndex: el.zIndex - 1 } as SchemaElement) : el));
    pushHistory();
    setElements(next);
    scheduleSave(next);
  }, [elements, selectedIds, pushHistory, scheduleSave]);

  type AlignKind = "left" | "right" | "top" | "bottom" | "centerH" | "centerV";
  const alignSelection = useCallback((kind: AlignKind) => {
    if (selectedIds.size < 2) return;
    const targets = elements.filter((el) => selectedIds.has(el.id));
    const bounds = targets.map((el) => ({ el, b: elementBounds(el) }));
    const minX = Math.min(...bounds.map((b) => b.b.x));
    const maxX = Math.max(...bounds.map((b) => b.b.x + b.b.w));
    const minY = Math.min(...bounds.map((b) => b.b.y));
    const maxY = Math.max(...bounds.map((b) => b.b.y + b.b.h));
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const moves: Record<string, { dx: number; dy: number }> = {};
    for (const { el, b } of bounds) {
      let dx = 0, dy = 0;
      if (kind === "left") dx = minX - b.x;
      else if (kind === "right") dx = maxX - (b.x + b.w);
      else if (kind === "top") dy = minY - b.y;
      else if (kind === "bottom") dy = maxY - (b.y + b.h);
      else if (kind === "centerH") dy = cy - (b.y + b.h / 2);
      else if (kind === "centerV") dx = cx - (b.x + b.w / 2);
      moves[el.id] = { dx, dy };
    }
    const next = elements.map((el) => (moves[el.id] ? translateElement(el, moves[el.id].dx, moves[el.id].dy) : el));
    pushHistory();
    setElements(next);
    scheduleSave(next);
  }, [elements, selectedIds, pushHistory, scheduleSave]);

  type DistributeKind = "horizontal" | "vertical";
  const distributeSelection = useCallback((kind: DistributeKind) => {
    if (selectedIds.size < 3) return;
    const targets = elements
      .filter((el) => selectedIds.has(el.id))
      .map((el) => ({ el, b: elementBounds(el) }));
    targets.sort((a, b) => kind === "horizontal" ? (a.b.x + a.b.w / 2) - (b.b.x + b.b.w / 2) : (a.b.y + a.b.h / 2) - (b.b.y + b.b.h / 2));
    const first = targets[0];
    const last = targets[targets.length - 1];
    const firstC = kind === "horizontal" ? first.b.x + first.b.w / 2 : first.b.y + first.b.h / 2;
    const lastC = kind === "horizontal" ? last.b.x + last.b.w / 2 : last.b.y + last.b.h / 2;
    const step = (lastC - firstC) / (targets.length - 1);
    const moves: Record<string, { dx: number; dy: number }> = {};
    targets.forEach((t, i) => {
      if (i === 0 || i === targets.length - 1) return;
      const wantedC = firstC + step * i;
      const currentC = kind === "horizontal" ? t.b.x + t.b.w / 2 : t.b.y + t.b.h / 2;
      const delta = wantedC - currentC;
      moves[t.el.id] = kind === "horizontal" ? { dx: delta, dy: 0 } : { dx: 0, dy: delta };
    });
    const next = elements.map((el) => (moves[el.id] ? translateElement(el, moves[el.id].dx, moves[el.id].dy) : el));
    pushHistory();
    setElements(next);
    scheduleSave(next);
  }, [elements, selectedIds, pushHistory, scheduleSave]);

  const nextZIndex = useCallback(() => {
    if (elements.length === 0) return 1;
    return Math.max(...elements.map((el) => el.zIndex)) + 1;
  }, [elements]);

  // ---------------------------------------------------------------------------
  // Shape libraries (stencils) — stamping, drop and persistence
  // ---------------------------------------------------------------------------

  // Deep-clone a bundle with fresh ids, remapping internal line references and
  // dropping references that point outside the bundle.
  const remapBundle = useCallback((bundle: SchemaElement[]): SchemaElement[] => {
    const idMap = new Map<string, string>();
    bundle.forEach((el) => idMap.set(el.id, genId()));
    return bundle.map((el) => {
      const clone = JSON.parse(JSON.stringify(el)) as SchemaElement;
      clone.id = idMap.get(el.id)!;
      if (clone.kind === "line") {
        clone.sourceId = clone.sourceId && idMap.has(clone.sourceId) ? idMap.get(clone.sourceId) : undefined;
        clone.targetId = clone.targetId && idMap.has(clone.targetId) ? idMap.get(clone.targetId) : undefined;
        if (!clone.sourceId) clone.sourceAnchor = undefined;
        if (!clone.targetId) clone.targetAnchor = undefined;
      }
      return clone;
    });
  }, []);

  // Stamp a library item onto the canvas centered on (worldX, worldY).
  const placeShapeItem = useCallback((item: ShapeLibraryItemDto, worldX: number, worldY: number) => {
    if (!data || data.managedByPlugin) return;
    const payload = (item.payload ?? []) as unknown as SchemaElement[];
    if (payload.length === 0) return;
    const remapped = remapBundle(payload);
    const baseZ = nextZIndex();
    const ox = worldX - item.width / 2;
    const oy = worldY - item.height / 2;
    const stamped = remapped.map((el, i) => ({ ...translateElement(el, ox, oy), zIndex: baseZ + i } as SchemaElement));
    commitElements([...elements, ...stamped]);
    setSelectedIds(new Set(stamped.map((e) => e.id)));
  }, [data, elements, remapBundle, nextZIndex, commitElements]);

  const findLibraryItem = useCallback((itemId: number): ShapeLibraryItemDto | null => {
    for (const lib of libraries) {
      const found = lib.items.find((it) => it.id === itemId);
      if (found) return found;
    }
    return null;
  }, [libraries]);

  const handleCanvasDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes(SHAPE_DND_MIME)) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleCanvasDrop = useCallback((e: React.DragEvent) => {
    const raw = e.dataTransfer.getData(SHAPE_DND_MIME);
    if (!raw) return;
    e.preventDefault();
    const item = findLibraryItem(Number(raw));
    if (!item) return;
    const w = toWorld(e.clientX, e.clientY);
    placeShapeItem(item, w.x, w.y);
  }, [findLibraryItem, toWorld, placeShapeItem]);

  const placeItemCenter = useCallback((item: ShapeLibraryItemDto) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const w = toWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
    placeShapeItem(item, w.x, w.y);
  }, [toWorld, placeShapeItem]);

  // Normalise the current selection into a reusable stencil payload at origin (0,0).
  const buildSelectionPayload = useCallback((): { payload: SchemaElement[]; width: number; height: number } | null => {
    const els = selectedElements;
    if (els.length === 0) return null;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const el of els) {
      const b = elementBounds(el);
      minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
      maxX = Math.max(maxX, b.x + b.w); maxY = Math.max(maxY, b.y + b.h);
    }
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const ids = new Set(els.map((e) => e.id));
    const payload = els.map((el) => {
      let clone = JSON.parse(JSON.stringify(el)) as SchemaElement;
      if (clone.kind === "line") {
        if (clone.sourceId && !ids.has(clone.sourceId)) { clone.sourceId = undefined; clone.sourceAnchor = undefined; }
        if (clone.targetId && !ids.has(clone.targetId)) { clone.targetId = undefined; clone.targetAnchor = undefined; }
      }
      clone = neutralizeNodeBinding(clone);
      return translateElement(clone, -minX, -minY);
    });
    return { payload, width, height };
  }, [selectedElements]);

  const saveSelectionAsShape = useCallback(async (target: SaveTarget, name: string) => {
    if (!current) return;
    const built = buildSelectionPayload();
    if (!built) return;
    let libraryId: number | null = null;
    if ("libraryId" in target) {
      libraryId = target.libraryId;
    } else {
      const res = await fetch(`/api/shape-libraries?context=${current.id}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: target.newLibraryName }),
      });
      if (!res.ok) return;
      libraryId = (await res.json()).id;
    }
    if (libraryId == null) return;
    await fetch(`/api/shape-libraries/${libraryId}/items`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, payload: built.payload, width: built.width, height: built.height }),
    });
    refreshLibraries();
  }, [current, buildSelectionPayload, refreshLibraries]);

  const createLibrary = useCallback(async (name: string) => {
    if (!current) return;
    await fetch(`/api/shape-libraries?context=${current.id}`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    refreshLibraries();
  }, [current, refreshLibraries]);

  const renameLibrary = useCallback(async (id: number, name: string) => {
    await fetch(`/api/shape-libraries/${id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name }),
    });
    refreshLibraries();
  }, [refreshLibraries]);

  const deleteLibrary = useCallback(async (id: number) => {
    await fetch(`/api/shape-libraries/${id}`, { method: "DELETE" });
    refreshLibraries();
  }, [refreshLibraries]);

  const deleteLibraryItem = useCallback(async (libraryId: number, itemId: number) => {
    await fetch(`/api/shape-libraries/${libraryId}/items/${itemId}`, { method: "DELETE" });
    refreshLibraries();
  }, [refreshLibraries]);

  const uploadIcon = useCallback(async (libraryId: number, file: File) => {
    const fd = new FormData();
    fd.append("image", file);
    await fetch(`/api/shape-libraries/${libraryId}/items/upload`, { method: "POST", body: fd });
    refreshLibraries();
  }, [refreshLibraries]);

  const importStencil = useCallback(async (file: File) => {
    if (!current) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/shape-libraries/import?context=${current.id}`, { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      window.alert(err.error || "Échec de l'import du stencil.");
    }
    refreshLibraries();
  }, [current, refreshLibraries]);

  // ---------------------------------------------------------------------------
  // Tool creation — mouse down on empty canvas
  // ---------------------------------------------------------------------------
  const startCreate = (worldX: number, worldY: number): SchemaElement | null => {
    const z = nextZIndex();
    switch (tool) {
      case "rectangle":
      case "ellipse":
      case "diamond":
      case "triangle":
      case "hexagon":
        return {
          id: genId(),
          kind: "shape",
          shape: tool as ShapeKind,
          x: worldX,
          y: worldY,
          width: 1,
          height: 1,
          rotation: 0,
          zIndex: z,
          style: defaultShapeStyle(),
        };
      case "line":
      case "arrow": {
        // Snap origin to anchor if we're starting near one
        const hit = findAnchorableUnder(elements, worldX, worldY);
        const startAnchor = hit ? findClosestAnchor(hit, worldX, worldY, zoom) : null;
        const start = (hit && startAnchor) ? (anchorablePoint(hit, startAnchor) ?? { x: worldX, y: worldY }) : { x: worldX, y: worldY };
        return {
          id: genId(),
          kind: "line",
          x1: start.x,
          y1: start.y,
          x2: start.x,
          y2: start.y,
          sourceId: (hit && startAnchor) ? hit.id : undefined,
          sourceAnchor: startAnchor ?? undefined,
          zIndex: z,
          style: defaultLineStyle(),
          arrowStart: false,
          arrowEnd: tool === "arrow",
        };
      }
      case "text":
        return {
          id: genId(),
          kind: "text",
          x: worldX,
          y: worldY,
          width: 160,
          height: 32,
          rotation: 0,
          zIndex: z,
          text: "Texte",
          fontSize: 16,
          color: "#1e293b",
          fontFamily: "sans-serif",
          fontWeight: 400,
          fontStyle: "normal",
          textAlign: "left",
          bgColor: null,
          padding: 4,
        };
      case "image":
        return {
          id: genId(),
          kind: "image",
          x: worldX,
          y: worldY,
          width: 200,
          height: 150,
          rotation: 0,
          zIndex: z,
          url: "",
          opacity: 1,
        };
      case "freedraw":
        return {
          id: genId(),
          kind: "freedraw",
          points: [{ x: worldX, y: worldY }],
          zIndex: z,
          style: { stroke: "#1e293b", strokeWidth: 2, opacity: 1 },
        };
      case "bezier":
        return {
          id: genId(),
          kind: "bezier",
          points: [{ x: worldX, y: worldY }, { x: worldX, y: worldY, cx1: worldX, cy1: worldY, cx2: worldX, cy2: worldY }],
          zIndex: z,
          style: { stroke: "#1e293b", strokeWidth: 2, dash: "solid", opacity: 1 },
        };
      case "data_label":
        return {
          id: genId(),
          kind: "data_label",
          nodeId: null,
          field: "hostname",
          x: worldX,
          y: worldY,
          width: 240,
          height: 56,
          rotation: 0,
          zIndex: z,
          prefix: "",
          suffix: "",
          fontSize: 28,
          color: "#1e293b",
          fontFamily: "sans-serif",
          fontWeight: 700,
          fontStyle: "normal",
          textAlign: "center",
          bgColor: null,
          padding: 6,
        };
      case "node_card_styled":
        return {
          id: genId(),
          kind: "node_card_styled",
          nodeId: null,
          x: worldX,
          y: worldY,
          zIndex: z,
          design: {
            shape: "round-rectangle",
            width: 120,
            height: 60,
            bgColor: "#ffffff",
            borderColor: "#94a3b8",
            borderWidth: 0.5,
            labelElements: [
              { field: "hostname", x: 0, y: 0, fontSize: 12, color: "#1e293b", fontWeight: 600, fontFamily: "sans-serif", textAlign: "center" },
            ],
          },
        };
      case "node_card_table":
        return {
          id: genId(),
          kind: "node_card_table",
          nodeId: null,
          x: worldX,
          y: worldY,
          width: 220,
          height: 160,
          zIndex: z,
          rows: [
            { field: "hostname" },
            { field: "ipAddress" },
          ],
          style: { fill: "#ffffff", stroke: "#94a3b8", headerColor: "#1e293b", rowFontSize: 11 },
        };
      default:
        return null;
    }
  };

  // ---------------------------------------------------------------------------
  // Mouse events
  // ---------------------------------------------------------------------------
  const handleSvgMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle-click or Alt+drag = pan
      panStart.current = { x: e.clientX, y: e.clientY, px: pan.x, py: pan.y };
      return;
    }
    if (e.button !== 0) return;

    const w = toWorld(e.clientX, e.clientY);

    if (tool === "select") {
      // Click on empty area → start lasso
      lassoStart.current = w;
      setLassoRect({ x: w.x, y: w.y, w: 0, h: 0 });
      if (!e.shiftKey) setSelectedIds(new Set());
      return;
    }

    // Tool creation
    const el = startCreate(w.x, w.y);
    if (el) {
      pushHistory();
      const next = [...elements, el];
      setElements(next);
      createStart.current = { x: w.x, y: w.y, id: el.id };
      if (el.kind === "freedraw") freedrawCurrent.current = el.id;
    }
  };

  const handleSvgMouseMove = (e: React.MouseEvent) => {
    if (panStart.current) {
      const dx = e.clientX - panStart.current.x;
      const dy = e.clientY - panStart.current.y;
      setPan({ x: panStart.current.px + dx, y: panStart.current.py + dy });
      return;
    }

    // Endpoint drag — reposition one extremity of a line, with snap to anchors.
    if (endpointDrag.current) {
      const w = toWorld(e.clientX, e.clientY);
      const { lineId, end } = endpointDrag.current;
      // Don't allow the endpoint to re-anchor to the line's OTHER endpoint's host (would be weird)
      const candidates = elements.filter((e2) => e2.id !== lineId);
      const hit = findAnchorableUnder(candidates, w.x, w.y);
      const anchor = hit ? findClosestAnchor(hit, w.x, w.y, zoom) : null;
      const point = (hit && anchor) ? (anchorablePoint(hit, anchor) ?? w) : w;
      setAnchorHover(hit ? { elementId: hit.id, anchor } : null);
      setElements((cur) => cur.map((el) => {
        if (el.id !== lineId || el.kind !== "line") return el;
        if (end === "src") {
          return {
            ...el,
            x1: point.x, y1: point.y,
            sourceId: hit && anchor ? hit.id : undefined,
            sourceAnchor: anchor ?? undefined,
          };
        }
        return {
          ...el,
          x2: point.x, y2: point.y,
          targetId: hit && anchor ? hit.id : undefined,
          targetAnchor: anchor ?? undefined,
        };
      }));
      return;
    }

    // Show anchor markers when hovering an anchorable element with the line/arrow tool.
    if (tool === "line" || tool === "arrow") {
      const w = toWorld(e.clientX, e.clientY);
      const hit = findAnchorableUnder(elements, w.x, w.y);
      if (hit) {
        const closest = findClosestAnchor(hit, w.x, w.y, zoom);
        setAnchorHover({ elementId: hit.id, anchor: closest });
      } else if (anchorHover) {
        setAnchorHover(null);
      }
    } else if (anchorHover) {
      setAnchorHover(null);
    }

    if (lassoStart.current) {
      const w = toWorld(e.clientX, e.clientY);
      const x = Math.min(lassoStart.current.x, w.x);
      const y = Math.min(lassoStart.current.y, w.y);
      const width = Math.abs(w.x - lassoStart.current.x);
      const height = Math.abs(w.y - lassoStart.current.y);
      setLassoRect({ x, y, w: width, h: height });
      return;
    }

    if (dragStart.current) {
      const w = toWorld(e.clientX, e.clientY);
      const dx = w.x - dragStart.current.x;
      const dy = w.y - dragStart.current.y;
      const snapshots = dragStart.current.snapshots;
      setElements((cur) => cur.map((el) => {
        const snap = snapshots[el.id];
        if (!snap) return el;
        return translateElement(snap, dx, dy);
      }));
      return;
    }

    if (resizeStart.current) {
      const w = toWorld(e.clientX, e.clientY);
      const dx = w.x - resizeStart.current.x;
      const dy = w.y - resizeStart.current.y;
      const corner = resizeStart.current.corner;
      const orig = resizeStart.current.el;
      setElements((cur) => cur.map((el) => {
        if (el.id !== orig.id) return el;
        if (el.kind === "shape" || el.kind === "text" || el.kind === "image" || el.kind === "node_card_table" || el.kind === "data_label") {
          const ob = elementBounds(orig);
          let nx = ob.x, ny = ob.y, nw = ob.w, nh = ob.h;
          if (corner === "nw") { nx = ob.x + dx; ny = ob.y + dy; nw = ob.w - dx; nh = ob.h - dy; }
          if (corner === "ne") { ny = ob.y + dy; nw = ob.w + dx; nh = ob.h - dy; }
          if (corner === "sw") { nx = ob.x + dx; nw = ob.w - dx; nh = ob.h + dy; }
          if (corner === "se") { nw = ob.w + dx; nh = ob.h + dy; }
          nw = Math.max(8, nw);
          nh = Math.max(8, nh);
          return { ...el, x: nx, y: ny, width: nw, height: nh } as SchemaElement;
        }
        return el;
      }));
      return;
    }

    if (createStart.current) {
      const w = toWorld(e.clientX, e.clientY);
      const dx = w.x - createStart.current.x;
      const dy = w.y - createStart.current.y;
      const id = createStart.current.id;
      setElements((cur) => cur.map((el) => {
        if (el.id !== id) return el;
        if (el.kind === "shape" || el.kind === "text" || el.kind === "image" || el.kind === "node_card_table" || el.kind === "data_label") {
          const nx = dx < 0 ? createStart.current!.x + dx : createStart.current!.x;
          const ny = dy < 0 ? createStart.current!.y + dy : createStart.current!.y;
          return { ...el, x: nx, y: ny, width: Math.max(2, Math.abs(dx)), height: Math.max(2, Math.abs(dy)) } as SchemaElement;
        }
        if (el.kind === "line") {
          // Don't allow a line to anchor to its own source element
          const candidate = findAnchorableUnder(elements.filter((e2) => e2.id !== el.sourceId), w.x, w.y);
          const targetAnchor = candidate ? findClosestAnchor(candidate, w.x, w.y, zoom) : null;
          if (candidate && targetAnchor) {
            const p = anchorablePoint(candidate, targetAnchor) ?? { x: w.x, y: w.y };
            return { ...el, x2: p.x, y2: p.y, targetId: candidate.id, targetAnchor };
          }
          return { ...el, x2: w.x, y2: w.y, targetId: undefined, targetAnchor: undefined };
        }
        if (el.kind === "freedraw") {
          const last = el.points[el.points.length - 1];
          if (last && Math.hypot(w.x - last.x, w.y - last.y) < 1.5) return el;
          return { ...el, points: [...el.points, { x: w.x, y: w.y }] };
        }
        if (el.kind === "bezier") {
          const pts = [...el.points];
          pts[pts.length - 1] = { x: w.x, y: w.y, cx1: createStart.current!.x + dx * 0.33, cy1: createStart.current!.y, cx2: createStart.current!.x + dx * 0.66, cy2: w.y };
          return { ...el, points: pts };
        }
        return el;
      }));
    }
  };

  const handleSvgMouseUp = () => {
    if (panStart.current) {
      panStart.current = null;
      scheduleSave(elements);
      return;
    }
    if (endpointDrag.current) {
      endpointDrag.current = null;
      setAnchorHover(null);
      scheduleSave(elements);
      return;
    }
    if (lassoStart.current && lassoRect) {
      // Resolve lasso → ids touched by rect
      const x0 = lassoRect.x;
      const y0 = lassoRect.y;
      const x1 = lassoRect.x + lassoRect.w;
      const y1 = lassoRect.y + lassoRect.h;
      const isClick = Math.abs(lassoRect.w) < SELECT_THRESHOLD_PX / zoom && Math.abs(lassoRect.h) < SELECT_THRESHOLD_PX / zoom;
      if (!isClick) {
        const hits = new Set<string>();
        for (const el of elements) {
          const b = elementBounds(el);
          if (b.x + b.w >= x0 && b.x <= x1 && b.y + b.h >= y0 && b.y <= y1) hits.add(el.id);
        }
        setSelectedIds(hits);
      }
      lassoStart.current = null;
      setLassoRect(null);
      return;
    }
    if (dragStart.current) {
      dragStart.current = null;
      scheduleSave(elements);
      return;
    }
    if (resizeStart.current) {
      resizeStart.current = null;
      scheduleSave(elements);
      return;
    }
    if (createStart.current) {
      const id = createStart.current.id;
      createStart.current = null;
      freedrawCurrent.current = null;
      // After creating, switch back to select tool and select the new element
      setTool("select");
      selectOnly(id);
      scheduleSave(elements);
    }
  };

  // ---------------------------------------------------------------------------
  // Element interactions
  // ---------------------------------------------------------------------------
  const handleElementMouseDown = (e: React.MouseEvent, el: SchemaElement) => {
    if (tool !== "select") return;
    e.stopPropagation();
    if (e.shiftKey) {
      toggleSelection(el.id);
      return;
    }
    const alreadySelected = selectedIds.has(el.id);
    if (!alreadySelected) selectOnly(el.id);

    // Start drag — snapshot every targeted element so the move computes from t=0.
    // For anchored lines we snapshot their RESOLVED geometry and strip the
    // anchor bindings: dragging a line detaches it (like in Excalidraw) so
    // subsequent x1/y1/x2/y2 updates produce visible movement.
    pushHistory();
    const w = toWorld(e.clientX, e.clientY);
    const targets = alreadySelected ? elements.filter((x) => selectedIds.has(x.id)) : [el];
    const snapshots: Record<string, SchemaElement> = {};
    for (const tgt of targets) {
      if (tgt.kind === "line" && (tgt.sourceId || tgt.targetId)) {
        const geom = resolveLineGeometry(tgt);
        snapshots[tgt.id] = {
          ...tgt,
          x1: geom.x1, y1: geom.y1, x2: geom.x2, y2: geom.y2,
          sourceId: undefined, sourceAnchor: undefined,
          targetId: undefined, targetAnchor: undefined,
        };
      } else {
        snapshots[tgt.id] = { ...tgt } as SchemaElement;
      }
    }
    dragStart.current = { x: w.x, y: w.y, snapshots };
  };

  const handleResizeMouseDown = (e: React.MouseEvent, el: SchemaElement, corner: "nw" | "ne" | "sw" | "se") => {
    e.stopPropagation();
    pushHistory();
    const w = toWorld(e.clientX, e.clientY);
    resizeStart.current = { x: w.x, y: w.y, corner, el: { ...el } as SchemaElement };
  };

  // ---------------------------------------------------------------------------
  // Wheel zoom
  // ---------------------------------------------------------------------------
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newZoom = Math.max(0.1, Math.min(5, zoom * factor));
    // Zoom around cursor
    const rect = svgRef.current?.getBoundingClientRect();
    if (rect) {
      const mx = e.clientX - rect.left;
      const my = e.clientY - rect.top;
      const dx = (mx - pan.x) * (1 - newZoom / zoom);
      const dy = (my - pan.y) * (1 - newZoom / zoom);
      setPan({ x: pan.x + dx, y: pan.y + dy });
    }
    setZoom(newZoom);
    scheduleSave(elements, undefined, newZoom);
  };

  // ---------------------------------------------------------------------------
  // Keyboard
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;

      const mod = e.ctrlKey || e.metaKey;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        deleteSelection();
      } else if (e.key === "Escape") {
        setSelectedIds(new Set());
        setTool("select");
      } else if (mod && (e.key === "z" || e.key === "Z")) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
      } else if (mod && (e.key === "y" || e.key === "Y")) {
        e.preventDefault();
        redo();
      } else if (mod && (e.key === "c" || e.key === "C")) {
        e.preventDefault();
        copySelection();
      } else if (mod && (e.key === "v" || e.key === "V")) {
        e.preventDefault();
        pasteFromClipboard();
      } else if (mod && (e.key === "d" || e.key === "D")) {
        e.preventDefault();
        duplicateSelection();
      } else if (mod && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        selectAll();
      } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) {
        if (selectedIds.size === 0) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const next = elements.map((el) => selectedIds.has(el.id) ? translateElement(el, dx, dy) : el);
        pushHistory();
        setElements(next);
        scheduleSave(next);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selectedIds, elements, deleteSelection, scheduleSave, pushHistory, undo, redo, copySelection, pasteFromClipboard, duplicateSelection, selectAll]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const renderElement = (el: SchemaElement, isSelected: boolean) => {
    const onMouseDown = (e: React.MouseEvent) => handleElementMouseDown(e, el);
    const selStroke = isSelected ? "#3b82f6" : "transparent";
    const selDash = isSelected ? "4,2" : undefined;

    if (el.kind === "shape") {
      const s = el.style;
      const ds = dashFor(s.dash, s.strokeWidth);
      const fillStyle = s.fillStyle ?? "solid";
      const patternId = fillStyle !== "solid" ? `fp-${fillStyle}-${s.fill.replace(/[^a-z0-9]/gi, "")}` : null;
      const common = {
        fill: patternId ? `url(#${patternId})` : s.fill,
        fillOpacity: patternId ? 1 : s.fillOpacity,
        stroke: s.stroke,
        strokeWidth: s.strokeWidth,
        strokeDasharray: ds,
        opacity: s.opacity,
        onMouseDown,
      };
      const shape = (() => {
        switch (el.shape) {
          case "ellipse":
            return <ellipse cx={el.width / 2} cy={el.height / 2} rx={el.width / 2} ry={el.height / 2} {...common} />;
          case "diamond":
            return <polygon points={`${el.width / 2},0 ${el.width},${el.height / 2} ${el.width / 2},${el.height} 0,${el.height / 2}`} {...common} />;
          case "triangle":
            return <polygon points={`${el.width / 2},0 ${el.width},${el.height} 0,${el.height}`} {...common} />;
          case "hexagon": {
            const r = el.width / 2;
            const pts: string[] = [];
            for (let i = 0; i < 6; i++) {
              const a = (Math.PI / 3) * i - Math.PI / 6;
              pts.push(`${r + r * Math.cos(a)},${el.height / 2 + r * Math.sin(a)}`);
            }
            return <polygon points={pts.join(" ")} {...common} />;
          }
          case "rectangle":
          default:
            return <rect width={el.width} height={el.height} rx={s.borderRadius} ry={s.borderRadius} {...common} />;
        }
      })();
      const sloppiness = s.sloppiness ?? "architect";
      const filter = sloppiness === "artist" ? "url(#se-sloppy-artist)" : sloppiness === "cartoonist" ? "url(#se-sloppy-cartoonist)" : undefined;
      return (
        <g key={el.id} transform={`translate(${el.x},${el.y})${el.rotation ? ` rotate(${el.rotation} ${el.width / 2} ${el.height / 2})` : ""}`}>
          <g filter={filter}>{shape}</g>
          {isSelected && <rect x={-2} y={-2} width={el.width + 4} height={el.height + 4} fill="none" stroke={selStroke} strokeDasharray={selDash} strokeWidth={1 / zoom} pointerEvents="none" />}
        </g>
      );
    }

    if (el.kind === "text") {
      const lines = el.text.split(/\r?\n/);
      const lineH = el.fontSize * 1.25;
      const totalH = lines.length * lineH;
      const startY = (el.height - totalH) / 2 + el.fontSize * 0.85;
      const anchor = el.textAlign === "left" ? "start" : el.textAlign === "right" ? "end" : "middle";
      const tx = el.textAlign === "left" ? el.padding : el.textAlign === "right" ? el.width - el.padding : el.width / 2;
      return (
        <g key={el.id} transform={`translate(${el.x},${el.y})${el.rotation ? ` rotate(${el.rotation} ${el.width / 2} ${el.height / 2})` : ""}`}>
          {el.bgColor && <rect width={el.width} height={el.height} fill={el.bgColor} rx="2" onMouseDown={onMouseDown} />}
          <rect width={el.width} height={el.height} fill="transparent" onMouseDown={onMouseDown} />
          {lines.map((line, i) => (
            <text key={i} x={tx} y={startY + i * lineH} textAnchor={anchor} fill={el.color} fontSize={el.fontSize} fontWeight={el.fontWeight} fontFamily={el.fontFamily} fontStyle={el.fontStyle} onMouseDown={onMouseDown} style={{ userSelect: "none" }}>
              {line || " "}
            </text>
          ))}
          {isSelected && <rect width={el.width} height={el.height} fill="none" stroke={selStroke} strokeDasharray={selDash} strokeWidth={1 / zoom} pointerEvents="none" />}
        </g>
      );
    }

    if (el.kind === "image") {
      const hasUrl = !!el.url;
      return (
        <g key={el.id} transform={`translate(${el.x},${el.y})${el.rotation ? ` rotate(${el.rotation} ${el.width / 2} ${el.height / 2})` : ""}`}>
          {hasUrl ? (
            <image href={el.url} width={el.width} height={el.height} opacity={el.opacity} preserveAspectRatio="xMidYMid meet" onMouseDown={onMouseDown} />
          ) : (
            <g onMouseDown={onMouseDown}>
              <rect width={el.width} height={el.height} fill="#f1f5f9" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="6,4" />
              <text x={el.width / 2} y={el.height / 2 + 4} textAnchor="middle" fill="#94a3b8" fontSize="12">Image (sélectionnez « Téléverser »)</text>
            </g>
          )}
          {isSelected && <rect width={el.width} height={el.height} fill="none" stroke={selStroke} strokeDasharray={selDash} strokeWidth={1 / zoom} pointerEvents="none" />}
        </g>
      );
    }

    if (el.kind === "line") {
      const s = el.style;
      const ds = dashFor(s.dash, s.strokeWidth);
      const sloppiness = s.sloppiness ?? "architect";
      const filter = sloppiness === "artist" ? "url(#se-sloppy-artist)" : sloppiness === "cartoonist" ? "url(#se-sloppy-cartoonist)" : undefined;
      const g = resolveLineGeometry(el);
      // Pre-compute line tangent + normal for label positioning
      const len = Math.hypot(g.x2 - g.x1, g.y2 - g.y1) || 1;
      const tx = (g.x2 - g.x1) / len;
      const ty = (g.y2 - g.y1) / len;
      const nx = -ty;
      const ny = tx;
      return (
        <g key={el.id}>
          <g filter={filter}>
            <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke={s.stroke} strokeWidth={s.strokeWidth} strokeDasharray={ds} opacity={s.opacity} markerStart={el.arrowStart ? "url(#se-arrow-start)" : undefined} markerEnd={el.arrowEnd ? "url(#se-arrow-end)" : undefined} onMouseDown={onMouseDown} style={{ color: s.stroke }} />
          </g>
          <line x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} stroke="transparent" strokeWidth={Math.max(s.strokeWidth + 8, 12)} onMouseDown={onMouseDown} />
          {/* Labels along the line — text labels rotate to follow the line's angle (kept readable). */}
          {(() => {
            const angleDeg = (Math.atan2(g.y2 - g.y1, g.x2 - g.x1) * 180) / Math.PI;
            const readableAngle = angleDeg > 90 || angleDeg < -90 ? angleDeg + 180 : angleDeg;
            return (el.labels ?? []).map((lab) => {
              const t = labelT(lab);
              const off = lab.offset ?? 0;
              const cx = g.x1 + tx * len * t + nx * off;
              const cy = g.y1 + ty * len * t + ny * off;
              const text = resolveLabelText(lab, el, elementsById, resolvedByNode);
              const isPill = lab.kind === "pill";
              if (!isPill && !text) return null;
              if (isPill) {
                const size = lab.pillSize ?? Math.max(lab.fontSize * 1.4, 14);
                const fill = resolvePillColor(lab, resolvedByNode);
                return (
                  <g key={lab.id} pointerEvents="none">
                    <circle
                      cx={cx}
                      cy={cy}
                      r={size / 2}
                      fill={fill}
                      stroke={lab.borderColor ?? "#ffffff"}
                      strokeWidth={1.5}
                      style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}
                    />
                    <text
                      x={cx}
                      y={cy + size * 0.32}
                      textAnchor="middle"
                      fill={lab.color}
                      fontSize={size * 0.6}
                      fontWeight={700}
                      style={{ userSelect: "none" }}
                    >
                      {text}
                    </text>
                  </g>
                );
              }
              const charW = lab.fontSize * 0.58;
              const textW = text.length * charW;
              const pad = lab.padding ?? 3;
              const isBadge = !!lab.bgColor;
              const rx = lab.borderRadius ?? (isBadge ? lab.fontSize * 0.6 : 3);
              return (
                <g key={lab.id} pointerEvents="none" transform={`rotate(${readableAngle} ${cx} ${cy})`}>
                  {isBadge && (
                    <rect
                      x={cx - textW / 2 - pad}
                      y={cy - lab.fontSize / 2 - pad}
                      width={textW + pad * 2}
                      height={lab.fontSize + pad * 2}
                      rx={rx}
                      ry={rx}
                      fill={lab.bgColor!}
                      stroke={lab.borderColor ?? "none"}
                      strokeWidth={lab.borderColor ? 0.8 : 0}
                    />
                  )}
                  <text
                    x={cx}
                    y={cy + lab.fontSize * 0.35}
                    textAnchor="middle"
                    fill={lab.color}
                    fontSize={lab.fontSize}
                    fontWeight={lab.fontWeight}
                    fontStyle={lab.fontStyle === "italic" ? "italic" : "normal"}
                    style={{ userSelect: "none" }}
                  >
                    {text}
                  </text>
                </g>
              );
            });
          })()}
          {isSelected && (
            <>
              <circle
                cx={g.x1} cy={g.y1} r={6 / zoom}
                fill={el.sourceId ? "#10b981" : "#3b82f6"}
                stroke="#ffffff"
                strokeWidth={1.5 / zoom}
                style={{ cursor: "crosshair" }}
                onMouseDown={(e) => { e.stopPropagation(); endpointDrag.current = { lineId: el.id, end: "src" }; }}
              />
              <circle
                cx={g.x2} cy={g.y2} r={6 / zoom}
                fill={el.targetId ? "#10b981" : "#3b82f6"}
                stroke="#ffffff"
                strokeWidth={1.5 / zoom}
                style={{ cursor: "crosshair" }}
                onMouseDown={(e) => { e.stopPropagation(); endpointDrag.current = { lineId: el.id, end: "tgt" }; }}
              />
            </>
          )}
        </g>
      );
    }

    if (el.kind === "freedraw") {
      const d = el.points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
      const sloppiness = el.style.sloppiness ?? "architect";
      const filter = sloppiness === "artist" ? "url(#se-sloppy-artist)" : sloppiness === "cartoonist" ? "url(#se-sloppy-cartoonist)" : undefined;
      return (
        <g key={el.id}>
          <g filter={filter}>
            <path d={d} fill="none" stroke={el.style.stroke} strokeWidth={el.style.strokeWidth} opacity={el.style.opacity} strokeLinecap="round" strokeLinejoin="round" onMouseDown={onMouseDown} />
          </g>
          <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(el.style.strokeWidth + 6, 10)} onMouseDown={onMouseDown} />
          {isSelected && (() => {
            const b = elementBounds(el);
            return <rect x={b.x - 2} y={b.y - 2} width={b.w + 4} height={b.h + 4} fill="none" stroke={selStroke} strokeDasharray={selDash} strokeWidth={1 / zoom} pointerEvents="none" />;
          })()}
        </g>
      );
    }

    if (el.kind === "bezier") {
      let d = "";
      el.points.forEach((p, i) => {
        if (i === 0) d += `M ${p.x} ${p.y}`;
        else {
          const cx1 = p.cx1 ?? p.x;
          const cy1 = p.cy1 ?? p.y;
          const cx2 = p.cx2 ?? p.x;
          const cy2 = p.cy2 ?? p.y;
          d += ` C ${cx1} ${cy1} ${cx2} ${cy2} ${p.x} ${p.y}`;
        }
      });
      const ds = dashFor(el.style.dash, el.style.strokeWidth);
      const sloppiness = el.style.sloppiness ?? "architect";
      const filter = sloppiness === "artist" ? "url(#se-sloppy-artist)" : sloppiness === "cartoonist" ? "url(#se-sloppy-cartoonist)" : undefined;
      return (
        <g key={el.id}>
          <g filter={filter}>
            <path d={d} fill="none" stroke={el.style.stroke} strokeWidth={el.style.strokeWidth} strokeDasharray={ds} opacity={el.style.opacity} strokeLinecap="round" onMouseDown={onMouseDown} />
          </g>
          <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(el.style.strokeWidth + 6, 10)} onMouseDown={onMouseDown} />
          {isSelected && (() => {
            const b = elementBounds(el);
            return <rect x={b.x - 2} y={b.y - 2} width={b.w + 4} height={b.h + 4} fill="none" stroke={selStroke} strokeDasharray={selDash} strokeWidth={1 / zoom} pointerEvents="none" />;
          })()}
        </g>
      );
    }

    if (el.kind === "data_label") {
      const nd = el.nodeId ? resolvedByNode[el.nodeId] ?? null : null;
      const raw = resolveField(el.field, nd);
      const text = (el.prefix ?? "") + (raw || (el.field ? `<${el.field}>` : "—")) + (el.suffix ?? "");
      const anchor = el.textAlign === "left" ? "start" : el.textAlign === "right" ? "end" : "middle";
      const tx = el.textAlign === "left" ? el.padding : el.textAlign === "right" ? el.width - el.padding : el.width / 2;
      const ty = el.height / 2 + el.fontSize * 0.35;
      return (
        <g key={el.id} transform={`translate(${el.x},${el.y})${el.rotation ? ` rotate(${el.rotation} ${el.width / 2} ${el.height / 2})` : ""}`}>
          {el.bgColor && <rect width={el.width} height={el.height} fill={el.bgColor} rx="3" onMouseDown={onMouseDown} />}
          <rect width={el.width} height={el.height} fill="transparent" onMouseDown={onMouseDown} />
          <text x={tx} y={ty} textAnchor={anchor} fill={el.color} fontSize={el.fontSize} fontWeight={el.fontWeight} fontFamily={el.fontFamily} fontStyle={el.fontStyle} onMouseDown={onMouseDown} style={{ userSelect: "none" }}>
            {text}
          </text>
          {isSelected && <rect width={el.width} height={el.height} fill="none" stroke={selStroke} strokeDasharray={selDash} strokeWidth={1 / zoom} pointerEvents="none" />}
        </g>
      );
    }

    if (el.kind === "node_card_styled") {
      const d = el.design;
      const w = d.width, h = d.height;
      const nd = el.nodeId ? resolvedByNode[el.nodeId] ?? null : null;
      const fallbackByField: Record<string, string> = { hostname: "hostname", ipAddress: "0.0.0.0", manufacturer: "manufacturer", model: "model", name: "name" };
      const fillStyle = d.fillStyle ?? "solid";
      const patternId = fillStyle !== "solid" ? `fp-${fillStyle}-${d.bgColor.replace(/[^a-z0-9]/gi, "")}` : null;
      const fillResolved = patternId ? `url(#${patternId})` : d.bgColor;
      const fillOp = patternId ? 1 : (d.fillOpacity ?? 1);
      const dashAttr = dashFor(d.dash ?? "solid", d.borderWidth);
      const sloppiness = d.sloppiness ?? "architect";
      const filter = sloppiness === "artist" ? "url(#se-sloppy-artist)" : sloppiness === "cartoonist" ? "url(#se-sloppy-cartoonist)" : undefined;
      const opacity = d.opacity ?? 1;
      const shape = (() => {
        const common = { fill: fillResolved, fillOpacity: fillOp, stroke: d.borderColor, strokeWidth: d.borderWidth, strokeDasharray: dashAttr };
        switch (d.shape) {
          case "rectangle":
            return <rect x={-w / 2} y={-h / 2} width={w} height={h} {...common} />;
          case "diamond":
            return <polygon points={`0,${-h / 2} ${w / 2},0 0,${h / 2} ${-w / 2},0`} {...common} />;
          case "ellipse":
            return <ellipse cx="0" cy="0" rx={w / 2} ry={h / 2} {...common} />;
          case "triangle":
            return <polygon points={`0,${-h / 2} ${w / 2},${h / 2} ${-w / 2},${h / 2}`} {...common} />;
          case "hexagon": {
            const r = w / 2;
            const pts: string[] = [];
            for (let i = 0; i < 6; i++) {
              const a = (Math.PI / 3) * i - Math.PI / 6;
              pts.push(`${r * Math.cos(a)},${r * Math.sin(a)}`);
            }
            return <polygon points={pts.join(" ")} {...common} />;
          }
          case "round-rectangle":
          default:
            return <rect x={-w / 2} y={-h / 2} width={w} height={h} rx="8" ry="8" {...common} />;
        }
      })();
      return (
        <g key={el.id} transform={`translate(${el.x},${el.y})`} opacity={opacity} onMouseDown={onMouseDown}>
          <g filter={filter}>{shape}</g>
          {(d.labelElements ?? []).map((lab, i) => {
            const resolved = resolveField(lab.field, nd);
            const text = resolved || fallbackByField[lab.field] || lab.field;
            const anchor = lab.textAlign === "left" ? "start" : lab.textAlign === "right" ? "end" : "middle";
            return (
              <text key={i} x={lab.x} y={lab.y} textAnchor={anchor} dy={lab.fontSize * 0.35} fill={lab.color} fontSize={lab.fontSize} fontWeight={lab.fontWeight} fontFamily={lab.fontFamily}>
                {text}
              </text>
            );
          })}
          {isSelected && <rect x={-w / 2 - 2} y={-h / 2 - 2} width={w + 4} height={h + 4} fill="none" stroke={selStroke} strokeDasharray={selDash} strokeWidth={1 / zoom} pointerEvents="none" />}
        </g>
      );
    }

    if (el.kind === "node_card_table") {
      const s = el.style;
      const t = el.title ?? {};
      const titleVisible = t.visible !== false;
      const titleBg = t.bgColor ?? s.headerColor;
      const titleColor = t.color ?? "#ffffff";
      const titleFontSize = t.fontSize ?? s.rowFontSize * 1.05;
      const titleFontWeight = t.fontWeight ?? 600;
      const titleAlign = t.align ?? "center";
      const titleTemplate = t.template && t.template !== "" ? t.template : "%hostname%";
      const headerH = titleVisible ? Math.max(18, titleFontSize * 1.6) : 0;
      const rowH = s.rowFontSize * 1.6;
      const nd = el.nodeId ? resolvedByNode[el.nodeId] ?? null : null;
      let titleText = resolveTemplate(titleTemplate, nd);
      if (!titleText) {
        titleText = nd?.hostname || nd?.name || nd?.ipAddress || (el.nodeId ? `Node #${el.nodeId}` : "—");
      }
      const titleAnchor = titleAlign === "left" ? "start" : titleAlign === "right" ? "end" : "middle";
      const titleX = titleAlign === "left" ? 8 : titleAlign === "right" ? el.width - 8 : el.width / 2;
      return (
        <g key={el.id} transform={`translate(${el.x},${el.y})`} onMouseDown={onMouseDown}>
          <rect width={el.width} height={el.height} fill={s.fill} stroke={s.stroke} strokeWidth="0.8" rx="4" ry="4" />
          {titleVisible && (
            <>
              <rect width={el.width} height={headerH} fill={titleBg} rx="4" ry="4" />
              <rect y={headerH - 4} width={el.width} height="4" fill={titleBg} />
              <text x={titleX} y={headerH * 0.7} textAnchor={titleAnchor} fill={titleColor} fontSize={titleFontSize} fontWeight={titleFontWeight}>
                {titleText}
              </text>
            </>
          )}
          {el.rows.map((row, i) => {
            const rs = row.style ?? {};
            const valFs = rs.fontSize ?? s.rowFontSize;
            const valColor = rs.color ?? "#1e293b";
            const labelColor = rs.labelColor ?? "#64748b";
            const labelFontWeight = rs.fontWeight ?? 600;
            const monospaced = rs.monospaced !== false;
            const ty = headerH + rowH * 0.7 + i * rowH;
            const val = resolveField(row.field, nd) || "—";
            const label = row.label || defaultLabelForField(row.field);
            return (
              <g key={i}>
                <text x="8" y={ty} fill={labelColor} fontSize={s.rowFontSize} fontWeight={labelFontWeight}>{label}</text>
                <text x={el.width - 8} y={ty} textAnchor="end" fill={valColor} fontSize={valFs} fontFamily={monospaced ? "monospace" : "sans-serif"}>{val}</text>
              </g>
            );
          })}
          {isSelected && <rect width={el.width} height={el.height} fill="none" stroke={selStroke} strokeDasharray={selDash} strokeWidth={1 / zoom} pointerEvents="none" />}
        </g>
      );
    }

    return null;
  };

  const renderResizeHandles = () => {
    if (selectedElements.length !== 1) return null;
    const el = selectedElements[0];
    const supports = el.kind === "shape" || el.kind === "text" || el.kind === "image" || el.kind === "node_card_table" || el.kind === "data_label";
    if (!supports) return null;
    const b = elementBounds(el);
    const corners: { x: number; y: number; corner: "nw" | "ne" | "sw" | "se" }[] = [
      { x: b.x, y: b.y, corner: "nw" },
      { x: b.x + b.w, y: b.y, corner: "ne" },
      { x: b.x, y: b.y + b.h, corner: "sw" },
      { x: b.x + b.w, y: b.y + b.h, corner: "se" },
    ];
    const size = HANDLE_SIZE / zoom;
    return corners.map((c) => (
      <rect
        key={c.corner}
        x={c.x - size / 2}
        y={c.y - size / 2}
        width={size}
        height={size}
        fill="#ffffff"
        stroke="#3b82f6"
        strokeWidth={1 / zoom}
        style={{ cursor: `${c.corner}-resize` }}
        onMouseDown={(e) => handleResizeMouseDown(e, el, c.corner)}
      />
    ));
  };

  // ---------------------------------------------------------------------------
  // UI
  // ---------------------------------------------------------------------------

  const toolGroups: { kind: ToolKind; icon: React.ReactNode; labelKey: string }[][] = [
    [
      { kind: "select", icon: <MousePointer2 className="h-4 w-4" />, labelKey: "schemas.toolSelect" },
    ],
    [
      { kind: "rectangle", icon: <SquareIcon className="h-4 w-4" />, labelKey: "schemas.toolRectangle" },
      { kind: "ellipse", icon: <CircleIcon className="h-4 w-4" />, labelKey: "schemas.toolEllipse" },
      { kind: "diamond", icon: <DiamondIcon className="h-4 w-4" />, labelKey: "schemas.toolDiamond" },
      { kind: "triangle", icon: <TriangleIcon className="h-4 w-4" />, labelKey: "schemas.toolTriangle" },
      { kind: "hexagon", icon: <HexagonIcon className="h-4 w-4" />, labelKey: "schemas.toolHexagon" },
      { kind: "image", icon: <ImageIcon className="h-4 w-4" />, labelKey: "schemas.toolImage" },
    ],
    [
      { kind: "text", icon: <TypeIcon className="h-4 w-4" />, labelKey: "schemas.toolText" },
      { kind: "freedraw", icon: <Pencil className="h-4 w-4" />, labelKey: "schemas.toolPencil" },
      { kind: "line", icon: <Minus className="h-4 w-4" />, labelKey: "schemas.toolLine" },
      { kind: "arrow", icon: <ArrowRight className="h-4 w-4" />, labelKey: "schemas.toolArrow" },
      { kind: "bezier", icon: <Spline className="h-4 w-4" />, labelKey: "schemas.toolBezier" },
    ],
    [
      { kind: "data_label", icon: <span className="font-bold text-[11px]">{"{}"}</span>, labelKey: "schemas.toolDataLabel" },
      { kind: "node_card_styled", icon: <span className="font-bold text-[10px]">N°</span>, labelKey: "schemas.toolNodeCardStyled" },
      { kind: "node_card_table", icon: <span className="font-bold text-[10px]">N=</span>, labelKey: "schemas.toolNodeCardTable" },
    ],
  ];

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="h-full flex items-center justify-center text-sm text-slate-500">
        Not found
      </div>
    );
  }

  const readOnly = !!data.managedByPlugin;

  return (
    <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950">
      {readOnly && (
        <div className="px-4 pt-3">
          <PluginManagedBanner pluginId={data.managedByPlugin!} />
        </div>
      )}
      {/* Top bar */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2">
        <div className="flex items-center gap-3">
          <Link href="/reports/schemas" className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="font-semibold text-slate-900 dark:text-white">{data.name}</span>
          {saving ? (
            <span className="text-xs text-slate-400 flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />{t("schemas.saving")}</span>
          ) : (
            <span className="text-xs text-slate-400">{t("schemas.saved")}</span>
          )}
          <a
            href={`/api/report-schemas/${schemaId}/export`}
            download
            title="Exporter le schéma en JSON"
            className="ml-2 inline-flex items-center gap-1 rounded-md border border-slate-200 dark:border-slate-700 px-2 py-1 text-[11px] text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Download className="h-3.5 w-3.5" />
            Exporter
          </a>
          <button
            onClick={() => setLibraryPanelOpen((v) => !v)}
            title="Bibliothèques de formes"
            className={`ml-1 inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
              libraryPanelOpen
                ? "border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-700 dark:bg-blue-500/10 dark:text-blue-300"
                : "border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            <Shapes className="h-3.5 w-3.5" />
            Formes
          </button>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={undo} disabled={past.length === 0} title={t("schemas.undo")} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
          <button onClick={redo} disabled={future.length === 0} title={t("schemas.redo")} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
          <button onClick={duplicateSelection} disabled={selectedIds.size === 0} title={t("schemas.duplicate")} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><Copy className="h-4 w-4" /></button>
          <button onClick={bringToFront} disabled={selectedIds.size === 0} title={t("schemas.bringToFront")} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><BringToFront className="h-4 w-4" /></button>
          <button onClick={sendToBack} disabled={selectedIds.size === 0} title={t("schemas.sendToBack")} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><SendToBack className="h-4 w-4" /></button>
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
          <button onClick={() => alignSelection("left")} disabled={selectedIds.size < 2} title={t("schemas.alignLeft")} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><AlignStartVertical className="h-4 w-4" /></button>
          <button onClick={() => alignSelection("centerV")} disabled={selectedIds.size < 2} title={t("schemas.alignVCenter")} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><AlignCenterVertical className="h-4 w-4" /></button>
          <button onClick={() => alignSelection("right")} disabled={selectedIds.size < 2} title={t("schemas.alignRight")} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><AlignEndVertical className="h-4 w-4" /></button>
          <button onClick={() => alignSelection("top")} disabled={selectedIds.size < 2} title={t("schemas.alignTop")} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><AlignStartHorizontal className="h-4 w-4" /></button>
          <button onClick={() => alignSelection("centerH")} disabled={selectedIds.size < 2} title={t("schemas.alignHCenter")} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><AlignCenterHorizontal className="h-4 w-4" /></button>
          <button onClick={() => alignSelection("bottom")} disabled={selectedIds.size < 2} title={t("schemas.alignBottom")} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><AlignEndHorizontal className="h-4 w-4" /></button>
          <button onClick={() => distributeSelection("horizontal")} disabled={selectedIds.size < 3} title={t("schemas.distributeH")} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><AlignHorizontalDistributeCenter className="h-4 w-4" /></button>
          <button onClick={() => distributeSelection("vertical")} disabled={selectedIds.size < 3} title={t("schemas.distributeV")} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-30"><AlignVerticalDistributeCenter className="h-4 w-4" /></button>
          <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
          <button onClick={() => { const z = Math.max(0.1, zoom / 1.2); setZoom(z); scheduleSave(elements, undefined, z); }} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Zoom -"><ZoomOut className="h-4 w-4" /></button>
          <span className="text-xs font-mono text-slate-500 w-12 text-center">{Math.round(zoom * 100)}%</span>
          <button onClick={() => { const z = Math.min(5, zoom * 1.2); setZoom(z); scheduleSave(elements, undefined, z); }} className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800" title="Zoom +"><ZoomIn className="h-4 w-4" /></button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left toolbar */}
        <div className="w-12 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-2 flex flex-col items-center gap-1">
          {toolGroups.map((group, gi) => (
            <Fragment key={gi}>
              {gi > 0 && <div className="w-6 h-px bg-slate-200 dark:bg-slate-700 my-1" />}
              {group.map((tl) => (
                <button
                  key={tl.kind}
                  onClick={() => setTool(tl.kind)}
                  disabled={readOnly && tl.kind !== "select"}
                  title={t(tl.labelKey)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
                    tool === tl.kind
                      ? "bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-300"
                      : "text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                  }`}
                >
                  {tl.icon}
                </button>
              ))}
            </Fragment>
          ))}
        </div>

        {/* Shape library panel */}
        {libraryPanelOpen && (
          <ShapeLibraryPanel
            libraries={libraries}
            onClose={() => setLibraryPanelOpen(false)}
            canSave={!readOnly && selectedElements.length > 0}
            onSaveSelection={saveSelectionAsShape}
            onCreateLibrary={createLibrary}
            onRenameLibrary={renameLibrary}
            onDeleteLibrary={deleteLibrary}
            onDeleteItem={deleteLibraryItem}
            onUpload={uploadIcon}
            onImportStencil={importStencil}
            onPlaceItemCenter={placeItemCenter}
          />
        )}

        {/* Canvas */}
        <div ref={containerRef} className="flex-1 overflow-hidden relative" onDragOver={handleCanvasDragOver} onDrop={handleCanvasDrop} style={{ cursor: panStart.current ? "grabbing" : tool === "select" ? "default" : "crosshair" }}>
          <svg
            ref={svgRef}
            className="w-full h-full"
            onMouseDown={handleSvgMouseDown}
            onMouseMove={handleSvgMouseMove}
            onMouseUp={handleSvgMouseUp}
            onMouseLeave={handleSvgMouseUp}
            onWheel={handleWheel}
          >
            <defs>
              <marker id="se-arrow-end" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
              </marker>
              <marker id="se-arrow-start" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 10 0 L 0 5 L 10 10 z" fill="currentColor" />
              </marker>
              <pattern id="schema-grid" width={data.gridSize} height={data.gridSize} patternUnits="userSpaceOnUse">
                <path d={`M ${data.gridSize} 0 L 0 0 0 ${data.gridSize}`} fill="none" stroke="#e2e8f0" strokeWidth="0.5" opacity="0.5" />
              </pattern>
              {/* Hand-drawn (sloppy) filters — wobble the rendered geometry */}
              <filter id="se-sloppy-artist" x="-10%" y="-10%" width="120%" height="120%">
                <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" />
                <feDisplacementMap in="SourceGraphic" scale="1.4" />
              </filter>
              <filter id="se-sloppy-cartoonist" x="-15%" y="-15%" width="130%" height="130%">
                <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="7" />
                <feDisplacementMap in="SourceGraphic" scale="3" />
              </filter>
              {/* Fill style patterns — generated per (kind × color) combination */}
              {fillPatterns.map((p) => (
                p.kind === "hachure" ? (
                  <pattern key={p.id} id={`fp-${p.id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                    <line x1="0" y1="0" x2="0" y2="6" stroke={p.color} strokeWidth="1.2" />
                  </pattern>
                ) : (
                  <pattern key={p.id} id={`fp-${p.id}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                    <line x1="0" y1="0" x2="0" y2="6" stroke={p.color} strokeWidth="1.2" />
                    <line x1="0" y1="0" x2="6" y2="0" stroke={p.color} strokeWidth="1.2" />
                  </pattern>
                )
              ))}
            </defs>

            <g transform={`translate(${pan.x},${pan.y}) scale(${zoom})`}>
              <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#schema-grid)" />

              {[...elements].sort((a, b) => a.zIndex - b.zIndex).map((el) => renderElement(el, selectedIds.has(el.id)))}

              {renderResizeHandles()}

              {/* Anchor markers — visible when hovering an anchorable element with line/arrow tool,
                  or while dragging a line endpoint. */}
              {(tool === "line" || tool === "arrow" || endpointDrag.current) && anchorHover && (() => {
                const el = elementsById[anchorHover.elementId];
                if (!el) return null;
                return ANCHORS.map((a) => {
                  const p = anchorablePoint(el, a);
                  if (!p) return null;
                  const active = anchorHover.anchor === a;
                  const r = (active ? 6 : 4) / zoom;
                  return (
                    <circle
                      key={a}
                      cx={p.x}
                      cy={p.y}
                      r={r}
                      fill={active ? "#10b981" : "#ffffff"}
                      stroke="#10b981"
                      strokeWidth={1.5 / zoom}
                      style={{ pointerEvents: "none" }}
                    />
                  );
                });
              })()}

              {lassoRect && (
                <rect x={lassoRect.x} y={lassoRect.y} width={lassoRect.w} height={lassoRect.h} fill="#3b82f6" fillOpacity={0.1} stroke="#3b82f6" strokeDasharray="4,2" strokeWidth={1 / zoom} />
              )}
            </g>
          </svg>
        </div>

        {/* Right properties panel */}
        <div className="w-80 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 overflow-y-auto">
          {primarySelected ? (
            <PropertiesPanel
              element={primarySelected}
              onChange={(patch) => updateElement(primarySelected.id, patch)}
              onDelete={deleteSelection}
              onDuplicate={duplicateSelection}
              onBringToFront={bringToFront}
              onBringForward={bringForward}
              onSendBackward={sendBackward}
              onSendToBack={sendToBack}
              nodes={nodes}
              inventoryCategories={inventoryCategories}
              resolvedByNode={resolvedByNode}
            />
          ) : (
            <SchemaInfoPanel
              data={data}
              elementsCount={elements.length}
              onChangeMeta={updateSchemaMeta}
              readOnly={readOnly}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Properties Panel
// ---------------------------------------------------------------------------

interface PropertiesPanelProps {
  element: SchemaElement;
  onChange: (patch: Partial<SchemaElement>) => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onBringToFront: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
  onSendToBack: () => void;
  nodes: NodeSummary[];
  inventoryCategories: InventoryCategoryOption[];
  resolvedByNode: Record<number, ResolvedNodeData>;
}

// ---- Building blocks (Excalidraw-style) ----

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{label}</div>
      {children}
    </div>
  );
}

function ColorSwatches({
  value,
  onChange,
  palette,
  allowTransparent = false,
}: {
  value: string;
  onChange: (v: string) => void;
  palette: string[];
  allowTransparent?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {palette.map((c) => {
        const isTransparent = c === "transparent";
        const active = value.toLowerCase() === c.toLowerCase();
        return (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={`h-7 w-7 rounded-md border ${active ? "ring-2 ring-violet-500 ring-offset-1 dark:ring-offset-slate-900" : "border-slate-200 dark:border-slate-700"} transition-all hover:scale-105`}
            style={isTransparent ? {
              backgroundImage: "linear-gradient(45deg, #cbd5e1 25%, transparent 25%), linear-gradient(-45deg, #cbd5e1 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #cbd5e1 75%), linear-gradient(-45deg, transparent 75%, #cbd5e1 75%)",
              backgroundSize: "8px 8px",
              backgroundPosition: "0 0, 0 4px, 4px -4px, -4px 0",
            } : { backgroundColor: c }}
            title={c}
          />
        );
      })}
      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />
      <label className="relative h-7 w-7 rounded-md border border-slate-200 dark:border-slate-700 cursor-pointer overflow-hidden hover:scale-105 transition-transform" title="Couleur personnalisée">
        <div className="absolute inset-0" style={{ background: "conic-gradient(red, yellow, lime, aqua, blue, magenta, red)" }} />
        <input type="color" value={value === "transparent" ? "#ffffff" : value} onChange={(e) => onChange(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
      </label>
      {allowTransparent && (
        <button type="button" onClick={() => onChange("transparent")} className="text-[10px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200" title="Aucun">∅</button>
      )}
    </div>
  );
}

function ToggleGroup<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label?: string; render?: React.ReactNode; title?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            onClick={() => onChange(opt.value)}
            title={opt.title}
            className={`h-9 min-w-9 px-2 inline-flex items-center justify-center rounded-md border transition-colors ${
              active
                ? "border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-700"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            {opt.render ?? opt.label}
          </button>
        );
      })}
    </div>
  );
}

function PercentSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  // value 0..1, displayed as 0..100
  return (
    <div className="space-y-0.5">
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={Math.round(value * 100)}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className="w-full accent-violet-600"
      />
      <div className="flex justify-between text-[10px] text-slate-400">
        <span>0</span>
        <span className="font-mono">{Math.round(value * 100)}</span>
        <span>100</span>
      </div>
    </div>
  );
}

// Right-panel content when no element is selected — exposes the schema-level
// metadata (name + description) and a few read-only stats.
function SchemaInfoPanel({
  data,
  elementsCount,
  onChangeMeta,
  readOnly = false,
}: {
  data: SchemaPayload;
  elementsCount: number;
  onChangeMeta: (patch: { name?: string; description?: string | null }) => void;
  readOnly?: boolean;
}) {
  const { t, locale } = useI18n();
  const dateLocale =
    locale === "fr" ? "fr-FR"
    : locale === "de" ? "de-DE"
    : locale === "es" ? "es-ES"
    : locale === "it" ? "it-IT"
    : locale === "ja" ? "ja-JP"
    : "en-US";
  return (
    <div className="space-y-4 text-slate-700 dark:text-slate-200">
      <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Schéma</h4>

      <Section label="Nom">
        <input
          type="text"
          value={data.name}
          onChange={(e) => onChangeMeta({ name: e.target.value })}
          disabled={readOnly}
          className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </Section>

      <Section label="Description">
        <textarea
          value={data.description ?? ""}
          onChange={(e) => onChangeMeta({ description: e.target.value || null })}
          rows={4}
          placeholder="Décrivez ce schéma…"
          disabled={readOnly}
          className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs resize-y disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </Section>

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1 text-[11px] text-slate-500">
        <div className="flex justify-between"><span>Éléments</span><span className="font-mono text-slate-700 dark:text-slate-300">{elementsCount}</span></div>
        <div className="flex justify-between"><span>Créé</span><span className="font-mono text-slate-700 dark:text-slate-300">{new Date(data.createdAt).toLocaleString(dateLocale)}</span></div>
        <div className="flex justify-between"><span>Mis à jour</span><span className="font-mono text-slate-700 dark:text-slate-300">{new Date(data.updatedAt).toLocaleString(dateLocale)}</span></div>
      </div>

      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 italic">
        {t("schemas.selectionHint")}
      </div>
    </div>
  );
}

function PropertiesPanel({ element, onChange, onDelete, onDuplicate, onBringToFront, onBringForward, onSendBackward, onSendToBack, nodes, inventoryCategories, resolvedByNode }: PropertiesPanelProps) {
  const { t } = useI18n();

  const setShapeStyle = <K extends keyof ShapeStyle>(key: K, v: ShapeStyle[K]) => {
    if (element.kind !== "shape") return;
    onChange({ style: { ...element.style, [key]: v } } as Partial<SchemaElement>);
  };
  const setLineStyle = <K extends keyof LineStyle>(key: K, v: LineStyle[K]) => {
    if (element.kind !== "line") return;
    onChange({ style: { ...element.style, [key]: v } } as Partial<SchemaElement>);
  };
  const setPathStyle = <K extends keyof FreedrawElement["style"] | keyof BezierElement["style"]>(key: K, v: unknown) => {
    if (element.kind !== "freedraw" && element.kind !== "bezier") return;
    onChange({ style: { ...element.style, [key]: v } } as Partial<SchemaElement>);
  };

  const DASH_OPTIONS = [
    { value: "solid" as const, render: <div className="w-5 h-0.5 bg-current" />, title: "Solid" },
    { value: "dashed" as const, render: <div className="w-5 h-0.5" style={{ backgroundImage: "linear-gradient(to right, currentColor 50%, transparent 50%)", backgroundSize: "4px 100%" }} />, title: "Dashed" },
    { value: "dotted" as const, render: <div className="w-5 h-0.5" style={{ backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1.5px)", backgroundSize: "4px 100%" }} />, title: "Dotted" },
  ];

  const STROKE_W_OPTIONS = [
    { value: 1, render: <div className="w-5 h-px bg-current" />, title: "Fin" },
    { value: 2, render: <div className="w-5 h-[2px] bg-current" />, title: "Moyen" },
    { value: 4, render: <div className="w-5 h-[4px] bg-current" />, title: "Epais" },
  ];

  const ALIGN_OPTIONS = [
    { value: "left" as const, label: "L", title: "Aligner à gauche" },
    { value: "center" as const, label: "C", title: "Centrer" },
    { value: "right" as const, label: "R", title: "Aligner à droite" },
  ];

  // Fill style mini-previews (SVG patterns rendered inline)
  const FILL_STYLE_OPTIONS = [
    {
      value: "hachure" as const,
      title: "Hachures",
      render: (
        <svg width="20" height="20" viewBox="0 0 20 20">
          <defs>
            <pattern id="ps-h" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x="2" y="2" width="16" height="16" fill="url(#ps-h)" stroke="currentColor" strokeWidth="0.7" />
        </svg>
      ),
    },
    {
      value: "cross-hatch" as const,
      title: "Hachures croisées",
      render: (
        <svg width="20" height="20" viewBox="0 0 20 20">
          <defs>
            <pattern id="ps-c" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
              <line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" strokeWidth="1" />
              <line x1="0" y1="0" x2="4" y2="0" stroke="currentColor" strokeWidth="1" />
            </pattern>
          </defs>
          <rect x="2" y="2" width="16" height="16" fill="url(#ps-c)" stroke="currentColor" strokeWidth="0.7" />
        </svg>
      ),
    },
    {
      value: "solid" as const,
      title: "Plein",
      render: <div className="w-4 h-4 rounded-sm bg-current" />,
    },
  ];

  // Sloppiness preview lines
  const SLOPPINESS_OPTIONS = [
    {
      value: "architect" as const,
      title: "Architecte (propre)",
      render: (
        <svg width="22" height="14" viewBox="0 0 22 14">
          <path d="M 2 7 Q 11 7 20 7" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      value: "artist" as const,
      title: "Artiste",
      render: (
        <svg width="22" height="14" viewBox="0 0 22 14">
          <path d="M 2 7 C 5 5 9 9 12 7 C 15 5 18 9 20 7" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ),
    },
    {
      value: "cartoonist" as const,
      title: "Caricaturiste",
      render: (
        <svg width="22" height="14" viewBox="0 0 22 14">
          <path d="M 2 7 C 4 3 7 11 10 6 C 13 2 16 12 20 7" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
        </svg>
      ),
    },
  ];

  return (
    <div className="space-y-4 text-slate-700 dark:text-slate-200">
      {/* SHAPE */}
      {element.kind === "shape" && (
        <>
          <Section label={t("schemas.stroke")}>
            <ColorSwatches value={element.style.stroke} onChange={(v) => setShapeStyle("stroke", v)} palette={STROKE_PALETTE} />
          </Section>

          <Section label={t("schemas.fill")}>
            <ColorSwatches value={element.style.fill} onChange={(v) => setShapeStyle("fill", v)} palette={FILL_PALETTE} allowTransparent />
          </Section>

          <Section label="Remplissage">
            <ToggleGroup
              value={element.style.fillStyle ?? "solid"}
              options={FILL_STYLE_OPTIONS}
              onChange={(v) => setShapeStyle("fillStyle", v)}
            />
          </Section>

          {(element.style.fillStyle ?? "solid") === "solid" && (
            <Section label={t("schemas.fillOpacity")}>
              <PercentSlider value={element.style.fillOpacity} onChange={(v) => setShapeStyle("fillOpacity", v)} />
            </Section>
          )}

          <Section label={t("schemas.strokeWidth")}>
            <ToggleGroup value={element.style.strokeWidth} options={STROKE_W_OPTIONS} onChange={(v) => setShapeStyle("strokeWidth", v)} />
          </Section>

          <Section label={t("schemas.dash")}>
            <ToggleGroup value={element.style.dash} options={DASH_OPTIONS} onChange={(v) => setShapeStyle("dash", v)} />
          </Section>

          {element.shape === "rectangle" && (
            <Section label={t("schemas.borderRadius")}>
              <ToggleGroup
                value={element.style.borderRadius === 0 ? 0 : 1}
                options={[
                  { value: 0, render: <SquareIcon className="h-4 w-4" />, title: "Sharp" },
                  { value: 1, render: <span className="h-4 w-4 inline-block rounded-md border-2 border-current" />, title: "Rounded" },
                ]}
                onChange={(v) => setShapeStyle("borderRadius", v === 0 ? 0 : 8)}
              />
            </Section>
          )}

          <Section label="Style de tracé">
            <ToggleGroup
              value={element.style.sloppiness ?? "architect"}
              options={SLOPPINESS_OPTIONS}
              onChange={(v) => setShapeStyle("sloppiness", v)}
            />
          </Section>

          <Section label={t("schemas.opacity")}>
            <PercentSlider value={element.style.opacity} onChange={(v) => setShapeStyle("opacity", v)} />
          </Section>
        </>
      )}

      {/* LINE */}
      {element.kind === "line" && (
        <>
          <Section label={t("schemas.stroke")}>
            <ColorSwatches value={element.style.stroke} onChange={(v) => setLineStyle("stroke", v)} palette={STROKE_PALETTE} />
          </Section>

          <Section label={t("schemas.strokeWidth")}>
            <ToggleGroup value={element.style.strokeWidth} options={STROKE_W_OPTIONS} onChange={(v) => setLineStyle("strokeWidth", v)} />
          </Section>

          <Section label={t("schemas.dash")}>
            <ToggleGroup value={element.style.dash} options={DASH_OPTIONS} onChange={(v) => setLineStyle("dash", v)} />
          </Section>

          <Section label="Fleche">
            <div className="flex items-center gap-2">
              <button onClick={() => onChange({ arrowStart: !element.arrowStart })} className={`h-9 px-2 inline-flex items-center gap-1 rounded-md border text-[11px] ${element.arrowStart ? "border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-700" : "border-slate-200 dark:border-slate-700"}`}>← début</button>
              <button onClick={() => onChange({ arrowEnd: !element.arrowEnd })} className={`h-9 px-2 inline-flex items-center gap-1 rounded-md border text-[11px] ${element.arrowEnd ? "border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-700" : "border-slate-200 dark:border-slate-700"}`}>fin →</button>
            </div>
          </Section>

          <Section label="Style de tracé">
            <ToggleGroup
              value={element.style.sloppiness ?? "architect"}
              options={SLOPPINESS_OPTIONS}
              onChange={(v) => setLineStyle("sloppiness", v)}
            />
          </Section>

          <Section label={t("schemas.opacity")}>
            <PercentSlider value={element.style.opacity} onChange={(v) => setLineStyle("opacity", v)} />
          </Section>

          <LinePanelLabelsTrigger element={element} onChange={onChange} inventoryCategories={inventoryCategories} resolvedByNode={resolvedByNode} nodes={nodes} />
        </>
      )}

      {/* TEXT */}
      {element.kind === "text" && (
        <>
          <Section label="Texte">
            <textarea value={element.text} onChange={(e) => onChange({ text: e.target.value })} rows={3} className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs" />
          </Section>

          <Section label={t("schemas.color")}>
            <ColorSwatches value={element.color} onChange={(v) => onChange({ color: v })} palette={TEXT_COLORS} />
          </Section>

          <Section label={t("schemas.fontSize")}>
            <ToggleGroup
              value={element.fontSize}
              options={FONT_SIZE_PRESETS.map((s) => ({ value: s, label: String(s), title: `${s}px` }))}
              onChange={(v) => onChange({ fontSize: v })}
            />
          </Section>

          <Section label={t("schemas.fontWeight")}>
            <ToggleGroup
              value={element.fontWeight >= 600 ? 700 : 400}
              options={[
                { value: 400, label: "Normal", title: "400" },
                { value: 700, label: "Bold", title: "700" },
              ]}
              onChange={(v) => onChange({ fontWeight: v })}
            />
          </Section>

          <Section label={t("schemas.textAlign")}>
            <ToggleGroup value={element.textAlign} options={ALIGN_OPTIONS} onChange={(v) => onChange({ textAlign: v })} />
          </Section>
        </>
      )}

      {/* FREEDRAW / BEZIER */}
      {(element.kind === "freedraw" || element.kind === "bezier") && (
        <>
          <Section label={t("schemas.stroke")}>
            <ColorSwatches value={element.style.stroke} onChange={(v) => setPathStyle("stroke", v)} palette={STROKE_PALETTE} />
          </Section>
          <Section label={t("schemas.strokeWidth")}>
            <ToggleGroup value={element.style.strokeWidth} options={STROKE_W_OPTIONS} onChange={(v) => setPathStyle("strokeWidth", v)} />
          </Section>
          {element.kind === "bezier" && (
            <Section label={t("schemas.dash")}>
              <ToggleGroup value={element.style.dash} options={DASH_OPTIONS} onChange={(v) => setPathStyle("dash", v)} />
            </Section>
          )}
          <Section label="Style de tracé">
            <ToggleGroup
              value={element.style.sloppiness ?? "architect"}
              options={SLOPPINESS_OPTIONS}
              onChange={(v) => setPathStyle("sloppiness", v)}
            />
          </Section>
          <Section label={t("schemas.opacity")}>
            <PercentSlider value={element.style.opacity} onChange={(v) => setPathStyle("opacity", v)} />
          </Section>
        </>
      )}

      {/* IMAGE */}
      {element.kind === "image" && (
        <ImagePanel element={element} onChange={onChange} t={t} />
      )}

      {/* DATA LABEL / NODE CARDS — gardent leurs panels dédiés (data-binding spécifique) */}
      {element.kind === "data_label" && (
        <DataLabelPanel element={element} onChange={onChange} nodes={nodes} inventoryCategories={inventoryCategories} />
      )}
      {element.kind === "node_card_styled" && (
        <NodeCardStyledPanel element={element} onChange={onChange} nodes={nodes} inventoryCategories={inventoryCategories} resolvedByNode={resolvedByNode} />
      )}
      {element.kind === "node_card_table" && (
        <NodeCardTablePanel element={element} onChange={onChange} nodes={nodes} inventoryCategories={inventoryCategories} />
      )}

      {/* Disposition (z-order) */}
      <Section label="Disposition">
        <div className="flex items-center gap-1.5">
          <button onClick={onSendToBack} title={t("schemas.sendToBack")} className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
            <ArrowDownToLine className="h-4 w-4" />
          </button>
          <button onClick={onSendBackward} title="Reculer" className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
            <ArrowDown className="h-4 w-4" />
          </button>
          <button onClick={onBringForward} title="Avancer" className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button onClick={onBringToFront} title={t("schemas.bringToFront")} className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
            <ArrowUpToLine className="h-4 w-4" />
          </button>
        </div>
      </Section>

      {/* Actions */}
      <Section label="Actions">
        <div className="flex items-center gap-1.5">
          <button onClick={onDuplicate} title={t("schemas.duplicate")} className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800">
            <Copy className="h-4 w-4" />
          </button>
          <button onClick={onDelete} title={t("schemas.deleteSelection")} className="h-9 w-9 inline-flex items-center justify-center rounded-md border border-red-200 dark:border-red-500/20 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node-card panels (styled + table)
// ---------------------------------------------------------------------------

interface DataLabelPanelProps {
  element: DataLabelElement;
  onChange: (patch: Partial<SchemaElement>) => void;
  nodes: NodeSummary[];
  inventoryCategories: InventoryCategoryOption[];
}

function DataLabelPanel({ element, onChange, nodes, inventoryCategories }: DataLabelPanelProps) {
  const { t } = useI18n();
  return (
    <>
      <NodePicker value={element.nodeId} onChange={(id) => onChange({ nodeId: id })} nodes={nodes} />

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("schemas.rowField")}</label>
          <FieldPicker inventoryCategories={inventoryCategories} onPick={(field) => onChange({ field })} compact label="Changer" />
        </div>
        <div className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs font-mono truncate" title={element.field}>
          {element.field || "—"}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Prefix</label>
          <input type="text" value={element.prefix ?? ""} onChange={(e) => onChange({ prefix: e.target.value })} placeholder="ex. IP : " className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs" />
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Suffix</label>
          <input type="text" value={element.suffix ?? ""} onChange={(e) => onChange({ suffix: e.target.value })} placeholder="ex.  Mbps" className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("schemas.color")}</label>
        <div className="flex items-center gap-2">
          <input type="color" value={element.color} onChange={(e) => onChange({ color: e.target.value })} className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
          <input type="text" value={element.color} onChange={(e) => onChange({ color: e.target.value })} className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-mono" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("schemas.fontSize")}</label>
        <div className="flex items-center gap-2">
          <input type="range" min={10} max={120} step={1} value={element.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) })} className="flex-1 accent-blue-600" />
          <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-10 text-right">{element.fontSize}</span>
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("schemas.fontWeight")}</label>
        <div className="flex items-center gap-2">
          <input type="range" min={100} max={900} step={100} value={element.fontWeight} onChange={(e) => onChange({ fontWeight: Number(e.target.value) })} className="flex-1 accent-blue-600" />
          <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-10 text-right">{element.fontWeight}</span>
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("schemas.fontFamily")}</label>
        <select value={element.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
          <option value="sans-serif">Sans-serif</option>
          <option value="serif">Serif</option>
          <option value="monospace">Monospace</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("schemas.textAlign")}</label>
        <select value={element.textAlign} onChange={(e) => onChange({ textAlign: e.target.value as DataLabelElement["textAlign"] })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
          <option value="left">left</option>
          <option value="center">center</option>
          <option value="right">right</option>
        </select>
      </div>

      <div className="space-y-1">
        <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Background</label>
        <div className="flex items-center gap-2">
          <input type="color" value={element.bgColor ?? "#ffffff"} onChange={(e) => onChange({ bgColor: e.target.value })} className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
          <input type="text" placeholder="aucun" value={element.bgColor ?? ""} onChange={(e) => onChange({ bgColor: e.target.value || null })} className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-mono" />
          {element.bgColor && <button onClick={() => onChange({ bgColor: null })} className="px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800">↺</button>}
        </div>
      </div>
    </>
  );
}

interface NodeCardStyledPanelProps {
  element: NodeCardStyledElement;
  onChange: (patch: Partial<SchemaElement>) => void;
  nodes: NodeSummary[];
  inventoryCategories: InventoryCategoryOption[];
  resolvedByNode: Record<number, ResolvedNodeData>;
}

function NodeCardStyledPanel({ element, onChange, nodes, inventoryCategories, resolvedByNode }: NodeCardStyledPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const d = element.design;
  const updateDesign = (patch: Partial<typeof d>) => onChange({ design: { ...d, ...patch } } as Partial<SchemaElement>);

  return (
    <>
      <NodePicker value={element.nodeId} onChange={(id) => onChange({ nodeId: id })} nodes={nodes} />

      <Section label="Forme">
        <select value={d.shape} onChange={(e) => updateDesign({ shape: e.target.value })} className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs">
          <option value="round-rectangle">Rectangle arrondi</option>
          <option value="rectangle">Rectangle</option>
          <option value="ellipse">Ellipse</option>
          <option value="diamond">Losange</option>
          <option value="triangle">Triangle</option>
          <option value="hexagon">Hexagone</option>
        </select>
      </Section>

      <div className="grid grid-cols-2 gap-2">
        <Section label="Largeur">
          <input type="number" value={d.width} onChange={(e) => updateDesign({ width: Number(e.target.value) || 0 })} className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs" />
        </Section>
        <Section label="Hauteur">
          <input type="number" value={d.height} onChange={(e) => updateDesign({ height: Number(e.target.value) || 0 })} className="w-full rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs" />
        </Section>
      </div>

      <Section label="Bordure">
        <ColorSwatches value={d.borderColor} onChange={(v) => updateDesign({ borderColor: v })} palette={STROKE_PALETTE} />
      </Section>

      <Section label="Arrière-plan">
        <ColorSwatches value={d.bgColor} onChange={(v) => updateDesign({ bgColor: v })} palette={FILL_PALETTE} allowTransparent />
      </Section>

      <Section label="Remplissage">
        <ToggleGroup
          value={d.fillStyle ?? "solid"}
          options={[
            {
              value: "hachure" as const,
              title: "Hachures",
              render: (
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <defs>
                    <pattern id="ncs-side-h" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                      <line x1="0" y1="0" x2="0" y2="3" stroke="currentColor" strokeWidth="0.8" />
                    </pattern>
                  </defs>
                  <rect x="2" y="2" width="14" height="14" fill="url(#ncs-side-h)" stroke="currentColor" strokeWidth="0.6" />
                </svg>
              ),
            },
            {
              value: "cross-hatch" as const,
              title: "Hachures croisées",
              render: (
                <svg width="18" height="18" viewBox="0 0 18 18">
                  <defs>
                    <pattern id="ncs-side-c" width="3" height="3" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                      <line x1="0" y1="0" x2="0" y2="3" stroke="currentColor" strokeWidth="0.8" />
                      <line x1="0" y1="0" x2="3" y2="0" stroke="currentColor" strokeWidth="0.8" />
                    </pattern>
                  </defs>
                  <rect x="2" y="2" width="14" height="14" fill="url(#ncs-side-c)" stroke="currentColor" strokeWidth="0.6" />
                </svg>
              ),
            },
            { value: "solid" as const, title: "Plein", render: <div className="w-4 h-4 rounded-sm bg-current" /> },
          ]}
          onChange={(v) => updateDesign({ fillStyle: v })}
        />
      </Section>

      {(d.fillStyle ?? "solid") === "solid" && (
        <Section label="Opacité fond">
          <PercentSlider value={d.fillOpacity ?? 1} onChange={(v) => updateDesign({ fillOpacity: v })} />
        </Section>
      )}

      <Section label="Largeur contour">
        <ToggleGroup
          value={d.borderWidth}
          options={[
            { value: 0.5, render: <div className="w-5 h-px bg-current" />, title: "Fin" },
            { value: 1.5, render: <div className="w-5 h-[2px] bg-current" />, title: "Moyen" },
            { value: 3, render: <div className="w-5 h-[4px] bg-current" />, title: "Épais" },
          ]}
          onChange={(v) => updateDesign({ borderWidth: v })}
        />
      </Section>

      <Section label="Style trait">
        <ToggleGroup
          value={d.dash ?? "solid"}
          options={[
            { value: "solid" as const, render: <div className="w-5 h-0.5 bg-current" />, title: "Solid" },
            { value: "dashed" as const, render: <div className="w-5 h-0.5" style={{ backgroundImage: "linear-gradient(to right, currentColor 50%, transparent 50%)", backgroundSize: "4px 100%" }} />, title: "Dashed" },
            { value: "dotted" as const, render: <div className="w-5 h-0.5" style={{ backgroundImage: "radial-gradient(circle, currentColor 1px, transparent 1.5px)", backgroundSize: "4px 100%" }} />, title: "Dotted" },
          ]}
          onChange={(v) => updateDesign({ dash: v })}
        />
      </Section>

      <Section label="Style de tracé">
        <ToggleGroup
          value={d.sloppiness ?? "architect"}
          options={[
            { value: "architect" as const, title: "Architecte", render: <svg width="20" height="12"><path d="M 2 6 Q 10 6 18 6" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg> },
            { value: "artist" as const, title: "Artiste", render: <svg width="20" height="12"><path d="M 2 6 C 5 4 8 8 11 6 C 14 4 17 8 18 6" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg> },
            { value: "cartoonist" as const, title: "Caricaturiste", render: <svg width="20" height="12"><path d="M 2 6 C 4 2 7 10 10 6 C 13 2 16 10 18 6" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" /></svg> },
          ]}
          onChange={(v) => updateDesign({ sloppiness: v })}
        />
      </Section>

      <Section label="Transparence">
        <PercentSlider value={d.opacity ?? 1} onChange={(v) => updateDesign({ opacity: v })} />
      </Section>

      <button onClick={() => setModalOpen(true)} className="w-full flex items-center justify-center gap-1.5 rounded-md border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors">
        <Settings2 className="h-3.5 w-3.5" />
        Personnaliser le contenu…
      </button>

      <div className="text-[10px] text-slate-400">
        {d.labelElements.length} élément{d.labelElements.length > 1 ? "s" : ""} affiché{d.labelElements.length > 1 ? "s" : ""}
      </div>

      {modalOpen && (
        <NodeCardStyledModal
          element={element}
          onChange={onChange}
          inventoryCategories={inventoryCategories}
          nodes={nodes}
          resolvedByNode={resolvedByNode}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

interface NodeCardTablePanelProps {
  element: NodeCardTableElement;
  onChange: (patch: Partial<SchemaElement>) => void;
  nodes: NodeSummary[];
  inventoryCategories: InventoryCategoryOption[];
}

function NodeCardTablePanel({ element, onChange, nodes, inventoryCategories }: NodeCardTablePanelProps) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <NodePicker value={element.nodeId} onChange={(id) => onChange({ nodeId: id })} nodes={nodes} />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Fill</label>
          <input type="color" value={element.style.fill} onChange={(e) => onChange({ style: { ...element.style, fill: e.target.value } })} className="h-7 w-full rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
        </div>
        <div className="space-y-1">
          <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Header</label>
          <input type="color" value={element.style.headerColor} onChange={(e) => onChange({ style: { ...element.style, headerColor: e.target.value } })} className="h-7 w-full rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
        </div>
      </div>

      <button onClick={() => setModalOpen(true)} className="w-full flex items-center justify-center gap-1.5 rounded-md border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors">
        <Settings2 className="h-3.5 w-3.5" />
        Personnaliser…
      </button>

      <div className="text-[10px] text-slate-400">
        {element.rows.length} ligne{element.rows.length > 1 ? "s" : ""} · titre {element.title?.visible === false ? "masqué" : "visible"}
      </div>

      {modalOpen && (
        <NodeCardTableModal
          element={element}
          onChange={onChange}
          inventoryCategories={inventoryCategories}
          nodes={nodes}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

interface NodePickerProps {
  value: number | null;
  onChange: (id: number | null) => void;
  nodes: NodeSummary[];
}

function NodePicker({ value, onChange, nodes }: NodePickerProps) {
  const { t } = useI18n();
  return (
    <div className="space-y-1">
      <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("schemas.selectNode")}</label>
      <select value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
        <option value="">— {t("schemas.selectNodeHint")}</option>
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>{n.hostname || n.name || n.ipAddress} (#{n.id})</option>
        ))}
      </select>
    </div>
  );
}

interface FieldPickerProps {
  inventoryCategories: InventoryCategoryOption[];
  onPick: (field: string) => void;
  compact?: boolean;
  label?: string;
}

function FieldPicker({ inventoryCategories, onPick, compact, label }: FieldPickerProps) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [invCategory, setInvCategory] = useState("");
  const [invKey, setInvKey] = useState("");
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [open]);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(!open);
    setInvCategory("");
    setInvKey("");
  };

  const cur = inventoryCategories.find((c) => c.name === invCategory);

  return (
    <>
      <button ref={btnRef} type="button" onClick={openMenu} className={`rounded border border-slate-200 dark:border-slate-700 ${compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1.5 text-xs"} hover:bg-slate-50 dark:hover:bg-slate-800`}>
        {label ?? `+ ${t("schemas.addRow")}`}
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-64 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-slate-100 dark:border-slate-800">
            {(["hostname", "ipAddress", "manufacturer", "model", "name"] as const).map((f) => (
              <button key={f} onClick={() => { onPick(f); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">{defaultLabelForField(f)}</button>
            ))}
          </div>
          <div className="p-2 space-y-1">
            <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Inventaire</label>
            <select value={invCategory} onChange={(e) => { setInvCategory(e.target.value); setInvKey(""); }} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
              <option value="">— Catégorie</option>
              {inventoryCategories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </select>
            {invCategory && (
              <select value={invKey} onChange={(e) => setInvKey(e.target.value)} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
                <option value="">— Clé</option>
                {(cur?.keys ?? []).map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            )}
            {invCategory && invKey && (
              <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded">
                {(cur?.columns ?? []).map((col) => (
                  <button key={col} onClick={() => { onPick(`inventory:${invCategory}:${invKey}:${col}`); setOpen(false); }} className="w-full text-left px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">{col}</button>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Customization modals
// ---------------------------------------------------------------------------

function ModalShell({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const sizeClass = wide
    ? "w-[80vw] h-[80vh] max-w-none"
    : "w-full max-w-2xl max-h-[90vh]";
  return (
    <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`${sizeClass} overflow-hidden flex flex-col rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-3 shrink-0">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">{title}</h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="overflow-y-auto p-5 flex-1 min-h-0">{children}</div>
      </div>
    </div>
  );
}

// --- Styled card modal -----------------------------------------------------

function NodeCardStyledModal({
  element,
  onChange,
  inventoryCategories,
  nodes,
  resolvedByNode,
  onClose,
}: {
  element: NodeCardStyledElement;
  onChange: (patch: Partial<SchemaElement>) => void;
  inventoryCategories: InventoryCategoryOption[];
  nodes: NodeSummary[];
  resolvedByNode: Record<number, ResolvedNodeData>;
  onClose: () => void;
}) {
  const d = element.design;
  const nd = element.nodeId ? resolvedByNode[element.nodeId] ?? null : null;
  void nodes; // nodes prop kept for symmetry with NodeCardTableModal; not used here directly
  const updateDesign = (patch: Partial<typeof d>) => onChange({ design: { ...d, ...patch } } as Partial<SchemaElement>);
  const updateLabel = (idx: number, patch: Partial<typeof d.labelElements[number]>) => {
    updateDesign({ labelElements: d.labelElements.map((lab, i) => (i === idx ? { ...lab, ...patch } : lab)) });
  };
  const addLabel = (field: string) => {
    const yOffset = d.height / 2 + 14 + d.labelElements.length * 16;
    updateDesign({
      labelElements: [
        ...d.labelElements,
        { field, x: 0, y: Math.round(yOffset), fontSize: 11, color: "#1e293b", fontWeight: 600, fontFamily: "sans-serif", textAlign: "center" },
      ],
    });
  };
  const removeLabel = (idx: number) => updateDesign({ labelElements: d.labelElements.filter((_, i) => i !== idx) });
  const moveLabel = (idx: number, dir: -1 | 1) => {
    const next = [...d.labelElements];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    updateDesign({ labelElements: next });
  };

  // Interactive drag-on-preview: same pattern as NodeLabelEditor in topology2.
  const previewRef = useRef<SVGSVGElement>(null);
  const SVG_W = 720;
  const SVG_H = 480;
  const CX = SVG_W / 2;
  const CY = SVG_H / 2;
  const SNAP_THRESHOLD = 5;
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [activeGuides, setActiveGuides] = useState<{ axis: "x" | "y"; value: number }[]>([]);
  const dragStart = useRef<{ x: number; y: number; elX: number; elY: number } | null>(null);

  const toPoint = (e: React.MouseEvent) => {
    const svg = previewRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const handleMouseDown = (idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const lab = d.labelElements[idx];
    const p = toPoint(e);
    dragStart.current = { x: p.x, y: p.y, elX: lab.x, elY: lab.y };
    setDragging(idx);
    setSelected(idx);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (dragging === null || !dragStart.current) return;
    const p = toPoint(e);
    const dx = p.x - dragStart.current.x;
    const dy = p.y - dragStart.current.y;
    let newX = Math.round(dragStart.current.elX + dx);
    let newY = Math.round(dragStart.current.elY + dy);

    // Snap to 0 (shape center) and to other labels' x/y positions.
    const snapXs = [0, ...d.labelElements.filter((_, i) => i !== dragging).map((l) => l.x)];
    const snapYs = [0, ...d.labelElements.filter((_, i) => i !== dragging).map((l) => l.y)];
    const guides: { axis: "x" | "y"; value: number }[] = [];
    for (const sx of snapXs) {
      if (Math.abs(newX - sx) < SNAP_THRESHOLD) { newX = sx; guides.push({ axis: "x", value: sx }); break; }
    }
    for (const sy of snapYs) {
      if (Math.abs(newY - sy) < SNAP_THRESHOLD) { newY = sy; guides.push({ axis: "y", value: sy }); break; }
    }
    setActiveGuides(guides);
    updateLabel(dragging, { x: newX, y: newY });
  };
  const handleMouseUp = () => { setDragging(null); dragStart.current = null; setActiveGuides([]); };

  const renderShape = () => {
    const w = d.width, h = d.height;
    const fillStyle = d.fillStyle ?? "solid";
    const patternId = fillStyle !== "solid" ? `ncs-pat-${fillStyle}` : null;
    const fill = patternId ? `url(#${patternId})` : d.bgColor;
    const fillOp = patternId ? 1 : (d.fillOpacity ?? 1);
    const stroke = d.borderColor;
    const sw = d.borderWidth;
    const dashAttr = dashFor(d.dash ?? "solid", sw);
    const common = { fill, fillOpacity: fillOp, stroke, strokeWidth: sw, strokeDasharray: dashAttr };
    switch (d.shape) {
      case "rectangle": return <rect x={CX - w / 2} y={CY - h / 2} width={w} height={h} {...common} />;
      case "diamond": return <polygon points={`${CX},${CY - h / 2} ${CX + w / 2},${CY} ${CX},${CY + h / 2} ${CX - w / 2},${CY}`} {...common} />;
      case "ellipse": return <ellipse cx={CX} cy={CY} rx={w / 2} ry={h / 2} {...common} />;
      case "triangle": return <polygon points={`${CX},${CY - h / 2} ${CX + w / 2},${CY + h / 2} ${CX - w / 2},${CY + h / 2}`} {...common} />;
      case "hexagon": {
        const r = w / 2;
        const pts = Array.from({ length: 6 }, (_, i) => {
          const a = (Math.PI / 3) * i - Math.PI / 6;
          return `${CX + r * Math.cos(a)},${CY + r * Math.sin(a)}`;
        }).join(" ");
        return <polygon points={pts} {...common} />;
      }
      case "round-rectangle":
      default: return <rect x={CX - w / 2} y={CY - h / 2} width={w} height={h} rx="8" ry="8" {...common} />;
    }
  };

  return (
    <ModalShell title="Personnaliser le contenu de la carte" onClose={onClose} wide>
      <div className="grid grid-cols-[1fr_320px] gap-6 h-full">
        {/* Preview (drag elements) */}
        <div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden">
            <svg
              ref={previewRef}
              viewBox={`0 0 ${SVG_W} ${SVG_H}`}
              className="w-full"
              style={{ cursor: dragging !== null ? "grabbing" : "default" }}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={(e) => { if (e.target === previewRef.current) setSelected(null); }}
            >
              <defs>
                <pattern id="ncs-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                  <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" opacity="0.6" />
                </pattern>
                <pattern id="ncs-pat-hachure" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke={d.bgColor} strokeWidth="1.2" />
                </pattern>
                <pattern id="ncs-pat-cross-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
                  <line x1="0" y1="0" x2="0" y2="6" stroke={d.bgColor} strokeWidth="1.2" />
                  <line x1="0" y1="0" x2="6" y2="0" stroke={d.bgColor} strokeWidth="1.2" />
                </pattern>
                <filter id="ncs-sloppy-artist" x="-10%" y="-10%" width="120%" height="120%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="2" seed="3" />
                  <feDisplacementMap in="SourceGraphic" scale="1.4" />
                </filter>
                <filter id="ncs-sloppy-cartoonist" x="-15%" y="-15%" width="130%" height="130%">
                  <feTurbulence type="fractalNoise" baseFrequency="0.06" numOctaves="2" seed="7" />
                  <feDisplacementMap in="SourceGraphic" scale="3" />
                </filter>
              </defs>
              <rect width={SVG_W} height={SVG_H} fill="url(#ncs-grid)" />
              <line x1={CX - 200} y1={CY} x2={CX + 200} y2={CY} stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="4,4" />
              <line x1={CX} y1={CY - 200} x2={CX} y2={CY + 200} stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="4,4" />
              {/* Snap guides (alignment helpers) */}
              {activeGuides.map((g, i) =>
                g.axis === "x"
                  ? <line key={`g${i}`} x1={CX + g.value} y1={0} x2={CX + g.value} y2={SVG_H} stroke="#3b82f6" strokeWidth="0.9" strokeDasharray="4,3" opacity="0.75" />
                  : <line key={`g${i}`} x1={0} y1={CY + g.value} x2={SVG_W} y2={CY + g.value} stroke="#3b82f6" strokeWidth="0.9" strokeDasharray="4,3" opacity="0.75" />
              )}
              {(() => {
                const sloppiness = d.sloppiness ?? "architect";
                const filter = sloppiness === "artist" ? "url(#ncs-sloppy-artist)" : sloppiness === "cartoonist" ? "url(#ncs-sloppy-cartoonist)" : undefined;
                return <g filter={filter} opacity={d.opacity ?? 1}>{renderShape()}</g>;
              })()}
              {d.labelElements.map((lab, idx) => {
                const tx = CX + lab.x;
                const ty = CY + lab.y;
                const isSel = selected === idx;
                const anchor = lab.textAlign === "left" ? "start" : lab.textAlign === "right" ? "end" : "middle";
                const resolved = resolveField(lab.field, nd);
                const sample = resolved || defaultLabelForField(lab.field);
                const charW = lab.fontSize * 0.58;
                const textW = sample.length * charW;
                const textH = lab.fontSize * 1.3;
                const rx = anchor === "start" ? tx - 3 : anchor === "end" ? tx - textW - 3 : tx - textW / 2 - 3;
                return (
                  <g key={idx} style={{ cursor: dragging === idx ? "grabbing" : "grab" }}>
                    <rect
                      x={rx} y={ty - textH / 2} width={textW + 6} height={textH}
                      fill={isSel ? "#dbeafe" : "white"}
                      fillOpacity={isSel ? 0.95 : 0.85}
                      stroke={isSel ? "#3b82f6" : "transparent"}
                      strokeWidth={isSel ? 1.5 : 0}
                      strokeDasharray={isSel ? "4,2" : undefined}
                      rx="3"
                      onMouseDown={(e) => handleMouseDown(idx, e)}
                    />
                    <text
                      x={tx} y={ty}
                      textAnchor={anchor}
                      dominantBaseline="central"
                      fill={lab.color}
                      fontSize={lab.fontSize}
                      fontWeight={lab.fontWeight}
                      fontFamily={lab.fontFamily}
                      fontStyle={lab.fontStyle === "italic" ? "italic" : "normal"}
                      onMouseDown={(e) => handleMouseDown(idx, e)}
                      style={{ userSelect: "none" }}
                    >
                      {sample}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="text-[11px] text-slate-500 mt-2">Glissez les libellés pour les repositionner. Cliquez pour sélectionner.</p>
        </div>

        {/* Content list — name, size, color, bold/italic, alignment */}
        <div className="space-y-3 overflow-y-auto">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Éléments affichés ({d.labelElements.length})</span>
            <FieldPicker inventoryCategories={inventoryCategories} onPick={addLabel} compact label="+ Ajouter" />
          </div>

          <div className="space-y-2">
            {d.labelElements.length === 0 && <p className="text-xs text-slate-400 italic">Aucun élément. Ajoutez-en avec le bouton ci-dessus.</p>}
            {d.labelElements.map((lab, i) => {
              const isSel = selected === i;
              const isBold = lab.fontWeight >= 600;
              const isItalic = lab.fontStyle === "italic";
              return (
                <div key={i} className={`rounded-md border p-2 space-y-2 ${isSel ? "border-violet-300 dark:border-violet-700 bg-violet-50/40 dark:bg-violet-500/10" : "border-slate-200 dark:border-slate-700"}`} onClick={() => setSelected(i)}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs text-slate-700 dark:text-slate-200 truncate flex-1" title={lab.field}>{defaultLabelForField(lab.field)}</span>
                    <button onClick={(e) => { e.stopPropagation(); moveLabel(i, -1); }} disabled={i === 0} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30">↑</button>
                    <button onClick={(e) => { e.stopPropagation(); moveLabel(i, 1); }} disabled={i === d.labelElements.length - 1} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30">↓</button>
                    <button onClick={(e) => { e.stopPropagation(); removeLabel(i); }} className="text-xs text-red-500 hover:text-red-700">×</button>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={6}
                      max={48}
                      value={lab.fontSize}
                      onChange={(e) => updateLabel(i, { fontSize: Number(e.target.value) || 11 })}
                      title="Taille"
                      className="w-14 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-1 text-[11px]"
                    />
                    <input
                      type="color"
                      value={lab.color}
                      onChange={(e) => updateLabel(i, { color: e.target.value })}
                      title="Couleur"
                      className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                    />
                    <button
                      onClick={(e) => { e.stopPropagation(); updateLabel(i, { fontWeight: isBold ? 400 : 700 }); }}
                      title="Gras"
                      className={`h-7 w-7 inline-flex items-center justify-center rounded border text-[11px] font-bold ${isBold ? "border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20" : "border-slate-200 dark:border-slate-700"}`}
                    >B</button>
                    <button
                      onClick={(e) => { e.stopPropagation(); updateLabel(i, { fontStyle: isItalic ? "normal" : "italic" }); }}
                      title="Italique"
                      className={`h-7 w-7 inline-flex items-center justify-center rounded border text-[11px] italic ${isItalic ? "border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20" : "border-slate-200 dark:border-slate-700"}`}
                    >I</button>
                    <div className="ml-auto flex items-center gap-0.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); updateLabel(i, { textAlign: "left" }); }}
                        title="Gauche"
                        className={`h-7 w-7 inline-flex items-center justify-center rounded border text-[11px] ${lab.textAlign === "left" ? "border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20" : "border-slate-200 dark:border-slate-700"}`}
                      >L</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); updateLabel(i, { textAlign: "center" }); }}
                        title="Centre"
                        className={`h-7 w-7 inline-flex items-center justify-center rounded border text-[11px] ${(!lab.textAlign || lab.textAlign === "center") ? "border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20" : "border-slate-200 dark:border-slate-700"}`}
                      >C</button>
                      <button
                        onClick={(e) => { e.stopPropagation(); updateLabel(i, { textAlign: "right" }); }}
                        title="Droite"
                        className={`h-7 w-7 inline-flex items-center justify-center rounded border text-[11px] ${lab.textAlign === "right" ? "border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20" : "border-slate-200 dark:border-slate-700"}`}
                      >R</button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <p className="text-[11px] text-slate-500 pt-2 border-t border-slate-100 dark:border-slate-800">Astuce : utilisez l'aperçu à gauche pour repositionner chaque élément en glissant-déposant. Les guides bleus apparaissent quand l'élément est aligné.</p>
        </div>
      </div>
    </ModalShell>
  );
}

// --- Table card modal ------------------------------------------------------

function NodeCardTableModal({
  element,
  onChange,
  inventoryCategories,
  nodes,
  onClose,
}: {
  element: NodeCardTableElement;
  onChange: (patch: Partial<SchemaElement>) => void;
  inventoryCategories: InventoryCategoryOption[];
  nodes: NodeSummary[];
  onClose: () => void;
}) {
  const node = nodes.find((n) => n.id === element.nodeId) ?? null;
  const sampleNd: ResolvedNodeData | null = node
    ? { hostname: node.hostname, ipAddress: node.ipAddress, name: node.name, manufacturer: null, model: null, inventory: {} }
    : null;
  const title = element.title ?? {};
  const updateTitle = (patch: Partial<NodeCardTableTitle>) =>
    onChange({ title: { ...title, ...patch } } as Partial<SchemaElement>);
  const updateRow = (idx: number, patch: Partial<NodeCardTableRow>) => {
    onChange({ rows: element.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r)) });
  };
  const updateRowStyle = (idx: number, patch: Partial<NonNullable<NodeCardTableRow["style"]>>) => {
    updateRow(idx, { style: { ...element.rows[idx].style, ...patch } });
  };
  const addRow = (field: string) => onChange({ rows: [...element.rows, { field }] });
  const removeRow = (idx: number) => onChange({ rows: element.rows.filter((_, i) => i !== idx) });
  const moveRow = (idx: number, dir: -1 | 1) => {
    const next = [...element.rows];
    const j = idx + dir;
    if (j < 0 || j >= next.length) return;
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ rows: next });
  };

  // Live preview
  const titleVisible = title.visible !== false;
  const titleColor = title.color ?? "#ffffff";
  const titleBg = title.bgColor ?? element.style.headerColor;
  const titleFs = title.fontSize ?? element.style.rowFontSize * 1.05;
  const titleFw = title.fontWeight ?? 600;
  const titleAlign = title.align ?? "center";
  const titleTpl = title.template && title.template !== "" ? title.template : "%hostname%";
  let resolvedTitle = resolveTemplate(titleTpl, sampleNd);
  if (!resolvedTitle) resolvedTitle = node?.hostname || node?.name || node?.ipAddress || "Node";
  const rowFs = element.style.rowFontSize;
  const headerH = titleVisible ? Math.max(18, titleFs * 1.6) : 0;
  const rowH = rowFs * 1.6;
  const previewW = element.width;
  const previewH = Math.max(element.height, headerH + element.rows.length * rowH + 8);

  return (
    <ModalShell title="Personnaliser la carte (tableau)" onClose={onClose} wide>
      <div className="grid grid-cols-[320px_1fr] gap-6">
        {/* Preview */}
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 p-4 flex items-center justify-center">
            <svg viewBox={`0 0 ${previewW + 20} ${previewH + 20}`} className="w-full" style={{ maxHeight: 400 }}>
              <g transform="translate(10,10)">
                <rect width={previewW} height={previewH} fill={element.style.fill} stroke={element.style.stroke} strokeWidth="0.8" rx="4" ry="4" />
                {titleVisible && (
                  <>
                    <rect width={previewW} height={headerH} fill={titleBg} rx="4" ry="4" />
                    <rect y={headerH - 4} width={previewW} height="4" fill={titleBg} />
                    <text
                      x={titleAlign === "left" ? 8 : titleAlign === "right" ? previewW - 8 : previewW / 2}
                      y={headerH * 0.7}
                      textAnchor={titleAlign === "left" ? "start" : titleAlign === "right" ? "end" : "middle"}
                      fill={titleColor}
                      fontSize={titleFs}
                      fontWeight={titleFw}
                    >
                      {resolvedTitle}
                    </text>
                  </>
                )}
                {element.rows.map((row, i) => {
                  const rs = row.style ?? {};
                  const valFs = rs.fontSize ?? rowFs;
                  const ty = headerH + rowH * 0.7 + i * rowH;
                  const v = resolveField(row.field, sampleNd) || "—";
                  return (
                    <g key={i}>
                      <text x="8" y={ty} fill={rs.labelColor ?? "#64748b"} fontSize={rowFs} fontWeight={rs.fontWeight ?? 600}>{row.label || defaultLabelForField(row.field)}</text>
                      <text x={previewW - 8} y={ty} textAnchor="end" fill={rs.color ?? "#1e293b"} fontSize={valFs} fontFamily={rs.monospaced !== false ? "monospace" : "sans-serif"}>{v}</text>
                    </g>
                  );
                })}
              </g>
            </svg>
          </div>
          <p className="text-[11px] text-slate-500">Aperçu basé sur le nœud sélectionné.</p>
        </div>

        {/* Right side: title + rows */}
        <div className="space-y-5">
          <section className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Titre</h3>
              <label className="flex items-center gap-1.5 text-[11px]">
                <input type="checkbox" checked={titleVisible} onChange={(e) => updateTitle({ visible: e.target.checked })} />
                Afficher
              </label>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Template</label>
              <input
                type="text"
                value={title.template ?? "%hostname%"}
                onChange={(e) => updateTitle({ template: e.target.value })}
                placeholder="%hostname% — %ipAddress%"
                className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs font-mono"
              />
              <p className="text-[10px] text-slate-400">Placeholders : <code>%hostname%</code>, <code>%ipAddress%</code>, <code>%manufacturer%</code>, <code>%model%</code>, <code>%inventory:cat:key:col%</code></p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Texte</label>
                <input type="color" value={titleColor} onChange={(e) => updateTitle({ color: e.target.value })} className="h-7 w-full rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Fond</label>
                <input type="color" value={titleBg} onChange={(e) => updateTitle({ bgColor: e.target.value })} className="h-7 w-full rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Taille</label>
                <input type="number" value={titleFs} onChange={(e) => updateTitle({ fontSize: Number(e.target.value) || 12 })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Graisse</label>
                <select value={titleFw} onChange={(e) => updateTitle({ fontWeight: Number(e.target.value) })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
                  <option value={400}>Normal</option>
                  <option value={600}>Semi-bold</option>
                  <option value={700}>Bold</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Alignement</label>
                <select value={titleAlign} onChange={(e) => updateTitle({ align: e.target.value as NonNullable<NodeCardTableTitle["align"]> })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
                  <option value="left">Gauche</option>
                  <option value="center">Centre</option>
                  <option value="right">Droite</option>
                </select>
              </div>
            </div>
          </section>

          <section className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Lignes ({element.rows.length})</h3>
              <FieldPicker inventoryCategories={inventoryCategories} onPick={addRow} compact label="+ Ajouter" />
            </div>

            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {element.rows.length === 0 && <p className="text-xs text-slate-400 italic">Aucune ligne. Ajoutez-en une.</p>}
              {element.rows.map((row, i) => {
                const rs = row.style ?? {};
                return (
                  <div key={i} className="rounded-md border border-slate-200 dark:border-slate-700 p-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono text-slate-400 w-5 text-right">{i + 1}.</span>
                      <span className="text-xs text-slate-700 dark:text-slate-200 truncate flex-1" title={row.field}>{row.field}</span>
                      <button onClick={() => moveRow(i, -1)} disabled={i === 0} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30">↑</button>
                      <button onClick={() => moveRow(i, 1)} disabled={i === element.rows.length - 1} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30">↓</button>
                      <button onClick={() => removeRow(i)} className="text-xs text-red-500 hover:text-red-700">×</button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={row.label ?? ""}
                        onChange={(e) => updateRow(i, { label: e.target.value || undefined })}
                        placeholder={`libellé (${defaultLabelForField(row.field)})`}
                        className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px]"
                      />
                      <div className="flex items-center gap-1.5">
                        <input type="color" title="Valeur" value={rs.color ?? "#1e293b"} onChange={(e) => updateRowStyle(i, { color: e.target.value })} className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
                        <input type="color" title="Libellé" value={rs.labelColor ?? "#64748b"} onChange={(e) => updateRowStyle(i, { labelColor: e.target.value })} className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
                        <input type="number" placeholder="taille" value={rs.fontSize ?? ""} onChange={(e) => updateRowStyle(i, { fontSize: Number(e.target.value) || undefined })} className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1 py-1 text-[10px]" />
                        <button onClick={() => updateRowStyle(i, { fontWeight: (rs.fontWeight ?? 600) >= 600 ? 400 : 700 })} className={`h-7 px-1.5 rounded border text-[10px] font-bold ${(rs.fontWeight ?? 600) >= 600 ? "border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20" : "border-slate-200 dark:border-slate-700"}`}>B</button>
                        <button onClick={() => updateRowStyle(i, { monospaced: !(rs.monospaced !== false) })} title="Police mono" className={`h-7 px-1.5 rounded border text-[10px] font-mono ${rs.monospaced !== false ? "border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20" : "border-slate-200 dark:border-slate-700"}`}>M</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-2 rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Apparence générale</h3>
            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Fond carte</label>
                <input type="color" value={element.style.fill} onChange={(e) => onChange({ style: { ...element.style, fill: e.target.value } })} className="h-7 w-full rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Bordure</label>
                <input type="color" value={element.style.stroke} onChange={(e) => onChange({ style: { ...element.style, stroke: e.target.value } })} className="h-7 w-full rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
              </div>
              <div className="space-y-1">
                <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">Taille texte</label>
                <input type="number" value={element.style.rowFontSize} onChange={(e) => onChange({ style: { ...element.style, rowFontSize: Number(e.target.value) || 11 } })} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </ModalShell>
  );
}

// ---------------------------------------------------------------------------
// Image upload + crop
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Line edit modal
// ---------------------------------------------------------------------------

const PILL_PRESETS = [
  { label: "Verte", color: "#22c55e" },
  { label: "Bleue", color: "#3b82f6" },
  { label: "Orange", color: "#f97316" },
  { label: "Jaune", color: "#eab308" },
  { label: "Rouge", color: "#ef4444" },
  { label: "Grise", color: "#94a3b8" },
];

function LinePanelLabelsTrigger({
  element,
  onChange,
  inventoryCategories,
  resolvedByNode,
  nodes,
}: {
  element: LineElement;
  onChange: (patch: Partial<SchemaElement>) => void;
  inventoryCategories: InventoryCategoryOption[];
  resolvedByNode: Record<number, ResolvedNodeData>;
  nodes: NodeSummary[];
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const count = (element.labels ?? []).length;

  return (
    <>
      <button onClick={() => setModalOpen(true)} className="w-full flex items-center justify-center gap-1.5 rounded-md border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors">
        <Settings2 className="h-3.5 w-3.5" />
        Personnaliser le lien…
      </button>
      <div className="text-[10px] text-slate-400">{count} étiquette{count > 1 ? "s" : ""}</div>
      {modalOpen && (
        <LineEditModal
          element={element}
          onChange={onChange}
          inventoryCategories={inventoryCategories}
          resolvedByNode={resolvedByNode}
          nodes={nodes}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  );
}

function LineEditModal({
  element,
  onChange,
  inventoryCategories,
  resolvedByNode,
  nodes,
  onClose,
}: {
  element: LineElement;
  onChange: (patch: Partial<SchemaElement>) => void;
  inventoryCategories: InventoryCategoryOption[];
  resolvedByNode: Record<number, ResolvedNodeData>;
  nodes: NodeSummary[];
  onClose: () => void;
}) {
  const labels = element.labels ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(labels[0]?.id ?? null);

  const updateLabel = (id: string, patch: Partial<LineLabel>) => {
    onChange({ labels: labels.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  };
  const removeLabel = (id: string) => {
    onChange({ labels: labels.filter((l) => l.id !== id) });
    if (selectedId === id) setSelectedId(null);
  };
  const moveLabel = (id: string, dir: -1 | 1) => {
    const idx = labels.findIndex((l) => l.id === id);
    const j = idx + dir;
    if (idx === -1 || j < 0 || j >= labels.length) return;
    const next = [...labels];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange({ labels: next });
  };
  const addText = (text: string) => {
    const lab: LineLabel = {
      id: genId(),
      kind: "text",
      t: 0.5,
      text,
      fontSize: 11,
      color: "#1e293b",
      fontWeight: 500,
      fontStyle: "normal",
      offset: 0,
      bgColor: null,
      padding: 3,
    };
    onChange({ labels: [...labels, lab] });
    setSelectedId(lab.id);
  };
  const addPill = (pillColor: string) => {
    const lab: LineLabel = {
      id: genId(),
      kind: "pill",
      t: 0.5,
      text: "",
      fontSize: 9,
      color: "#ffffff",
      fontWeight: 700,
      fontStyle: "normal",
      offset: 0,
      pillSize: 16,
      pillColor,
      borderColor: "#ffffff",
    };
    onChange({ labels: [...labels, lab] });
    setSelectedId(lab.id);
  };

  // Preview: render the line horizontally with all labels at their t positions.
  const PREVIEW_W = 800;
  const PREVIEW_H = 200;
  const previewSourceX = 80;
  const previewTargetX = PREVIEW_W - 80;
  const previewY = PREVIEW_H / 2;
  const previewLen = previewTargetX - previewSourceX;

  // Resolve label text for preview (uses the same logic as canvas).
  const previewLabelText = (lab: LineLabel): string => {
    return resolveLabelText(lab, element, {}, resolvedByNode);
  };
  // Resolve the actual pill color for preview (evaluating conditional rules).
  const previewPillColor = (lab: LineLabel): string => resolvePillColor(lab, resolvedByNode);

  const sel = labels.find((l) => l.id === selectedId);

  return (
    <ModalShell title="Personnaliser le lien" onClose={onClose} wide>
      <div className="flex flex-col gap-4 h-full">
        {/* Preview */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden">
          <svg viewBox={`0 0 ${PREVIEW_W} ${PREVIEW_H}`} className="w-full" style={{ maxHeight: 200 }}>
            <defs>
              <marker id="lem-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill={element.style.stroke} />
              </marker>
            </defs>
            {/* Endpoints */}
            <circle cx={previewSourceX} cy={previewY} r={5} fill="#3b82f6" />
            <text x={previewSourceX} y={previewY + 22} textAnchor="middle" fill="#94a3b8" fontSize="10">source</text>
            <circle cx={previewTargetX} cy={previewY} r={5} fill="#3b82f6" />
            <text x={previewTargetX} y={previewY + 22} textAnchor="middle" fill="#94a3b8" fontSize="10">cible</text>
            {/* The line itself */}
            <line
              x1={previewSourceX}
              y1={previewY}
              x2={previewTargetX}
              y2={previewY}
              stroke={element.style.stroke}
              strokeWidth={element.style.strokeWidth}
              strokeDasharray={dashFor(element.style.dash, element.style.strokeWidth)}
              markerStart={element.arrowStart ? "url(#lem-arrow)" : undefined}
              markerEnd={element.arrowEnd ? "url(#lem-arrow)" : undefined}
            />
            {/* Labels */}
            {labels.map((lab) => {
              const t = labelT(lab);
              const off = lab.offset ?? 0;
              const cx = previewSourceX + previewLen * t;
              const cy = previewY + off;
              const isPill = lab.kind === "pill";
              const text = previewLabelText(lab);
              const isSel = selectedId === lab.id;
              if (isPill) {
                const size = lab.pillSize ?? Math.max(lab.fontSize * 1.4, 14);
                const fill = previewPillColor(lab);
                return (
                  <g key={lab.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(lab.id)}>
                    {isSel && <circle cx={cx} cy={cy} r={size / 2 + 4} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,2" />}
                    <circle cx={cx} cy={cy} r={size / 2} fill={fill} stroke={lab.borderColor ?? "#ffffff"} strokeWidth="1.5" />
                    <text x={cx} y={cy + size * 0.32} textAnchor="middle" fill={lab.color} fontSize={size * 0.6} fontWeight="700">{text}</text>
                  </g>
                );
              }
              const charW = lab.fontSize * 0.58;
              const textW = text.length * charW;
              const pad = lab.padding ?? 3;
              const isBadge = !!lab.bgColor;
              const rx = lab.borderRadius ?? (isBadge ? lab.fontSize * 0.6 : 3);
              return (
                <g key={lab.id} style={{ cursor: "pointer" }} onClick={() => setSelectedId(lab.id)}>
                  {isSel && (
                    <rect x={cx - textW / 2 - pad - 3} y={cy - lab.fontSize / 2 - pad - 3} width={textW + pad * 2 + 6} height={lab.fontSize + pad * 2 + 6} rx={rx + 3} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="3,2" />
                  )}
                  {isBadge && (
                    <rect x={cx - textW / 2 - pad} y={cy - lab.fontSize / 2 - pad} width={textW + pad * 2} height={lab.fontSize + pad * 2} rx={rx} ry={rx} fill={lab.bgColor!} stroke={lab.borderColor ?? "none"} strokeWidth={lab.borderColor ? 0.8 : 0} />
                  )}
                  <text x={cx} y={cy + lab.fontSize * 0.35} textAnchor="middle" fill={lab.color} fontSize={lab.fontSize} fontWeight={lab.fontWeight} fontStyle={lab.fontStyle === "italic" ? "italic" : "normal"}>{text}</text>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="grid grid-cols-[260px_1fr] gap-4 flex-1 min-h-0">
          {/* Left: label list + add */}
          <div className="flex flex-col gap-3 overflow-y-auto pr-1">
            <div className="space-y-1">
              <LineLabelAddTextMenu inventoryCategories={inventoryCategories} onAdd={(text) => addText(text)} />
              <LineLabelAddPillMenu onAdd={(color) => addPill(color)} />
            </div>

            <div className="space-y-1">
              {labels.length === 0 && <p className="text-[11px] text-slate-400 italic">Aucune étiquette.</p>}
              {labels.map((lab, i) => {
                const isSel = selectedId === lab.id;
                const preview = previewLabelText(lab);
                return (
                  <div
                    key={lab.id}
                    onClick={() => setSelectedId(lab.id)}
                    className={`rounded-md border p-2 cursor-pointer ${isSel ? "border-violet-300 dark:border-violet-700 bg-violet-50/40 dark:bg-violet-500/10" : "border-slate-200 dark:border-slate-700"}`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center justify-center min-w-6 h-5 rounded text-[10px] font-bold ${lab.kind === "pill" ? "text-white" : "text-slate-600 dark:text-slate-300"}`} style={{ backgroundColor: lab.kind === "pill" ? (lab.pillColor ?? "#dc2626") : (lab.bgColor ?? "transparent") }}>
                        {lab.kind === "pill" ? lab.text : (lab.kind === "text" ? "T" : "?")}
                      </span>
                      <span className="text-xs text-slate-700 dark:text-slate-200 truncate flex-1" title={preview}>{preview || "—"}</span>
                      <span className="text-[10px] text-slate-400 font-mono">{Math.round(labelT(lab) * 100)}%</span>
                      <button onClick={(e) => { e.stopPropagation(); moveLabel(lab.id, -1); }} disabled={i === 0} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30">↑</button>
                      <button onClick={(e) => { e.stopPropagation(); moveLabel(lab.id, 1); }} disabled={i === labels.length - 1} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30">↓</button>
                      <button onClick={(e) => { e.stopPropagation(); removeLabel(lab.id); }} className="text-xs text-red-500 hover:text-red-700">×</button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: selected label editor */}
          <div className="overflow-y-auto pr-1">
            {sel ? (
              <LineLabelEditor
                label={sel}
                onChange={(patch) => updateLabel(sel.id, patch)}
                inventoryCategories={inventoryCategories}
                nodes={nodes}
              />
            ) : (
              <div className="h-full flex items-center justify-center text-xs text-slate-400 italic">
                Sélectionnez une étiquette pour la modifier
              </div>
            )}
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function LineLabelEditor({
  label,
  onChange,
  inventoryCategories,
  nodes,
}: {
  label: LineLabel;
  onChange: (patch: Partial<LineLabel>) => void;
  inventoryCategories: InventoryCategoryOption[];
  nodes: NodeSummary[];
}) {
  const isPill = label.kind === "pill";
  const isBadge = !!label.bgColor;
  const isBold = label.fontWeight >= 600;
  const isItalic = label.fontStyle === "italic";
  const isBound = !!label.dataBinding;
  return (
    <div className="space-y-4">
      <Section label="Source du contenu">
        <ToggleGroup
          value={isBound ? "data" : "text"}
          options={[
            { value: "text" as const, label: "Texte libre" },
            { value: "data" as const, label: "Donnée d'inventaire" },
          ]}
          onChange={(v) => {
            if (v === "text") onChange({ dataBinding: null });
            else onChange({ dataBinding: { nodeId: null, field: "hostname" } });
          }}
        />
        {!isBound ? (
          <input
            type="text"
            value={label.text}
            onChange={(e) => onChange({ text: e.target.value })}
            placeholder={isPill ? "R, D, A, …" : "Saisissez un texte"}
            className="w-full mt-2 rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
          />
        ) : (
          <DataBindingPicker
            value={label.dataBinding!}
            onChange={(binding) => onChange({ dataBinding: binding })}
            nodes={nodes}
            inventoryCategories={inventoryCategories}
          />
        )}
      </Section>

      <Section label="Position le long du lien">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(labelT(label) * 100)}
            onChange={(e) => onChange({ t: Number(e.target.value) / 100 })}
            className="flex-1 accent-violet-600"
          />
          <span className="text-xs font-mono w-12 text-right">{Math.round(labelT(label) * 100)}%</span>
        </div>
        <div className="flex items-center gap-1 mt-1">
          <button onClick={() => onChange({ t: 0.0 })} className="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] hover:bg-slate-50 dark:hover:bg-slate-800">0%</button>
          <button onClick={() => onChange({ t: 0.15 })} className="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] hover:bg-slate-50 dark:hover:bg-slate-800">Début</button>
          <button onClick={() => onChange({ t: 0.5 })} className="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] hover:bg-slate-50 dark:hover:bg-slate-800">Milieu</button>
          <button onClick={() => onChange({ t: 0.85 })} className="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] hover:bg-slate-50 dark:hover:bg-slate-800">Fin</button>
          <button onClick={() => onChange({ t: 1.0 })} className="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] hover:bg-slate-50 dark:hover:bg-slate-800">100%</button>
        </div>
      </Section>

      <Section label="Décalage perpendiculaire">
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={-40}
            max={40}
            step={1}
            value={label.offset ?? 0}
            onChange={(e) => onChange({ offset: Number(e.target.value) })}
            className="flex-1 accent-violet-600"
          />
          <span className="text-xs font-mono w-10 text-right">{label.offset ?? 0}</span>
        </div>
        <p className="text-[10px] text-slate-400">Négatif = au-dessus de la ligne, positif = en-dessous.</p>
      </Section>

      {isPill ? (
        <>
          <Section label="Couleur pastille">
            <div className="flex items-center gap-2 flex-wrap">
              {PILL_PRESETS.map((p) => (
                <button
                  key={p.label}
                  onClick={() => onChange({ pillColor: p.color })}
                  title={p.label}
                  className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-700 ring-1 ring-white shadow-sm hover:scale-105 transition-transform"
                  style={{ backgroundColor: p.color }}
                />
              ))}
            </div>
            <div className="flex items-center gap-2 mt-2">
              <input type="color" value={label.pillColor ?? "#22c55e"} onChange={(e) => onChange({ pillColor: e.target.value })} className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
              <input type="text" value={label.pillColor ?? "#22c55e"} onChange={(e) => onChange({ pillColor: e.target.value })} className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-mono" />
            </div>
          </Section>

          <Section label="Taille pastille">
            <div className="flex items-center gap-3">
              <input type="range" min={10} max={32} step={1} value={label.pillSize ?? 16} onChange={(e) => onChange({ pillSize: Number(e.target.value) })} className="flex-1 accent-violet-600" />
              <span className="text-xs font-mono w-10 text-right">{label.pillSize ?? 16}</span>
            </div>
          </Section>

          <Section label="Couleur texte">
            <input type="color" value={label.color} onChange={(e) => onChange({ color: e.target.value })} className="h-8 w-12 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
          </Section>

          <Section label="Bordure">
            <div className="flex items-center gap-2">
              <input type="color" value={label.borderColor ?? "#ffffff"} onChange={(e) => onChange({ borderColor: e.target.value })} className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
              <input type="text" placeholder="aucune" value={label.borderColor ?? ""} onChange={(e) => onChange({ borderColor: e.target.value || null })} className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-mono" />
            </div>
          </Section>

          <PillConditionalColorEditor
            label={label}
            onChange={onChange}
            nodes={nodes}
            inventoryCategories={inventoryCategories}
          />
        </>
      ) : (
        <>
          <Section label="Apparence">
            <div className="flex items-center gap-1.5">
              <input type="number" min={6} max={28} value={label.fontSize} onChange={(e) => onChange({ fontSize: Number(e.target.value) || 11 })} title="Taille" className="w-14 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-1.5 py-1 text-[11px]" />
              <input type="color" value={label.color} onChange={(e) => onChange({ color: e.target.value })} title="Couleur" className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
              <button onClick={() => onChange({ fontWeight: isBold ? 400 : 700 })} title="Gras" className={`h-7 w-7 inline-flex items-center justify-center rounded border text-[11px] font-bold ${isBold ? "border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20" : "border-slate-200 dark:border-slate-700"}`}>B</button>
              <button onClick={() => onChange({ fontStyle: isItalic ? "normal" : "italic" })} title="Italique" className={`h-7 w-7 inline-flex items-center justify-center rounded border text-[11px] italic ${isItalic ? "border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20" : "border-slate-200 dark:border-slate-700"}`}>I</button>
            </div>
          </Section>

          <Section label="Badge (fond)">
            <div className="flex items-center gap-2">
              <button
                onClick={() => onChange({ bgColor: isBadge ? null : "#e0e7ff" })}
                className={`rounded-md border px-3 py-1.5 text-[11px] ${isBadge ? "border-violet-300 bg-violet-100 text-violet-700 dark:bg-violet-500/20" : "border-slate-200 dark:border-slate-700"}`}
              >
                {isBadge ? "Désactiver le badge" : "Activer le badge"}
              </button>
              {isBadge && (
                <>
                  <input type="color" value={label.bgColor ?? "#e0e7ff"} onChange={(e) => onChange({ bgColor: e.target.value })} title="Fond" className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
                  <input type="color" value={label.borderColor ?? "#000000"} onChange={(e) => onChange({ borderColor: e.target.value || null })} title="Bordure" className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
                </>
              )}
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

// Picker for a (nodeId, field) data binding. Used in label text mode "Donnée"
// and as the source for conditional pill color rules.
function DataBindingPicker({
  value,
  onChange,
  nodes,
  inventoryCategories,
  compact,
}: {
  value: LineLabelDataBinding;
  onChange: (v: LineLabelDataBinding) => void;
  nodes: NodeSummary[];
  inventoryCategories: InventoryCategoryOption[];
  compact?: boolean;
}) {
  const inv = parseInventoryField(value.field);
  const setNode = (id: number | null) => onChange({ ...value, nodeId: id });
  const setField = (field: string) => onChange({ ...value, field });
  const cur = inv ? inventoryCategories.find((c) => c.name === inv.category) : null;
  return (
    <div className={`space-y-1.5 ${compact ? "" : "mt-2"}`}>
      <select
        value={value.nodeId ?? ""}
        onChange={(e) => setNode(e.target.value ? Number(e.target.value) : null)}
        className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs"
      >
        <option value="">— Sélectionner un nœud —</option>
        {nodes.map((n) => (
          <option key={n.id} value={n.id}>{n.hostname || n.name || n.ipAddress} (#{n.id})</option>
        ))}
      </select>
      <div className="grid grid-cols-[1fr_auto] gap-1.5 items-center">
        <select
          value={inv ? "__inv__" : value.field}
          onChange={(e) => {
            // "inventory:::" parses to {category:"", key:"", column:""} — empty inventory mode
            if (e.target.value === "__inv__") setField("inventory:::");
            else setField(e.target.value);
          }}
          className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs"
        >
          <option value="hostname">Hostname</option>
          <option value="ipAddress">IP</option>
          <option value="manufacturer">Manufacturer</option>
          <option value="model">Model</option>
          <option value="name">Name</option>
          <option value="__inv__">Inventaire…</option>
        </select>
        {!inv && (
          <span className="text-[10px] text-slate-400 truncate" title={value.field}>builtin</span>
        )}
      </div>
      {inv && (
        <div className="space-y-1 pl-2 border-l-2 border-violet-200 dark:border-violet-700">
          <select
            value={inv.category}
            onChange={(e) => setField(`inventory:${e.target.value}:${inv.key}:${inv.column}`)}
            className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px]"
          >
            <option value="">— Catégorie —</option>
            {inventoryCategories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          {inv.category && (
            <select
              value={inv.key}
              onChange={(e) => setField(`inventory:${inv.category}:${e.target.value}:${inv.column}`)}
              className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px]"
            >
              <option value="">— Clé —</option>
              {(cur?.keys ?? []).map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          )}
          {inv.category && inv.key && (
            <select
              value={inv.column}
              onChange={(e) => setField(`inventory:${inv.category}:${inv.key}:${e.target.value}`)}
              className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px]"
            >
              <option value="">— Colonne —</option>
              <option value="__key__">↳ (la clé elle-même)</option>
              {(cur?.columns ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          )}
        </div>
      )}
    </div>
  );
}

const OPERATOR_OPTIONS: { value: LabelComparisonOperator; label: string }[] = [
  { value: "equals", label: "égal à" },
  { value: "not_equals", label: "différent de" },
  { value: "contains", label: "contient" },
  { value: "not_contains", label: "ne contient pas" },
  { value: "matches", label: "regex" },
  { value: "greater_than", label: "supérieur à" },
  { value: "less_than", label: "inférieur à" },
  { value: "is_empty", label: "est vide" },
  { value: "is_not_empty", label: "n'est pas vide" },
  { value: "exists", label: "existe" },
  { value: "not_exists", label: "n'existe pas" },
];

const OPERATORS_WITHOUT_VALUE = new Set<LabelComparisonOperator>(["is_empty", "is_not_empty", "exists", "not_exists"]);

function PillConditionalColorEditor({
  label,
  onChange,
  nodes,
  inventoryCategories,
}: {
  label: LineLabel;
  onChange: (patch: Partial<LineLabel>) => void;
  nodes: NodeSummary[];
  inventoryCategories: InventoryCategoryOption[];
}) {
  const rules = label.pillColorRules ?? [];
  const setRules = (next: LineLabelColorRule[]) => onChange({ pillColorRules: next });

  const addRule = () => {
    const lastSource = rules.length > 0 ? rules[rules.length - 1].source : { nodeId: null, field: "hostname" };
    setRules([
      ...rules,
      { id: genId(), source: { ...lastSource }, operator: "equals", value: "", color: "#22c55e" },
    ]);
  };
  const updateRule = (id: string, patch: Partial<LineLabelColorRule>) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };
  const removeRule = (id: string) => setRules(rules.filter((r) => r.id !== id));
  const moveRule = (id: string, dir: -1 | 1) => {
    const idx = rules.findIndex((r) => r.id === id);
    const j = idx + dir;
    if (idx === -1 || j < 0 || j >= rules.length) return;
    const next = [...rules];
    [next[idx], next[j]] = [next[j], next[idx]];
    setRules(next);
  };

  return (
    <Section label="Couleur conditionnelle">
      <p className="text-[10px] text-slate-500 mb-2">
        Les règles sont évaluées dans l'ordre. La première condition vérifiée fixe la couleur de la pastille. Si aucune ne s'applique, la couleur par défaut ci-dessus est utilisée.
      </p>
      {rules.length === 0 && <p className="text-[11px] text-slate-400 italic">Aucune règle. Ajoutez-en pour piloter dynamiquement la couleur.</p>}
      <div className="space-y-2">
        {rules.map((rule, i) => {
          const needsValue = !OPERATORS_WITHOUT_VALUE.has(rule.operator);
          return (
            <div key={rule.id} className="rounded-md border border-slate-200 dark:border-slate-700 p-2 space-y-2">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full ring-1 ring-white shadow-sm" style={{ backgroundColor: rule.color }} />
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">Si #{i + 1}</span>
                <button onClick={() => moveRule(rule.id, -1)} disabled={i === 0} className="ml-auto text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30">↑</button>
                <button onClick={() => moveRule(rule.id, 1)} disabled={i === rules.length - 1} className="text-xs text-slate-400 hover:text-slate-700 disabled:opacity-30">↓</button>
                <button onClick={() => removeRule(rule.id)} className="text-xs text-red-500 hover:text-red-700">×</button>
              </div>

              <DataBindingPicker
                value={rule.source}
                onChange={(source) => updateRule(rule.id, { source })}
                nodes={nodes}
                inventoryCategories={inventoryCategories}
                compact
              />

              <div className="flex items-center gap-1.5">
                <select
                  value={rule.operator}
                  onChange={(e) => updateRule(rule.id, { operator: e.target.value as LabelComparisonOperator })}
                  className="rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px]"
                >
                  {OPERATOR_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {needsValue && (
                  <input
                    type="text"
                    value={rule.value ?? ""}
                    onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                    placeholder="valeur"
                    className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[11px] font-mono"
                  />
                )}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] text-slate-500">Alors couleur :</span>
                <input type="color" value={rule.color} onChange={(e) => updateRule(rule.id, { color: e.target.value })} className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
                <div className="flex items-center gap-1 flex-wrap">
                  {PILL_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      onClick={() => updateRule(rule.id, { color: p.color })}
                      title={p.label}
                      className="h-6 w-6 rounded-full ring-1 ring-white shadow-sm hover:scale-105"
                      style={{ backgroundColor: p.color }}
                    />
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={addRule} className="w-full mt-2 rounded border border-dashed border-slate-300 dark:border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">
        + Ajouter une règle
      </button>
    </Section>
  );
}

function LineLabelAddTextMenu({ inventoryCategories, onAdd }: { inventoryCategories: InventoryCategoryOption[]; onAdd: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [open]);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(!open);
  };

  return (
    <>
      <button ref={btnRef} type="button" onClick={openMenu} className="w-full rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">
        + Ajouter une étiquette texte
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-72 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="border-b border-slate-100 dark:border-slate-800">
            <button onClick={() => { onAdd("Étiquette"); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">Texte libre</button>
            {(["hostname", "ipAddress", "manufacturer", "model"] as const).map((f) => (
              <button key={f} onClick={() => { onAdd(`%${f}%`); setOpen(false); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">
                {defaultLabelForField(f)} <span className="text-slate-400 font-mono">%{f}%</span>
              </button>
            ))}
          </div>
          <div className="p-2">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Inventaire</div>
            <InventoryQuickPicker inventoryCategories={inventoryCategories} onPick={(field) => { onAdd(`%${field}%`); setOpen(false); }} />
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function LineLabelAddPillMenu({ onAdd }: { onAdd: (color: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [open]);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(!open);
  };

  return (
    <>
      <button ref={btnRef} type="button" onClick={openMenu} className="w-full rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">
        + Ajouter une pastille
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="w-64 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="p-2 space-y-1">
            <div className="text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">Pastilles</div>
            {PILL_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => { onAdd(p.color); setOpen(false); }}
                className="w-full flex items-center gap-2 px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 rounded"
              >
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full ring-1 ring-white shadow-sm" style={{ backgroundColor: p.color }} />
                {p.label}
              </button>
            ))}
            <button
              onClick={() => { onAdd("#64748b"); setOpen(false); }}
              className="w-full flex items-center gap-2 px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800 rounded border-t border-slate-100 dark:border-slate-800 mt-1 pt-2"
            >
              <span className="inline-flex items-center justify-center w-6 h-6 rounded-full ring-1 ring-white shadow-sm bg-slate-500" />
              Pastille personnalisée
            </button>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function InventoryFieldQuickInsert({ inventoryCategories, onPick }: { inventoryCategories: InventoryCategoryOption[]; onPick: (field: string) => void }) {
  return <InventoryQuickPickerCompact inventoryCategories={inventoryCategories} onPick={onPick} />;
}

function InventoryQuickPickerCompact({ inventoryCategories, onPick }: { inventoryCategories: InventoryCategoryOption[]; onPick: (field: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = () => setOpen(false);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, [open]);

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const r = btnRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
    }
    setOpen(!open);
  };

  return (
    <>
      <button ref={btnRef} type="button" onClick={openMenu} className="rounded border border-slate-200 dark:border-slate-700 px-2 py-0.5 text-[10px] hover:bg-slate-50 dark:hover:bg-slate-800">
        + champ inventaire
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          style={{ position: "fixed", top: pos.top, right: pos.right, zIndex: 9999 }}
          className="w-72 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl p-2"
          onClick={(e) => e.stopPropagation()}
        >
          <InventoryQuickPicker inventoryCategories={inventoryCategories} onPick={(field) => { onPick(field); setOpen(false); }} />
        </div>,
        document.body,
      )}
    </>
  );
}

function InventoryQuickPicker({ inventoryCategories, onPick }: { inventoryCategories: InventoryCategoryOption[]; onPick: (field: string) => void }) {
  const [cat, setCat] = useState("");
  const [key, setKey] = useState("");
  const cur = inventoryCategories.find((c) => c.name === cat);
  return (
    <div className="space-y-1">
      <select value={cat} onChange={(e) => { setCat(e.target.value); setKey(""); }} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
        <option value="">— Catégorie</option>
        {inventoryCategories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
      </select>
      {cat && (
        <select value={key} onChange={(e) => setKey(e.target.value)} className="w-full rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-xs">
          <option value="">— Clé</option>
          {(cur?.keys ?? []).map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      )}
      {cat && key && (
        <div className="max-h-40 overflow-y-auto border border-slate-200 dark:border-slate-700 rounded">
          {(cur?.columns ?? []).map((col) => (
            <button key={col} onClick={() => onPick(`inventory:${cat}:${key}:${col}`)} className="w-full text-left px-2 py-1 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">{col}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function ImagePanel({ element, onChange, t }: { element: ImageElement; onChange: (patch: Partial<SchemaElement>) => void; t: (k: string) => string }) {
  const [modalOpen, setModalOpen] = useState(false);
  const hasImage = !!element.url;
  return (
    <>
      <Section label="Image">
        {hasImage ? (
          <div className="rounded-md border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-100 dark:bg-slate-800" style={{ aspectRatio: "4/3" }}>
            <img src={element.url} alt="" className="w-full h-full object-contain" />
          </div>
        ) : (
          <div className="rounded-md border border-dashed border-slate-300 dark:border-slate-700 p-4 text-center text-[11px] text-slate-400">
            Aucune image
          </div>
        )}
      </Section>

      <button onClick={() => setModalOpen(true)} className="w-full flex items-center justify-center gap-1.5 rounded-md border border-violet-200 dark:border-violet-700 bg-violet-50 dark:bg-violet-500/10 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-500/20 transition-colors">
        <ImageIcon className="h-3.5 w-3.5" />
        {hasImage ? "Modifier l'image…" : "Téléverser une image…"}
      </button>

      <Section label={t("schemas.opacity")}>
        <PercentSlider value={element.opacity} onChange={(v) => onChange({ opacity: v })} />
      </Section>

      {modalOpen && (
        <ImageEditModal
          initialUrl={element.url}
          onClose={() => setModalOpen(false)}
          onApply={(url, naturalW, naturalH) => {
            if (!url) {
              onChange({ url: "" } as Partial<SchemaElement>);
              setModalOpen(false);
              return;
            }
            // Preserve existing canvas width if any; adjust height to the new aspect ratio.
            const ratio = naturalW && naturalH ? naturalW / naturalH : 1;
            const hadDims = element.width > 1 && element.height > 1;
            const newWidth = hadDims ? element.width : Math.min(400, naturalW);
            const newHeight = Math.round(newWidth / ratio);
            onChange({ url, width: newWidth, height: newHeight } as Partial<SchemaElement>);
            setModalOpen(false);
          }}
        />
      )}
    </>
  );
}

function ImageEditModal({
  initialUrl,
  onClose,
  onApply,
}: {
  initialUrl: string;
  onClose: () => void;
  onApply: (dataUrl: string, width: number, height: number) => void;
}) {
  const [src, setSrc] = useState<string>(initialUrl);
  const [loaded, setLoaded] = useState<{ w: number; h: number } | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  // Crop rectangle expressed in NATURAL image coordinates.
  const [crop, setCrop] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  type CropAction = { kind: "move"; ox: number; oy: number; cx: number; cy: number }
    | { kind: "resize"; corner: "nw" | "ne" | "sw" | "se"; ox: number; oy: number; cx: number; cy: number; cw: number; ch: number }
    | { kind: "new"; ox: number; oy: number };
  const action = useRef<CropAction | null>(null);

  const loadFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      setSrc(url);
    };
    reader.readAsDataURL(file);
  };

  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && f.type.startsWith("image/")) loadFile(f);
  };

  // When the image loads (or its src changes), reset the crop to the full image.
  const onImgLoad = () => {
    const img = imgRef.current;
    if (!img) return;
    setLoaded({ w: img.naturalWidth, h: img.naturalHeight });
    setCrop({ x: 0, y: 0, w: img.naturalWidth, h: img.naturalHeight });
  };

  // Convert page coords → image natural coords (the <img> may be scaled by CSS).
  const toImageCoords = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    const rect = img?.getBoundingClientRect();
    if (!img || !rect || !loaded) return { x: 0, y: 0 };
    const sx = loaded.w / rect.width;
    const sy = loaded.h / rect.height;
    return { x: Math.max(0, Math.min(loaded.w, (clientX - rect.left) * sx)), y: Math.max(0, Math.min(loaded.h, (clientY - rect.top) * sy)) };
  };

  const onMouseDownCrop = (e: React.MouseEvent, kind: "move" | "resize" | "new", corner?: "nw" | "ne" | "sw" | "se") => {
    e.preventDefault();
    e.stopPropagation();
    if (!loaded || !crop) return;
    const p = toImageCoords(e.clientX, e.clientY);
    if (kind === "move") action.current = { kind, ox: p.x, oy: p.y, cx: crop.x, cy: crop.y };
    else if (kind === "resize") action.current = { kind, corner: corner!, ox: p.x, oy: p.y, cx: crop.x, cy: crop.y, cw: crop.w, ch: crop.h };
    else action.current = { kind: "new", ox: p.x, oy: p.y };
    if (kind === "new") setCrop({ x: p.x, y: p.y, w: 0, h: 0 });
  };

  const onMouseMoveDoc = (e: React.MouseEvent) => {
    if (!action.current || !loaded || !crop) return;
    const p = toImageCoords(e.clientX, e.clientY);
    const a = action.current;
    if (a.kind === "move") {
      const dx = p.x - a.ox;
      const dy = p.y - a.oy;
      const nx = Math.max(0, Math.min(loaded.w - crop.w, a.cx + dx));
      const ny = Math.max(0, Math.min(loaded.h - crop.h, a.cy + dy));
      setCrop({ ...crop, x: nx, y: ny });
    } else if (a.kind === "resize") {
      const dx = p.x - a.ox;
      const dy = p.y - a.oy;
      let nx = a.cx, ny = a.cy, nw = a.cw, nh = a.ch;
      if (a.corner === "nw") { nx = a.cx + dx; ny = a.cy + dy; nw = a.cw - dx; nh = a.ch - dy; }
      else if (a.corner === "ne") { ny = a.cy + dy; nw = a.cw + dx; nh = a.ch - dy; }
      else if (a.corner === "sw") { nx = a.cx + dx; nw = a.cw - dx; nh = a.ch + dy; }
      else { nw = a.cw + dx; nh = a.ch + dy; }
      // Clamp & ensure positive sizes
      if (nw < 8) { nw = 8; }
      if (nh < 8) { nh = 8; }
      if (nx < 0) { nw += nx; nx = 0; }
      if (ny < 0) { nh += ny; ny = 0; }
      if (nx + nw > loaded.w) nw = loaded.w - nx;
      if (ny + nh > loaded.h) nh = loaded.h - ny;
      setCrop({ x: nx, y: ny, w: nw, h: nh });
    } else if (a.kind === "new") {
      const x = Math.min(a.ox, p.x);
      const y = Math.min(a.oy, p.y);
      const w = Math.abs(p.x - a.ox);
      const h = Math.abs(p.y - a.oy);
      setCrop({ x, y, w, h });
    }
  };

  const onMouseUpDoc = () => { action.current = null; };

  const resetCrop = () => {
    if (loaded) setCrop({ x: 0, y: 0, w: loaded.w, h: loaded.h });
  };

  const apply = async () => {
    if (!loaded || !crop) {
      // No image at all: clear it
      onApply("", 0, 0);
      return;
    }
    // If crop = full image, just apply the src as-is
    if (crop.x === 0 && crop.y === 0 && crop.w === loaded.w && crop.h === loaded.h) {
      onApply(src, loaded.w, loaded.h);
      return;
    }
    // Else, draw crop onto canvas and export PNG data URL
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(crop.w));
    canvas.height = Math.max(1, Math.round(crop.h));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = imgRef.current;
    if (!img) return;
    ctx.drawImage(img, crop.x, crop.y, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/png");
    onApply(dataUrl, canvas.width, canvas.height);
  };

  // Crop overlay rendered as % of image container for resolution-independence
  const cropStyle: React.CSSProperties = loaded && crop ? {
    left: `${(crop.x / loaded.w) * 100}%`,
    top: `${(crop.y / loaded.h) * 100}%`,
    width: `${(crop.w / loaded.w) * 100}%`,
    height: `${(crop.h / loaded.h) * 100}%`,
  } : { display: "none" };

  return (
    <ModalShell title="Image" onClose={onClose} wide>
      <div className="flex flex-col h-full gap-4">
        {!src && (
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`flex-1 flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed cursor-pointer transition-colors ${
              isDragOver ? "border-violet-400 bg-violet-50 dark:bg-violet-500/10" : "border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
            }`}
          >
            <ImageIcon className="h-12 w-12 text-slate-300 dark:text-slate-600" />
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Glissez une image ici</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">ou cliquez pour parcourir</p>
            </div>
            <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
          </div>
        )}

        {src && (
          <>
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                {loaded ? <>Source: <span className="font-mono">{loaded.w}×{loaded.h}</span> · Découpe: <span className="font-mono">{crop ? `${Math.round(crop.w)}×${Math.round(crop.h)}` : "—"}</span></> : "Chargement…"}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => fileInputRef.current?.click()} className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">Remplacer</button>
                <button onClick={resetCrop} className="rounded-md border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs hover:bg-slate-50 dark:hover:bg-slate-800">Réinitialiser le cadrage</button>
                <input ref={fileInputRef} type="file" accept="image/*" onChange={onPickFile} className="hidden" />
              </div>
            </div>

            <div
              ref={containerRef}
              onMouseMove={onMouseMoveDoc}
              onMouseUp={onMouseUpDoc}
              onMouseLeave={onMouseUpDoc}
              className="flex-1 min-h-0 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-950 overflow-hidden"
            >
              <div className="relative inline-block max-w-full max-h-full">
                <img
                  ref={imgRef}
                  src={src}
                  alt=""
                  onLoad={onImgLoad}
                  className="block max-w-full max-h-[60vh] select-none pointer-events-none"
                  draggable={false}
                />
                {/* Crop overlay */}
                {loaded && crop && (
                  <>
                    {/* Dim outside the crop using 4 rects to avoid covering the inner area */}
                    <div className="absolute inset-0" style={{ pointerEvents: "none" }}>
                      <div className="absolute bg-black/40" style={{ left: 0, top: 0, right: 0, height: `${(crop.y / loaded.h) * 100}%` }} />
                      <div className="absolute bg-black/40" style={{ left: 0, top: `${((crop.y + crop.h) / loaded.h) * 100}%`, right: 0, bottom: 0 }} />
                      <div className="absolute bg-black/40" style={{ left: 0, top: `${(crop.y / loaded.h) * 100}%`, width: `${(crop.x / loaded.w) * 100}%`, height: `${(crop.h / loaded.h) * 100}%` }} />
                      <div className="absolute bg-black/40" style={{ right: 0, top: `${(crop.y / loaded.h) * 100}%`, width: `${((loaded.w - crop.x - crop.w) / loaded.w) * 100}%`, height: `${(crop.h / loaded.h) * 100}%` }} />
                    </div>
                    {/* Crop box */}
                    <div
                      className="absolute border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]"
                      style={{ ...cropStyle, cursor: "move" }}
                      onMouseDown={(e) => onMouseDownCrop(e, "move")}
                    >
                      {(["nw", "ne", "sw", "se"] as const).map((c) => (
                        <div
                          key={c}
                          className="absolute w-3 h-3 bg-white border border-slate-900 rounded-sm"
                          style={{
                            ...(c === "nw" || c === "sw" ? { left: -6 } : { right: -6 }),
                            ...(c === "nw" || c === "ne" ? { top: -6 } : { bottom: -6 }),
                            cursor: `${c}-resize`,
                          }}
                          onMouseDown={(e) => onMouseDownCrop(e, "resize", c)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200 dark:border-slate-700">
          <button onClick={onClose} className="rounded-md border border-slate-200 dark:border-slate-700 px-4 py-1.5 text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
            Annuler
          </button>
          <button
            onClick={apply}
            disabled={!src || !crop || crop.w < 4 || crop.h < 4}
            className="rounded-md bg-violet-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Appliquer
          </button>
        </div>
      </div>
    </ModalShell>
  );
}
