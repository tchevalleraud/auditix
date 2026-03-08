"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Plus,
  Loader2,
  Search,
  Server,
  Wifi,
  Play,
  Tag,
  X,
  CheckCircle2,
  XCircle,
} from "lucide-react";

interface NodeTag {
  id: number;
  name: string;
  color: string;
}

interface NodeItem {
  id: number;
  name: string | null;
  ipAddress: string;
  hostname: string | null;
  score: string | null;
  policy: string;
  discoveredModel: string | null;
  discoveredVersion: string | null;
  isReachable: boolean | null;
  lastPingAt: string | null;
  monitoringEnabled: boolean;
  manufacturer: { id: number; name: string; logo: string | null } | null;
  model: { id: number; name: string } | null;
  profile: { id: number; name: string } | null;
  tags: NodeTag[];
  createdAt: string;
}

export default function NodesPage() {
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const [nodes, setNodes] = useState<NodeItem[]>([]);
  const [search, setSearch] = useState("");
  const [fetchLoading, setFetchLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pinging, setPinging] = useState(false);
  const [collectModal, setCollectModal] = useState(false);
  const [collectTags, setCollectTags] = useState<string[]>([]);
  const [collectTagInput, setCollectTagInput] = useState("");
  const [collecting, setCollecting] = useState(false);

  // Collection status indicators per node: pending | running | completed | failed
  const [collectStatus, setCollectStatus] = useState<Record<number, string>>({});
  const dismissTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  // Cleanup timers on unmount
  useEffect(() => {
    const timers = dismissTimers.current;
    return () => { Object.values(timers).forEach(clearTimeout); };
  }, []);

  const loadNodes = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/nodes?context=${current.id}`);
    if (res.ok) setNodes(await res.json());
    setFetchLoading(false);
  }, [current]);

  // Load active collections (pending/running) on mount to restore status indicators
  const loadActiveCollections = useCallback(async () => {
    if (!current) return;
    const res = await fetch(`/api/collections?context=${current.id}`);
    if (!res.ok) return;
    const cols: { node: { id: number }; status: string }[] = await res.json();
    const active: Record<number, string> = {};
    for (const col of cols) {
      if (col.status === "pending" || col.status === "running") {
        // Keep the most "active" status per node (running > pending)
        if (!active[col.node.id] || col.status === "running") {
          active[col.node.id] = col.status;
        }
      }
    }
    setCollectStatus((prev) => ({ ...active, ...prev }));
  }, [current]);

  useEffect(() => {
    loadNodes();
    loadActiveCollections();
  }, [loadNodes, loadActiveCollections]);

  // Mercure SSE for real-time ping + collection updates
  useEffect(() => {
    if (!current || nodes.length === 0) return;
    const url = new URL("/.well-known/mercure", window.location.origin);
    url.searchParams.append("topic", `nodes/context/${current.id}`);
    nodes.forEach((n) => url.searchParams.append("topic", `collections/node/${n.id}`));
    const es = new EventSource(url);
    es.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "ping") {
        setNodes((prev) =>
          prev.map((n) =>
            n.id === data.nodeId
              ? { ...n, isReachable: data.isReachable, lastPingAt: data.lastPingAt }
              : n
          )
        );
      }
      if (data.event === "collection.updated" && data.collection) {
        const col = data.collection;
        const nodeId = Number(data.collection.nodeId ?? 0);
        if (!nodeId) return;
        const status = col.status as string;
        setCollectStatus((prev) => ({ ...prev, [nodeId]: status }));

        if (status === "completed" || status === "failed") {
          // Clear any existing timer for this node
          if (dismissTimers.current[nodeId]) clearTimeout(dismissTimers.current[nodeId]);
          dismissTimers.current[nodeId] = setTimeout(() => {
            setCollectStatus((prev) => {
              const next = { ...prev };
              delete next[nodeId];
              return next;
            });
            delete dismissTimers.current[nodeId];
          }, 15000);
        }
      }
    };
    return () => es.close();
  }, [current, nodes.length]);

  const filtered = nodes.filter(
    (n) =>
      n.ipAddress.toLowerCase().includes(search.toLowerCase()) ||
      (n.name && n.name.toLowerCase().includes(search.toLowerCase())) ||
      (n.hostname && n.hostname.toLowerCase().includes(search.toLowerCase()))
  );

  const filteredIds = new Set(filtered.map((n) => n.id));
  const allFilteredSelected = filtered.length > 0 && filtered.every((n) => selected.has(n.id));

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allFilteredSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.delete(id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filteredIds.forEach((id) => next.add(id));
        return next;
      });
    }
  };

  const handlePing = async () => {
    if (selected.size === 0) return;
    setPinging(true);
    // Reset selected nodes to grey (null) immediately
    setNodes((prev) =>
      prev.map((n) =>
        selected.has(n.id) ? { ...n, isReachable: null } : n
      )
    );
    try {
      await fetch("/api/nodes/ping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeIds: Array.from(selected) }),
      });
    } finally {
      setPinging(false);
      setSelected(new Set());
    }
  };

  const handleCollect = async () => {
    if (!current || selected.size === 0) return;
    setCollecting(true);
    try {
      const nodeIds = Array.from(selected);
      // Mark selected nodes as pending immediately
      setCollectStatus((prev) => {
        const next = { ...prev };
        nodeIds.forEach((id) => { next[id] = "pending"; });
        return next;
      });
      await fetch(`/api/collections/collect?context=${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nodeIds, tags: collectTags }),
      });
      setCollectModal(false);
      setCollectTags([]);
      setCollectTagInput("");
      setSelected(new Set());
    } finally {
      setCollecting(false);
    }
  };

  const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
  const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

  const scoreColors: Record<string, string> = {
    A: "bg-emerald-500",
    B: "bg-lime-500",
    C: "bg-yellow-500",
    D: "bg-orange-500",
    E: "bg-red-400",
    F: "bg-red-600",
  };

  if (fetchLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("nodes.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("nodes.subtitle")}</p>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <button
                onClick={() => { setCollectTags([]); setCollectTagInput(""); setCollectModal(true); }}
                className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                <Play className="h-4 w-4" />
                {t("nodes.collectSelected", { count: String(selected.size) })}
              </button>
              <button
                onClick={handlePing}
                disabled={pinging}
                className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              >
                {pinging ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
                {t("nodes.pingSelected", { count: String(selected.size) })}
              </button>
            </>
          )}
          <Link
            href="/nodes/new"
            className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
          >
            <Plus className="h-4 w-4" />
            {t("nodes.newNode")}
          </Link>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
        <input
          type="text"
          placeholder={t("nodes.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
        />
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="px-4 py-3 text-center w-10">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={toggleAll}
                    className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20"
                  />
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-12">
                  {t("nodes.colScore")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("nodes.colHostname")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("nodes.colIpAddress")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("nodes.colManufacturer")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("nodes.colDiscoveredModel")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("nodes.colDiscoveredVersion")}
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  {t("nodes.colPolicy")}
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider min-w-[160px]">
                  {t("nodes.colCompliance")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-5 py-12 text-center">
                    <Server className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                    <p className="text-sm text-slate-400 dark:text-slate-500">
                      {search ? t("nodes.noResult") : t("nodes.noNodes")}
                    </p>
                  </td>
                </tr>
              ) : (
                filtered.map((node) => (
                  <tr key={node.id} className={`hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors ${selected.has(node.id) ? "bg-slate-50 dark:bg-slate-800/30" : ""}`}>
                    <td className="px-4 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selected.has(node.id)}
                        onChange={() => toggleSelect(node.id)}
                        className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20"
                      />
                    </td>

                    {/* Score */}
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center">
                        {node.score ? (
                          <div className={`flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white ${scoreColors[node.score] ?? "bg-slate-300 dark:bg-slate-600"}`}>
                            {node.score}
                          </div>
                        ) : (
                          <div className="h-7 w-7 rounded-full bg-slate-200 dark:bg-slate-700" />
                        )}
                      </div>
                    </td>

                    {/* Hostname */}
                    <td className="px-4 py-2">
                      <Link href={`/nodes/${node.id}`} className="group flex items-center gap-2">
                        {collectStatus[node.id] && (
                          collectStatus[node.id] === "completed" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                          ) : collectStatus[node.id] === "failed" ? (
                            <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                          ) : collectStatus[node.id] === "running" ? (
                            <Loader2 className="h-4 w-4 animate-spin text-blue-500 shrink-0" />
                          ) : (
                            <Loader2 className="h-4 w-4 animate-spin text-slate-400 shrink-0" />
                          )
                        )}
                        <div>
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:underline">
                            {node.hostname || node.name || <span className="text-slate-300 dark:text-slate-600">{"\u2014"}</span>}
                          </span>
                          {node.tags && node.tags.length > 0 && (
                            <div className="flex items-center gap-1 mt-0.5">
                              {node.tags.slice(0, 3).map((tag) => (
                                <span
                                  key={tag.id}
                                  className="inline-flex items-center rounded-full px-1.5 py-0 text-[10px] font-medium text-white leading-4"
                                  style={{ backgroundColor: tag.color }}
                                >
                                  {tag.name}
                                </span>
                              ))}
                              {node.tags.length > 3 && (
                                <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                                  +{node.tags.length - 3}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </Link>
                    </td>

                    {/* IP Address + profile */}
                    <td className="px-4 py-2">
                      <Link href={`/nodes/${node.id}`} className="group">
                        <span className="flex items-center gap-2">
                          <span className="text-sm text-slate-700 dark:text-slate-300 font-mono group-hover:underline">
                            {node.ipAddress}
                          </span>
                          {node.monitoringEnabled && (
                            <span className={`inline-block h-2 w-2 rounded-full ${node.isReachable === null ? "bg-slate-300 dark:bg-slate-600" : node.isReachable ? "bg-emerald-500" : "bg-red-500"}`} />
                          )}
                        </span>
                        {node.profile && (
                          <div className="text-xs text-slate-500 dark:text-slate-400">{node.profile.name}</div>
                        )}
                      </Link>
                    </td>

                    {/* Manufacturer + Model */}
                    <td className="px-4 py-2">
                      {node.manufacturer ? (
                        <div className="flex items-center gap-2">
                          {node.manufacturer.logo && (
                            <img src={`/api/logos/${node.manufacturer.logo}`} alt="" className="h-5 w-5 object-contain shrink-0" />
                          )}
                          <div>
                            <div className="text-sm text-slate-700 dark:text-slate-300">{node.manufacturer.name}</div>
                            {node.model && (
                              <div className="text-xs text-slate-500 dark:text-slate-400">{node.model.name}</div>
                            )}
                          </div>
                        </div>
                      ) : node.model ? (
                        <div className="text-sm text-slate-700 dark:text-slate-300">{node.model.name}</div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">{"\u2014"}</span>
                      )}
                    </td>

                    {/* Discovered Model */}
                    <td className="px-4 py-2">
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {node.discoveredModel || <span className="text-slate-300 dark:text-slate-600">{"\u2014"}</span>}
                      </span>
                    </td>

                    {/* Version */}
                    <td className="px-4 py-2">
                      <span className="text-sm text-slate-700 dark:text-slate-300">
                        {node.discoveredVersion || <span className="text-slate-300 dark:text-slate-600">{"\u2014"}</span>}
                      </span>
                    </td>

                    {/* Policy */}
                    <td className="px-4 py-2 text-center">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        node.policy === "enforce"
                          ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400"
                          : "bg-sky-100 dark:bg-sky-500/20 text-sky-700 dark:text-sky-400"
                      }`}>
                        {node.policy === "enforce" ? t("nodes.policyEnforce") : t("nodes.policyAudit")}
                      </span>
                    </td>

                    {/* Compliance bar */}
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                          <div className="h-full rounded-full bg-slate-200 dark:bg-slate-700" style={{ width: "100%" }} />
                        </div>
                        <span className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">{"\u2014"}</span>
                      </div>
                    </td>

                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      {/* Collect modal */}
      {collectModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{t("nodes.collectTitle")}</h3>
              <button onClick={() => setCollectModal(false)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                <X className="h-5 w-5 text-slate-400" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                {t("nodes.collectDescription")} ({selected.size} {selected.size === 1 ? "node" : "nodes"})
              </p>
              <div className="space-y-1.5">
                <label className={labelClass}>
                  <span className="flex items-center gap-1.5">
                    <Tag className="h-3.5 w-3.5" />
                    {t("nodes.collectTagLabel")}
                  </span>
                </label>
                <div className="flex flex-wrap items-center gap-1.5 min-h-[42px] rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2">
                  {collectTags.map((tag) => (
                    <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-slate-200 dark:bg-slate-700 px-2.5 py-0.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                      {tag}
                      <button type="button" onClick={() => setCollectTags(collectTags.filter((t) => t !== tag))} className="hover:text-red-500 transition-colors">
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={collectTagInput}
                    onChange={(e) => setCollectTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if ((e.key === "Enter" || e.key === ",") && collectTagInput.trim()) {
                        e.preventDefault();
                        const tag = collectTagInput.trim().replace(/,/g, "");
                        if (tag && !collectTags.includes(tag)) setCollectTags([...collectTags, tag]);
                        setCollectTagInput("");
                      }
                      if (e.key === "Backspace" && !collectTagInput && collectTags.length > 0) {
                        setCollectTags(collectTags.slice(0, -1));
                      }
                    }}
                    placeholder={collectTags.length === 0 ? t("nodes.collectTagPlaceholder") : ""}
                    className="flex-1 min-w-[120px] bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none"
                  />
                </div>
                <p className="text-xs text-slate-400 dark:text-slate-500">{t("nodes.collectTagHelp")}</p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-800">
              <button onClick={() => setCollectModal(false)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                {t("common.cancel")}
              </button>
              <button
                onClick={handleCollect}
                disabled={collecting}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {collecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                {t("nodes.collectStart")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
