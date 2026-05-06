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
import DashboardSwitcher, { type DashboardSummary } from "@/components/dashboard/DashboardSwitcher";
import SectionTitleBlock, { type SectionTitleConfig } from "@/components/dashboard/SectionTitleBlock";
import FilterEditor from "@/components/dashboard/FilterEditor";
import { useFilteredDashboardData } from "@/components/dashboard/useFilteredDashboardData";
import { isFilterableWidget, countActiveFilters, type WidgetFilters } from "@/components/dashboard/widgetFilters";
import { getWidgetComponent, getWidgetIcon, getWidgetTitle } from "@/components/dashboard/widgets";
import { WIDGET_REGISTRY, DEFAULT_LAYOUT, FAKE_DATA, type WidgetInstance } from "@/components/dashboard/widgetRegistry";

interface Dashboard extends DashboardSummary {
  widgets: WidgetInstance[];
}

export default function Dashboard() {
  const { current } = useAppContext();
  const { t } = useI18n();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<Record<string, any> | null>(null);
  const [loading, setLoading] = useState(true);
  const [dashboards, setDashboards] = useState<Dashboard[]>([]);
  const [currentDashboardId, setCurrentDashboardId] = useState<number | null>(null);
  const [widgets, setWidgets] = useState<WidgetInstance[]>([...DEFAULT_LAYOUT]);
  const [editing, setEditing] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [filterEditingFor, setFilterEditingFor] = useState<string | null>(null);
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

  // Load dashboards list for the current context
  useEffect(() => {
    if (!current) return;
    setConfigLoaded(false);
    fetch(`/api/contexts/${current.id}/dashboards`)
      .then((res) => (res.ok ? res.json() : []))
      .then((list: Dashboard[]) => {
        setDashboards(list);
        const def = list.find((d) => d.isDefault) ?? list[0] ?? null;
        if (def) {
          setCurrentDashboardId(def.id);
          setWidgets(def.widgets.length > 0 ? def.widgets : [...DEFAULT_LAYOUT]);
        } else {
          setCurrentDashboardId(null);
          setWidgets([...DEFAULT_LAYOUT]);
        }
      })
      .catch(() => {
        setDashboards([]);
        setCurrentDashboardId(null);
        setWidgets([...DEFAULT_LAYOUT]);
      })
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

  // Save the current dashboard layout
  const saveCurrentDashboard = useCallback(async (w: WidgetInstance[]) => {
    if (!currentDashboardId) return;
    setSaving(true);
    try {
      await fetch(`/api/dashboards/${currentDashboardId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ widgets: w }),
      });
      setDashboards((prev) => prev.map((d) => (d.id === currentDashboardId ? { ...d, widgets: w } : d)));
    } finally { setSaving(false); }
  }, [currentDashboardId]);

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
    setWidgets((prev) => [...prev, newWidget]);
    setCatalogOpen(false);
  };

  // Remove widget
  const removeWidget = (id: string) => {
    setWidgets((prev) => prev.filter((w) => w.i !== id));
  };

  // Update widget config (used by section-title and other configurable widgets)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateWidgetConfig = (id: string, config: Record<string, any>) => {
    setWidgets((prev) => prev.map((w) => (w.i === id ? { ...w, config } : w)));
  };

  // Toggle editing
  const toggleEditing = () => {
    if (editing) saveCurrentDashboard(widgets);
    setEditing(!editing);
  };

  // Reset layout
  const resetLayout = () => {
    setWidgets([...DEFAULT_LAYOUT]);
    if (currentDashboardId) saveCurrentDashboard([...DEFAULT_LAYOUT]);
  };

  // Switch dashboard (saves current first if editing)
  const switchDashboard = async (id: number) => {
    if (id === currentDashboardId) return;
    if (editing && currentDashboardId) await saveCurrentDashboard(widgets);
    const target = dashboards.find((d) => d.id === id);
    if (!target) return;
    setCurrentDashboardId(id);
    setWidgets(target.widgets.length > 0 ? target.widgets : [...DEFAULT_LAYOUT]);
  };

  const createDashboard = async (name: string) => {
    if (!current) return;
    if (editing && currentDashboardId) await saveCurrentDashboard(widgets);
    const res = await fetch(`/api/contexts/${current.id}/dashboards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, widgets: [] }),
    });
    if (!res.ok) return;
    const created: Dashboard = await res.json();
    created.widgets = created.widgets ?? [];
    setDashboards((prev) => [...prev, created]);
    setCurrentDashboardId(created.id);
    setWidgets([...DEFAULT_LAYOUT]);
  };

  const renameDashboard = async (id: number, name: string) => {
    const res = await fetch(`/api/dashboards/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) return;
    setDashboards((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)));
  };

  const duplicateDashboard = async () => {
    if (!current || !currentDashboardId) return;
    const cur = dashboards.find((d) => d.id === currentDashboardId);
    if (!cur) return;
    const name = `${cur.name} ${t("dashboard.switcher.duplicateSuffix")}`;
    const res = await fetch(`/api/contexts/${current.id}/dashboards`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, widgets }),
    });
    if (!res.ok) return;
    const created: Dashboard = await res.json();
    created.widgets = created.widgets ?? [];
    setDashboards((prev) => [...prev, created]);
    setCurrentDashboardId(created.id);
    setWidgets(created.widgets.length > 0 ? created.widgets : [...widgets]);
  };

  const deleteDashboard = async (id: number) => {
    if (!current) return;
    const res = await fetch(`/api/dashboards/${id}`, { method: "DELETE" });
    if (!res.ok) return;
    const list: Dashboard[] = await fetch(`/api/contexts/${current.id}/dashboards`).then((r) => r.json());
    setDashboards(list);
    const def = list.find((d) => d.isDefault) ?? list[0] ?? null;
    if (def) {
      setCurrentDashboardId(def.id);
      setWidgets(def.widgets.length > 0 ? def.widgets : [...DEFAULT_LAYOUT]);
    } else {
      setCurrentDashboardId(null);
      setWidgets([...DEFAULT_LAYOUT]);
    }
  };

  const setDefaultDashboard = async (id: number) => {
    const res = await fetch(`/api/dashboards/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isDefault: true }),
    });
    if (!res.ok) return;
    setDashboards((prev) => prev.map((d) => ({ ...d, isDefault: d.id === id })));
  };

  // Hooks must run on every render — keep before any early return
  const getDataForWidget = useFilteredDashboardData(widgets, current?.id ?? null, data);

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

  const filterEditingWidget = filterEditingFor ? widgets.find((w) => w.i === filterEditingFor) : null;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("dashboard.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("dashboard.subtitle", { name: current.name })}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <DashboardSwitcher
            dashboards={dashboards}
            currentId={currentDashboardId}
            editing={editing}
            onSelect={switchDashboard}
            onCreate={createDashboard}
            onRename={renameDashboard}
            onDuplicate={duplicateDashboard}
            onDelete={deleteDashboard}
            onSetDefault={setDefaultDashboard}
            t={t}
          />
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
          if (widget.type === "section-title") {
            return (
              <div key={widget.i} className="h-full">
                <SectionTitleBlock
                  config={(widget.config as SectionTitleConfig) ?? {}}
                  editing={editing}
                  onChange={(cfg) => updateWidgetConfig(widget.i, cfg)}
                  onRemove={() => removeWidget(widget.i)}
                  t={t}
                />
              </div>
            );
          }
          const Comp = getWidgetComponent(widget.type);
          const icon = getWidgetIcon(widget.type);
          const isCompact = widget.type.startsWith("kpi-");
          const filterable = isFilterableWidget(widget.type);
          const filterCount = filterable ? countActiveFilters(widget.config?.filters as WidgetFilters | undefined) : undefined;
          const widgetData = getDataForWidget(widget) ?? data;
          return (
            <div key={widget.i} className="h-full">
              <WidgetCard
                title={getWidgetTitle(widget.type, t)}
                icon={icon}
                editing={editing}
                onRemove={() => removeWidget(widget.i)}
                compact={isCompact}
                filterCount={filterCount}
                onConfigureFilters={filterable ? () => setFilterEditingFor(widget.i) : undefined}
              >
                {Comp ? <Comp data={editing ? { ...FAKE_DATA, ...widgetData } : widgetData} t={t} /> : <p className="text-xs text-slate-400">Unknown widget: {widget.type}</p>}
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

      {/* Filter editor modal */}
      {filterEditingWidget && (
        <FilterEditor
          contextId={current.id}
          widgetTitle={getWidgetTitle(filterEditingWidget.type, t)}
          value={(filterEditingWidget.config?.filters as WidgetFilters) ?? {}}
          onChange={(filters) => {
            const cleanFilters = countActiveFilters(filters) > 0 ? filters : undefined;
            const nextConfig = { ...(filterEditingWidget.config ?? {}), filters: cleanFilters };
            if (cleanFilters === undefined) delete nextConfig.filters;
            updateWidgetConfig(filterEditingWidget.i, nextConfig);
          }}
          onClose={() => setFilterEditingFor(null)}
          t={t}
        />
      )}
    </div>
  );
}
