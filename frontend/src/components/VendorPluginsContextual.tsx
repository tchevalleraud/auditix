"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Package,
  RefreshCw,
  Settings as SettingsIcon,
  ShieldCheck,
  ShieldQuestion,
  AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { PluginConfigureModal, type ConfigurationSchema } from "@/components/PluginConfigureModal";

type SignatureStatus = "official" | "community" | "invalid";

interface PluginInfo {
  identifier: string;
  version?: string;
  displayName: string;
  description?: string | null;
  supportedManufacturers?: string[];
  capabilities?: string[];
  configurationSchema?: ConfigurationSchema | null;
  configuration?: Record<string, unknown> | null;
  enabled: boolean;
  lastSyncAt?: string | null;
  lastSyncStatus?: string | null;
  // Optional — only present if the parent endpoint exposes it. Falls back gracefully.
  signatureStatus?: SignatureStatus;
}

interface Props {
  contextId: number | undefined;
  t: (k: string, v?: Record<string, string>) => string;
  isAdmin?: boolean;
}

/**
 * Contextual page Settings > Vendor plugins.
 *
 * Shows one card per installed plugin. Each context activates and configures
 * them independently. The global install / uninstall lives at /settings/global/vendor-plugins.
 */
export function VendorPluginsContextual({ contextId, t, isAdmin }: Props) {
  const [plugins, setPlugins] = useState<PluginInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [configuring, setConfiguring] = useState<PluginInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!contextId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/plugins?context=${contextId}`, { credentials: "include" });
      setPlugins(res.ok ? await res.json() : []);
    } finally {
      setLoading(false);
    }
  }, [contextId]);

  useEffect(() => { load(); }, [load]);

  const toggle = async (plugin: PluginInfo) => {
    const next = !plugin.enabled;
    const res = await fetch(`/api/plugins/${plugin.identifier}?context=${contextId}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: next }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError((data as { error?: string }).error ?? t("vendorPluginsCtx.toggleFailed"));
      return;
    }
    setPlugins(plugins.map((p) => p.identifier === plugin.identifier ? { ...p, enabled: next } : p));
  };

  const sync = async (plugin: PluginInfo) => {
    setSyncingId(plugin.identifier);
    try {
      await fetch(`/api/plugins/${plugin.identifier}/sync?context=${contextId}`, {
        method: "POST", credentials: "include",
      });
    } finally {
      setTimeout(() => setSyncingId(null), 3000);
    }
  };

  const saveConfig = async (identifier: string, configuration: Record<string, unknown>) => {
    const res = await fetch(`/api/plugins/${identifier}?context=${contextId}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ configuration }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error((data as { error?: string }).error ?? t("pluginConfig.saveFailed"));
    }
    setPlugins(plugins.map((p) => p.identifier === identifier ? { ...p, configuration } : p));
  };

  const hasSchema = (p: PluginInfo) => {
    const fields = p.configurationSchema?.fields;
    return Array.isArray(fields) && fields.length > 0;
  };

  const hasLifecycle = (p: PluginInfo) => (p.capabilities ?? []).includes("lifecycle");

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("vendorPluginsCtx.title")}</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("vendorPluginsCtx.subtitle")}</p>
        </div>
        {isAdmin && (
          <Link
            href="/settings/global/vendor-plugins"
            className="shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            <Package className="h-3.5 w-3.5" />
            {t("vendorPluginsCtx.manageInstall")}
          </Link>
        )}
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {error}
        </div>
      )}

      {plugins.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t("vendorPluginsCtx.empty")}</p>
          {isAdmin && (
            <Link href="/settings/global/vendor-plugins" className="mt-3 inline-block text-sm text-slate-700 dark:text-slate-300 underline">
              {t("vendorPluginsCtx.installFirst")}
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plugins.map((plugin) => (
            <div key={plugin.identifier} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex flex-col">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{plugin.displayName}</h3>
                    {plugin.version && (
                      <span className="text-[10px] text-slate-500 dark:text-slate-400">v{plugin.version}</span>
                    )}
                    <SignatureBadge status={plugin.signatureStatus} t={t} />
                  </div>
                  {plugin.description && (
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{plugin.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => toggle(plugin)}
                  title={plugin.enabled ? t("vendorPluginsCtx.disable") : t("vendorPluginsCtx.enable")}
                  className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${plugin.enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${plugin.enabled ? "translate-x-5" : "translate-x-1"}`} />
                </button>
              </div>

              {(plugin.capabilities && plugin.capabilities.length > 0) && (
                <div className="flex flex-wrap gap-1 mb-3">
                  {plugin.capabilities.map((c) => (
                    <span key={c} className="text-[10px] font-medium text-slate-600 bg-slate-100 ring-1 ring-inset ring-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:ring-slate-700 rounded-full px-2 py-0.5">
                      {c}
                    </span>
                  ))}
                </div>
              )}

              {plugin.supportedManufacturers && plugin.supportedManufacturers.length > 0 && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
                  {t("vendorPluginsCtx.supports")}: {plugin.supportedManufacturers.join(", ")}
                </p>
              )}

              {plugin.lastSyncAt && hasLifecycle(plugin) && (
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-3">
                  {t("vendorPluginsCtx.lastSync")}: {new Date(plugin.lastSyncAt).toLocaleString()}
                  {plugin.lastSyncStatus && <span className={`ml-1 ${plugin.lastSyncStatus === "success" ? "text-emerald-500" : "text-red-500"}`}>· {plugin.lastSyncStatus}</span>}
                </p>
              )}

              <div className="mt-auto flex items-center gap-2 pt-2">
                {hasSchema(plugin) && (
                  <button
                    onClick={() => setConfiguring(plugin)}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    <SettingsIcon className="h-3 w-3" />
                    {t("pluginConfig.button")}
                  </button>
                )}
                {plugin.enabled && hasLifecycle(plugin) && (
                  <button
                    onClick={() => sync(plugin)}
                    disabled={syncingId === plugin.identifier}
                    className="inline-flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    {syncingId === plugin.identifier ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3 w-3" />
                    )}
                    {syncingId === plugin.identifier ? t("vendorPluginsCtx.syncing") : t("vendorPluginsCtx.syncNow")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <PluginConfigureModal
        open={configuring !== null}
        pluginName={configuring?.displayName ?? ""}
        schema={configuring?.configurationSchema ?? null}
        value={configuring?.configuration ?? null}
        onClose={() => setConfiguring(null)}
        onSave={async (cfg) => {
          if (configuring) await saveConfig(configuring.identifier, cfg);
        }}
        t={t}
      />
    </div>
  );
}

function SignatureBadge({ status, t }: { status: SignatureStatus | undefined; t: (k: string) => string }) {
  if (!status) return null;
  if (status === "official") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-600/20 dark:text-emerald-400 dark:bg-emerald-500/10 dark:ring-emerald-500/20">
        <ShieldCheck className="h-2.5 w-2.5" />
        {t("vendorPlugins.sigOfficial")}
      </span>
    );
  }
  if (status === "invalid") {
    return (
      <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-red-700 bg-red-50 ring-1 ring-inset ring-red-600/20 dark:text-red-400 dark:bg-red-500/10 dark:ring-red-500/20">
        <AlertTriangle className="h-2.5 w-2.5" />
        {t("vendorPlugins.sigInvalid")}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-medium text-amber-700 bg-amber-50 ring-1 ring-inset ring-amber-600/20 dark:text-amber-400 dark:bg-amber-500/10 dark:ring-amber-500/20">
      <ShieldQuestion className="h-2.5 w-2.5" />
      {t("vendorPlugins.sigCommunity")}
    </span>
  );
}
