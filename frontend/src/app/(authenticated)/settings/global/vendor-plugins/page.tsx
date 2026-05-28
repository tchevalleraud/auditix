"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  AlertTriangle,
  Download,
  Loader2,
  Package,
  ShieldCheck,
  ShieldQuestion,
  Trash2,
  Upload,
  X,
} from "lucide-react";

type SignatureStatus = "official" | "community" | "invalid";

interface InstalledPlugin {
  id: number;
  identifier: string;
  version: string;
  name: string;
  description: string | null;
  author: string | null;
  homepage: string | null;
  license: string | null;
  sha256: string;
  signatureStatus: SignatureStatus;
  signatureKeyId: string | null;
  capabilities: string[];
  manufacturers: string[];
  installedBy: string | null;
  installedAt: string;
  iconUrl: string | null;
}

export default function VendorPluginsPage() {
  const { t } = useI18n();
  const [plugins, setPlugins] = useState<InstalledPlugin[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pendingCommunity, setPendingCommunity] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/vendor-plugins");
      if (res.ok) {
        setPlugins(await res.json());
      } else {
        setPlugins([]);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submitUpload = useCallback(async (file: File) => {
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("archive", file);
      const res = await fetch("/api/admin/vendor-plugins", { method: "POST", body: form });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setUploadError((data as { error?: string }).error || t("vendorPlugins.uploadFailed"));
        return;
      }
      await load();
    } finally {
      setUploading(false);
    }
  }, [load, t]);

  const handleFile = useCallback((file: File) => {
    if (!file.name.toLowerCase().endsWith(".zip")) {
      setUploadError(t("vendorPlugins.errZipOnly"));
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setUploadError(t("vendorPlugins.errTooLarge"));
      return;
    }
    setUploadError(null);
    setPendingCommunity(file);
  }, [t]);

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const onUninstall = async (identifier: string) => {
    setDeleteError(null);
    const res = await fetch(`/api/admin/vendor-plugins/${encodeURIComponent(identifier)}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setDeleteError((data as { error?: string }).error || t("vendorPlugins.uninstallFailed"));
      return;
    }
    setConfirmDelete(null);
    await load();
  };

  if (loading) {
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
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("vendorPlugins.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("vendorPlugins.subtitle")}</p>
        </div>
      </div>

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed px-6 py-10 transition-colors ${
          dragOver
            ? "border-slate-900 bg-slate-50 dark:border-white dark:bg-slate-800/50"
            : "border-slate-300 dark:border-slate-700 bg-slate-50/40 dark:bg-slate-900/30"
        }`}
      >
        <Upload className="h-8 w-8 text-slate-400" />
        <p className="text-sm text-slate-600 dark:text-slate-300">
          {t("vendorPlugins.dropHint")}
        </p>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("vendorPlugins.chooseFile")}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
        {uploadError && (
          <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>
        )}
      </div>

      {/* Plugin cards */}
      {plugins.length === 0 ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-10 text-center">
          <Package className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" />
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{t("vendorPlugins.empty")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plugins.map((p) => (
            <div
              key={p.id}
              className="group relative rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 flex gap-4"
            >
              <PluginIcon iconUrl={p.iconUrl} name={p.name} />

              <div className="flex-1 min-w-0 flex flex-col">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{p.name}</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                      <code className="font-mono">{p.identifier}</code> · v{p.version}
                      {p.author && <> · {p.author}</>}
                    </p>
                  </div>
                  <SignatureBadge status={p.signatureStatus} keyId={p.signatureKeyId} t={t} />
                </div>

                {p.description && (
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{p.description}</p>
                )}

                {p.capabilities.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1">
                    {p.capabilities.map((c) => (
                      <span
                        key={c}
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium text-slate-700 bg-slate-100 ring-1 ring-inset ring-slate-200 dark:text-slate-300 dark:bg-slate-800 dark:ring-slate-700"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-auto pt-3 flex items-end justify-between gap-2">
                  <div className="text-[11px] text-slate-400 dark:text-slate-500">
                    {new Date(p.installedAt).toLocaleDateString()}
                    {p.installedBy && <> · {p.installedBy}</>}
                  </div>

                  {confirmDelete === p.identifier ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => onUninstall(p.identifier)}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10"
                      >
                        {t("common.delete")}
                      </button>
                      <button
                        onClick={() => { setConfirmDelete(null); setDeleteError(null); }}
                        className="rounded-lg px-2 py-1 text-xs font-medium text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      >
                        {t("common.cancel")}
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <a
                        href={`/api/admin/vendor-plugins/${encodeURIComponent(p.identifier)}/export`}
                        download={`${p.identifier}-${p.version}.zip`}
                        className="rounded-lg p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                        title={t("vendorPlugins.export")}
                      >
                        <Download className="h-3.5 w-3.5" />
                      </a>
                      <button
                        onClick={() => setConfirmDelete(p.identifier)}
                        className="rounded-lg p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {deleteError && (
        <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
          {deleteError}
        </div>
      )}

      {/* Community-trust confirmation modal */}
      {pendingCommunity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white dark:bg-slate-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 px-5 py-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("vendorPlugins.confirmTitle")}</h2>
              </div>
              <button onClick={() => setPendingCommunity(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-5 space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <p>{t("vendorPlugins.confirmBody1")}</p>
              <p className="text-amber-700 dark:text-amber-400 font-medium">{t("vendorPlugins.confirmBody2")}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {t("vendorPlugins.confirmFile")}: <code className="font-mono">{pendingCommunity.name}</code> ({(pendingCommunity.size / 1024).toFixed(1)} KB)
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-5 py-3">
              <button onClick={() => setPendingCommunity(null)} className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                {t("common.cancel")}
              </button>
              <button
                onClick={async () => {
                  const f = pendingCommunity;
                  setPendingCommunity(null);
                  await submitUpload(f);
                }}
                className="rounded-lg bg-amber-600 hover:bg-amber-700 px-4 py-2 text-sm font-medium text-white"
              >
                {t("vendorPlugins.confirmInstall")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PluginIcon({ iconUrl, name }: { iconUrl: string | null; name: string }) {
  const [errored, setErrored] = useState(false);
  const showFallback = !iconUrl || errored;
  return (
    <div className="shrink-0 h-16 w-16 rounded-lg overflow-hidden ring-1 ring-slate-200 dark:ring-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center">
      {showFallback ? (
        <Package className="h-7 w-7 text-slate-300 dark:text-slate-600" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconUrl}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setErrored(true)}
        />
      )}
    </div>
  );
}

function SignatureBadge({ status, keyId, t }: { status: SignatureStatus; keyId: string | null; t: (k: string) => string }) {
  if (status === "official") {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-emerald-700 bg-emerald-50 ring-1 ring-inset ring-emerald-600/20 dark:text-emerald-400 dark:bg-emerald-500/10 dark:ring-emerald-500/20" title={keyId ?? undefined}>
        <ShieldCheck className="h-3 w-3" />
        {t("vendorPlugins.sigOfficial")}
      </span>
    );
  }
  if (status === "invalid") {
    return (
      <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-red-700 bg-red-50 ring-1 ring-inset ring-red-600/20 dark:text-red-400 dark:bg-red-500/10 dark:ring-red-500/20">
        <AlertTriangle className="h-3 w-3" />
        {t("vendorPlugins.sigInvalid")}
      </span>
    );
  }
  return (
    <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-amber-700 bg-amber-50 ring-1 ring-inset ring-amber-600/20 dark:text-amber-400 dark:bg-amber-500/10 dark:ring-amber-500/20">
      <ShieldQuestion className="h-3 w-3" />
      {t("vendorPlugins.sigCommunity")}
    </span>
  );
}
