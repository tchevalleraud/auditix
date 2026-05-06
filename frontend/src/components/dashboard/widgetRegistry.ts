export interface WidgetDef {
  type: string;
  category: string;
  defaultW: number;
  defaultH: number;
  minW?: number;
  minH?: number;
  maxH?: number;
}

export interface KpiDef {
  id: string;
  category: string;
  icon: "Server" | "Activity" | "AlertCircle" | "AlertTriangle" | "ShieldCheck" | "ShieldAlert" | "FileSearch" | "FileText" | "Network" | "Box" | "Cpu" | "KeyRound" | "Tags" | "Zap";
  accent: "emerald" | "red" | "rose" | "blue" | "violet" | "amber" | "teal";
  labelKey: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getValue: (data: any) => string | number;
}

export const KPI_DEFS: KpiDef[] = [
  // Compliance
  { id: "compliance-compliant", category: "compliance", icon: "ShieldCheck", accent: "emerald", labelKey: "compliantResults", getValue: (d) => d.compliance?.byStatus?.compliant ?? 0 },
  { id: "compliance-violations", category: "compliance", icon: "ShieldAlert", accent: "red", labelKey: "violations", getValue: (d) => d.compliance?.byStatus?.non_compliant ?? 0 },
  { id: "compliance-critical", category: "compliance", icon: "AlertCircle", accent: "rose", labelKey: "criticalViolations", getValue: (d) => d.compliance?.bySeverity?.critical ?? 0 },
  { id: "compliance-evaluated", category: "compliance", icon: "Server", accent: "blue", labelKey: "evaluatedNodes", getValue: (d) => `${d.compliance?.evaluatedNodes ?? 0}/${d.compliance?.totalNodes ?? 0}` },
  { id: "compliance-policies", category: "compliance", icon: "FileSearch", accent: "violet", labelKey: "activePolicies", getValue: (d) => d.compliance?.enabledPolicies ?? 0 },
  { id: "compliance-errors", category: "compliance", icon: "AlertTriangle", accent: "amber", labelKey: "errors", getValue: (d) => d.compliance?.byStatus?.error ?? 0 },
  // Nodes
  { id: "nodes-total", category: "nodes", icon: "Server", accent: "blue", labelKey: "nodes", getValue: (d) => d.nodes?.total ?? 0 },
  { id: "nodes-reachable", category: "nodes", icon: "Activity", accent: "emerald", labelKey: "reachable", getValue: (d) => d.nodes?.reachable ?? 0 },
  { id: "nodes-unreachable", category: "nodes", icon: "AlertCircle", accent: "red", labelKey: "unreachable", getValue: (d) => d.nodes?.unreachable ?? 0 },
  { id: "nodes-unknown", category: "nodes", icon: "Server", accent: "amber", labelKey: "unknown", getValue: (d) => d.nodes?.unknown ?? 0 },
  // Topology
  { id: "topology-maps", category: "topology", icon: "Network", accent: "violet", labelKey: "topoMaps", getValue: (d) => d.topology?.maps ?? 0 },
  { id: "topology-devices", category: "topology", icon: "Server", accent: "blue", labelKey: "topoDevices", getValue: (d) => d.topology?.devices ?? 0 },
  { id: "topology-links", category: "topology", icon: "Activity", accent: "teal", labelKey: "topoLinks", getValue: (d) => d.topology?.links ?? 0 },
  // Collections
  { id: "collections-rules", category: "collections", icon: "FileSearch", accent: "amber", labelKey: "rules", getValue: (d) => `${d.rules?.enabled ?? 0}/${d.rules?.total ?? 0}` },
  { id: "collections-manufacturers", category: "collections", icon: "Box", accent: "blue", labelKey: "manufacturers", getValue: (d) => d.inventory?.manufacturers ?? 0 },
  { id: "collections-models", category: "collections", icon: "Cpu", accent: "violet", labelKey: "models", getValue: (d) => d.inventory?.models ?? 0 },
  { id: "collections-profiles", category: "collections", icon: "KeyRound", accent: "teal", labelKey: "profiles", getValue: (d) => d.inventory?.profiles ?? 0 },
  { id: "collections-tags", category: "collections", icon: "Tags", accent: "rose", labelKey: "tags", getValue: (d) => d.inventory?.tags ?? 0 },
  // Reports
  { id: "reports-total", category: "reports", icon: "FileText", accent: "rose", labelKey: "reportsTotal", getValue: (d) => d.reports?.total ?? 0 },
  { id: "reports-generated", category: "reports", icon: "FileText", accent: "emerald", labelKey: "reportsGenerated", getValue: (d) => d.reports?.generated ?? 0 },
  // Automations
  { id: "automations-schedulers", category: "automations", icon: "Zap", accent: "teal", labelKey: "schedulers", getValue: (d) => d.automations?.schedulers ?? 0 },
  { id: "automations-active", category: "automations", icon: "Activity", accent: "amber", labelKey: "activeJobs", getValue: (d) => d.automations?.active ?? 0 },
  // Vulnerabilities
  { id: "vulnerabilities-total", category: "vulnerabilities", icon: "ShieldAlert", accent: "red", labelKey: "w_vulnerability-summary", getValue: (d) => d.vulnerabilities?.total ?? 0 },
  { id: "vulnerabilities-critical", category: "vulnerabilities", icon: "AlertCircle", accent: "rose", labelKey: "severityCritical", getValue: (d) => d.vulnerabilities?.bySeverity?.critical ?? 0 },
  { id: "vulnerabilities-high", category: "vulnerabilities", icon: "AlertTriangle", accent: "amber", labelKey: "severityHigh", getValue: (d) => d.vulnerabilities?.bySeverity?.high ?? 0 },
  { id: "vulnerabilities-medium", category: "vulnerabilities", icon: "ShieldCheck", accent: "blue", labelKey: "severityMedium", getValue: (d) => d.vulnerabilities?.bySeverity?.medium ?? 0 },
];

const KPI_WIDGET_DEFS: WidgetDef[] = KPI_DEFS.map((k) => ({
  type: `kpi-${k.id}`,
  category: k.category,
  defaultW: 2,
  defaultH: 1,
  minW: 1,
  minH: 1,
}));

export const WIDGET_REGISTRY: WidgetDef[] = [
  // Layout
  { type: "section-title", category: "layout", defaultW: 12, defaultH: 1, minW: 2, minH: 1 },
  // Compliance
  { type: "compliance-score", category: "compliance", defaultW: 3, defaultH: 3, minW: 2, minH: 2 },
  { type: "compliance-hero", category: "compliance", defaultW: 6, defaultH: 3, minW: 4, minH: 3 },
  { type: "compliance-kpis", category: "compliance", defaultW: 3, defaultH: 3, minW: 2, minH: 2 },
  { type: "compliance-grade-chart", category: "compliance", defaultW: 4, defaultH: 3, minW: 2, minH: 2 },
  { type: "compliance-severity-chart", category: "compliance", defaultW: 4, defaultH: 3, minW: 2, minH: 2 },
  { type: "compliance-unhealthy-nodes", category: "compliance", defaultW: 6, defaultH: 3, minW: 3, minH: 2 },
  { type: "compliance-violated-rules", category: "compliance", defaultW: 6, defaultH: 3, minW: 3, minH: 2 },
  // Nodes
  { type: "nodes-kpi", category: "nodes", defaultW: 2, defaultH: 2, minW: 2, minH: 1 },
  { type: "nodes-summary", category: "nodes", defaultW: 4, defaultH: 2, minW: 2, minH: 2 },
  { type: "nodes-reachability", category: "nodes", defaultW: 4, defaultH: 3, minW: 2, minH: 2 },
  { type: "nodes-manufacturers", category: "nodes", defaultW: 4, defaultH: 3, minW: 2, minH: 2 },
  // Topology
  { type: "topology-summary", category: "topology", defaultW: 3, defaultH: 2, minW: 2, minH: 1 },
  // Collections
  { type: "collections-summary", category: "collections", defaultW: 3, defaultH: 2, minW: 2, minH: 1 },
  { type: "collections-inventory", category: "collections", defaultW: 4, defaultH: 3, minW: 2, minH: 2 },
  // Reports
  { type: "reports-summary", category: "reports", defaultW: 3, defaultH: 2, minW: 2, minH: 1 },
  // Automations
  { type: "automations-summary", category: "automations", defaultW: 3, defaultH: 2, minW: 2, minH: 1 },
  // Vulnerabilities
  { type: "vulnerability-summary", category: "vulnerabilities", defaultW: 3, defaultH: 2, minW: 2, minH: 2 },
  { type: "vulnerability-severity-chart", category: "vulnerabilities", defaultW: 4, defaultH: 3, minW: 2, minH: 2 },
  { type: "vulnerability-top-cves", category: "vulnerabilities", defaultW: 6, defaultH: 3, minW: 3, minH: 2 },
  // Individual KPIs (auto-generated from KPI_DEFS)
  ...KPI_WIDGET_DEFS,
];

export interface WidgetInstance {
  i: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  config?: Record<string, any>;
}

export const DEFAULT_LAYOUT: WidgetInstance[] = [
  { i: "w1", type: "compliance-hero", x: 0, y: 0, w: 6, h: 3 },
  { i: "w2", type: "nodes-summary", x: 6, y: 0, w: 3, h: 2 },
  { i: "w3", type: "nodes-reachability", x: 9, y: 0, w: 3, h: 3 },
  { i: "w4", type: "compliance-grade-chart", x: 0, y: 3, w: 3, h: 3 },
  { i: "w5", type: "compliance-severity-chart", x: 3, y: 3, w: 3, h: 3 },
  { i: "w6", type: "compliance-unhealthy-nodes", x: 6, y: 3, w: 3, h: 3 },
  { i: "w7", type: "compliance-violated-rules", x: 9, y: 3, w: 3, h: 3 },
  { i: "w8", type: "nodes-manufacturers", x: 0, y: 6, w: 3, h: 3 },
  { i: "w9", type: "collections-summary", x: 3, y: 6, w: 3, h: 2 },
  { i: "w10", type: "reports-summary", x: 6, y: 6, w: 3, h: 2 },
  { i: "w11", type: "topology-summary", x: 9, y: 6, w: 3, h: 2 },
];

// ---- Fake data for edit mode preview ----
export const FAKE_DATA = {
  nodes: {
    total: 24,
    reachable: 19,
    unreachable: 3,
    unknown: 2,
    byManufacturer: [
      { name: "Cisco", total: 10 },
      { name: "Extreme", total: 6 },
      { name: "Juniper", total: 4 },
      { name: "Arista", total: 3 },
      { name: "Other", total: 1 },
    ],
  },
  rules: { total: 12, enabled: 8 },
  inventory: { tags: 5, profiles: 3, models: 7, manufacturers: 4 },
  monitoring: true,
  compliance: {
    globalScore: 78,
    globalGrade: "B",
    evaluatedNodes: 20,
    totalNodes: 24,
    enabledPolicies: 6,
    byStatus: { compliant: 142, non_compliant: 38, error: 2, not_applicable: 15, skipped: 0 },
    bySeverity: { critical: 3, high: 8, medium: 12, low: 10, info: 5 },
    byGrade: { A: 8, B: 5, C: 3, D: 2, E: 1, F: 1, unrated: 4 },
    topUnhealthyNodes: [
      { id: 1, name: "RTR-CORE1-01", ipAddress: "10.201.100.41", grade: "D", violations: 12, criticalCount: 2 },
      { id: 2, name: "SW-ACCESS-03", ipAddress: "10.201.100.55", grade: "E", violations: 8, criticalCount: 1 },
      { id: 3, name: "FW-EDGE-01", ipAddress: "10.201.100.1", grade: "C", violations: 5, criticalCount: 0 },
      { id: 4, name: "RTR-DIST-02", ipAddress: "10.201.100.32", grade: "D", violations: 4, criticalCount: 0 },
      { id: 5, name: "SW-CORE-02", ipAddress: "10.201.100.12", grade: "C", violations: 3, criticalCount: 0 },
    ],
    topViolatedRules: [
      { id: 1, identifier: "SEC-001", name: "SSH Hardening", violationCount: 14, criticalCount: 3, highCount: 5 },
      { id: 2, identifier: "NET-003", name: "NTP Configuration", violationCount: 10, criticalCount: 0, highCount: 2 },
      { id: 3, identifier: "SEC-005", name: "SNMP Community", violationCount: 8, criticalCount: 2, highCount: 3 },
      { id: 4, identifier: "NET-007", name: "Syslog Server", violationCount: 6, criticalCount: 0, highCount: 1 },
      { id: 5, identifier: "SEC-002", name: "Banner Config", violationCount: 4, criticalCount: 0, highCount: 0 },
    ],
    lastEvaluatedAt: new Date(Date.now() - 3600000).toISOString(),
  },
  topology: { maps: 3, devices: 18, links: 32 },
  reports: { total: 5, generated: 3 },
  automations: { schedulers: 2, active: 1 },
  vulnerabilities: {
    enabled: true,
    total: 47,
    bySeverity: { critical: 3, high: 12, medium: 18, low: 14 },
    topAffectedModels: [
      { name: "Catalyst 9300", manufacturer: "Cisco", cve_count: 22 },
      { name: "EX4300", manufacturer: "Juniper", cve_count: 15 },
    ],
    lastSyncAt: new Date(Date.now() - 7200000).toISOString(),
    lastSyncStatus: "success",
  },
};
