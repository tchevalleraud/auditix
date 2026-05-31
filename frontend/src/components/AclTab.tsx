"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Table2, Grid3x3 } from "lucide-react";
import { useAppContext } from "@/components/ContextProvider";
import { useI18n } from "@/components/I18nProvider";

interface ActionQualifier {
  label: string;
  value: string | null;
}

interface Ace {
  id: string;
  name: string;
  action: string | null;
  actions: ActionQualifier[];
  etherType: string | null;
  source: string | null;
  destination: string | null;
  enabled: boolean;
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

function AclTableCard({ acl, t }: { acl: Acl; t: (k: string) => string }) {
  const th = "px-3 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400";
  const td = "px-3 py-2 align-top text-sm text-slate-700 dark:text-slate-300 break-words";
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
              <col className="w-[18%]" />
              <col className="w-[24%]" />
              <col className="w-[12%]" />
              <col className="w-[20%]" />
              <col className="w-[20%]" />
              <col className="w-[6%]" />
            </colgroup>
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr>
                <th className={th}>{t("acl.fields.name")}</th>
                <th className={th}>{t("acl.fields.action")}</th>
                <th className={th}>{t("acl.fields.etherType")}</th>
                <th className={th}>{t("acl.fields.source")}</th>
                <th className={th}>{t("acl.fields.destination")}</th>
                <th className={th}>{t("acl.fields.enabled")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {acl.aces.map((ace, i) => (
                <tr key={i} className={ace.enabled ? "" : "opacity-50"}>
                  <td className={td}>{ace.name}</td>
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
                  <td className={td}>{ace.etherType ?? "—"}</td>
                  <td className={td}>{ace.source ?? "—"}</td>
                  <td className={td}>{ace.destination ?? "—"}</td>
                  <td className={td}>
                    {ace.enabled ? (
                      <span className="text-green-600 dark:text-green-400">●</span>
                    ) : (
                      <span className="text-slate-400">{t("acl.disabled")}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function AclMatrixCard({ acl, t }: { acl: Acl; t: (k: string) => string }) {
  const aces = acl.aces.filter((a) => a.enabled);
  const sources = Array.from(new Set(aces.map((a) => a.source ?? "*")));
  const dests = Array.from(new Set(aces.map((a) => a.destination ?? "*")));

  const cell = (src: string, dst: string): Ace | undefined =>
    aces.find((a) => (a.source ?? "*") === src && (a.destination ?? "*") === dst);

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
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sources.map((s) => (
                <tr key={s}>
                  <th className="border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-3 py-2 text-left text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {s}
                  </th>
                  {dests.map((d) => {
                    const ace = cell(s, d);
                    return (
                      <td
                        key={d}
                        title={
                          ace
                            ? [ace.name, ...ace.actions.map((q) => (q.value !== null ? `${q.label}: ${q.value}` : q.label))]
                                .filter(Boolean)
                                .join(" · ")
                            : undefined
                        }
                        className={`border border-slate-200 dark:border-slate-700 px-3 py-2 text-center text-xs font-medium ${
                          ace ? actionClass(ace.action) : "text-slate-300 dark:text-slate-600"
                        }`}
                      >
                        {ace ? (
                          <span className="inline-flex items-center gap-1">
                            {ace.action ?? "•"}
                            {ace.actions.length > 0 && (
                              <span className="rounded-full bg-slate-900/10 dark:bg-white/15 px-1 text-[10px]">
                                +{ace.actions.length}
                              </span>
                            )}
                          </span>
                        ) : (
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
