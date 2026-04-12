"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import GridLayout from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import { useAppContext } from "@/components/ContextProvider";
import { useI18n } from "@/components/I18nProvider";
import { Loader2, LayoutDashboard, Pencil, Plus, RotateCcw, Check } from "lucide-react";
import WidgetCard from "@/components/dashboard/WidgetCard";
import WidgetCatalog from "@/components/dashboard/WidgetCatalog";
import { getWidgetComponent, getWidgetIcon } from "@/components/dashboard/widgets";
import { WIDGET_REGISTRY, DEFAULT_LAYOUT, FAKE_DATA, type WidgetInstance } from "@/components/dashboard/widgetRegistry";

// GridLayout imported from react-grid-layout v1

export default function Dashboard() {
  const { current } = useAppContext();
  const { t } = useI18n();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [widgets, setWidgets] = useState<WidgetInstance[]>([...DEFAULT_LAYOUT]);
  const [editing, setEditing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [gridWidth, setGridWidth] = useState(1200);
  const gridContainerRef = useRef<HTMLDivElement>(null);

  const prevContextId = useRef<number | null>(null);

  // Measure container width for grid
  useEffect(() => {
    const measure = () => {
      const el = gridContainerRef.current;
      if (el) setGridWidth(el.clientWidth);
    };
    measure();
    // Re-measure after a tick (layout may not be ready on first render)
    const t = setTimeout(measure, 100);
    window.addEventListener("resize", measure);
    return () => { clearTimeout(t); window.removeEventListener("resize", measure); };
  }, [data, configLoaded]);

  // Load dashboard data
  useEffect(() => {
    if (!current) { setData(null); setLoading(false); prevContextId.current = null; return; }
    const contextChanged = current.id !== prevContextId.current;
    if (contextChanged) { setLoading(true); setData(null); prevContextId.current = current.id; }
    fetch(`/api/contexts/${current.id}/dashboard`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [current]);

  // Load user's widget config
  useEffect(() => {
    if (!current) return;
    setConfigLoaded(false);
    fetch(`/api/dashboard-config?context=${current.id}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (d?.widgets && Array.isArray(d.widgets) && d.widgets.length > 0) {
          setWidgets(d.widgets);
        } else {
          setWidgets([...DEFAULT_LAYOUT]);
        }
      })
      .catch(() => setWidgets([...DEFAULT_LAYOUT]))
      .finally(() => setConfigLoaded(true));
  }, [current]);

  // Silent refresh for Mercure
  const silentRefresh = useCallback(() => {
    if (!current) return;
    fetch(`/api/contexts/${current.id}/dashboard`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d) setData(d); })
      .catch(() => {});
  }, [current]);

  useEffect(() => {
    if (!current || !data?.monitoring) return;
    const url = new URL("/.well-known/mercure", window.location.origin);
    url.searchParams.append("topic", `nodes/context/${current.id}`);
    const es = new EventSource(url);
    let timer: ReturnType<typeof setTimeout> | null = null;
    es.onmessage = (event) => {
      try { const msg = JSON.parse(event.data); if (msg.type === "ping") { if (timer) clearTimeout(timer); timer = setTimeout(silentRefresh, 500); } } catch {}
    };
    return () => { es.close(); if (timer) clearTimeout(timer); };
  }, [current, data?.monitoring, silentRefresh]);

  // Save config
  const saveConfig = async (w: WidgetInstance[]) => {
    if (!current) return;
    setSaving(true);
    try {
      await fetch(`/api/dashboard-config?context=${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets: w }),
      });
    } finally { setSaving(false); }
  };

  // Layout change handler
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleLayoutChange = (layout: readonly any[]) => {
    if (!editing) return;
    const updated = widgets.map((widget) => {
      const l = layout.find((li) => li.i === widget.i);
      if (l) return { ...widget, x: l.x, y: l.y, w: l.w, h: l.h };
      return widget;
    });
    setWidgets(updated);
  };

  // Add widget
  const addWidget = (type: string) => {
    const def = WIDGET_REGISTRY.find((w) => w.type === type);
    if (!def) return;
    const newId = `w_${Date.now()}`;
    const newWidget: WidgetInstance = { i: newId, type, x: 0, y: Infinity, w: def.defaultW, h: def.defaultH };
    const updated = [...widgets, newWidget];
    setWidgets(updated);
    setCatalogOpen(false);
  };

  // Remove widget
  const removeWidget = (id: string) => {
    setWidgets((prev) => prev.filter((w) => w.i !== id));
  };

  // Toggle editing
  const toggleEditing = () => {
    if (editing) {
      // Save when exiting edit mode
      saveConfig(widgets);
    }
    setEditing(!editing);
  };

  // Reset layout
  const resetLayout = () => {
    setWidgets(DEFAULT_LAYOUT);
    saveConfig(DEFAULT_LAYOUT);
  };

  if (!current) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <LayoutDashboard className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
        <h2 className="text-lg font-semibold text-slate-700 dark:text-slate-300">{t("dashboard.noContextSelected")}</h2>
        <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">{t("dashboard.noContextSelectedDesc")}</p>
      </div>
    );
  }

  if (loading || !configLoaded) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  if (!data) return null;

  const gridLayout = widgets.map((w) => {
    const def = WIDGET_REGISTRY.find((d) => d.type === w.type);
    return { i: w.i, x: w.x, y: w.y, w: w.w, h: w.h, minW: def?.minW ?? 2, minH: def?.minH ?? 1 };
  });

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("dashboard.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("dashboard.subtitle", { name: current.name })}</p>
        </div>
        <div className="flex items-center gap-2">
          {editing && (
            <>
              <button onClick={() => setCatalogOpen(true)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <Plus className="h-4 w-4" />
                {t("dashboard.addWidget")}
              </button>
              <button onClick={resetLayout} className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                <RotateCcw className="h-4 w-4" />
                {t("dashboard.resetLayout")}
              </button>
            </>
          )}
          <button
            onClick={toggleEditing}
            className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              editing
                ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100"
                : "border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
            }`}
          >
            {editing ? (
              <>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {t("dashboard.doneEditing")}</>
            ) : (
              <><Pencil className="h-4 w-4" /> {t("dashboard.editDashboard")}</>
            )}
          </button>
        </div>
      </div>

      {/* Grid */}
      <div ref={gridContainerRef} className="w-full relative">
      <GridLayout
        className="layout"
        layout={gridLayout}
        cols={12}
        rowHeight={80}
        width={gridWidth}
        draggableHandle=".widget-drag-handle"
        onLayoutChange={handleLayoutChange}
        compactType="vertical"
        margin={[16, 16] as [number, number]}
        {...(editing ? {} : { isDraggable: false, isResizable: false })}
      >
        {widgets.map((widget) => {
          const Comp = getWidgetComponent(widget.type);
          const icon = getWidgetIcon(widget.type);
          return (
            <div key={widget.i} className="h-full">
              <WidgetCard
                title={t(`dashboard.w_${widget.type}`)}
                icon={icon}
                editing={editing}
                onRemove={() => removeWidget(widget.i)}
              >
                {Comp ? <Comp data={editing ? { ...FAKE_DATA, ...data } : data} t={t} /> : <p className="text-xs text-slate-400">Unknown widget: {widget.type}</p>}
              </WidgetCard>
            </div>
          );
        })}
      </GridLayout>
      </div>

      {/* Catalog modal */}
      {catalogOpen && (
        <WidgetCatalog
          onAdd={addWidget}
          onClose={() => setCatalogOpen(false)}
          existingTypes={widgets.map((w) => w.type)}
          t={t}
        />
      )}
    </div>
  );
}
