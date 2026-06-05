"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Table2, Grid3x3, ChevronRight, Network, Cpu, Globe, Plug, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useAppContext } from "@/components/ContextProvider";
import { useI18n } from "@/components/I18nProvider";

interface ActionQualifier {
  label: string;
  value: string | null;
}

interface AceField {
  label: string;
  value: string;
}

interface Ace {
  id: string;
  name: string;
  action: string | null;
  actions: ActionQualifier[];
  enabled: boolean;
  /** Firewall-style aggregated cells (each may gather several columns). */
  source: AceField[];
  destination: AceField[];
  /** L2 / standalone services (e.g. ARP-Request). */
  service: AceField[];
  /** L3 service split across columns: protocol (tcp/udp) + ports. */
  protocol: AceField[];
  /** Generic / destination port (back-compat: treated as destination). */
  port: AceField[];
  /** Explicit source / destination ports. */
  portSrc: AceField[];
  portDst: AceField[];
  /** Remaining match parameters for the expandable detail. */
  fields: AceField[];
}

interface Acl {
  id: string;
  name: string;
  type: string | null;
  defaultAction: string | null;
  ports: string[];
  vlans: string[];
  vni: string | null;
  aces: Ace[];
}

type ViewMode = "table" | "matrix";

/**
 * Vendor field catalog (Extreme Networks Fabric Engine). Maps a normalized
 * field name to its logical group so the ACE detail can be displayed grouped
 * without any per-field configuration. Unknown columns fall into "other".
 */
const FIELD_GROUPS: { key: string; fields: string[] }[] = [
  { key: "action", fields: ["count", "internal-qos", "monitor-dst-mlt", "monitor-dst-ports", "monitor-isid-offset", "redirect-next-hop", "remark-dot1p", "remark-dscp", "unreachable"] },
  { key: "arp", fields: ["operation", "arp-operation"] },
  { key: "ethernet", fields: ["dst-mac", "ether-type", "ethertype", "port", "src-mac", "vlan-id", "vlan-tag-prio"] },
  { key: "ip", fields: ["dscp", "dst-ip", "ip-frag-flag", "ip-options", "ip-protocol-type", "routed-only", "src-ip"] },
  { key: "ipv6", fields: ["dst-ipv6", "nxt-hdr", "src-ipv6", "traffic-class"] },
  { key: "policer", fields: ["svc-rate"] },
  { key: "protocol", fields: ["dst-port", "icmp-msg-type", "icmpv6-msg-type", "routing-type", "src-port", "tcp-flags"] },
];

const GROUP_ORDER = ["action", "arp", "ethernet", "ip", "ipv6", "policer", "protocol", "other"];

/** Normalize a column label for catalog matching (lowercase, alphanumerics only). */
function normalize(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const FIELD_TO_GROUP: Record<string, string> = (() => {
  const m: Record<string, string> = {};
  for (const g of FIELD_GROUPS) for (const f of g.fields) m[normalize(f)] = g.key;
  return m;
})();

/** Group an ACE's extra match fields into ordered, non-empty sections. */
function groupFields(fields: AceField[]): { key: string; items: AceField[] }[] {
  const buckets: Record<string, AceField[]> = {};
  for (const f of fields) {
    const g = FIELD_TO_GROUP[normalize(f.label)] ?? "other";
    (buckets[g] ??= []).push(f);
  }
  return GROUP_ORDER.filter((k) => buckets[k]?.length).map((k) => ({ key: k, items: buckets[k] }));
}

/** Single-line text for a firewall cell, joining multiple parts (e.g. ip + mac). */
function cellText(parts: AceField[]): string[] {
  return parts.map((p) => p.value);
}

// --- Value typing for firewall badges -------------------------------------

type ValueKind = "mac" | "ipv4" | "ipv6" | "port" | "protocol" | "any" | "text";

const MAC_BODY = "(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}|(?:[0-9a-f]{4}\\.){2}[0-9a-f]{4}";
const IPV4_BODY = "\\d{1,3}(?:\\.\\d{1,3}){3}";
const RE_MAC = new RegExp(`^(?:${MAC_BODY})$`, "i");
const RE_IPV4 = new RegExp(`^${IPV4_BODY}(?:/\\d{1,2})?$`);
// IPv4 followed by a separate mask (wildcard 0.0.0.255 or netmask 255.255.255.0).
const RE_IPV4_MASKED = new RegExp(`^(${IPV4_BODY})[\\s/]+(${IPV4_BODY})$`);
// MAC followed by a separate hex mask (e.g. "aa:bb:cc:dd:ee:ff 0x000000ffffff").
const RE_MAC_MASKED = new RegExp(`^(${MAC_BODY})[\\s/]+(0x[0-9a-f]+|${MAC_BODY})$`, "i");
const RE_IPV6 = /^[0-9a-f:]+:[0-9a-f:]*(\/\d{1,3})?$/i;
const RE_PORT = /^\d{1,5}$/;
// Port value optionally followed by a match mask: "20480 0xfc00" or "80 65535".
const RE_PORT_MASKED = /^(\d{1,5})[\s/]+(0x[0-9a-f]+|\d{1,5})$/i;

/** Convert an IPv4 wildcard or netmask to a CIDR prefix length, or null. */
function maskToCidr(mask: string): number | null {
  const octets = mask.split(".").map((o) => Number(o));
  if (octets.length !== 4 || octets.some((o) => !Number.isInteger(o) || o < 0 || o > 255)) return null;
  // Build the 32-bit value; treat right-aligned 1s as a wildcard mask.
  const val = ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
  const popcount = (n: number) => {
    let c = 0;
    for (let i = 0; i < 32; i++) if ((n >>> i) & 1) c++;
    return c;
  };
  const bits = popcount(val);
  // Leading bit set -> netmask (prefix = bits); else wildcard (prefix = 32 - bits).
  const prefix = (val >>> 31) & 1 ? bits : 32 - bits;
  // Sanity: only accept contiguous masks producing a plausible prefix.
  return prefix >= 0 && prefix <= 32 ? prefix : null;
}
const KNOWN_PROTOCOLS = new Set([
  "tcp", "udp", "icmp", "icmpv6", "igmp", "gre", "esp", "ah", "ospf", "pim", "sctp", "ip", "ipv6",
  // ARP and its L2 operations (compared with separators stripped).
  "arp", "arprequest", "arpresponse", "arpreply",
  // ICMP message types.
  "echorequest", "echoreply", "destinationunreachable", "timeexceeded",
  "redirect", "routeradvertisement", "routersolicitation",
]);

/** Match a protocol keyword, tolerant to case and separators (ARP-Request -> arprequest). */
function isKnownProtocol(v: string): boolean {
  return KNOWN_PROTOCOLS.has(v.replace(/[^a-z0-9]/gi, "").toLowerCase());
}

/** Well-known TCP/UDP port -> service name, for friendly labels (22 -> SSH). */
const PORT_NAMES: Record<string, string> = {
  "20": "FTP-DATA", "21": "FTP", "22": "SSH", "23": "Telnet", "25": "SMTP", "53": "DNS",
  "67": "DHCP", "68": "DHCP", "69": "TFTP", "80": "HTTP", "110": "POP3", "123": "NTP",
  "143": "IMAP", "161": "SNMP", "162": "SNMP-Trap", "179": "BGP", "389": "LDAP",
  "443": "HTTPS", "445": "SMB", "465": "SMTPS", "514": "Syslog", "587": "SMTP",
  "636": "LDAPS", "993": "IMAPS", "995": "POP3S", "1812": "RADIUS", "1813": "RADIUS",
  "3306": "MySQL", "3389": "RDP", "5060": "SIP", "5432": "PostgreSQL", "8080": "HTTP-Alt", "8443": "HTTPS-Alt",
};

const ANY_VALUES = new Set(["any", "all", "*", "0.0.0.0/0", "::/0"]);

/** Classify a raw value so the UI can pick an icon and an enriched label. */
function classifyValue(value: string, role: "source" | "destination" | "service" | "other"): ValueKind {
  const v = value.trim().toLowerCase();
  if (ANY_VALUES.has(v)) return "any";
  if (RE_MAC.test(v) || RE_MAC_MASKED.test(v)) return "mac";
  if (RE_IPV4.test(v) || RE_IPV4_MASKED.test(v)) return "ipv4";
  if (role === "service") {
    if (RE_PORT.test(v) || RE_PORT_MASKED.test(v)) return "port";
    if (isKnownProtocol(v)) return "protocol";
  }
  if (RE_IPV6.test(v) && v.includes(":")) return "ipv6";
  if (isKnownProtocol(v)) return "protocol";
  if (RE_PORT.test(v)) return "port";
  return "text";
}

const KIND_ICON: Record<ValueKind, LucideIcon | null> = {
  mac: Cpu,
  ipv4: Network,
  ipv6: Globe,
  port: Plug,
  protocol: Layers,
  any: null,
  text: null,
};

const KIND_CLASS: Record<ValueKind, string> = {
  mac: "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300",
  ipv4: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300",
  ipv6: "bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300",
  port: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300",
  protocol: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  any: "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400",
  text: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300",
};

/** Enriched display text: known service ports show "22 · SSH"; masked IPv4
 * collapses to CIDR ("192.168.2.0 0.0.0.255" -> "192.168.2.0/24"); masked MACs
 * keep "address / mask". */
function badgeText(value: string, kind: ValueKind): string {
  const v = value.trim();
  if (kind === "port") {
    return portText(v);
  }
  if (kind === "ipv4") {
    const m = v.match(RE_IPV4_MASKED);
    if (m) {
      const cidr = maskToCidr(m[2]);
      return cidr !== null ? `${m[1]}/${cidr}` : `${m[1]} ${m[2]}`;
    }
  }
  if (kind === "mac") {
    const m = v.match(RE_MAC_MASKED);
    if (m) return `${m[1]} / ${m[2]}`;
  }
  return v;
}

function actionClass(action: string | null): string {
  const a = (action ?? "").toLowerCase();
  if (a.includes("permit") || a.includes("allow") || a.includes("accept"))
    return "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400";
  if (a.includes("deny") || a.includes("drop") || a.includes("block") || a.includes("reject"))
    return "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400";
  return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
}

export default function AclTab({ nodeId }: { nodeId: string }) {
  const { current } = useAppContext();
  const { t } = useI18n();
  const [acls, setAcls] = useState<Acl[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<ViewMode>("table");

  const configured = useMemo(() => {
    const c = current?.aclConfig;
    return !!(c && (c.aclSource?.categoryId || c.aceSource?.categoryId));
  }, [current]);

  const load = useCallback(async () => {
    if (!current) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/nodes/${nodeId}/acl?context=${current.id}`);
      if (res.ok) {
        const data = await res.json();
        setAcls(data.acls ?? []);
      } else {
        setAcls([]);
      }
    } finally {
      setLoading(false);
    }
  }, [current, nodeId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-7 w-7 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  if (!configured) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("acl.notConfigured")}</p>
        <Link
          href="/settings?tab=acl"
          className="mt-3 inline-block text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
        >
          {t("acl.configureLink")}
        </Link>
      </div>
    );
  }

  if (acls.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t("acl.empty")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* View switcher */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">{t("acl.title")}</h2>
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 p-0.5">
          <button
            type="button"
            onClick={() => setView("table")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "table"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Table2 className="h-4 w-4" />
            {t("acl.view.table")}
          </button>
          <button
            type="button"
            onClick={() => setView("matrix")}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              view === "matrix"
                ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Grid3x3 className="h-4 w-4" />
            {t("acl.view.matrix")}
          </button>
        </div>
      </div>

      {acls.map((acl) =>
        view === "table" ? (
          <AclTableCard key={acl.id} acl={acl} t={t} />
        ) : (
          <AclMatrixCard key={acl.id} acl={acl} t={t} />
        )
      )}
    </div>
  );
}

function AclHeader({ acl, t }: { acl: Acl; t: (k: string) => string }) {
  const meta = "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-300";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="font-semibold text-slate-900 dark:text-white">{acl.name}</span>
      {acl.type && <span className={meta}>{acl.type}</span>}
      {acl.vni && <span className={meta}>{t("acl.fields.vni")}: {acl.vni}</span>}
      {acl.ports.length > 0 && (
        <span className={meta}>{t("acl.fields.ports")}: {acl.ports.join(", ")}</span>
      )}
      {acl.vlans.length > 0 && (
        <span className={meta}>{t("acl.fields.vlans")}: {acl.vlans.join(", ")}</span>
      )}
      {acl.defaultAction && (
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {t("acl.fields.defaultAction")}:{" "}
          <span className={`rounded px-1.5 py-0.5 font-medium ${actionClass(acl.defaultAction)}`}>
            {acl.defaultAction}
          </span>
        </span>
      )}
    </div>
  );
}

/** A single typed value badge with an icon hint (MAC / IP / port / protocol). */
function ValueBadge({
  value,
  role,
  title,
}: {
  value: string;
  role: "source" | "destination" | "service" | "other";
  title?: string;
}) {
  const kind = classifyValue(value, role);
  const Icon = KIND_ICON[kind];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium ${KIND_CLASS[kind]}`}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0" />}
      {badgeText(value, kind)}
    </span>
  );
}

/** A firewall cell: typed value badges, or a muted "all" when no info is available. */
function FwCell({
  parts,
  role,
  t,
}: {
  parts: AceField[];
  role: "source" | "destination" | "service";
  t: (k: string) => string;
}) {
  if (parts.length === 0) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 italic">
        {t("acl.all")}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {parts.map((p, i) => (
        <ValueBadge key={i} value={p.value} role={role} title={`${p.label}: ${p.value}`} />
      ))}
    </div>
  );
}

/** Short service summary (proto/port labels + L2 services) for matrix cells/tooltips. */
function serviceSummary(ace: Ace): string[] {
  const out = serviceLabels(ace).map((s) => s.text);
  for (const s of ace.service) out.push(s.value);
  return out;
}

/**
 * Human label for a port value. A bare port shows its service name when known
 * (22 -> "22 · SSH"). A masked port — where the mask's 1-bits are the
 * significant ones — collapses to a range ("20480 0xfc00" -> "20480-21503").
 * Falls back to "port mask" if the free bits are not low-contiguous.
 */
function portText(raw: string): string {
  const v = raw.trim();
  const m = v.match(RE_PORT_MASKED);
  if (m) {
    const base = Number(m[1]);
    const mask = m[2].toLowerCase().startsWith("0x") ? parseInt(m[2], 16) : Number(m[2]);
    if (Number.isFinite(base) && Number.isFinite(mask) && base <= 0xffff && mask <= 0xffff) {
      const free = (~mask) & 0xffff; // bits NOT matched -> they may vary
      // Only collapse to a range when the free bits are a low-contiguous block.
      if (free === 0) return String(base);
      if (((free + 1) & free) === 0) {
        const lo = base & mask & 0xffff;
        const hi = lo + free;
        return `${lo}-${hi}`;
      }
    }
    return `${m[1]} ${m[2]}`;
  }
  const name = PORT_NAMES[v];
  return name ? `${v} · ${name}` : v;
}

/**
 * Build the L3 service labels for an ACE, combining protocol with source and/or
 * destination ports. Each row aligns positionally across the protocol/port lists.
 *   TCP + dstPort 8443        -> "TCP/8443 · HTTPS-Alt"
 *   TCP + srcPort 1024 + dst  -> "TCP src:1024 → dst:8443 · HTTPS-Alt"
 */
function serviceLabels(ace: Ace): { text: string; title: string }[] {
  // Destination port falls back to the generic "port" role for back-compat.
  const dstPorts = ace.portDst.length ? ace.portDst : ace.port;
  const srcPorts = ace.portSrc;
  const rows = Math.max(ace.protocol.length, srcPorts.length, dstPorts.length);
  const out: { text: string; title: string }[] = [];

  for (let i = 0; i < rows; i++) {
    const proto = ace.protocol[i]?.value?.trim();
    const src = srcPorts[i]?.value?.trim();
    const dst = dstPorts[i]?.value?.trim();
    if (!proto && !src && !dst) continue;

    const upper = proto ? proto.toUpperCase() : "";
    let text: string;
    if (src && dst) {
      text = `${upper ? upper + " " : ""}src:${portText(src)} → dst:${portText(dst)}`;
    } else if (src) {
      text = `${upper ? upper + " " : ""}src:${portText(src)}`;
    } else if (dst) {
      text = upper ? `${upper}/${portText(dst)}` : portText(dst);
    } else {
      text = upper;
    }

    const title = [
      ace.protocol[i] && `${ace.protocol[i].label}: ${ace.protocol[i].value}`,
      srcPorts[i] && `${srcPorts[i].label}: ${srcPorts[i].value}`,
      dstPorts[i] && `${dstPorts[i].label}: ${dstPorts[i].value}`,
    ]
      .filter(Boolean)
      .join(" · ");

    out.push({ text, title });
  }
  return out;
}

/** Service cell: combined L3 protocol/port badge plus any standalone L2 services. */
function ServiceCell({ ace, t }: { ace: Ace; t: (k: string) => string }) {
  const pairs = serviceLabels(ace);
  const hasL2 = ace.service.length > 0;
  if (pairs.length === 0 && !hasL2) {
    return (
      <span className="inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400 italic">
        {t("acl.all")}
      </span>
    );
  }
  return (
    <div className="flex flex-wrap gap-1">
      {pairs.map((p, i) => (
        <span
          key={`pp-${i}`}
          title={p.title}
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"
        >
          <Plug className="h-3 w-3 shrink-0" />
          {p.text}
        </span>
      ))}
      {ace.service.map((s, i) => (
        <ValueBadge key={`l2-${i}`} value={s.value} role="service" title={`${s.label}: ${s.value}`} />
      ))}
    </div>
  );
}

function AclTableCard({ acl, t }: { acl: Acl; t: (k: string) => string }) {
  const th = "px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400";
  const td = "px-3 py-2 align-top text-sm text-slate-700 dark:text-slate-300 break-words";
  const [expanded, setExpanded] = useState<Set<number>>(new Set());

  const toggle = (i: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <AclHeader acl={acl} t={t} />
      </div>
      {acl.aces.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">{t("acl.noAces")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <colgroup>
              <col className="w-[3%]" />
              <col className="w-[23%]" />
              <col className="w-[18%]" />
              <col className="w-[18%]" />
              <col className="w-[17%]" />
              <col className="w-[21%]" />
            </colgroup>
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className={th} />
                <th className={th}>{t("acl.fields.name")}</th>
                <th className={th}>{t("acl.fields.source")}</th>
                <th className={th}>{t("acl.fields.destination")}</th>
                <th className={th}>{t("acl.fields.service")}</th>
                <th className={th}>{t("acl.fields.action")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {acl.aces.map((ace, i) => {
                const groups = groupFields(ace.fields);
                const isOpen = expanded.has(i);
                const hasDetail = groups.length > 0;
                return (
                  <Fragment key={i}>
                    <tr
                      className={`${ace.enabled ? "" : "opacity-50"} ${hasDetail ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/40" : ""}`}
                      onClick={hasDetail ? () => toggle(i) : undefined}
                    >
                      <td className={`${td} text-center`} title={ace.enabled ? t("acl.fields.enabled") : t("acl.disabled")}>
                        {ace.enabled ? (
                          <span className="text-green-600 dark:text-green-400">●</span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">●</span>
                        )}
                      </td>
                      <td className={`${td} font-medium text-slate-900 dark:text-slate-100`}>
                        <span className="flex items-center gap-1">
                          <ChevronRight
                            className={`h-4 w-4 shrink-0 transition-transform ${
                              hasDetail ? "text-slate-400" : "invisible"
                            } ${isOpen ? "rotate-90" : ""}`}
                          />
                          <span>
                            {ace.name}
                            {ace.id && ace.id !== ace.name && (
                              <span className="ml-1.5 font-normal text-xs text-slate-400 dark:text-slate-500">#{ace.id}</span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className={td}><FwCell parts={ace.source} role="source" t={t} /></td>
                      <td className={td}><FwCell parts={ace.destination} role="destination" t={t} /></td>
                      <td className={td}><ServiceCell ace={ace} t={t} /></td>
                      <td className={td}>
                        <div className="flex flex-wrap items-center gap-1">
                          {ace.action && (
                            <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${actionClass(ace.action)}`}>
                              {ace.action}
                            </span>
                          )}
                          {ace.actions.map((q, qi) => (
                            <span
                              key={qi}
                              className="rounded px-1.5 py-0.5 text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
                            >
                              {q.value !== null ? `${q.label}: ${q.value}` : q.label}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                    {isOpen && hasDetail && (
                      <tr>
                        <td />
                        <td colSpan={5} className="px-3 pb-4 pt-1">
                          <AceDetail groups={groups} t={t} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/** Grouped, read-only detail of the remaining match fields carried by an ACE. */
function AceDetail({ groups, t }: { groups: { key: string; items: AceField[] }[]; t: (k: string) => string }) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 p-3 sm:grid-cols-2 lg:grid-cols-3">
      {groups.map((g) => (
        <div key={g.key}>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {t(`acl.groups.${g.key}`)}
          </p>
          <dl className="space-y-1">
            {g.items.map((f, fi) => (
              <div key={fi} className="flex justify-between gap-3 text-xs">
                <dt className="text-slate-500 dark:text-slate-400">{f.label}</dt>
                <dd className="text-right font-medium text-slate-700 dark:text-slate-200 break-all">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

/** Combined key for the matrix axes (joined values, or "*" for "all"). */
function axisKey(parts: AceField[]): string {
  return parts.length === 0 ? "*" : cellText(parts).join(", ");
}

function AclMatrixCard({ acl, t }: { acl: Acl; t: (k: string) => string }) {
  const aces = acl.aces.filter((a) => a.enabled);
  const label = (k: string) => (k === "*" ? t("acl.all") : k);
  const sources = Array.from(new Set(aces.map((a) => axisKey(a.source))));
  const dests = Array.from(new Set(aces.map((a) => axisKey(a.destination))));

  const cell = (src: string, dst: string): Ace | undefined =>
    aces.find((a) => axisKey(a.source) === src && axisKey(a.destination) === dst);

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
      <div className="border-b border-slate-100 dark:border-slate-800 px-4 py-3">
        <AclHeader acl={acl} t={t} />
      </div>
      {aces.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-slate-400">{t("acl.noAces")}</p>
      ) : (
        <div className="overflow-x-auto p-4">
          <table className="border-collapse">
            <thead>
              <tr>
                <th className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400">
                  {t("acl.matrixSourceDest")}
                </th>
                {dests.map((d) => (
                  <th
                    key={d}
                    className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300"
                  >
                    {label(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s}>
                  <th className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {label(s)}
                  </th>
                  {dests.map((d) => {
                    const ace = cell(s, d);
                    return (
                      <td
                        key={d}
                        title={
                          ace
                            ? (() => {
                                const svc = serviceSummary(ace);
                                return [
                                  ace.name,
                                  svc.length ? `${t("acl.fields.service")}: ${svc.join(", ")}` : "",
                                  ...ace.actions.map((q) => (q.value !== null ? `${q.label}: ${q.value}` : q.label)),
                                  ...ace.fields.map((f) => `${f.label}: ${f.value}`),
                                ]
                                  .filter(Boolean)
                                  .join(" · ");
                              })()
                            : undefined
                        }
                        className={`border border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-xs font-medium ${
                          ace ? actionClass(ace.action) : "text-slate-300 dark:text-slate-600"
                        }`}
                      >
                        {ace ? (() => {
                          const svc = serviceSummary(ace);
                          return (
                            <span className="inline-flex items-center gap-1">
                              {ace.action ?? "•"}
                              {svc.length > 0 && (
                                <span className="rounded-full bg-slate-900/10 dark:bg-white/15 px-1 text-[10px]">
                                  {svc.join(", ")}
                                </span>
                              )}
                            </span>
                          );
                        })() : (
                          "—"
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
