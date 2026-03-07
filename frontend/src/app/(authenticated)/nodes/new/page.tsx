"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import { ArrowLeft, Loader2 } from "lucide-react";

interface Manufacturer { id: number; name: string }
interface Model { id: number; name: string; manufacturer: { id: number } | null }
interface ProfileItem { id: number; name: string }

const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const selectClass = inputClass;
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

export default function NewNodePage() {
  const router = useRouter();
  const { t } = useI18n();
  const { current } = useAppContext();

  const [ipAddress, setIpAddress] = useState("");
  const [manufacturerId, setManufacturerId] = useState("");
  const [modelId, setModelId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [policy, setPolicy] = useState("audit");
  const [loading, setLoading] = useState(false);

  const [manufacturers, setManufacturers] = useState<Manufacturer[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);

  const loadInitial = useCallback(async () => {
    if (!current) return;
    const [mRes, pRes] = await Promise.all([
      fetch(`/api/manufacturers?context=${current.id}`),
      fetch(`/api/profiles?context=${current.id}`),
    ]);
    if (mRes.ok) setManufacturers(await mRes.json());
    if (pRes.ok) setProfiles(await pRes.json());
  }, [current]);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  const loadModels = useCallback(async (mfId: string) => {
    if (!current) return;
    setModelsLoading(true);
    setModels([]);
    try {
      const res = await fetch(`/api/models?context=${current.id}`);
      if (res.ok) {
        const allModels: Model[] = await res.json();
        setModels(mfId ? allModels.filter((m) => m.manufacturer && m.manufacturer.id === Number(mfId)) : allModels);
      }
    } finally {
      setModelsLoading(false);
    }
  }, [current]);

  const handleManufacturerChange = (value: string) => {
    setManufacturerId(value);
    setModelId("");
    loadModels(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ipAddress.trim()) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/nodes?context=${current?.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ipAddress,
          manufacturerId: manufacturerId ? Number(manufacturerId) : null,
          modelId: modelId ? Number(modelId) : null,
          profileId: profileId ? Number(profileId) : null,
          policy,
        }),
      });

      if (res.ok) {
        router.push("/nodes");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/nodes"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("nodes.title")}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("nodes.newNode")}</h1>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className={labelClass}>{t("nodes.colIpAddress")}</label>
            <input
              type="text"
              value={ipAddress}
              onChange={(e) => setIpAddress(e.target.value)}
              required
              autoFocus
              className={inputClass}
              placeholder={t("nodes.ipPlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>{t("nodes.colManufacturer")}</label>
            <select
              value={manufacturerId}
              onChange={(e) => handleManufacturerChange(e.target.value)}
              className={selectClass}
            >
              <option value="">{"\u2014"}</option>
              {manufacturers.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>
              <span className="flex items-center gap-2">
                {t("nodes.colModel")}
                {modelsLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />}
              </span>
            </label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              disabled={modelsLoading}
              className={`${selectClass} ${modelsLoading ? "opacity-50" : ""}`}
            >
              <option value="">{modelsLoading ? t("nodes.loadingModels") : "\u2014"}</option>
              {models.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>{t("nodes.colProfile")}</label>
            <select value={profileId} onChange={(e) => setProfileId(e.target.value)} className={selectClass}>
              <option value="">{"\u2014"}</option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className={labelClass}>{t("nodes.colPolicy")}</label>
            <select value={policy} onChange={(e) => setPolicy(e.target.value)} className={selectClass}>
              <option value="audit">{t("nodes.policyAudit")}</option>
              <option value="enforce">{t("nodes.policyEnforce")}</option>
            </select>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="submit"
              disabled={loading || !ipAddress.trim()}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.create")}
            </button>
            <Link
              href="/nodes"
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {t("common.cancel")}
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
