"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { ShieldAlert, ArrowLeft, ExternalLink } from "lucide-react";

interface CveDetail {
  id: number;
  cveId: string;
  description: string | null;
  cvssScore: number | null;
  cvssVector: string | null;
  severity: string;
  publishedAt: string | null;
  modifiedAt: string | null;
  versionStartIncluding: string | null;
  versionEndExcluding: string | null;
  versionEndIncluding: string | null;
  syncedAt: string;
  affectedModels: { id: number; name: string; manufacturer: { id: number; name: string } | null }[];
  affectedNodes: { id: number; name: string | null; hostname: string | null; ipAddress: string; discoveredVersion: string | null; score: string | null }[];
}

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400",
  high: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400",
  low: "bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-400",
  none: "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-400",
};

const GRADE_COLORS: Record<string, string> = {
  A: "text-emerald-600 dark:text-emerald-400",
  B: "text-blue-600 dark:text-blue-400",
  C: "text-amber-600 dark:text-amber-400",
  D: "text-orange-600 dark:text-orange-400",
  E: "text-red-600 dark:text-red-400",
  F: "text-red-700 dark:text-red-500",
};

export default function VulnerabilityDetailPage() {
  const { t } = useI18n();
  const params = useParams();
  const id = params.id as string;
  const [cve, setCve] = useState<CveDetail | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch(`/api/vulnerabilities/${id}`);
    if (res.ok) setCve(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-slate-400">{t("common.loading")}</div>;
  }

  if (!cve) {
    return <div className="flex items-center justify-center py-24 text-slate-400">CVE not found</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/vulnerabilities"
          className="rounded-lg border border-slate-200 dark:border-slate-700 p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <ShieldAlert className="h-7 w-7" />
            {cve.cveId}
          </h1>
          <div className="mt-1 flex items-center gap-3">
            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${SEVERITY_COLORS[cve.severity] || SEVERITY_COLORS.none}`}>
              {t(`vulnerabilities.${cve.severity}` as any) || cve.severity}
            </span>
            {cve.cvssScore !== null && (
              <span className="text-sm font-mono font-semibold text-slate-600 dark:text-slate-300">
                CVSS {cve.cvssScore.toFixed(1)}
              </span>
            )}
            <a
              href={`https://nvd.nist.gov/vuln/detail/${cve.cveId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {t("vulnerabilities.externalLink")}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">{t("vulnerabilities.description")}</h2>
        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
          {cve.description || "-"}
        </p>

        {cve.cvssVector && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">CVSS Vector: </span>
            <span className="text-xs font-mono text-slate-600 dark:text-slate-300">{cve.cvssVector}</span>
          </div>
        )}

        {(cve.versionStartIncluding || cve.versionEndExcluding || cve.versionEndIncluding) && (
          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">{t("vulnerabilities.affectedVersions")}: </span>
            <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
              {cve.versionStartIncluding && `>= ${cve.versionStartIncluding}`}
              {cve.versionStartIncluding && (cve.versionEndExcluding || cve.versionEndIncluding) && " — "}
              {cve.versionEndExcluding && `< ${cve.versionEndExcluding}`}
              {cve.versionEndIncluding && `<= ${cve.versionEndIncluding}`}
              {!cve.versionStartIncluding && cve.versionEndExcluding && ` (${t("vulnerabilities.allVersionsBefore")} ${cve.versionEndExcluding})`}
              {!cve.versionStartIncluding && cve.versionEndIncluding && ` (${t("vulnerabilities.allVersionsUpTo")} ${cve.versionEndIncluding})`}
            </span>
          </div>
        )}

        <div className="mt-4 flex gap-6 text-xs text-slate-500 dark:text-slate-400">
          {cve.publishedAt && (
            <span>{t("vulnerabilities.publishedAt")}: {new Date(cve.publishedAt).toLocaleDateString()}</span>
          )}
          {cve.modifiedAt && (
            <span>{t("vulnerabilities.modifiedAt")}: {new Date(cve.modifiedAt).toLocaleDateString()}</span>
          )}
        </div>
      </div>

      {/* Affected Models */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
          {t("vulnerabilities.affectedModels")} ({cve.affectedModels.length})
        </h2>
        {cve.affectedModels.length === 0 ? (
          <p className="text-sm text-slate-400">{t("common.noResult")}</p>
        ) : (
          <div className="space-y-2">
            {cve.affectedModels.map((m) => (
              <div key={m.id} className="flex items-center gap-3 rounded-lg bg-slate-50 dark:bg-slate-900/50 px-4 py-2.5">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {m.manufacturer?.name}
                </span>
                <span className="text-sm text-slate-500 dark:text-slate-400">{m.name}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Affected Nodes */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6">
        <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
          {t("vulnerabilities.affectedNodes")} ({cve.affectedNodes.length})
        </h2>
        {cve.affectedNodes.length === 0 ? (
          <p className="text-sm text-slate-400">{t("common.noResult")}</p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">IP</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("vulnerabilities.nodeName")}</th>
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("vulnerabilities.nodeVersion")}</th>
                  <th className="px-4 py-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {cve.affectedNodes.map((n) => (
                  <tr key={n.id} className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-2">
                      <Link
                        href={`/nodes/${n.id}?tab=vulnerabilities`}
                        className="font-mono text-sm text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        {n.ipAddress}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-600 dark:text-slate-300">{n.name || n.hostname || "-"}</td>
                    <td className="px-4 py-2 font-mono text-xs text-slate-500 dark:text-slate-400">{n.discoveredVersion || "-"}</td>
                    <td className="px-4 py-2 text-center">
                      {n.score ? (
                        <span className={`font-bold ${GRADE_COLORS[n.score] || "text-slate-400"}`}>{n.score}</span>
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
