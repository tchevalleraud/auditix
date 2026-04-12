"use client";

import { X, ShieldCheck, ShieldAlert, Server, Network, FileSearch, FileText, Zap } from "lucide-react";
import { WIDGET_REGISTRY } from "./widgetRegistry";

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
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

export default function WidgetCatalog({ onAdd, onClose, existingTypes, t }: WidgetCatalogProps) {
  const categories = [...new Set(WIDGET_REGISTRY.map((w) => w.category))];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("dashboard.addWidget")}</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {categories.map((cat) => (
            <div key={cat}>
              <div className="flex items-center gap-2 mb-3">
                {CATEGORY_ICONS[cat]}
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 capitalize">{t(`dashboard.cat_${cat}`)}</h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {WIDGET_REGISTRY.filter((w) => w.category === cat).map((w) => {
                  const alreadyAdded = existingTypes.includes(w.type);
                  return (
                    <button
                      key={w.type}
                      onClick={() => { if (!alreadyAdded) onAdd(w.type); }}
                      disabled={alreadyAdded}
                      className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors ${
                        alreadyAdded
                          ? "border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 opacity-50 cursor-not-allowed"
                          : "border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{t(`dashboard.w_${w.type}`)}</p>
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{w.defaultW}x{w.defaultH}</p>
                      </div>
                      {alreadyAdded && <span className="text-[10px] text-slate-400 shrink-0">{t("dashboard.alreadyAdded")}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
