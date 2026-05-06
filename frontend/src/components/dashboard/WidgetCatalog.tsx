"use client";

import { X, ShieldCheck, ShieldAlert, Server, Network, FileSearch, FileText, Zap, Layers } from "lucide-react";
import { WIDGET_REGISTRY, FAKE_DATA, type WidgetDef } from "./widgetRegistry";
import { getWidgetComponent, getWidgetIcon, getWidgetTitle } from "./widgets";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  layout: <Layers className="h-4 w-4 text-slate-500" />,
  compliance: <ShieldCheck className="h-4 w-4 text-emerald-500" />,
  nodes: <Server className="h-4 w-4 text-blue-500" />,
  topology: <Network className="h-4 w-4 text-violet-500" />,
  collections: <FileSearch className="h-4 w-4 text-amber-500" />,
  reports: <FileText className="h-4 w-4 text-rose-500" />,
  automations: <Zap className="h-4 w-4 text-teal-500" />,
  vulnerabilities: <ShieldAlert className="h-4 w-4 text-red-500" />,
};

interface WidgetCatalogProps {
  onAdd: (type: string) => void;
  onClose: () => void;
  existingTypes: string[];
  t: (key: string) => string;
}

function WidgetPreviewCard({ w, instanceCount, onAdd, t }: { w: WidgetDef; instanceCount: number; onAdd: () => void; t: (key: string) => string }) {
  const Comp = getWidgetComponent(w.type);
  const icon = getWidgetIcon(w.type);
  // Widgets that are only one row tall don't have room for a footer.
  // The widget content itself carries the label, so we hide it and rely on a
  // hover overlay for the title + size info.
  const compact = w.defaultH === 1;
  return (
    <button
      onClick={() => onAdd()}
      style={{ gridColumn: `span ${w.defaultW} / span ${w.defaultW}`, gridRow: `span ${w.defaultH} / span ${w.defaultH}` }}
      className="group relative flex flex-col rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-md cursor-pointer bg-white dark:bg-slate-900 text-left transition-all overflow-hidden h-full"
      title={`${getWidgetTitle(w.type, t)} • ${w.defaultW}×${w.defaultH}`}
    >
      {instanceCount > 0 && (
        <span className="absolute top-1 right-1 z-20 inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[9px] font-bold shadow">
          ×{instanceCount}
        </span>
      )}
      <div className="@container relative flex-1 min-h-0 overflow-hidden bg-slate-50/60 dark:bg-slate-800/40">
        <div className="pointer-events-none select-none absolute inset-0 p-2">
          {Comp ? <Comp data={FAKE_DATA} t={t} /> : <p className="text-xs text-slate-400">—</p>}
        </div>
        {compact && (
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 px-2 py-1 bg-gradient-to-t from-white via-white/90 dark:from-slate-900 dark:via-slate-900/90 to-transparent flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className="text-slate-400 dark:text-slate-500 shrink-0">{icon}</span>
            <p className="flex-1 text-[10px] font-medium text-slate-900 dark:text-slate-100 truncate">{getWidgetTitle(w.type, t)}</p>
            <span className="text-[9px] text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">{w.defaultW}×{w.defaultH}</span>
          </div>
        )}
      </div>
      {!compact && (
        <div className="flex items-center gap-1.5 px-2 py-1 min-w-0 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
          <span className="text-slate-400 dark:text-slate-500 shrink-0">{icon}</span>
          <p className="flex-1 text-[11px] font-medium text-slate-900 dark:text-slate-100 truncate">{getWidgetTitle(w.type, t)}</p>
          <span className="text-[9px] text-slate-400 dark:text-slate-500 shrink-0 tabular-nums">{w.defaultW}×{w.defaultH}</span>
        </div>
      )}
    </button>
  );
}

export default function WidgetCatalog({ onAdd, onClose, existingTypes, t }: WidgetCatalogProps) {
  const categories = [...new Set(WIDGET_REGISTRY.map((w) => w.category))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-[5vh_5vw]">
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-[90vw] h-[90vh] bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("dashboard.addWidget")}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-8">
          {categories.map((cat) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                {CATEGORY_ICONS[cat]}
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize">{t(`dashboard.cat_${cat}`)}</h3>
              </div>
              <div className="grid grid-cols-12 gap-3 auto-rows-[80px]">
                {WIDGET_REGISTRY.filter((w) => w.category === cat).map((w) => (
                  <WidgetPreviewCard
                    key={w.type}
                    w={w}
                    instanceCount={existingTypes.filter((t) => t === w.type).length}
                    onAdd={() => onAdd(w.type)}
                    t={t}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
