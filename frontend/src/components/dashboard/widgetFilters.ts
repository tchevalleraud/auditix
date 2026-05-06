export interface WidgetFilters {
  tagIds?: number[];
  manufacturerIds?: number[];
  modelIds?: number[];
  profileIds?: number[];
}

export function countActiveFilters(filters?: WidgetFilters): number {
  if (!filters) return 0;
  return (
    (filters.tagIds?.length ?? 0) +
    (filters.manufacturerIds?.length ?? 0) +
    (filters.modelIds?.length ?? 0) +
    (filters.profileIds?.length ?? 0)
  );
}

// Stable signature used to dedupe fetches for widgets sharing the same filter set.
export function filterSignature(filters?: WidgetFilters): string {
  if (!filters || countActiveFilters(filters) === 0) return "";
  const parts: string[] = [];
  const push = (key: string, ids?: number[]) => {
    if (ids && ids.length > 0) {
      parts.push(`${key}=${[...ids].sort((a, b) => a - b).join(",")}`);
    }
  };
  push("tagIds", filters.tagIds);
  push("manufacturerIds", filters.manufacturerIds);
  push("modelIds", filters.modelIds);
  push("profileIds", filters.profileIds);
  return parts.join("&");
}

// Widgets that aggregate over nodes — these honor filters. Vulnerability /
// topology / collections widgets aren't node-scoped here and ignore filters.
export function isFilterableWidget(type: string): boolean {
  if (type === "section-title") return false;
  if (type.startsWith("compliance-")) return true;
  if (type.startsWith("nodes-")) return true;
  if (type.startsWith("kpi-compliance-")) return true;
  if (type.startsWith("kpi-nodes-")) return true;
  return false;
}
