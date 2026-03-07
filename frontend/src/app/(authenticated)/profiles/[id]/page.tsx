"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import { ArrowLeft, Loader2, Network, Terminal } from "lucide-react";

interface SnmpCred { id: number; name: string; version: string | null }
interface CliCred { id: number; name: string; protocol: string | null; port: number | null }

interface ProfileDetail {
  id: number;
  name: string;
  snmpCredential: SnmpCred | null;
  cliCredential: CliCred | null;
  createdAt: string;
}

const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const selectClass = inputClass;
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

export default function ProfileDetailPage() {
  const params = useParams();
  const { t } = useI18n();
  const { current } = useAppContext();
  const profileId = params.id as string;

  const [profile, setProfile] = useState<ProfileDetail | null>(null);
  const [fetchLoading, setFetchLoading] = useState(true);

  const [name, setName] = useState("");
  const [selectedSnmpId, setSelectedSnmpId] = useState<string>("");
  const [selectedCliId, setSelectedCliId] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const [snmpCredentials, setSnmpCredentials] = useState<SnmpCred[]>([]);
  const [cliCredentials, setCliCredentials] = useState<CliCred[]>([]);

  const loadData = useCallback(async () => {
    if (!current) return;
    const [pRes, sRes, cRes] = await Promise.all([
      fetch(`/api/profiles?context=${current.id}`),
      fetch(`/api/snmp-credentials?context=${current.id}`),
      fetch(`/api/cli-credentials?context=${current.id}`),
    ]);
    const profiles: ProfileDetail[] = pRes.ok ? await pRes.json() : [];
    const found = profiles.find((p) => p.id === Number(profileId));
    if (found) {
      setProfile(found);
      setName(found.name);
      setSelectedSnmpId(found.snmpCredential ? String(found.snmpCredential.id) : "");
      setSelectedCliId(found.cliCredential ? String(found.cliCredential.id) : "");
    }
    if (sRes.ok) setSnmpCredentials(await sRes.json());
    if (cRes.ok) setCliCredentials(await cRes.json());
    setFetchLoading(false);
  }, [profileId, current]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/profiles/${profileId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          snmpCredentialId: selectedSnmpId ? Number(selectedSnmpId) : null,
          cliCredentialId: selectedCliId ? Number(selectedCliId) : null,
        }),
      });
      if (res.ok) {
        const updated = await res.json();
        setProfile(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  if (fetchLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  if (!profile) return null;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/profiles"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("profiles.title")}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{profile.name}</h1>
        <div className="mt-1 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          {profile.snmpCredential && (
            <span className="inline-flex items-center gap-1">
              <Network className="h-3.5 w-3.5" />
              {profile.snmpCredential.name}
            </span>
          )}
          {profile.snmpCredential && profile.cliCredential && (
            <span className="text-slate-300 dark:text-slate-600">|</span>
          )}
          {profile.cliCredential && (
            <span className="inline-flex items-center gap-1">
              <Terminal className="h-3.5 w-3.5" />
              {profile.cliCredential.name}
            </span>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <form onSubmit={handleSave} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className={labelClass}>{t("profiles.colName")}</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} required className={inputClass} placeholder={t("profiles.namePlaceholder")} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className={labelClass}>{t("profiles.selectSnmpCredential")}</label>
              <select value={selectedSnmpId} onChange={(e) => setSelectedSnmpId(e.target.value)} className={selectClass}>
                <option value="">{t("profiles.snmpNone")}</option>
                {snmpCredentials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.version})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>{t("profiles.selectCliCredential")}</label>
              <select value={selectedCliId} onChange={(e) => setSelectedCliId(e.target.value)} className={selectClass}>
                <option value="">{t("profiles.cliNone")}</option>
                {cliCredentials.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.protocol?.toUpperCase()}{c.port ? `:${c.port}` : ""})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button type="submit" disabled={saving || !name.trim()} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
            {saved && <span className="text-sm text-green-600 dark:text-green-400">{t("profiles.saved")}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
