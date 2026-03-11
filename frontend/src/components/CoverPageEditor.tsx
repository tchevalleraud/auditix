"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  Type,
  Image,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Trash2,
  Plus,
  FileText,
  Move,
  Upload,
  X,
  Copy,
} from "lucide-react";

const FONTS = [
  "Calibri", "Arial", "Times New Roman", "Georgia", "Verdana", "Cambria",
  "Garamond", "Trebuchet MS", "Tahoma", "Century Gothic", "Palatino Linotype",
  "Book Antiqua", "Roboto", "Open Sans", "Lato", "Source Sans Pro",
];

export interface CoverPageElement {
  id: string;
  type: "variable" | "text" | "image";
  variable?: string;
  content?: string;
  preview?: string;
  src?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  style?: {
    fontFamily?: string;
    fontSize?: number;
    fontWeight?: string;
    fontStyle?: string;
    color?: string;
    textAlign?: string;
  };
}

export interface CoverPageData {
  background: string;
  elements: CoverPageElement[];
}

interface Margins {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

interface Props {
  data: CoverPageData;
  margins?: Margins;
  onChange: (data: CoverPageData) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const VARIABLES = [
  { key: "title", label: "coverPage.varTitle" },
  { key: "subtitle", label: "coverPage.varSubtitle" },
  { key: "date", label: "coverPage.varDate" },
];

const VARIABLE_PREVIEWS: Record<string, string> = {
  title: "Audit de securite 2026",
  subtitle: "Rapport final",
  date: "11/03/2026",
};

// Only allow <b>, <i>, <br> tags - strip everything else
function sanitizeHtml(html: string): string {
  return html.replace(/<(?!\/?(?:b|i|br)\b)[^>]*>/gi, "");
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// A4 width in pt (72 DPI): 210mm * 72/25.4
const A4_WIDTH_PT = 595.28;

const SNAP_THRESHOLD = 1.2; // % threshold for snapping

export default function CoverPageEditor({ data, margins, onChange, t }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [canvasScale, setCanvasScale] = useState(0.5);
  const [snapLines, setSnapLines] = useState<{ x?: number; y?: number }[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Convert margins from mm to % of page
  const marginPct = {
    top: ((margins?.top ?? 20) / 297) * 100,
    bottom: ((margins?.bottom ?? 20) / 297) * 100,
    left: ((margins?.left ?? 20) / 210) * 100,
    right: ((margins?.right ?? 20) / 210) * 100,
  };
  const dragRef = useRef<{
    elementId: string;
    startX: number;
    startY: number;
    startElX: number;
    startElY: number;
  } | null>(null);
  const resizeRef = useRef<{
    elementId: string;
    handle: string;
    startX: number;
    startY: number;
    startElX: number;
    startElY: number;
    startW: number;
    startH: number;
  } | null>(null);

  // Track canvas actual width to compute scale factor (canvas px / A4 pt)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasScale(entry.contentRect.width / A4_WIDTH_PT);
      }
    });
    observer.observe(canvas);
    return () => observer.disconnect();
  }, []);

  const selected = data.elements.find((el) => el.id === selectedId) ?? null;

  const updateElements = useCallback(
    (elements: CoverPageElement[]) => {
      onChange({ ...data, elements });
    },
    [data, onChange]
  );

  const updateElement = useCallback(
    (id: string, patch: Partial<CoverPageElement>) => {
      updateElements(data.elements.map((el) => (el.id === id ? { ...el, ...patch } : el)));
    },
    [data.elements, updateElements]
  );

  const updateElementStyle = useCallback(
    (id: string, stylePatch: Partial<NonNullable<CoverPageElement["style"]>>) => {
      const el = data.elements.find((e) => e.id === id);
      if (!el) return;
      updateElement(id, { style: { ...el.style, ...stylePatch } });
    },
    [data.elements, updateElement]
  );

  const addElement = (type: CoverPageElement["type"], variable?: string) => {
    const el: CoverPageElement = {
      id: uid(),
      type,
      x: 10,
      y: 10,
      width: 80,
      height: type === "image" ? 20 : 8,
      style: {
        fontFamily: "Calibri",
        fontSize: type === "variable" && variable === "title" ? 32 : type === "variable" && variable === "subtitle" ? 20 : 14,
        fontWeight: type === "variable" && variable === "title" ? "bold" : "normal",
        fontStyle: "normal",
        color: "#1e293b",
        textAlign: "center",
      },
    };
    if (type === "variable") {
      el.variable = variable;
      el.preview = VARIABLE_PREVIEWS[variable ?? ""] ?? "";
    }
    if (type === "text") el.content = t("coverPage.defaultText");
    if (type === "image") el.src = "";
    onChange({ ...data, elements: [...data.elements, el] });
    setSelectedId(el.id);
  };

  const deleteElement = (id: string) => {
    updateElements(data.elements.filter((el) => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateElement = (id: string) => {
    const el = data.elements.find((e) => e.id === id);
    if (!el) return;
    const dup = { ...el, id: uid(), x: Math.min(el.x + 3, 90), y: Math.min(el.y + 3, 90) };
    onChange({ ...data, elements: [...data.elements, dup] });
    setSelectedId(dup.id);
  };

  // --- Drag ---
  const onMouseDownDrag = (e: React.MouseEvent, elementId: string) => {
    if (resizeRef.current) return;
    e.stopPropagation();
    e.preventDefault();
    const el = data.elements.find((x) => x.id === elementId);
    if (!el) return;
    setSelectedId(elementId);
    dragRef.current = { elementId, startX: e.clientX, startY: e.clientY, startElX: el.x, startElY: el.y };
  };

  const onMouseDownResize = (e: React.MouseEvent, elementId: string, handle: string) => {
    e.stopPropagation();
    e.preventDefault();
    const el = data.elements.find((x) => x.id === elementId);
    if (!el) return;
    resizeRef.current = {
      elementId,
      handle,
      startX: e.clientX,
      startY: e.clientY,
      startElX: el.x,
      startElY: el.y,
      startW: el.width,
      startH: el.height,
    };
  };

  // Compute snap targets: margins, center, other elements
  const getSnapTargets = useCallback((excludeId: string) => {
    const xTargets: number[] = [
      marginPct.left,
      100 - marginPct.right,
      50, // center
    ];
    const yTargets: number[] = [
      marginPct.top,
      100 - marginPct.bottom,
      50, // center
    ];
    // Add other element edges
    for (const el of data.elements) {
      if (el.id === excludeId) continue;
      xTargets.push(el.x, el.x + el.width, el.x + el.width / 2);
      yTargets.push(el.y, el.y + el.height, el.y + el.height / 2);
    }
    return { xTargets, yTargets };
  }, [data.elements, marginPct]);

  const snapValue = (val: number, targets: number[]): { snapped: number; line: number | undefined } => {
    for (const t of targets) {
      if (Math.abs(val - t) < SNAP_THRESHOLD) {
        return { snapped: t, line: t };
      }
    }
    return { snapped: val, line: undefined };
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();

      if (dragRef.current) {
        const dx = ((e.clientX - dragRef.current.startX) / rect.width) * 100;
        const dy = ((e.clientY - dragRef.current.startY) / rect.height) * 100;
        const el = data.elements.find((x) => x.id === dragRef.current!.elementId);
        if (!el) return;
        let newX = Math.max(0, Math.min(100 - el.width, dragRef.current.startElX + dx));
        let newY = Math.max(0, Math.min(100 - el.height, dragRef.current.startElY + dy));

        const { xTargets, yTargets } = getSnapTargets(el.id);
        const lines: { x?: number; y?: number }[] = [];

        // Snap left edge, right edge, center
        const snapL = snapValue(newX, xTargets);
        const snapR = snapValue(newX + el.width, xTargets);
        const snapCx = snapValue(newX + el.width / 2, xTargets);
        if (snapL.line !== undefined) { newX = snapL.snapped; lines.push({ x: snapL.line }); }
        else if (snapR.line !== undefined) { newX = snapR.snapped - el.width; lines.push({ x: snapR.line }); }
        else if (snapCx.line !== undefined) { newX = snapCx.snapped - el.width / 2; lines.push({ x: snapCx.line }); }

        // Snap top edge, bottom edge, center
        const snapT = snapValue(newY, yTargets);
        const snapB = snapValue(newY + el.height, yTargets);
        const snapCy = snapValue(newY + el.height / 2, yTargets);
        if (snapT.line !== undefined) { newY = snapT.snapped; lines.push({ y: snapT.line }); }
        else if (snapB.line !== undefined) { newY = snapB.snapped - el.height; lines.push({ y: snapB.line }); }
        else if (snapCy.line !== undefined) { newY = snapCy.snapped - el.height / 2; lines.push({ y: snapCy.line }); }

        setSnapLines(lines);
        updateElement(dragRef.current.elementId, { x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 });
      }

      if (resizeRef.current) {
        const r = resizeRef.current;
        const dx = ((e.clientX - r.startX) / rect.width) * 100;
        const dy = ((e.clientY - r.startY) / rect.height) * 100;

        let newX = r.startElX;
        let newY = r.startElY;
        let newW = r.startW;
        let newH = r.startH;

        if (r.handle.includes("e")) { newW = Math.max(5, Math.min(100 - r.startElX, r.startW + dx)); }
        if (r.handle.includes("w")) { newW = Math.max(5, r.startW - dx); newX = r.startElX + r.startW - newW; }
        if (r.handle.includes("s")) { newH = Math.max(3, Math.min(100 - r.startElY, r.startH + dy)); }
        if (r.handle.includes("n")) { newH = Math.max(3, r.startH - dy); newY = r.startElY + r.startH - newH; }

        // Snap resize edges
        const { xTargets, yTargets } = getSnapTargets(r.elementId);
        const lines: { x?: number; y?: number }[] = [];

        if (r.handle.includes("e")) {
          const snap = snapValue(newX + newW, xTargets);
          if (snap.line !== undefined) { newW = snap.snapped - newX; lines.push({ x: snap.line }); }
        }
        if (r.handle.includes("w")) {
          const snap = snapValue(newX, xTargets);
          if (snap.line !== undefined) { const diff = newX - snap.snapped; newX = snap.snapped; newW += diff; lines.push({ x: snap.line }); }
        }
        if (r.handle.includes("s")) {
          const snap = snapValue(newY + newH, yTargets);
          if (snap.line !== undefined) { newH = snap.snapped - newY; lines.push({ y: snap.line }); }
        }
        if (r.handle.includes("n")) {
          const snap = snapValue(newY, yTargets);
          if (snap.line !== undefined) { const diff = newY - snap.snapped; newY = snap.snapped; newH += diff; lines.push({ y: snap.line }); }
        }

        setSnapLines(lines);
        updateElement(r.elementId, {
          x: Math.round(newX * 10) / 10,
          y: Math.round(newY * 10) / 10,
          width: Math.round(newW * 10) / 10,
          height: Math.round(newH * 10) / 10,
        });
      }
    };

    const onMouseUp = () => {
      dragRef.current = null;
      resizeRef.current = null;
      setSnapLines([]);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [data.elements, updateElement, getSnapTargets]);

  const inputClass =
    "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
  const labelClass = "block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1";

  return (
    <div className="flex gap-4 min-h-0 h-full">
      {/* Left panel - Elements palette */}
      <div className="w-64 shrink-0 space-y-3 overflow-y-auto">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">
            {t("coverPage.variables")}
          </h3>
          <div className="space-y-1">
            {VARIABLES.map((v) => (
              <button
                key={v.key}
                onClick={() => addElement("variable", v.key)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <Plus className="h-3.5 w-3.5 text-slate-400" />
                {t(v.label)}
              </button>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">
            {t("coverPage.elements")}
          </h3>
          <div className="space-y-1">
            <button
              onClick={() => addElement("text")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Type className="h-3.5 w-3.5 text-slate-400" />
              {t("coverPage.addText")}
            </button>
            <button
              onClick={() => addElement("image")}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              <Image className="h-3.5 w-3.5 text-slate-400" />
              {t("coverPage.addImage")}
            </button>
          </div>
        </div>

        {/* Background */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 space-y-3">
          <h3 className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">
            {t("coverPage.background")}
          </h3>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={data.background}
              onChange={(e) => onChange({ ...data, background: e.target.value })}
              className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 cursor-pointer"
            />
            <input
              type="text"
              value={data.background}
              onChange={(e) => onChange({ ...data, background: e.target.value })}
              className={`${inputClass} font-mono text-xs`}
            />
          </div>
        </div>
      </div>

      {/* Center - Canvas A4 */}
      <div className="flex-1 flex items-center justify-center min-w-0 h-full">
        <div
          ref={canvasRef}
          className="relative border border-slate-300 dark:border-slate-600 shadow-lg"
          style={{
            maxHeight: "100%",
            maxWidth: "100%",
            aspectRatio: "210 / 297",
            height: "100%",
            background: data.background,
          }}
          onMouseDown={(e) => { if (e.target === e.currentTarget) setSelectedId(null); }}
        >
          {/* Margin guides */}
          <div
            className="absolute border border-dashed border-blue-400/40 pointer-events-none z-0"
            style={{
              top: `${marginPct.top}%`,
              left: `${marginPct.left}%`,
              right: `${marginPct.right}%`,
              bottom: `${marginPct.bottom}%`,
            }}
          />

          {/* Snap lines */}
          {snapLines.map((line, i) => (
            line.x !== undefined ? (
              <div
                key={`sx-${i}`}
                className="absolute top-0 bottom-0 pointer-events-none z-30"
                style={{ left: `${line.x}%`, width: 1, background: "#f43f5e" }}
              />
            ) : line.y !== undefined ? (
              <div
                key={`sy-${i}`}
                className="absolute left-0 right-0 pointer-events-none z-30"
                style={{ top: `${line.y}%`, height: 1, background: "#f43f5e" }}
              />
            ) : null
          ))}

          {data.elements.map((el) => {
            const isSelected = el.id === selectedId;
            return (
              <div
                key={el.id}
                className={`absolute group ${isSelected ? "ring-2 ring-blue-500" : "hover:ring-1 hover:ring-blue-300"}`}
                style={{
                  left: `${el.x}%`,
                  top: `${el.y}%`,
                  width: `${el.width}%`,
                  height: `${el.height}%`,
                  cursor: "move",
                }}
                onMouseDown={(e) => onMouseDownDrag(e, el.id)}
              >
                {/* Element content */}
                <div className="w-full h-full overflow-hidden flex items-center justify-center select-none pointer-events-none">
                  {el.type === "variable" && (
                    <span
                      className="w-full block"
                      style={{
                        fontFamily: el.style?.fontFamily,
                        fontSize: `${(el.style?.fontSize ?? 14) * canvasScale}px`,
                        lineHeight: 1.3,
                        fontWeight: el.style?.fontWeight,
                        fontStyle: el.style?.fontStyle,
                        color: el.style?.color,
                        textAlign: (el.style?.textAlign as CanvasTextAlign) ?? "center",
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                      }}
                    >
                      {el.preview || (VARIABLE_PREVIEWS[el.variable ?? ""] ?? el.variable)}
                    </span>
                  )}
                  {el.type === "text" && (
                    <span
                      className="w-full block"
                      style={{
                        fontFamily: el.style?.fontFamily,
                        fontSize: `${(el.style?.fontSize ?? 14) * canvasScale}px`,
                        lineHeight: 1.3,
                        fontWeight: el.style?.fontWeight,
                        fontStyle: el.style?.fontStyle,
                        color: el.style?.color,
                        textAlign: (el.style?.textAlign as CanvasTextAlign) ?? "center",
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                        whiteSpace: "pre-wrap",
                      }}
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml((el.content ?? "").replace(/\n/g, "<br>")) }}
                    />
                  )}
                  {el.type === "image" && (
                    el.src ? (
                      <img src={el.src} alt="" className="w-full h-full object-contain" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 rounded text-slate-400">
                        <Image className="h-6 w-6" />
                      </div>
                    )
                  )}
                </div>

                {/* Resize handles */}
                {isSelected && (
                  <>
                    {["nw", "ne", "sw", "se", "n", "s", "e", "w"].map((handle) => {
                      const pos: Record<string, string> = {
                        nw: "top-0 left-0 cursor-nw-resize -translate-x-1/2 -translate-y-1/2",
                        ne: "top-0 right-0 cursor-ne-resize translate-x-1/2 -translate-y-1/2",
                        sw: "bottom-0 left-0 cursor-sw-resize -translate-x-1/2 translate-y-1/2",
                        se: "bottom-0 right-0 cursor-se-resize translate-x-1/2 translate-y-1/2",
                        n: "top-0 left-1/2 cursor-n-resize -translate-x-1/2 -translate-y-1/2",
                        s: "bottom-0 left-1/2 cursor-s-resize -translate-x-1/2 translate-y-1/2",
                        e: "top-1/2 right-0 cursor-e-resize translate-x-1/2 -translate-y-1/2",
                        w: "top-1/2 left-0 cursor-w-resize -translate-x-1/2 -translate-y-1/2",
                      };
                      return (
                        <div
                          key={handle}
                          className={`absolute h-2.5 w-2.5 rounded-full bg-blue-500 border-2 border-white ${pos[handle]}`}
                          onMouseDown={(e) => onMouseDownResize(e, el.id, handle)}
                        />
                      );
                    })}
                  </>
                )}
              </div>
            );
          })}

          {/* Empty state */}
          {data.elements.length === 0 && (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 dark:text-slate-500 gap-2">
              <FileText className="h-10 w-10" />
              <p className="text-sm">{t("coverPage.emptyCanvas")}</p>
            </div>
          )}
        </div>
      </div>

      {/* Right panel - Properties */}
      <div className="w-76 shrink-0 overflow-y-auto">
        {selected ? (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase text-slate-400 dark:text-slate-500">
                {t("coverPage.properties")}
              </h3>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => duplicateElement(selected.id)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 transition-colors"
                  title={t("coverPage.duplicate")}
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => deleteElement(selected.id)}
                  className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-500 transition-colors"
                  title={t("coverPage.delete")}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Type badge */}
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300">
                {selected.type === "variable" && <><Move className="h-3 w-3" /> {t(`coverPage.var_${selected.variable}`)}</>}
                {selected.type === "text" && <><Type className="h-3 w-3" /> {t("coverPage.text")}</>}
                {selected.type === "image" && <><Image className="h-3 w-3" /> {t("coverPage.image")}</>}
              </span>
            </div>

            {/* Preview data (variable only) */}
            {selected.type === "variable" && (
              <div>
                <label className={labelClass}>{t("coverPage.previewData")}</label>
                <input
                  type="text"
                  value={selected.preview ?? VARIABLE_PREVIEWS[selected.variable ?? ""] ?? ""}
                  onChange={(e) => updateElement(selected.id, { preview: e.target.value })}
                  placeholder={VARIABLE_PREVIEWS[selected.variable ?? ""] ?? ""}
                  className={`${inputClass} text-xs`}
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  {t("coverPage.variableInfo")}: <code className="text-blue-500">{`{{${selected.variable}}}`}</code>
                </span>
              </div>
            )}

            {/* Content (text only) */}
            {selected.type === "text" && (
              <div>
                <label className={labelClass}>{t("coverPage.content")}</label>
                <div className="flex items-center gap-1 mb-1">
                  <button
                    type="button"
                    onClick={() => {
                      const ta = document.getElementById("cp-text-content") as HTMLTextAreaElement | null;
                      if (!ta) return;
                      const start = ta.selectionStart;
                      const end = ta.selectionEnd;
                      const val = ta.value;
                      const sel = val.substring(start, end);
                      const newVal = val.substring(0, start) + "<b>" + sel + "</b>" + val.substring(end);
                      updateElement(selected.id, { content: newVal });
                    }}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title={t("coverPage.wrapBold")}
                  >
                    <Bold className="h-3 w-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const ta = document.getElementById("cp-text-content") as HTMLTextAreaElement | null;
                      if (!ta) return;
                      const start = ta.selectionStart;
                      const end = ta.selectionEnd;
                      const val = ta.value;
                      const sel = val.substring(start, end);
                      const newVal = val.substring(0, start) + "<i>" + sel + "</i>" + val.substring(end);
                      updateElement(selected.id, { content: newVal });
                    }}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title={t("coverPage.wrapItalic")}
                  >
                    <Italic className="h-3 w-3" />
                  </button>
                </div>
                <textarea
                  id="cp-text-content"
                  value={selected.content ?? ""}
                  onChange={(e) => updateElement(selected.id, { content: e.target.value })}
                  rows={3}
                  className={`${inputClass} resize-none text-xs font-mono`}
                />
              </div>
            )}

            {/* Image upload */}
            {selected.type === "image" && (
              <div>
                <label className={labelClass}>{t("coverPage.image")}</label>
                {selected.src ? (
                  <div className="space-y-2">
                    <div className="relative rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden bg-slate-50 dark:bg-slate-800">
                      <img src={selected.src} alt="" className="w-full h-24 object-contain" />
                      <button
                        type="button"
                        onClick={async () => {
                          const filename = selected.src?.split("/").pop();
                          if (filename) {
                            await fetch(`/api/cover-page-images/${filename}`, { method: "DELETE" });
                          }
                          updateElement(selected.id, { src: "" });
                        }}
                        className="absolute top-1 right-1 p-1 rounded-full bg-red-500 text-white hover:bg-red-600 transition-colors"
                        title={t("coverPage.removeImage")}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <label className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 p-4 cursor-pointer hover:border-slate-400 dark:hover:border-slate-500 transition-colors">
                    <Upload className="h-5 w-5 text-slate-400" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">{t("coverPage.uploadImage")}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/svg+xml"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const formData = new FormData();
                        formData.append("image", file);
                        const res = await fetch("/api/cover-page-images", { method: "POST", body: formData });
                        if (res.ok) {
                          const data = await res.json();
                          updateElement(selected.id, { src: data.url });
                        }
                      }}
                    />
                  </label>
                )}
              </div>
            )}

            {/* Typography (text & variable) */}
            {selected.type !== "image" && (
              <>
                <div>
                  <label className={labelClass}>{t("coverPage.font")}</label>
                  <select
                    value={selected.style?.fontFamily ?? "Calibri"}
                    onChange={(e) => updateElementStyle(selected.id, { fontFamily: e.target.value })}
                    className={`${inputClass} text-xs`}
                  >
                    {FONTS.map((f) => (
                      <option key={f} value={f}>{f}</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>{t("coverPage.size")}</label>
                    <input
                      type="number"
                      value={selected.style?.fontSize ?? 14}
                      onChange={(e) => updateElementStyle(selected.id, { fontSize: Number(e.target.value) })}
                      min={8}
                      max={120}
                      className={`${inputClass} text-xs`}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t("coverPage.color")}</label>
                    <div className="flex items-center gap-1.5">
                      <input
                        type="color"
                        value={selected.style?.color ?? "#1e293b"}
                        onChange={(e) => updateElementStyle(selected.id, { color: e.target.value })}
                        className="h-8 w-8 rounded border border-slate-200 dark:border-slate-700 cursor-pointer shrink-0"
                      />
                      <input
                        type="text"
                        value={selected.style?.color ?? "#1e293b"}
                        onChange={(e) => updateElementStyle(selected.id, { color: e.target.value })}
                        className={`${inputClass} text-xs font-mono`}
                      />
                    </div>
                  </div>
                </div>

                {/* Bold / Italic / Align */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => updateElementStyle(selected.id, { fontWeight: selected.style?.fontWeight === "bold" ? "normal" : "bold" })}
                    className={`p-2 rounded-lg border transition-colors ${
                      selected.style?.fontWeight === "bold"
                        ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                        : "border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Bold className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => updateElementStyle(selected.id, { fontStyle: selected.style?.fontStyle === "italic" ? "normal" : "italic" })}
                    className={`p-2 rounded-lg border transition-colors ${
                      selected.style?.fontStyle === "italic"
                        ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                        : "border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                    }`}
                  >
                    <Italic className="h-3.5 w-3.5" />
                  </button>
                  <div className="w-px h-6 bg-slate-200 dark:bg-slate-700 mx-1" />
                  {(["left", "center", "right"] as const).map((align) => {
                    const Icon = align === "left" ? AlignLeft : align === "center" ? AlignCenter : AlignRight;
                    return (
                      <button
                        key={align}
                        type="button"
                        onClick={() => updateElementStyle(selected.id, { textAlign: align })}
                        className={`p-2 rounded-lg border transition-colors ${
                          (selected.style?.textAlign ?? "center") === align
                            ? "border-slate-900 dark:border-white bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                            : "border-slate-200 dark:border-slate-700 text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {/* Position */}
            <div>
              <label className={labelClass}>{t("coverPage.position")}</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-slate-400">X (%)</span>
                  <input
                    type="number"
                    value={selected.x}
                    onChange={(e) => updateElement(selected.id, { x: Number(e.target.value) })}
                    min={0}
                    max={100}
                    step={0.5}
                    className={`${inputClass} text-xs`}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">Y (%)</span>
                  <input
                    type="number"
                    value={selected.y}
                    onChange={(e) => updateElement(selected.id, { y: Number(e.target.value) })}
                    min={0}
                    max={100}
                    step={0.5}
                    className={`${inputClass} text-xs`}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">{t("coverPage.width")} (%)</span>
                  <input
                    type="number"
                    value={selected.width}
                    onChange={(e) => updateElement(selected.id, { width: Number(e.target.value) })}
                    min={5}
                    max={100}
                    step={0.5}
                    className={`${inputClass} text-xs`}
                  />
                </div>
                <div>
                  <span className="text-[10px] text-slate-400">{t("coverPage.height")} (%)</span>
                  <input
                    type="number"
                    value={selected.height}
                    onChange={(e) => updateElement(selected.id, { height: Number(e.target.value) })}
                    min={3}
                    max={100}
                    step={0.5}
                    className={`${inputClass} text-xs`}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 flex flex-col items-center justify-center text-center gap-2">
            <Move className="h-6 w-6 text-slate-300 dark:text-slate-600" />
            <p className="text-xs text-slate-400 dark:text-slate-500">
              {t("coverPage.noSelection")}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
