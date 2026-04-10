"use client";

import { useRef, useState, useCallback } from "react";
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
  Activity,
  ShieldCheck,
  ChevronDown,
} from "lucide-react";

export interface LabelElement {
  field: string; // text: "name","hostname",... | badge: "badge:monitoring","badge:compliance"
  x: number;
  y: number;
  fontSize: number; // for badges, this is the badge diameter
  color: string;
  fontWeight: number;
  fontFamily: string;
  fontStyle?: string;
  textAlign?: string;
}

interface NodeConfig {
  shape: string;
  width: number;
  height: number;
  bgColor: string;
  borderColor: string;
  borderWidth: number;
}

interface LabelEditorProps {
  elements: LabelElement[];
  onChange: (elements: LabelElement[]) => void;
  node: NodeConfig;
}

interface SnapGuide {
  axis: "x" | "y";
  value: number;
}

const SNAP_THRESHOLD = 5;

const isBadge = (field: string) => field.startsWith("badge:");

const FIELD_OPTIONS = [
  { value: "name", labelKey: "topology.fieldName" },
  { value: "hostname", labelKey: "topology.fieldHostname" },
  { value: "ipAddress", labelKey: "topology.fieldIp" },
  { value: "manufacturer", labelKey: "topology.fieldManufacturer" },
  { value: "model", labelKey: "topology.fieldModel" },
  { value: "chassisId", labelKey: "topology.fieldChassis" },
  { value: "sysDescr", labelKey: "topology.fieldSysDescr" },
];

const SAMPLE_DATA: Record<string, string> = {
  name: "RTR-CORE1",
  hostname: "RTR-CORE1-01",
  ipAddress: "10.201.100.41",
  manufacturer: "Extreme",
  model: "5520-24T",
  chassisId: "0c:2d:3d:ab",
  sysDescr: "VOSS 8.10",
};

const FONT_FAMILIES = [
  { value: "sans-serif", label: "Sans-serif" },
  { value: "serif", label: "Serif" },
  { value: "monospace", label: "Monospace" },
];

const BADGE_SAMPLE: Record<string, { color: string; label: string }> = {
  "badge:monitoring": { color: "#22c55e", label: "" },
  "badge:compliance": { color: "#22c55e", label: "A" },
};

export function migrateLabelToElements(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  label: any,
  nodeHeight: number
): LabelElement[] {
  if (label?.elements?.length) return label.elements;

  const fields: string[] = label?.fields ?? ["name"];
  const pos: string = label?.position ?? "bottom";
  const fs: number = label?.fontSize ?? 11;
  const col: string = label?.color ?? "#1e293b";
  const ff: string = label?.fontFamily ?? "sans-serif";

  return fields.map((field: string, i: number) => {
    let y: number;
    if (pos === "bottom") {
      y = nodeHeight / 2 + 14 + i * (fs + 4);
    } else if (pos === "top") {
      y = -(nodeHeight / 2 + 14 + (fields.length - 1 - i) * (fs + 4));
    } else {
      y = (i - (fields.length - 1) / 2) * (fs + 4);
    }
    return {
      field,
      x: 0,
      y: Math.round(y),
      fontSize: fs,
      color: col,
      fontWeight: i === 0 ? 600 : 400,
      fontFamily: ff,
      fontStyle: "normal",
      textAlign: "center",
    };
  });
}

export default function LabelEditor({
  elements,
  onChange,
  node,
}: LabelEditorProps) {
  const { t } = useI18n();
  const svgRef = useRef<SVGSVGElement>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [dragging, setDragging] = useState<number | null>(null);
  const [activeGuides, setActiveGuides] = useState<SnapGuide[]>([]);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const dragStart = useRef<{
    x: number;
    y: number;
    elX: number;
    elY: number;
  } | null>(null);

  const SVG_W = 500;
  const SVG_H = 300;
  const CX = SVG_W / 2;
  const CY = SVG_H / 2;

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

  const handleMouseDown = useCallback(
    (idx: number, e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const pt = toSVGPoint(e);
      const el = elements[idx];
      dragStart.current = { x: pt.x, y: pt.y, elX: el.x, elY: el.y };
      setDragging(idx);
      setSelected(idx);
    },
    [elements, toSVGPoint]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
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
    },
    [dragging, elements, onChange, toSVGPoint]
  );

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

  const addTextElement = () => {
    const y = node.height / 2 + 14 + elements.length * 16;
    onChange([...elements, {
      field: "ipAddress", x: 0, y: Math.round(y), fontSize: 10,
      color: "#64748b", fontWeight: 400, fontFamily: "sans-serif", fontStyle: "normal", textAlign: "center",
    }]);
    setSelected(elements.length);
    setAddMenuOpen(false);
  };

  const addBadgeElement = (type: "badge:monitoring" | "badge:compliance") => {
    const offsetX = type === "badge:monitoring" ? node.width / 2 + 4 : -(node.width / 2 + 4);
    onChange([...elements, {
      field: type, x: Math.round(offsetX), y: Math.round(-node.height / 2 - 4), fontSize: 12,
      color: "", fontWeight: 700, fontFamily: "sans-serif", fontStyle: "normal", textAlign: "center",
    }]);
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
  const selIsBadge = sel ? isBadge(sel.field) : false;

  const renderNodeShape = () => {
    const w = node.width, h = node.height;
    const fill = node.bgColor, stroke = node.borderColor, sw = node.borderWidth;
    switch (node.shape) {
      case "rectangle": return <rect x={CX-w/2} y={CY-h/2} width={w} height={h} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case "round-rectangle": return <rect x={CX-w/2} y={CY-h/2} width={w} height={h} rx={8} ry={8} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case "diamond": return <polygon points={`${CX},${CY-h/2} ${CX+w/2},${CY} ${CX},${CY+h/2} ${CX-w/2},${CY}`} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case "hexagon": { const r=w/2; return <polygon points={Array.from({length:6},(_,i)=>{const a=(Math.PI/3)*i-Math.PI/6;return`${CX+r*Math.cos(a)},${CY+r*Math.sin(a)}`;}).join(" ")} fill={fill} stroke={stroke} strokeWidth={sw} />; }
      case "triangle": return <polygon points={`${CX},${CY-h/2} ${CX+w/2},${CY+h/2} ${CX-w/2},${CY+h/2}`} fill={fill} stroke={stroke} strokeWidth={sw} />;
      case "star": { const o=w/2,inn=w/4; return <polygon points={Array.from({length:10},(_,i)=>{const a=(Math.PI/5)*i-Math.PI/2;const r=i%2===0?o:inn;return`${CX+r*Math.cos(a)},${CY+r*Math.sin(a)}`;}).join(" ")} fill={fill} stroke={stroke} strokeWidth={sw} />; }
      default: return <ellipse cx={CX} cy={CY} rx={w/2} ry={h/2} fill={fill} stroke={stroke} strokeWidth={sw} />;
    }
  };

  const textAnchorFor = (align?: string) => align === "left" ? "start" : align === "right" ? "end" : "middle";
  const bgRectX = (tx: number, textW: number, align?: string) =>
    align === "left" ? tx - 3 : align === "right" ? tx - textW - 3 : tx - textW / 2 - 3;

  const toggleBtnCls = (active: boolean) =>
    `p-1.5 rounded-lg border transition-colors ${active
      ? "border-blue-300 dark:border-blue-600 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300"
      : "border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800"}`;

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500 dark:text-slate-400">{t("topology.labelEditorHint")}</p>
        <div className="relative">
          <button
            onClick={() => setAddMenuOpen(!addMenuOpen)}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            {t("topology.labelAddElement")}
            <ChevronDown className="h-3 w-3 text-slate-400" />
          </button>
          {addMenuOpen && (
            <div className="absolute right-0 top-full mt-1 w-52 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-xl z-20 overflow-hidden">
              <button onClick={addTextElement} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <span className="h-4 w-4 flex items-center justify-center text-[10px] font-bold text-slate-400">A</span>
                {t("topology.labelAddText")}
              </button>
              <button onClick={() => addBadgeElement("badge:monitoring")} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-800">
                <Activity className="h-4 w-4 text-emerald-500" />
                {t("topology.badgeMonitoring")}
              </button>
              <button onClick={() => addBadgeElement("badge:compliance")} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-xs text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-t border-slate-100 dark:border-slate-800">
                <ShieldCheck className="h-4 w-4 text-blue-500" />
                {t("topology.badgeCompliance")}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-4">
        {/* SVG Canvas */}
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
              <pattern id="label-grid" width="20" height="20" patternUnits="userSpaceOnUse">
                <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#e2e8f0" strokeWidth="0.5" opacity="0.6" />
              </pattern>
            </defs>
            <rect width={SVG_W} height={SVG_H} fill="url(#label-grid)" className="bg-grid" />

            {/* Crosshair */}
            <line x1={CX-80} y1={CY} x2={CX+80} y2={CY} stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="4,4" />
            <line x1={CX} y1={CY-80} x2={CX} y2={CY+80} stroke="#cbd5e1" strokeWidth="0.5" strokeDasharray="4,4" />

            {renderNodeShape()}

            {/* Snap guides */}
            {activeGuides.map((g, i) =>
              g.axis === "x"
                ? <line key={`g${i}`} x1={CX+g.value} y1={0} x2={CX+g.value} y2={SVG_H} stroke="#3b82f6" strokeWidth="0.8" strokeDasharray="4,3" opacity="0.7" />
                : <line key={`g${i}`} x1={0} y1={CY+g.value} x2={SVG_W} y2={CY+g.value} stroke="#3b82f6" strokeWidth="0.8" strokeDasharray="4,3" opacity="0.7" />
            )}

            {/* Elements (text + badges) */}
            {elements.map((el, idx) => {
              const tx = CX + el.x;
              const ty = CY + el.y;
              const isSelected = selected === idx;
              const isDragging = dragging === idx;
              const cursor = isDragging ? "grabbing" : "grab";

              if (isBadge(el.field)) {
                // Badge element
                const sample = BADGE_SAMPLE[el.field] ?? { color: "#94a3b8", label: "?" };
                const r = el.fontSize / 2;
                return (
                  <g key={idx} style={{ cursor }}>
                    {/* Selection ring */}
                    {isSelected && (
                      <circle cx={tx} cy={ty} r={r + 4} fill="none" stroke="#3b82f6" strokeWidth="1.5" strokeDasharray="4,2" />
                    )}
                    {/* Badge circle */}
                    <circle
                      cx={tx} cy={ty} r={r}
                      fill={sample.color}
                      stroke="white" strokeWidth="2"
                      onMouseDown={(e) => handleMouseDown(idx, e)}
                      style={{ filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.2))" }}
                    />
                    {/* Badge label */}
                    {sample.label && (
                      <text
                        x={tx} y={ty}
                        textAnchor="middle" dominantBaseline="central"
                        fill="white" fontSize={r * 1.2} fontWeight={700}
                        onMouseDown={(e) => handleMouseDown(idx, e)}
                        style={{ userSelect: "none" }}
                      >
                        {sample.label}
                      </text>
                    )}
                  </g>
                );
              }

              // Text element
              const text = SAMPLE_DATA[el.field] ?? el.field;
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

        {/* Properties panel */}
        <div className="w-52 shrink-0 space-y-3">
          {sel && selected !== null ? (
            <>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                {t("topology.labelElementProps")}
              </h4>

              {selIsBadge ? (
                <>
                  {/* Badge properties */}
                  <div className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 p-2.5">
                    {sel.field === "badge:monitoring"
                      ? <Activity className="h-4 w-4 text-emerald-500 shrink-0" />
                      : <ShieldCheck className="h-4 w-4 text-blue-500 shrink-0" />
                    }
                    <span className="text-xs font-medium text-slate-900 dark:text-slate-100">
                      {sel.field === "badge:monitoring" ? t("topology.badgeMonitoring") : t("topology.badgeCompliance")}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">
                      {t("topology.badgeSize")}
                    </label>
                    <div className="flex items-center gap-2">
                      <input type="range" min={6} max={24} step={1} value={sel.fontSize}
                        onChange={(e) => updateElement(selected, { fontSize: Number(e.target.value) })}
                        className="flex-1 accent-blue-600" />
                      <span className="text-xs font-mono text-slate-600 dark:text-slate-300 w-6 text-right">{sel.fontSize}</span>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* Text properties */}
                  <div className="space-y-1">
                    <label className="block text-[10px] uppercase tracking-wider text-slate-400 font-semibold">{t("topology.labelField")}</label>
                    <select value={sel.field} onChange={(e) => updateElement(selected, { field: e.target.value })}
                      className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-2.5 py-1.5 text-xs text-slate-900 dark:text-slate-100">
                      {FIELD_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>)}
                    </select>
                  </div>

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
                      <button onClick={() => updateElement(selected, { fontWeight: sel.fontWeight === 700 ? 400 : 700 })} title={t("topology.labelBold")} className={toggleBtnCls(sel.fontWeight === 700)}>
                        <Bold className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => updateElement(selected, { fontStyle: sel.fontStyle === "italic" ? "normal" : "italic" })} title={t("topology.labelItalic")} className={toggleBtnCls(sel.fontStyle === "italic")}>
                        <Italic className="h-3.5 w-3.5" />
                      </button>
                      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />
                      <button onClick={() => updateElement(selected, { textAlign: "left" })} title={t("topology.labelAlignLeft")} className={toggleBtnCls(sel.textAlign === "left")}>
                        <AlignLeft className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => updateElement(selected, { textAlign: "center" })} title={t("topology.labelAlignCenter")} className={toggleBtnCls(!sel.textAlign || sel.textAlign === "center")}>
                        <AlignCenter className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => updateElement(selected, { textAlign: "right" })} title={t("topology.labelAlignRight")} className={toggleBtnCls(sel.textAlign === "right")}>
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

              <button onClick={() => removeElement(selected)}
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
