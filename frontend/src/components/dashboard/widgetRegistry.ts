export interface WidgetDef {
  type: string;
  category: string;
  defaultW: number;
  defaultH: number;
  minW?: number;
  minH?: number;
  maxH?: number;
}

export const WIDGET_REGISTRY: WidgetDef[] = [
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
