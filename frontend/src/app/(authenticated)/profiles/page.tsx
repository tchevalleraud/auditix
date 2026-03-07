"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Plus,
  Trash2,
  Loader2,
  Search,
  KeyRound,
  Network,
  Terminal,
} from "lucide-react";

interface SnmpCred {
  id: number;
  name: string;
  version: string | null;
  community: string | null;
  username: string | null;
  securityLevel: string | null;
  authProtocol: string | null;
  authPassword: string | null;
  privProtocol: string | null;
  privPassword: string | null;
  createdAt: string;
}

interface CliCred {
  id: number;
  name: string;
  protocol: string | null;
  port: number | null;
  username: string | null;
  password: string | null;
  enablePassword: string | null;
  createdAt: string;
}

interface ProfileItem {
  id: number;
  name: string;
  snmpCredential: { id: number; name: string; version: string | null } | null;
  cliCredential: { id: number; name: string; protocol: string | null; port: number | null } | null;
  createdAt: string;
}

type Tab = "profiles" | "snmp" | "cli";

const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const selectClass = inputClass;
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

export default function ProfilesPage() {
  const { t, locale } = useI18n();
  const { current } = useAppContext();
  const [activeTab, setActiveTab] = useState<Tab>("profiles");
  const [fetchLoading, setFetchLoading] = useState(true);

  // Profiles
  const [profiles, setProfiles] = useState<ProfileItem[]>([]);
  const [profileSearch, setProfileSearch] = useState("");

  // SNMP
  const [snmpCredentials, setSnmpCredentials] = useState<SnmpCred[]>([]);
  const [snmpSearch, setSnmpSearch] = useState("");
  const [showSnmpForm, setShowSnmpForm] = useState(false);
  const [editingSnmp, setEditingSnmp] = useState<SnmpCred | null>(null);
  const [snmpName, setSnmpName] = useState("");
  const [snmpVersion, setSnmpVersion] = useState("");
  const [snmpCommunity, setSnmpCommunity] = useState("");
  const [snmpUsername, setSnmpUsername] = useState("");
  const [snmpSecurityLevel, setSnmpSecurityLevel] = useState("");
  const [snmpAuthProtocol, setSnmpAuthProtocol] = useState("");
  const [snmpAuthPassword, setSnmpAuthPassword] = useState("");
  const [snmpPrivProtocol, setSnmpPrivProtocol] = useState("");
  const [snmpPrivPassword, setSnmpPrivPassword] = useState("");
  const [savingSnmp, setSavingSnmp] = useState(false);

  // CLI
  const [cliCredentials, setCliCredentials] = useState<CliCred[]>([]);
  const [cliSearch, setCliSearch] = useState("");
  const [showCliForm, setShowCliForm] = useState(false);
  const [editingCli, setEditingCli] = useState<CliCred | null>(null);
  const [cliName, setCliName] = useState("");
  const [cliProtocol, setCliProtocol] = useState("");
  const [cliPort, setCliPort] = useState("");
  const [cliUsername, setCliUsername] = useState("");
  const [cliPassword, setCliPassword] = useState("");
  const [cliEnablePassword, setCliEnablePassword] = useState("");
  const [savingCli, setSavingCli] = useState(false);

  const loadAll = useCallback(async () => {
    if (!current) return;
    const [pRes, sRes, cRes] = await Promise.all([
      fetch(`/api/profiles?context=${current.id}`),
      fetch(`/api/snmp-credentials?context=${current.id}`),
      fetch(`/api/cli-credentials?context=${current.id}`),
    ]);
    if (pRes.ok) setProfiles(await pRes.json());
    if (sRes.ok) setSnmpCredentials(await sRes.json());
    if (cRes.ok) setCliCredentials(await cRes.json());
    setFetchLoading(false);
  }, [current]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const dateLocale =
    locale === "fr" ? "fr-FR" : locale === "de" ? "de-DE" : locale === "es" ? "es-ES" : locale === "it" ? "it-IT" : locale === "ja" ? "ja-JP" : "en-US";

  // --- Profile handlers ---
  const handleDeleteProfile = async (profile: ProfileItem) => {
    if (!confirm(t("profiles.confirmDelete", { name: profile.name }))) return;
    await fetch(`/api/profiles/${profile.id}`, { method: "DELETE" });
    await loadAll();
  };

  // --- SNMP handlers ---
  const resetSnmpForm = () => {
    setSnmpName("");
    setSnmpVersion("");
    setSnmpCommunity("");
    setSnmpUsername("");
    setSnmpSecurityLevel("");
    setSnmpAuthProtocol("");
    setSnmpAuthPassword("");
    setSnmpPrivProtocol("");
    setSnmpPrivPassword("");
    setEditingSnmp(null);
    setShowSnmpForm(false);
  };

  const openSnmpCreate = () => {
    resetSnmpForm();
    setShowSnmpForm(true);
  };

  const openSnmpEdit = (cred: SnmpCred) => {
    setEditingSnmp(cred);
    setSnmpName(cred.name);
    setSnmpVersion(cred.version ?? "");
    setSnmpCommunity(cred.community ?? "");
    setSnmpUsername(cred.username ?? "");
    setSnmpSecurityLevel(cred.securityLevel ?? "");
    setSnmpAuthProtocol(cred.authProtocol ?? "");
    setSnmpAuthPassword(cred.authPassword ?? "");
    setSnmpPrivProtocol(cred.privProtocol ?? "");
    setSnmpPrivPassword(cred.privPassword ?? "");
    setShowSnmpForm(true);
  };

  const handleSaveSnmp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snmpName.trim() || !snmpVersion) return;
    setSavingSnmp(true);
    try {
      const body = {
        name: snmpName,
        version: snmpVersion || null,
        community: snmpCommunity || null,
        username: snmpUsername || null,
        securityLevel: snmpSecurityLevel || null,
        authProtocol: snmpAuthProtocol || null,
        authPassword: snmpAuthPassword || null,
        privProtocol: snmpPrivProtocol || null,
        privPassword: snmpPrivPassword || null,
      };
      const url = editingSnmp
        ? `/api/snmp-credentials/${editingSnmp.id}`
        : `/api/snmp-credentials?context=${current?.id}`;
      await fetch(url, {
        method: editingSnmp ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      resetSnmpForm();
      await loadAll();
    } finally {
      setSavingSnmp(false);
    }
  };

  const handleDeleteSnmp = async (cred: SnmpCred) => {
    if (!confirm(t("profiles.confirmDeleteCredential", { name: cred.name }))) return;
    await fetch(`/api/snmp-credentials/${cred.id}`, { method: "DELETE" });
    await loadAll();
  };

  // --- CLI handlers ---
  const resetCliForm = () => {
    setCliName("");
    setCliProtocol("");
    setCliPort("");
    setCliUsername("");
    setCliPassword("");
    setCliEnablePassword("");
    setEditingCli(null);
    setShowCliForm(false);
  };

  const openCliCreate = () => {
    resetCliForm();
    setShowCliForm(true);
  };

  const openCliEdit = (cred: CliCred) => {
    setEditingCli(cred);
    setCliName(cred.name);
    setCliProtocol(cred.protocol ?? "");
    setCliPort(cred.port ? String(cred.port) : "");
    setCliUsername(cred.username ?? "");
    setCliPassword(cred.password ?? "");
    setCliEnablePassword(cred.enablePassword ?? "");
    setShowCliForm(true);
  };

  const handleSaveCli = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cliName.trim() || !cliProtocol) return;
    setSavingCli(true);
    try {
      const body = {
        name: cliName,
        protocol: cliProtocol || null,
        port: cliPort ? Number(cliPort) : null,
        username: cliUsername || null,
        password: cliPassword || null,
        enablePassword: cliEnablePassword || null,
      };
      const url = editingCli
        ? `/api/cli-credentials/${editingCli.id}`
        : `/api/cli-credentials?context=${current?.id}`;
      await fetch(url, {
        method: editingCli ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      resetCliForm();
      await loadAll();
    } finally {
      setSavingCli(false);
    }
  };

  const handleDeleteCli = async (cred: CliCred) => {
    if (!confirm(t("profiles.confirmDeleteCredential", { name: cred.name }))) return;
    await fetch(`/api/cli-credentials/${cred.id}`, { method: "DELETE" });
    await loadAll();
  };

  // Filtered lists
  const filteredProfiles = profiles.filter((p) => p.name.toLowerCase().includes(profileSearch.toLowerCase()));
  const filteredSnmp = snmpCredentials.filter((c) => c.name.toLowerCase().includes(snmpSearch.toLowerCase()));
  const filteredCli = cliCredentials.filter((c) => c.name.toLowerCase().includes(cliSearch.toLowerCase()));

  const showV1V2 = snmpVersion === "v1" || snmpVersion === "v2c";
  const showV3 = snmpVersion === "v3";
  const showAuth = showV3 && (snmpSecurityLevel === "authNoPriv" || snmpSecurityLevel === "authPriv");
  const showPriv = showV3 && snmpSecurityLevel === "authPriv";

  if (fetchLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode; count: number }[] = [
    { key: "profiles", label: t("profiles.title"), icon: <KeyRound className="h-4 w-4" />, count: profiles.length },
    { key: "snmp", label: "SNMP", icon: <Network className="h-4 w-4" />, count: snmpCredentials.length },
    { key: "cli", label: "CLI", icon: <Terminal className="h-4 w-4" />, count: cliCredentials.length },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("profiles.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("profiles.subtitle")}</p>
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800">
        <nav className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                activeTab === tab.key
                  ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-600"
              }`}
            >
              {tab.icon}
              {tab.label}
              <span className={`rounded-full px-1.5 py-0.5 text-xs ${
                activeTab === tab.key
                  ? "bg-slate-900 dark:bg-white text-white dark:text-slate-900"
                  : "bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </nav>
      </div>

      {/* ========== PROFILES TAB ========== */}
      {activeTab === "profiles" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={t("profiles.searchPlaceholder")}
                value={profileSearch}
                onChange={(e) => setProfileSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
              />
            </div>
            <Link
              href="/profiles/new"
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("profiles.newProfile")}
            </Link>
          </div>

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("profiles.colName")}</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">SNMP</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">CLI</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("profiles.colCreatedAt")}</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("profiles.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredProfiles.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <KeyRound className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                      <p className="text-sm text-slate-400 dark:text-slate-500">
                        {profileSearch ? t("profiles.noResult") : t("profiles.noProfiles")}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredProfiles.map((profile) => (
                    <tr key={profile.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <Link href={`/profiles/${profile.id}`} className="flex items-center gap-3 group">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <KeyRound className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                          </div>
                          <span className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:underline">{profile.name}</span>
                        </Link>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {profile.snmpCredential ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                            <Network className="h-3 w-3" />
                            {profile.snmpCredential.name}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">{"\u2014"}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        {profile.cliCredential ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                            <Terminal className="h-3 w-3" />
                            {profile.cliCredential.name}
                          </span>
                        ) : (
                          <span className="text-slate-300 dark:text-slate-600">{"\u2014"}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {new Date(profile.createdAt).toLocaleDateString(dateLocale)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleDeleteProfile(profile)}
                            className="rounded-lg p-2 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== SNMP TAB ========== */}
      {activeTab === "snmp" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={t("profiles.searchPlaceholder")}
                value={snmpSearch}
                onChange={(e) => setSnmpSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
              />
            </div>
            <button
              onClick={openSnmpCreate}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("profiles.newCredential")}
            </button>
          </div>

          {/* SNMP inline form */}
          {showSnmpForm && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {editingSnmp ? t("profiles.editSnmpCredential") : t("profiles.newSnmpCredential")}
                </h3>
              </div>
              <form onSubmit={handleSaveSnmp} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelClass}>{t("profiles.credentialName")}</label>
                    <input type="text" value={snmpName} onChange={(e) => setSnmpName(e.target.value)} required className={inputClass} placeholder={t("profiles.credentialNamePlaceholder")} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>{t("profiles.snmpVersion")}</label>
                    <select value={snmpVersion} onChange={(e) => setSnmpVersion(e.target.value)} required className={selectClass}>
                      <option value="">{t("profiles.snmpNone")}</option>
                      <option value="v1">v1</option>
                      <option value="v2c">v2c</option>
                      <option value="v3">v3</option>
                    </select>
                  </div>
                </div>

                {showV1V2 && (
                  <div className="space-y-1.5">
                    <label className={labelClass}>{t("profiles.snmpCommunity")}</label>
                    <input type="text" value={snmpCommunity} onChange={(e) => setSnmpCommunity(e.target.value)} className={inputClass} placeholder="public" />
                  </div>
                )}

                {showV3 && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className={labelClass}>{t("profiles.snmpUsername")}</label>
                        <input type="text" value={snmpUsername} onChange={(e) => setSnmpUsername(e.target.value)} className={inputClass} />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelClass}>{t("profiles.snmpSecurityLevel")}</label>
                        <select value={snmpSecurityLevel} onChange={(e) => setSnmpSecurityLevel(e.target.value)} className={selectClass}>
                          <option value="">—</option>
                          <option value="noAuthNoPriv">noAuthNoPriv</option>
                          <option value="authNoPriv">authNoPriv</option>
                          <option value="authPriv">authPriv</option>
                        </select>
                      </div>
                    </div>
                    {showAuth && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className={labelClass}>{t("profiles.snmpAuthProtocol")}</label>
                          <select value={snmpAuthProtocol} onChange={(e) => setSnmpAuthProtocol(e.target.value)} className={selectClass}>
                            <option value="">—</option>
                            <option value="MD5">MD5</option>
                            <option value="SHA">SHA</option>
                            <option value="SHA224">SHA-224</option>
                            <option value="SHA256">SHA-256</option>
                            <option value="SHA384">SHA-384</option>
                            <option value="SHA512">SHA-512</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className={labelClass}>{t("profiles.snmpAuthPassword")}</label>
                          <input type="password" value={snmpAuthPassword} onChange={(e) => setSnmpAuthPassword(e.target.value)} className={inputClass} />
                        </div>
                      </div>
                    )}
                    {showPriv && (
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label className={labelClass}>{t("profiles.snmpPrivProtocol")}</label>
                          <select value={snmpPrivProtocol} onChange={(e) => setSnmpPrivProtocol(e.target.value)} className={selectClass}>
                            <option value="">—</option>
                            <option value="DES">DES</option>
                            <option value="AES">AES-128</option>
                            <option value="AES192">AES-192</option>
                            <option value="AES256">AES-256</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className={labelClass}>{t("profiles.snmpPrivPassword")}</label>
                          <input type="password" value={snmpPrivPassword} onChange={(e) => setSnmpPrivPassword(e.target.value)} className={inputClass} />
                        </div>
                      </div>
                    )}
                  </>
                )}

                <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button type="submit" disabled={savingSnmp || !snmpName.trim() || !snmpVersion} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                    {savingSnmp && <Loader2 className="h-4 w-4 animate-spin" />}
                    {editingSnmp ? t("common.save") : t("common.create")}
                  </button>
                  <button type="button" onClick={resetSnmpForm} className="rounded-lg border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    {t("common.cancel")}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("profiles.colName")}</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("profiles.snmpVersion")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("profiles.colCreatedAt")}</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("profiles.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredSnmp.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-12 text-center">
                      <Network className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                      <p className="text-sm text-slate-400 dark:text-slate-500">
                        {snmpSearch ? t("profiles.noResult") : t("profiles.noSnmpCredentials")}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredSnmp.map((cred) => (
                    <tr key={cred.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <button onClick={() => openSnmpEdit(cred)} className="flex items-center gap-3 group text-left">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <Network className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                          </div>
                          <div>
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:underline">{cred.name}</span>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {cred.community ? `community: ${cred.community}` : ""}
                              {cred.username ? `user: ${cred.username}` : ""}
                            </div>
                          </div>
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                          {cred.version}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {new Date(cred.createdAt).toLocaleDateString(dateLocale)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleDeleteSnmp(cred)} className="rounded-lg p-2 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========== CLI TAB ========== */}
      {activeTab === "cli" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="relative max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={t("profiles.searchPlaceholder")}
                value={cliSearch}
                onChange={(e) => setCliSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
              />
            </div>
            <button
              onClick={openCliCreate}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors"
            >
              <Plus className="h-4 w-4" />
              {t("profiles.newCredential")}
            </button>
          </div>

          {/* CLI inline form */}
          {showCliForm && (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {editingCli ? t("profiles.editCliCredential") : t("profiles.newCliCredential")}
                </h3>
              </div>
              <form onSubmit={handleSaveCli} className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className={labelClass}>{t("profiles.credentialName")}</label>
                    <input type="text" value={cliName} onChange={(e) => setCliName(e.target.value)} required className={inputClass} placeholder={t("profiles.credentialNamePlaceholder")} />
                  </div>
                  <div className="space-y-1.5">
                    <label className={labelClass}>{t("profiles.cliProtocol")}</label>
                    <select
                      value={cliProtocol}
                      onChange={(e) => {
                        setCliProtocol(e.target.value);
                        if (e.target.value === "ssh" && !cliPort) setCliPort("22");
                        if (e.target.value === "telnet" && !cliPort) setCliPort("23");
                      }}
                      required
                      className={selectClass}
                    >
                      <option value="">{t("profiles.cliNone")}</option>
                      <option value="ssh">SSH</option>
                      <option value="telnet">Telnet</option>
                    </select>
                  </div>
                </div>

                {cliProtocol && (
                  <>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="space-y-1.5">
                        <label className={labelClass}>{t("profiles.cliPort")}</label>
                        <input type="number" value={cliPort} onChange={(e) => setCliPort(e.target.value)} className={inputClass} placeholder={cliProtocol === "telnet" ? "23" : "22"} />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelClass}>{t("profiles.cliUsername")}</label>
                        <input type="text" value={cliUsername} onChange={(e) => setCliUsername(e.target.value)} className={inputClass} />
                      </div>
                      <div className="space-y-1.5">
                        <label className={labelClass}>{t("profiles.cliPassword")}</label>
                        <input type="password" value={cliPassword} onChange={(e) => setCliPassword(e.target.value)} className={inputClass} />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className={labelClass}>{t("profiles.cliEnablePassword")}</label>
                      <p className="text-xs text-slate-400 dark:text-slate-500">{t("profiles.cliEnablePasswordHelp")}</p>
                      <input type="password" value={cliEnablePassword} onChange={(e) => setCliEnablePassword(e.target.value)} className={inputClass} />
                    </div>
                  </>
                )}

                <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button type="submit" disabled={savingCli || !cliName.trim() || !cliProtocol} className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors">
                    {savingCli && <Loader2 className="h-4 w-4 animate-spin" />}
                    {editingCli ? t("common.save") : t("common.create")}
                  </button>
                  <button type="button" onClick={resetCliForm} className="rounded-lg border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
                    {t("common.cancel")}
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("profiles.colName")}</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("profiles.cliProtocol")}</th>
                  <th className="px-5 py-3 text-center text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("profiles.cliPort")}</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("profiles.colCreatedAt")}</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{t("profiles.colActions")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredCli.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-5 py-12 text-center">
                      <Terminal className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                      <p className="text-sm text-slate-400 dark:text-slate-500">
                        {cliSearch ? t("profiles.noResult") : t("profiles.noCliCredentials")}
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredCli.map((cred) => (
                    <tr key={cred.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="px-5 py-3.5">
                        <button onClick={() => openCliEdit(cred)} className="flex items-center gap-3 group text-left">
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            <Terminal className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                          </div>
                          <div>
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100 group-hover:underline">{cred.name}</span>
                            {cred.username && (
                              <div className="text-xs text-slate-500 dark:text-slate-400">user: {cred.username}</div>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-300">
                          {cred.protocol?.toUpperCase()}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="text-sm text-slate-500 dark:text-slate-400">{cred.port ?? "\u2014"}</span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-slate-500 dark:text-slate-400">
                          {new Date(cred.createdAt).toLocaleDateString(dateLocale)}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => handleDeleteCli(cred)} className="rounded-lg p-2 text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
