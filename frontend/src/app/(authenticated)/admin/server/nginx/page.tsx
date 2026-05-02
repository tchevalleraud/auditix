"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/components/I18nProvider";
import {
  Loader2,
  Globe,
  Lock,
  ShieldCheck,
  ShieldAlert,
  Upload,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Info,
} from "lucide-react";

type Mode = "http" | "https" | "http_https";

interface CertificateInfo {
  subject: string | null;
  issuer: string | null;
  commonName: string | null;
  subjectAltNames: string[];
  validFrom: string | null;
  validTo: string | null;
  serialNumber: string | null;
  fingerprintSha256: string | null;
  selfSigned: boolean;
}

interface NginxConfig {
  mode: Mode;
  serverName: string;
  hasCertificate: boolean;
  hasChain: boolean;
  certificateInfo: CertificateInfo | null;
  appliedAt: string | null;
  updatedAt: string;
}

interface ApplyResult {
  config: NginxConfig;
  reloaded: boolean;
  message: string | null;
}

type Toast = { kind: "success" | "error" | "info"; text: string };

export default function NginxConfigPage() {
  const { t, locale } = useI18n();
  const [config, setConfig] = useState<NginxConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [applying, setApplying] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [showUploader, setShowUploader] = useState(false);

  // Editable fields
  const [mode, setMode] = useState<Mode>("http");
  const [serverName, setServerName] = useState("localhost");

  // Cert uploader fields
  const [certPem, setCertPem] = useState("");
  const [keyPem, setKeyPem] = useState("");
  const [chainPem, setChainPem] = useState("");

  const certFileRef = useRef<HTMLInputElement>(null);
  const keyFileRef = useRef<HTMLInputElement>(null);
  const chainFileRef = useRef<HTMLInputElement>(null);

  const showToast = useCallback((toastValue: Toast) => {
    setToast(toastValue);
    window.setTimeout(() => setToast(null), 4500);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/admin/server/nginx");
    if (res.ok) {
      const data = (await res.json()) as NginxConfig;
      setConfig(data);
      setMode(data.mode);
      setServerName(data.serverName);
    }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const errorMessage = (code: string): string => {
    const key = `admin_nginx.errors.${code}`;
    const translated = t(key);
    return translated === key ? code : translated;
  };

  const saveSettings = async () => {
    if (!config) return;
    setSaving(true);
    const res = await fetch("/api/admin/server/nginx", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode, serverName }),
    });
    setSaving(false);
    if (res.ok) {
      const data = (await res.json()) as NginxConfig;
      setConfig(data);
      showToast({ kind: "success", text: t("admin_nginx.savedDraft") });
    } else {
      const body = await res.json().catch(() => ({}));
      showToast({ kind: "error", text: errorMessage(body.error ?? "save_failed") });
    }
  };

  const apply = async () => {
    if (!confirm(t("admin_nginx.confirmApply"))) return;
    setApplying(true);
    const res = await fetch("/api/admin/server/nginx/apply", { method: "POST" });
    setApplying(false);
    if (res.ok) {
      const data = (await res.json()) as ApplyResult;
      setConfig(data.config);
      if (data.reloaded) {
        showToast({ kind: "success", text: t("admin_nginx.appliedReloaded") });
      } else {
        showToast({ kind: "info", text: t("admin_nginx.appliedNoReload", { detail: data.message ?? "" }) });
      }
    } else {
      const body = await res.json().catch(() => ({}));
      showToast({ kind: "error", text: errorMessage(body.error ?? "apply_failed") });
    }
  };

  const uploadCert = async () => {
    if (!certPem.trim() || !keyPem.trim()) {
      showToast({ kind: "error", text: t("admin_nginx.errors.certificate_and_key_required") });
      return;
    }
    setUploading(true);
    const res = await fetch("/api/admin/server/nginx/certificate", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ certificate: certPem, privateKey: keyPem, chain: chainPem || null }),
    });
    setUploading(false);
    if (res.ok) {
      const data = (await res.json()) as NginxConfig;
      setConfig(data);
      setCertPem(""); setKeyPem(""); setChainPem("");
      setShowUploader(false);
      showToast({ kind: "success", text: t("admin_nginx.certificateSaved") });
    } else {
      const body = await res.json().catch(() => ({}));
      showToast({ kind: "error", text: errorMessage(body.error ?? "upload_failed") });
    }
  };

  const deleteCert = async () => {
    if (!confirm(t("admin_nginx.confirmDeleteCert"))) return;
    const res = await fetch("/api/admin/server/nginx/certificate", { method: "DELETE" });
    if (res.ok) {
      const data = (await res.json()) as NginxConfig;
      setConfig(data);
      setMode(data.mode);
      showToast({ kind: "success", text: t("admin_nginx.certificateDeleted") });
    } else {
      showToast({ kind: "error", text: errorMessage("delete_failed") });
    }
  };

  const onFile = (target: "cert" | "key" | "chain") => async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    if (target === "cert") setCertPem(text);
    if (target === "key") setKeyPem(text);
    if (target === "chain") setChainPem(text);
    e.target.value = "";
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(locale);
    } catch { return iso; }
  };

  const certExpiry = (() => {
    const validTo = config?.certificateInfo?.validTo;
    if (!validTo) return null;
    const expiry = new Date(validTo).getTime();
    const now = Date.now();
    const days = Math.floor((expiry - now) / (1000 * 60 * 60 * 24));
    return { days, expired: days < 0, expiringSoon: days >= 0 && days < 30 };
  })();

  const isDirty = config !== null && (mode !== config.mode || serverName !== config.serverName);
  const isPendingApply = config !== null && (
    config.appliedAt === null || new Date(config.updatedAt).getTime() > new Date(config.appliedAt).getTime()
  );

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("admin_nginx.title")}</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("admin_nginx.subtitle")}</p>
        </div>
        <button
          onClick={apply}
          disabled={applying || isDirty}
          className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={isDirty ? t("admin_nginx.saveBeforeApply") : ""}
        >
          {applying ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("admin_nginx.applyAndReload")}
        </button>
      </div>

      {toast && (
        <div className={`rounded-lg border px-4 py-3 text-sm ${
          toast.kind === "success"
            ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-300"
            : toast.kind === "info"
            ? "border-blue-200 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300"
            : "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
        }`}>
          {toast.text}
        </div>
      )}

      {isPendingApply && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{t("admin_nginx.pendingApply")}</span>
        </div>
      )}

      {config.mode === "http" && config.hasCertificate && (
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 dark:border-blue-500/30 bg-blue-50 dark:bg-blue-500/10 px-4 py-3 text-sm text-blue-800 dark:text-blue-300">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{t("admin_nginx.hstsCleanupActive")}</span>
        </div>
      )}

      {/* Mode + server name */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("admin_nginx.modeSection")}</h2>
        </div>
        <div className="p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {([
              { value: "http", icon: Globe, label: t("admin_nginx.modeHttp"), hint: t("admin_nginx.modeHttpHint") },
              { value: "https", icon: Lock, label: t("admin_nginx.modeHttps"), hint: t("admin_nginx.modeHttpsHint"), needsCert: true },
              { value: "http_https", icon: ShieldCheck, label: t("admin_nginx.modeHttpHttps"), hint: t("admin_nginx.modeHttpHttpsHint"), needsCert: true },
            ] as const).map((opt) => {
              const disabled = !!opt.needsCert && !config.hasCertificate;
              const selected = mode === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={disabled}
                  onClick={() => setMode(opt.value)}
                  className={`text-left rounded-lg border p-4 transition-colors ${
                    selected
                      ? "border-slate-900 dark:border-white bg-slate-50 dark:bg-slate-800"
                      : "border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/60"
                  } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <Icon className="h-4 w-4 text-slate-700 dark:text-slate-200" />
                    <span className="font-medium text-sm text-slate-900 dark:text-slate-100">{opt.label}</span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{opt.hint}</p>
                  {disabled && (
                    <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">{t("admin_nginx.needsCertificate")}</p>
                  )}
                </button>
              );
            })}
          </div>

          <label className="block">
            <span className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t("admin_nginx.serverName")}</span>
            <input
              type="text"
              value={serverName}
              onChange={(e) => setServerName(e.target.value)}
              placeholder="auditix.example.com"
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
            />
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{t("admin_nginx.serverNameHint")}</span>
          </label>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => { setMode(config.mode); setServerName(config.serverName); }}
              disabled={!isDirty}
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
            >
              {t("admin_nginx.cancel")}
            </button>
            <button
              type="button"
              onClick={saveSettings}
              disabled={!isDirty || saving}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("admin_nginx.save")}
            </button>
          </div>
        </div>
      </div>

      {/* Certificate */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("admin_nginx.certSection")}</h2>
          <div className="flex items-center gap-2">
            {config.hasCertificate && (
              <button
                onClick={deleteCert}
                className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                {t("admin_nginx.removeCert")}
              </button>
            )}
            <button
              onClick={() => setShowUploader((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Upload className="h-3.5 w-3.5" />
              {config.hasCertificate ? t("admin_nginx.replaceCert") : t("admin_nginx.uploadCert")}
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {!config.hasCertificate && !showUploader && (
            <div className="text-center py-8">
              <Lock className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
              <p className="text-sm text-slate-400 dark:text-slate-500">{t("admin_nginx.noCert")}</p>
            </div>
          )}

          {config.hasCertificate && config.certificateInfo && !showUploader && (
            <div className="space-y-3">
              {certExpiry && (certExpiry.expired || certExpiry.expiringSoon) && (
                <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                  certExpiry.expired
                    ? "border-red-200 bg-red-50 text-red-800 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-300"
                    : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300"
                }`}>
                  <ShieldAlert className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>
                    {certExpiry.expired
                      ? t("admin_nginx.certExpired")
                      : t("admin_nginx.certExpiringSoon", { days: String(certExpiry.days) })}
                  </span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <CertField label={t("admin_nginx.commonName")} value={config.certificateInfo.commonName ?? "—"} />
                <CertField label={t("admin_nginx.serial")} value={config.certificateInfo.serialNumber ?? "—"} mono />
                <CertField label={t("admin_nginx.subject")} value={config.certificateInfo.subject ?? "—"} mono full />
                <CertField label={t("admin_nginx.issuer")} value={config.certificateInfo.issuer ?? "—"} mono full />
                <CertField label={t("admin_nginx.validFrom")} value={formatDate(config.certificateInfo.validFrom)} />
                <CertField label={t("admin_nginx.validTo")} value={formatDate(config.certificateInfo.validTo)} />
                <CertField label={t("admin_nginx.fingerprint")} value={config.certificateInfo.fingerprintSha256 ?? "—"} mono full />
                <CertField label={t("admin_nginx.subjectAltNames")} value={config.certificateInfo.subjectAltNames.join(", ") || "—"} mono full />
                <CertField
                  label={t("admin_nginx.chain")}
                  value={config.hasChain ? t("admin_nginx.chainProvided") : t("admin_nginx.chainNone")}
                />
                <CertField
                  label={t("admin_nginx.selfSigned")}
                  value={config.certificateInfo.selfSigned ? t("admin_nginx.yes") : t("admin_nginx.no")}
                />
              </div>

              {config.certificateInfo.selfSigned && (
                <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                  <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <span>{t("admin_nginx.selfSignedHint")}</span>
                </div>
              )}
            </div>
          )}

          {showUploader && (
            <div className="space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300">
                {t("admin_nginx.uploaderHint")}
              </div>

              <CertUploader
                label={t("admin_nginx.certPem")}
                placeholder="-----BEGIN CERTIFICATE-----\n..."
                value={certPem}
                onChange={setCertPem}
                onFile={onFile("cert")}
                fileRef={certFileRef}
                accept=".crt,.pem,.cer"
                t={t}
              />
              <CertUploader
                label={t("admin_nginx.keyPem")}
                placeholder="-----BEGIN PRIVATE KEY-----\n..."
                value={keyPem}
                onChange={setKeyPem}
                onFile={onFile("key")}
                fileRef={keyFileRef}
                accept=".key,.pem"
                t={t}
              />
              <CertUploader
                label={t("admin_nginx.chainPem")}
                placeholder={t("admin_nginx.chainPlaceholder")}
                value={chainPem}
                onChange={setChainPem}
                onFile={onFile("chain")}
                fileRef={chainFileRef}
                accept=".crt,.pem,.cer"
                optional
                t={t}
              />

              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => { setShowUploader(false); setCertPem(""); setKeyPem(""); setChainPem(""); }}
                  className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  {t("admin_nginx.cancel")}
                </button>
                <button
                  onClick={uploadCert}
                  disabled={uploading || !certPem.trim() || !keyPem.trim()}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50"
                >
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {t("admin_nginx.saveCert")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
        <Info className="h-3 w-3" />
        {t("admin_nginx.lastApplied", { date: formatDate(config.appliedAt) })}
      </div>
    </div>
  );
}

function CertField({ label, value, mono, full }: { label: string; value: string; mono?: boolean; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="text-xs font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">{label}</div>
      <div className={`mt-0.5 text-slate-700 dark:text-slate-200 break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</div>
    </div>
  );
}

function CertUploader({
  label, placeholder, value, onChange, onFile, fileRef, accept, optional, t,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileRef: React.RefObject<HTMLInputElement | null>;
  accept: string;
  optional?: boolean;
  t: (key: string) => string;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">
        {label}
        {optional && <span className="text-xs text-slate-400">({t("admin_nginx.optional")})</span>}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="ml-auto inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
        >
          <Upload className="h-3 w-3" />
          {t("admin_nginx.pickFile")}
        </button>
        <input ref={fileRef} type="file" accept={accept} onChange={onFile} className="hidden" />
      </span>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        rows={6}
        spellCheck={false}
        className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-xs font-mono text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-900 dark:focus:ring-white"
      />
    </label>
  );
}
