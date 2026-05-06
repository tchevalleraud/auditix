"use client";

import { useEffect, useMemo, useState } from "react";
import type { WidgetInstance } from "./widgetRegistry";
import { filterSignature, type WidgetFilters } from "./widgetFilters";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DashboardData = Record<string, any>;

/**
 * For each unique non-empty filter signature among the given widgets, fetches
 * the dashboard payload with those filters applied. Returns a getter that maps
 * a widget back to the right slice (filtered or default).
 */
export function useFilteredDashboardData(
  widgets: WidgetInstance[],
  contextId: number | null,
  defaultData: DashboardData | null,
) {
  const [byKey, setByKey] = useState<Record<string, DashboardData>>({});

  const signatures = useMemo(() => {
    const set = new Set<string>();
    for (const w of widgets) {
      const sig = filterSignature(w.config?.filters as WidgetFilters | undefined);
      if (sig) set.add(sig);
    }
    return Array.from(set);
  }, [widgets]);

  useEffect(() => {
    if (!contextId) return;
    let cancelled = false;
    for (const sig of signatures) {
      if (byKey[sig]) continue;
      fetch(`/api/contexts/${contextId}/dashboard?${sig}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (cancelled || !data) return;
          setByKey((prev) => ({ ...prev, [sig]: data }));
        })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, [signatures, contextId, byKey]);

  // Drop cache entries whose signature is no longer used (cleanup).
  useEffect(() => {
    setByKey((prev) => {
      const next: Record<string, DashboardData> = {};
      for (const sig of signatures) {
        if (prev[sig]) next[sig] = prev[sig];
      }
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [signatures]);

  return (widget: WidgetInstance): DashboardData | null => {
    const sig = filterSignature(widget.config?.filters as WidgetFilters | undefined);
    if (!sig) return defaultData;
    return byKey[sig] ?? null;
  };
}
