"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  Plus,
  Trash2,
  Bold,
  Italic,
  Move,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Database,
  ChevronDown,
  Activity,
  ShieldCheck,
} from "lucide-react";

export interface LabelElement {
  field: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight: number;
  fontFamily: string;
  fontStyle?: string;
  textAlign?: string;
  // Badge-only customization (for fields starting with "badge:")
  badgeSize?: number;          // diameter in SVG units, defaults to fontSize
  badgeBorderColor?: string;   // default "#ffffff"
  badgeBorderWidth?: number;   // default 2
  badgeBgColor?: string;       // override automatic color (compliance grade / monitoring status)
  badgeShowLabel?: boolean;    // show the grade letter inside the badge (compliance only)
}

export interface NodeDesign {
  shape: string;
  width: number;
  height: number;
  bgColor: string;
  borderColor: string;
  borderWidth: number;
  labelElements?: LabelElement[];
}

export interface InventoryCategoryOption {
  id: number | null;
  name: string;
  keys: string[];
  columns: string[];
}

interface SnapGuide { axis: "x" | "y"; value: number; }

interface Props {
  elements: LabelElement[];
  onChange: (els: LabelElement[]) => void;
  node: NodeDesign;
  inventoryCategories: InventoryCategoryOption[];
}

const SNAP_THRESHOLD = 5;

const BUILTIN_FIELDS = [
  { value: "hostname", labelKey: "topology.fieldHostname" },
  { value: "ipAddress", labelKey: "topology.fieldIp" },
  { value: "manufacturer", labelKey: "topology.fieldManufacturer" },
  { value: "model", labelKey: "topology.fieldModel" },
] as const;

const BADGE_FIELDS = {
  compliance: "badge:compliance",
  monitoring: "badge:monitoring",
} as const;

const COMPLIANCE_COLORS: Record<string, string> = {
  A: "#22c55e", B: "#84cc16", C: "#eab308", D: "#f97316", E: "#ef4444", F: "#7f1d1d",
};
const SAMPLE_COMPLIANCE = "A";
const SAMPLE_REACHABLE = true;

const SAMPLE_DATA: Record<string, string> = {
  hostname: "RTR-CORE1-01",
  ipAddress: "10.201.100.41",
  manufacturer: "Extreme",
  model: "5520-24T",
};

const FONT_FAMILIES = [
  { value: "sans-serif", label: "Sans-serif" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Monospace" },
];

const isInventoryField = (f: string) => f.startsWith("inventory:");
const isBadgeField = (f: string) => f.startsWith("badge:");

const parseInventoryField = (f: string): { category: string; key: string; column: string } | null => {
  if (!isInventoryField(f)) return null;
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

const buildInventoryField = (category: string, key: string, column: string) =>
  `inventory:${category}:${key}:${column}`;

const sampleFor = (field: string): string => {
  const inv = parseInventoryField(field);
  if (inv) return `${inv.key}-sample`;
  return SAMPLE_DATA[field] ?? field;
};

export default function NodeLabelEditor({ elements, onChange, node, inventoryCategories }: Props) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([]);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [invPickerOpen, setInvPickerOpen] = useState(false);
  const [invCategory, setInvCategory] = useState<string>("");
  const [invKey, setInvKey] = useState<string>("");
  const [invKeySearch, setInvKeySearch] = useState<string>("");
  const dragStart = useRef<{ x: number; y: number; elX: number; elY: number } | null>(null);

  const SVG_W = 220;
  const SVG_H = 160;
  const CX = SVG_W / 2;
  const CY = SVG_H / 2;

  // Close menus on outside click
  useEffect(() => {
    const handler = () => { setAddMenuOpen(false); closeInvPicker(); };
    if (addMenuOpen || invPickerOpen) {
      window.addEventListener("click", handler);
      return () => window.removeEventListener("click", handler);
    }
  }, [addMenuOpen, invPickerOpen]);

  // Arrow-key nudging of the selected element (1px, +Shift = 10px)
  useEffect(() => {
    if (selected === null) return;
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) {
          return;
        }
      }
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
      e.preventDefault();
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      onChange(elements.map((el, i) => i === selected ? { ...el, x: el.x + dx, y: el.y + dy } : el));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [selected, elements, onChange]);

  const toSVGPoint = useCallback((e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const svgPt = pt.matrixTransform(ctm.inverse());
    return { x: svgPt.x, y: svgPt.y };
  }, []);

  const handleMouseDown = useCallback((idx: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const pt = toSVGPoint(e);
    const el = elements[idx];
    dragStart.current = { x: pt.x, y: pt.y, elX: el.x, elY: el.y };
    setDragging(idx);
    setSelected(idx);
  }, [elements, toSVGPoint]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (dragging === null || !dragStart.current) return;
    const pt = toSVGPoint(e);
    const dx = pt.x - dragStart.current.x;
    const dy = pt.y - dragStart.current.y;
    let newX = Math.round(dragStart.current.elX + dx);
    let newY = Math.round(dragStart.current.elY + dy);

    const snapXs = [0, ...elements.filter((_, i) => i !== dragging).map((el) => el.x)];
    const snapYs = [0, ...elements.filter((_, i) => i !== dragging).map((el) => el.y)];

    const guides: SnapGuide[] = [];
    for (const sx of snapXs) {
      if (Math.abs(newX - sx) < SNAP_THRESHOLD) { newX = sx; guides.push({ axis: "x", value: sx }); break; }
    }
    for (const sy of snapYs) {
      if (Math.abs(newY - sy) < SNAP_THRESHOLD) { newY = sy; guides.push({ axis: "y", value: sy }); break; }
    }

    setActiveGuides(guides);
    onChange(elements.map((el, i) => i === dragging ? { ...el, x: newX, y: newY } : el));
  }, [dragging, elements, onChange, toSVGPoint]);

  const handleMouseUp = useCallback(() => {
    setDragging(null);
    dragStart.current = null;
    setActiveGuides([]);
  }, []);

  const handleSvgClick = useCallback((e: React.MouseEvent) => {
    if (e.target === svgRef.current || (e.target as SVGElement).classList?.contains("bg-grid")) {
      setSelected(null);
    }
  }, []);

  const addElement = (field: string) => {
    const yOffset = node.height / 2 + 14 + elements.length * 16;
    const newEl: LabelElement = {
      field,
      x: 0,
      y: Math.round(yOffset),
      fontSize: 10,
      color: "#64748b",
      fontWeight: 400,
      fontFamily: "sans-serif",
      fontStyle: "normal",
      textAlign: "center",
    };
    onChange([...elements, newEl]);
    setSelected(elements.length);
    setAddMenuOpen(false);
    setInvPickerOpen(false);
  };

  const addBadge = (field: string) => {
    const offsetX = field === BADGE_FIELDS.monitoring ? node.width / 2 + 6 : -(node.width / 2 + 6);
    const newEl: LabelElement = {
      field,
      x: Math.round(offsetX),
      y: Math.round(-node.height / 2 - 4),
      fontSize: 12,
      color: "#ffffff",
      fontWeight: 700,
      fontFamily: "sans-serif",
      fontStyle: "normal",
      textAlign: "center",
      badgeSize: 12,
      badgeBorderColor: "#ffffff",
      badgeBorderWidth: 2,
      badgeShowLabel: field === BADGE_FIELDS.compliance,
    };
    onChange([...elements, newEl]);
    setSelected(elements.length);
    setAddMenuOpen(false);
  };

  const removeElement = (idx: number) => {
    onChange(elements.filter((_, i) => i !== idx));
    if (selected === idx) setSelected(null);
    else if (selected !== null && selected > idx) setSelected(selected - 1);
  };

  const updateElement = (idx: number, patch: Partial<LabelElement>) => {
    onChange(elements.map((el, i) => (i === idx ? { ...el, ...patch } : el)));
  };

  const sel = selected !== null && selected < elements.length ? elements[selected] : null;
  const selInv = sel ? parseInventoryField(sel.field) : null;
  const selIsBadge = sel ? isBadgeField(sel.field) : false;

  const renderShape = () => {
    const w = node.width, h = node.height;
    const fill = node.bgColor, stroke = node.borderColor, sw = node.borderWidth;
    switch (node.shape) {
      case "rectangle": return <rect x={CX-w/2} y={CY-h/2} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case "round-rectangle": return <rect x={CX-w/2} y={CY-h/2} width={w} height={h} rx={8} ry={8} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case "diamond": return <polygon points={`${CX},${CY-h/2} ${CX+w/2},${CY} ${CX},${CY+h/2} ${CX-w/2},${CY}`} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case "hexagon": { const r=w/2; return <polygon points={Array.from({length:6},(_,i)=>{const a=(Math.PI/3)*i-Math.PI/6;return`${CX+r*Math.cos(a)},${CY+r*Math.sin(a)}`;}).join(" ")} fill={fill} stroke={stroke} strokeWidth={sw} />; }
      case "triangle": return <polygon points={`${CX},${CY-h/2} ${CX+w/2},${CY+h/2} ${CX-w/2},${CY+h/2}`} fill={fill} stroke={stroke} strokeWidth={sw} />;
      default: return <ellipse cx={CX} cy={CY} rx={w/2} ry={h/2} fill={fill} stroke={stroke} strokeWidth={sw} />;
    }
  };

  const textAnchorFor = (a?: string) => a === "left" ? "start" : a === "right" ? "end" : "middle";
  const bgRectX = (tx: number, tw: number, a?: string) =>
    a === "left" ? tx - 3 : a === "right" ? tx - tw - 3 : tx - tw / 2 - 3;

  const toggleBtn = (active: boolean) =>
    `p-1.5 rounded-lg border transition-colors ${active
      ? "border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
      : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`;

  const fieldLabel = (field: string): string => {
    if (field === BADGE_FIELDS.compliance) return t("topology.badgeCompliance");
    if (field === BADGE_FIELDS.monitoring) return t("topology.badgeMonitoring");
    const inv = parseInventoryField(field);
    if (inv) return `${inv.category} · ${inv.key} · ${inv.column}`;
    const opt = BUILTIN_FIELDS.find((b) => b.value === field);
    return opt ? t(opt.labelKey) : field;
  };

  const resetInvPicker = () => {
    setInvCategory("");
    setInvKey("");
    setInvKeySearch("");
  };

  const closeInvPicker = () => {
    setInvPickerOpen(false);
    resetInvPicker();
  };

  const currentInvCategory = inventoryCategories.find((c) => c.name === invCategory);
  const filteredKeys = (currentInvCategory?.keys ?? []).filter((k) =>
    !invKeySearch.trim() || k.toLowerCase().includes(invKeySearch.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("topology.labelEditorHint")}</p>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setAddMenuOpen(!addMenuOpen); }}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("topology.labelAddElement")}
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>
          {addMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-60 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-20 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              {BUILTIN_FIELDS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => addElement(opt.value)}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span className="h-4 w-4 flex items-center justify-center text-[10px] font-bold text-slate-400">A</span>
                  {t(opt.labelKey)}
                </button>
              ))}
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); resetInvPicker(); setInvPickerOpen(true); setAddMenuOpen(false); }}
                disabled={inventoryCategories.length === 0}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-800 disabled:opacity-50"
              >
                <Database className="h-3.5 w-3.5 text-purple-500" />
                {t("topology.labelAddInventory")}
              </button>
              <button
                type="button"
                onClick={() => addBadge(BADGE_FIELDS.compliance)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-800"
              >
                <ShieldCheck className="h-3.5 w-3.5 text-blue-500" />
                {t("topology.badgeCompliance")}
              </button>
              <button
                type="button"
                onClick={() => addBadge(BADGE_FIELDS.monitoring)}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-800"
              >
                <Activity className="h-3.5 w-3.5 text-emerald-500" />
                {t("topology.badgeMonitoring")}
              </button>
            </div>
          )}

          {invPickerOpen && (
            <div className="absolute right-0 top-full mt-1 w-80 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-30 overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 space-y-2">
                <div>
                  <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                    {t("topology.pickCategory")}
                  </label>
                  <select
                    value={invCategory}
                    onChange={(e) => { setInvCategory(e.target.value); setInvKey(""); setInvKeySearch(""); }}
                    className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
                  >
                    <option value="">—</option>
                    {inventoryCategories.map((c) => (
                      <option key={c.name} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                {invCategory && (
                  <div>
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold mb-1">
                      {t("topology.pickKey")}
                    </label>
                    {(currentInvCategory?.keys.length ?? 0) > 8 ? (
                      <input
                        type="text"
                        value={invKeySearch}
                        onChange={(e) => setInvKeySearch(e.target.value)}
                        placeholder={t("topology.searchKey")}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1.5 text-xs"
                      />
                    ) : null}
                    <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 dark:border-slate-700">
                      {filteredKeys.length === 0 ? (
                        <p className="px-2 py-2 text-xs text-slate-400 italic">{t("topology.noKeys")}</p>
                      ) : (
                        filteredKeys.map((k) => (
                          <button
                            key={k}
                            type="button"
                            onClick={() => setInvKey(k)}
                            className={`w-full text-left px-2 py-1.5 text-xs truncate transition-colors ${
                              invKey === k
                                ? "bg-purple-50 dark:bg-purple-500/10 text-purple-700 dark:text-purple-300 font-medium"
                                : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                            }`}
                            title={k}
                          >
                            {k}
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                )}
              </div>

              {invCategory && invKey ? (
                <div>
                  <p className="px-3 py-2 text-[10px] uppercase tracking-wider text-slate-400 font-semibold border-b border-slate-100 dark:border-slate-800">
                    {t("topology.pickValue")}
                  </p>
                  <div className="max-h-40 overflow-y-auto">
                    {(currentInvCategory?.columns ?? []).map((col) => (
                      <button
                        key={col}
                        type="button"
                        onClick={() => { addElement(buildInventoryField(invCategory, invKey, col)); closeInvPicker(); }}
                        className="w-full text-left px-3 py-2 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                      >
                        {col}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="px-3 py-3 text-xs text-slate-400 italic">
                  {invCategory ? t("topology.pickKeyFirst") : t("topology.pickColumn")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 overflow-hidden">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${SVG_W} ${SVG_H}`}
            className="w-full select-none"
            style={{ cursor: dragging !== null ? "grabbing" : "default" }}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleSvgClick}
          >
            <defs>
              <pattern id="node-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" opacity="0.6" />
              </pattern>
            </defs>
            <rect width={SVG_W} height={SVG_H} fill="url(#node-grid)" className="bg-grid" />
            <line x1={CX-80} y1={CY} x2={CX+80} y2={CY} stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="4,4" />
            <line x1={CX} y1={CY-80} x2={CX} y2={CY+80} stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="4,4" />

            {renderShape()}

            {activeGuides.map((g, i) =>
              g.axis === "x"
                ? <line key={`g${i}`} x1={CX+g.value} y1={0} x2={CX+g.value} y2={SVG_H} stroke="#3b82f6" strokeWidth="0.8" strokeDasharray="4,3" opacity="0.7" />
                : <line key={`g${i}`} x1={0} y1={CY+g.value} x2={SVG_W} y2={CY+g.value} stroke="#3b82f6" strokeWidth="0.8" strokeDasharray="4,3" opacity="0.7" />
            )}

            {elements.map((el, idx) => {
              const tx = CX + el.x;
              const ty = CY + el.y;
              const isSelected = selected === idx;
              const cursor = dragging === idx ? "grabbing" : "grab";

              if (isBadgeField(el.field)) {
                const diameter = el.badgeSize ?? el.fontSize;
                const r = diameter / 2;
                const isCompliance = el.field === BADGE_FIELDS.compliance;
                const autoColor = isCompliance
                  ? COMPLIANCE_COLORS[SAMPLE_COMPLIANCE]
                  : (SAMPLE_REACHABLE ? "#22c55e" : "#ef4444");
                const fill = el.badgeBgColor || autoColor;
                const labelText = isCompliance && el.badgeShowLabel ? SAMPLE_COMPLIANCE : "";
                return (
                  <g key={idx} style={{ cursor }}>
                    {isSelected && (
                      <circle cx={tx} cy={ty} r={r + 4} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,2" />
                    )}
                    <circle
                      cx={tx} cy={ty} r={r}
                      fill={fill}
                      stroke={el.badgeBorderColor ?? "#ffffff"}
                      strokeWidth={el.badgeBorderWidth ?? 2}
                      onMouseDown={(e) => handleMouseDown(idx, e)}
                      style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}
                    />
                    {labelText && (
                      <text
                        x={tx} y={ty}
                        textAnchor="middle" dominantBaseline="central"
                        fill={el.color || "#ffffff"} fontSize={r * 1.2} fontWeight={700}
                        onMouseDown={(e) => handleMouseDown(idx, e)}
                        style={{ userSelect: "none" }}
                      >
                        {labelText}
                      </text>
                    )}
                  </g>
                );
              }

              const text = sampleFor(el.field);
              const charW = el.fontSize * 0.58;
              const textW = text.length * charW;
              const textH = el.fontSize * 1.3;
              const anchor = textAnchorFor(el.textAlign);
              const rx = bgRectX(tx, textW, el.textAlign);

              return (
                <g key={idx} style={{ cursor }}>
                  <rect
                    x={rx} y={ty - textH / 2} width={textW + 6} height={textH}
                    fill={isSelected ? "#dbeafe" : "white"}
                    fillOpacity={isSelected ? 0.95 : 0.85}
                    stroke={isSelected ? "#3b82f6" : "transparent"}
                    strokeWidth={isSelected ? 1.5 : 0}
                    strokeDasharray={isSelected ? "4,2" : undefined}
                    rx="3"
                    onMouseDown={(e) => handleMouseDown(idx, e)}
                  />
                  <text
                    x={tx} y={ty} textAnchor={anchor} dominantBaseline="central"
                    fill={el.color} fontSize={el.fontSize} fontWeight={el.fontWeight}
                    fontFamily={el.fontFamily}
                    fontStyle={el.fontStyle === "italic" ? "italic" : "normal"}
                    onMouseDown={(e) => handleMouseDown(idx, e)}
                    style={{ userSelect: "none" }}
                  >
                    {text}
                  </text>
                </g>
              );
            })}

            {elements.length === 0 && (
              <text x={CX} y={CY + node.height / 2 + 30} textAnchor="middle" fill="#94a3b8" fontSize="12">
                {t("topology.labelNoElements")}
              </text>
            )}
          </svg>
        </div>

        <div className="w-56 shrink-0 space-y-3">
          {sel && selected !== null ? (
            <>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t("topology.labelElementProps")}
              </h4>

              <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2.5 flex items-center gap-2">
                {selIsBadge && sel.field === BADGE_FIELDS.compliance && <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0" />}
                {selIsBadge && sel.field === BADGE_FIELDS.monitoring && <Activity className="h-4 w-4 text-emerald-500 shrink-0" />}
                {selInv && <Database className="h-4 w-4 text-purple-500 shrink-0" />}
                <span className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                  {fieldLabel(sel.field)}
                </span>
              </div>

              {selIsBadge ? (
                <>
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.badgeSize")}</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min={6} max={32} step={1} value={sel.badgeSize ?? sel.fontSize}
                        onChange={(e) => updateElement(selected, { badgeSize: Number(e.target.value), fontSize: Number(e.target.value) })}
                        className="flex-1 accent-blue-600" />
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-6 text-right">{sel.badgeSize ?? sel.fontSize}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.badgeBorderWidth")}</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min={0} max={6} step={0.5} value={sel.badgeBorderWidth ?? 2}
                        onChange={(e) => updateElement(selected, { badgeBorderWidth: Number(e.target.value) })}
                        className="flex-1 accent-blue-600" />
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-6 text-right">{sel.badgeBorderWidth ?? 2}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.badgeBorderColor")}</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={sel.badgeBorderColor ?? "#ffffff"} onChange={(e) => updateElement(selected, { badgeBorderColor: e.target.value })}
                        className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
                      <input type="text" value={sel.badgeBorderColor ?? "#ffffff"} onChange={(e) => updateElement(selected, { badgeBorderColor: e.target.value })}
                        className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-mono text-slate-900 dark:text-slate-100" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.badgeFillColor")}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="color"
                        value={sel.badgeBgColor ?? "#22c55e"}
                        onChange={(e) => updateElement(selected, { badgeBgColor: e.target.value })}
                        className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5"
                      />
                      <input
                        type="text"
                        placeholder={t("topology.badgeFillAuto")}
                        value={sel.badgeBgColor ?? ""}
                        onChange={(e) => updateElement(selected, { badgeBgColor: e.target.value || undefined })}
                        className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-mono text-slate-900 dark:text-slate-100"
                      />
                      {sel.badgeBgColor && (
                        <button
                          type="button"
                          onClick={() => updateElement(selected, { badgeBgColor: undefined })}
                          title={t("topology.badgeFillReset")}
                          className="px-1.5 py-1 rounded border border-slate-200 dark:border-slate-700 text-[10px] text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800"
                        >
                          ↺
                        </button>
                      )}
                    </div>
                  </div>

                  {sel.field === BADGE_FIELDS.compliance && (
                    <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={sel.badgeShowLabel !== false}
                        onChange={(e) => updateElement(selected, { badgeShowLabel: e.target.checked })}
                        className="h-3.5 w-3.5 rounded border-slate-300"
                      />
                      {t("topology.badgeShowLetter")}
                    </label>
                  )}
                </>
              ) : (
                <>
                  {!selInv && (
                    <div className="space-y-1">
                      <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.labelField")}</label>
                      <select value={sel.field} onChange={(e) => updateElement(selected, { field: e.target.value })}
                        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100">
                        {BUILTIN_FIELDS.map((opt) => <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>)}
                      </select>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.labelFontSize")}</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min={3} max={24} step={1} value={sel.fontSize}
                        onChange={(e) => updateElement(selected, { fontSize: Number(e.target.value) })}
                        className="flex-1 accent-blue-600" />
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-6 text-right">{sel.fontSize}</span>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.labelColor")}</label>
                    <div className="flex items-center gap-2">
                      <input type="color" value={sel.color} onChange={(e) => updateElement(selected, { color: e.target.value })}
                        className="h-7 w-7 rounded border border-slate-200 dark:border-slate-700 cursor-pointer p-0.5" />
                      <input type="text" value={sel.color} onChange={(e) => updateElement(selected, { color: e.target.value })}
                        className="flex-1 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2 py-1 text-[10px] font-mono text-slate-900 dark:text-slate-100" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.labelFontFamily")}</label>
                    <select value={sel.fontFamily} onChange={(e) => updateElement(selected, { fontFamily: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100">
                      {FONT_FAMILIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.labelStyle")}</label>
                    <div className="flex items-center gap-1.5">
                      <button type="button" onClick={() => updateElement(selected, { fontWeight: sel.fontWeight === 700 ? 400 : 700 })} className={toggleBtn(sel.fontWeight === 700)}>
                        <Bold className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => updateElement(selected, { fontStyle: sel.fontStyle === "italic" ? "normal" : "italic" })} className={toggleBtn(sel.fontStyle === "italic")}>
                        <Italic className="h-3.5 w-3.5" />
                      </button>
                      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
                      <button type="button" onClick={() => updateElement(selected, { textAlign: "left" })} className={toggleBtn(sel.textAlign === "left")}>
                        <AlignLeft className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => updateElement(selected, { textAlign: "center" })} className={toggleBtn(!sel.textAlign || sel.textAlign === "center")}>
                        <AlignCenter className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => updateElement(selected, { textAlign: "right" })} className={toggleBtn(sel.textAlign === "right")}>
                        <AlignRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </>
              )}

              <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400 pt-1">
                <div>X: <span className="font-mono text-slate-600 dark:text-slate-300">{sel.x}</span></div>
                <div>Y: <span className="font-mono text-slate-600 dark:text-slate-300">{sel.y}</span></div>
              </div>

              <button type="button" onClick={() => removeElement(selected)}
                className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-red-200 dark:border-red-500/20 px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                <Trash2 className="h-3.5 w-3.5" />
                {t("topology.labelDeleteElement")}
              </button>
            </>
          ) : (
            <div className="text-center py-8">
              <Move className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {elements.length > 0 ? t("topology.labelSelectElement") : t("topology.labelNoElements")}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
