"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Filter, RotateCcw } from "lucide-react";
import type { WidgetFilters } from "./widgetFilters";

interface NamedItem {
  id: number;
  name: string;
}

interface ColoredTag extends NamedItem {
  color: string;
}

interface Props {
  contextId: number;
  widgetTitle: string;
  value: WidgetFilters;
  onChange: (filters: WidgetFilters) => void;
  onClose: () => void;
  t: (key: string) => string;
}

export default function FilterEditor({ contextId, widgetTitle, value, onChange, onClose, t }: Props) {
  const [tags, setTags] = useState<ColoredTag[]>([]);
  const [manufacturers, setManufacturers] = useState<NamedItem[]>([]);
  const [models, setModels] = useState<NamedItem[]>([]);
  const [profiles, setProfiles] = useState<NamedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      fetch(`/api/node-tags?context=${contextId}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/manufacturers?context=${contextId}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/models?context=${contextId}`).then((r) => (r.ok ? r.json() : [])),
      fetch(`/api/profiles?context=${contextId}`).then((r) => (r.ok ? r.json() : [])),
    ])
      .then(([tg, mfr, mdl, prf]) => {
        if (cancelled) return;
        setTags(tg);
        setManufacturers(mfr);
        setModels(mdl);
        setProfiles(prf);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [contextId]);

  const toggle = (key: keyof WidgetFilters, id: number) => {
    const current = (value[key] ?? []) as number[];
    const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
    onChange({ ...value, [key]: next.length > 0 ? next : undefined });
  };

  const reset = () => onChange({});

  const total = (value.tagIds?.length ?? 0) + (value.manufacturerIds?.length ?? 0) + (value.modelIds?.length ?? 0) + (value.profileIds?.length ?? 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50 dark:bg-black/70" onClick={onClose} />
      <div className="relative z-10 w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <Filter className="h-4 w-4 text-slate-400 shrink-0" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {t("dashboard.filters.title")} <span className="text-slate-400 font-normal">— {widgetTitle}</span>
            </h2>
          </div>
          <div className="flex items-center gap-1">
            {total > 0 && (
              <button onClick={reset} className="flex items-center gap-1 px-2 py-1 rounded text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <RotateCcw className="h-3 w-3" />
                {t("dashboard.filters.reset")}
              </button>
            )}
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            <FilterSection title={t("dashboard.filters.tags")} count={value.tagIds?.length ?? 0} empty={t("dashboard.filters.noTags")} hidden={tags.length === 0}>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => {
                  const selected = (value.tagIds ?? []).includes(tag.id);
                  return (
                    <button
                      key={tag.id}
                      onClick={() => toggle("tagIds", tag.id)}
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-all ${selected ? "ring-2 ring-offset-1 ring-slate-900 dark:ring-white dark:ring-offset-slate-900" : "opacity-60 hover:opacity-100"}`}
                      style={{ backgroundColor: tag.color, color: "white" }}
                    >
                      {tag.name}
                    </button>
                  );
                })}
              </div>
            </FilterSection>

            <FilterSection title={t("dashboard.filters.manufacturers")} count={value.manufacturerIds?.length ?? 0} empty={t("dashboard.filters.noManufacturers")} hidden={manufacturers.length === 0}>
              <ChipList items={manufacturers} selected={value.manufacturerIds ?? []} onToggle={(id) => toggle("manufacturerIds", id)} />
            </FilterSection>

            <FilterSection title={t("dashboard.filters.models")} count={value.modelIds?.length ?? 0} empty={t("dashboard.filters.noModels")} hidden={models.length === 0}>
              <ChipList items={models} selected={value.modelIds ?? []} onToggle={(id) => toggle("modelIds", id)} />
            </FilterSection>

            <FilterSection title={t("dashboard.filters.profiles")} count={value.profileIds?.length ?? 0} empty={t("dashboard.filters.noProfiles")} hidden={profiles.length === 0}>
              <ChipList items={profiles} selected={value.profileIds ?? []} onToggle={(id) => toggle("profileIds", id)} />
            </FilterSection>

            {tags.length === 0 && manufacturers.length === 0 && models.length === 0 && profiles.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-8">{t("dashboard.filters.nothingAvailable")}</p>
            )}
          </div>
        )}

        <div className="px-6 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>
            {total === 0 ? t("dashboard.filters.noActive") : `${total} ${t("dashboard.filters.activeCount")}`}
          </span>
          <button onClick={onClose} className="rounded-lg bg-slate-900 dark:bg-white px-4 py-1.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors">
            {t("common.close")}
          </button>
        </div>
      </div>
    </div>
  );
}

function FilterSection({ title, count, empty: _empty, hidden, children }: { title: string; count: number; empty: string; hidden?: boolean; children: React.ReactNode }) {
  if (hidden) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h3>
        {count > 0 && <span className="text-[10px] text-slate-400">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function ChipList({ items, selected, onToggle }: { items: NamedItem[]; selected: number[]; onToggle: (id: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((item) => {
        const isSelected = selected.includes(item.id);
        return (
          <button
            key={item.id}
            onClick={() => onToggle(item.id)}
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              isSelected
                ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900 ring-2 ring-offset-1 ring-slate-900 dark:ring-white dark:ring-offset-slate-900"
                : "bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}
          >
            {item.name}
          </button>
        );
      })}
    </div>
  );
}
