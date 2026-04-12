"use client";

import { useState, useEffect, useCallback } from "react";
import { useI18n } from "@/components/I18nProvider";
import { useAppContext } from "@/components/ContextProvider";
import {
  Loader2,
  Check,
  Search,
  CircleUser,
  UserPlus,
  UserMinus,
} from "lucide-react";

interface ContextUser {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  avatar: string | null;
}

type TabKey = "general" | "monitoring" | "retention" | "vulnerability" | "systemUpdates" | "members" | "lab";

const inputClass = "w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors";
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

export default function SettingsPage() {
  const { t } = useI18n();
  const { current, reload } = useAppContext();
  const [tab, setTab] = useState<TabKey>("general");

  // General
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Monitoring
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);

  // Data Retention & Poll intervals
  const [snmpRetentionMinutes, setSnmpRetentionMinutes] = useState(120);
  const [snmpPollIntervalSeconds, setSnmpPollIntervalSeconds] = useState(60);
  const [icmpPollIntervalSeconds, setIcmpPollIntervalSeconds] = useState(60);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionSaved, setRetentionSaved] = useState(false);

  // Vulnerability
  const [vulnEnabled, setVulnEnabled] = useState(false);
  const [nvdApiKey, setNvdApiKey] = useState("");
  const [vulnSyncInterval, setVulnSyncInterval] = useState(24);
  const [vulnWeight, setVulnWeight] = useState(0.3);
  const [vulnSaving, setVulnSaving] = useState(false);
  const [vulnSaved, setVulnSaved] = useState(false);
  const [vulnSyncing, setVulnSyncing] = useState(false);

  // System Updates
  const [suEnabled, setSuEnabled] = useState(false);
  const [suWeight, setSuWeight] = useState(0.0);
  const [suSaving, setSuSaving] = useState(false);
  const [suSaved, setSuSaved] = useState(false);
  const [plugins, setPlugins] = useState<any[]>([]);
  const [pluginSyncing, setPluginSyncing] = useState<string | null>(null);

  // Lab
  const [publicEnabled, setPublicEnabled] = useState(false);
  const [publicToken, setPublicToken] = useState<string | null>(null);
  const [labCopied, setLabCopied] = useState(false);
  const [labSaving, setLabSaving] = useState(false);
  const [labSaved, setLabSaved] = useState(false);

  // Members
  const [allUsers, setAllUsers] = useState<ContextUser[]>([]);
  const [memberIds, setMemberIds] = useState<Set<number>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const [membersSaving, setMembersSaving] = useState(false);
  const [membersSuccess, setMembersSuccess] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  useEffect(() => {
    if (current) {
      setName(current.name);
      setDescription(current.description ?? "");
      setMonitoringEnabled(current.monitoringEnabled);
      setSnmpRetentionMinutes(current.snmpRetentionMinutes ?? 120);
      setSnmpPollIntervalSeconds(current.snmpPollIntervalSeconds ?? 60);
      setIcmpPollIntervalSeconds(current.icmpPollIntervalSeconds ?? 60);
      setIsDefault(current.isDefault);
      setVulnEnabled(current.vulnerabilityEnabled ?? false);
      setNvdApiKey(current.nvdApiKey ?? "");
      setVulnSyncInterval(current.vulnerabilitySyncIntervalHours ?? 24);
      setVulnWeight(current.vulnerabilityScoreWeight ?? 0.3);
      setSuEnabled(current.systemUpdateEnabled ?? false);
      setSuWeight(current.systemUpdateScoreWeight ?? 0.0);
      setPublicEnabled(current.publicEnabled ?? false);
      setPublicToken(current.publicToken ?? null);
    }
  }, [current]);

  const loadMembers = useCallback(async () => {
    if (!current) return;
    const [usersRes, membersRes] = await Promise.all([
      fetch("/api/users"),
      fetch(`/api/contexts/${current.id}/users`),
    ]);
    if (usersRes.ok) setAllUsers(await usersRes.json());
    if (membersRes.ok) {
      const members: ContextUser[] = await membersRes.json();
      setMemberIds(new Set(members.map((u) => u.id)));
    }
  }, [current]);

  useEffect(() => {
    if (tab === "members") loadMembers();
  }, [tab, loadMembers]);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || !name.trim()) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch(`/api/contexts/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null, monitoringEnabled }),
      });
      if (res.ok) {
        await reload();
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } finally {
      setSaving(false);
    }
  };

  const toggleMonitoring = async () => {
    if (!current) return;
    const next = !monitoringEnabled;
    setMonitoringEnabled(next);
    await fetch(`/api/contexts/${current.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || null, monitoringEnabled: next }),
    });
    await reload();
  };

  const toggleMember = (userId: number) => {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const saveMembers = async () => {
    if (!current) return;
    setMembersSaving(true);
    setMembersSuccess(false);
    try {
      const res = await fetch(`/api/contexts/${current.id}/users`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: Array.from(memberIds) }),
      });
      if (res.ok) {
        setMembersSuccess(true);
        await reload();
        setTimeout(() => setMembersSuccess(false), 3000);
      }
    } finally {
      setMembersSaving(false);
    }
  };

  const handleSaveRetention = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!current) return;
    setRetentionSaving(true);
    setRetentionSaved(false);
    try {
      const res = await fetch(`/api/contexts/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null, monitoringEnabled, snmpRetentionMinutes, snmpPollIntervalSeconds, icmpPollIntervalSeconds }),
      });
      if (res.ok) {
        await reload();
        setRetentionSaved(true);
        setTimeout(() => setRetentionSaved(false), 2000);
      }
    } finally {
      setRetentionSaving(false);
    }
  };

  const handleSaveLab = async () => {
    if (!current) return;
    setLabSaving(true);
    setLabSaved(false);
    try {
      const res = await fetch(`/api/contexts/${current.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name, description: description || null, monitoringEnabled,
          publicEnabled,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setPublicToken(data.publicToken);
        await reload();
        setLabSaved(true);
        setTimeout(() => setLabSaved(false), 2000);
      }
    } finally {
      setLabSaving(false);
    }
  };

  const regenerateToken = async () => {
    if (!current) return;
    const res = await fetch(`/api/contexts/${current.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, description: description || null, monitoringEnabled,
        regenerateToken: true,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      setPublicToken(data.publicToken);
      await reload();
    }
  };

  const filteredUsers = allUsers.filter(
    (u) =>
      u.username.toLowerCase().includes(memberSearch.toLowerCase()) ||
      (u.firstName ?? "").toLowerCase().includes(memberSearch.toLowerCase()) ||
      (u.lastName ?? "").toLowerCase().includes(memberSearch.toLowerCase())
  );

  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: t("settings.tabGeneral") },
    { key: "monitoring", label: t("settings.tabMonitoring") },
    { key: "retention", label: t("settings.tabRetention") },
    { key: "vulnerability", label: t("settings.tabVulnerability") },
    { key: "systemUpdates", label: t("settings.tabSystemUpdates") },
    ...(!isDefault ? [{ key: "members" as TabKey, label: t("settings.tabMembers") }] : []),
    { key: "lab" as TabKey, label: t("settings.tabLab") },
  ];

  if (!current) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("settings.title")}</h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("settings.subtitle", { name: current.name })}
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800">
        {tabs.map((item) => (
          <button
            key={item.key}
            onClick={() => setTab(item.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === item.key
                ? "border-slate-900 dark:border-white text-slate-900 dark:text-white"
                : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {/* General tab */}
      {tab === "general" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <form onSubmit={handleSaveGeneral} className="p-6 space-y-5">
            <div className="space-y-1.5">
              <label className={labelClass}>{t("settings.nameLabel")}</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className={inputClass}
              />
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>{t("settings.descriptionLabel")}</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className={`${inputClass} resize-none`}
                placeholder={t("settings.descriptionPlaceholder")}
              />
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              {saved && <span className="text-sm text-green-600 dark:text-green-400">{t("settings.saved")}</span>}
              <button
                type="submit"
                disabled={saving || !name.trim()}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Monitoring tab */}
      {tab === "monitoring" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between px-6 py-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("settings.monitoringLabel")}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {t("settings.monitoringHelp")}
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={monitoringEnabled}
              onClick={toggleMonitoring}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
                monitoringEnabled ? "bg-slate-900 dark:bg-white" : "bg-slate-200 dark:bg-slate-700"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                  monitoringEnabled ? "translate-x-5" : "translate-x-0"
                }`}
                style={monitoringEnabled ? { backgroundColor: undefined } : undefined}
              />
            </button>
          </div>
        </div>
      )}

      {/* Data Retention tab */}
      {tab === "retention" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <form onSubmit={handleSaveRetention} className="p-6 space-y-5">
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {t("settings.retentionTitle")}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {t("settings.retentionHelp")}
              </p>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>{t("settings.icmpIntervalLabel")}</label>
              <p className="text-xs text-slate-400 dark:text-slate-500">{t("settings.icmpIntervalHelp")}</p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="5"
                  max="3600"
                  value={icmpPollIntervalSeconds}
                  onChange={(e) => setIcmpPollIntervalSeconds(Math.max(5, Number(e.target.value)))}
                  className="w-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">{t("settings.seconds")}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>{t("settings.pollIntervalLabel")}</label>
              <p className="text-xs text-slate-400 dark:text-slate-500">{t("settings.pollIntervalHelp")}</p>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="5"
                  max="3600"
                  value={snmpPollIntervalSeconds}
                  onChange={(e) => setSnmpPollIntervalSeconds(Math.max(5, Number(e.target.value)))}
                  className="w-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">{t("settings.seconds")}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className={labelClass}>{t("settings.snmpRetentionLabel")}</label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="1"
                  max="43200"
                  value={snmpRetentionMinutes}
                  onChange={(e) => setSnmpRetentionMinutes(Math.max(1, Number(e.target.value)))}
                  className="w-32 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                />
                <span className="text-sm text-slate-500 dark:text-slate-400">{t("settings.minutes")}</span>
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  ({Math.floor(snmpRetentionMinutes / 60)}{t("settings.hours")}{snmpRetentionMinutes % 60 > 0 ? ` ${snmpRetentionMinutes % 60}min` : ""})
                </span>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
              {retentionSaved && <span className="text-sm text-green-600 dark:text-green-400">{t("settings.saved")}</span>}
              <button
                type="submit"
                disabled={retentionSaving}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {retentionSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Members tab */}
      {tab === "members" && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                {t("settings.tabMembers")}
              </h2>
              <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
                {memberIds.size}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {membersSuccess && (
                <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                  <Check className="h-4 w-4" />
                  {t("settings.membersSaved")}
                </span>
              )}
              <button
                onClick={saveMembers}
                disabled={membersSaving}
                className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
              >
                {membersSaving && <Loader2 className="h-4 w-4 animate-spin" />}
                {t("common.save")}
              </button>
            </div>
          </div>

          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={t("settings.searchMembers")}
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-2 pl-10 pr-4 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
              />
            </div>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {filteredUsers.length === 0 ? (
              <div className="px-6 py-12 text-center">
                <CircleUser className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
                <p className="text-sm text-slate-400 dark:text-slate-500">{t("settings.noUsers")}</p>
              </div>
            ) : (
              filteredUsers.map((user) => {
                const isMember = memberIds.has(user.id);
                return (
                  <div
                    key={user.id}
                    className="flex items-center justify-between px-6 py-3 hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {user.avatar ? (
                        <img src={user.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
                      ) : (
                        <CircleUser className="h-8 w-8 text-slate-400 dark:text-slate-500" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                          {[user.firstName, user.lastName].filter(Boolean).join(" ") || user.username}
                        </p>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          {user.username}
                          {user.roles.includes("ROLE_ADMIN") && (
                            <span className="ml-2 text-slate-500 dark:text-slate-400">Admin</span>
                          )}
                        </p>
                      </div>
                    </div>
                    {isMember && isDefault ? (
                      <span className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 dark:text-slate-500">
                        <Check className="h-4 w-4" />
                        {t("settings.memberLocked")}
                      </span>
                    ) : (
                      <button
                        onClick={() => toggleMember(user.id)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                          isMember
                            ? "text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
                            : "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10"
                        }`}
                      >
                        {isMember ? (
                          <>
                            <UserMinus className="h-4 w-4" />
                            {t("settings.removeMember")}
                          </>
                        ) : (
                          <>
                            <UserPlus className="h-4 w-4" />
                            {t("settings.addMember")}
                          </>
                        )}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {tab === "vulnerability" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">{t("settings.tabVulnerability")}</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{t("settings.vulnEnabledHelp")}</p>
            </div>
            <div className="p-6 space-y-6">
              {/* Enable toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <label className={labelClass}>{t("settings.vulnEnabled")}</label>
                </div>
                <button
                  type="button"
                  onClick={() => setVulnEnabled(!vulnEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${vulnEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}
                >
                  <span className={`inline-block h-4 w-4 rounded-full bg-white transition-transform ${vulnEnabled ? "translate-x-6" : "translate-x-1"}`} />
                </button>
              </div>

              {vulnEnabled && (
                <>
                  {/* NVD API Key */}
                  <div>
                    <label className={labelClass}>{t("settings.vulnApiKey")}</label>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t("settings.vulnApiKeyHelp")}</p>
                    <input
                      type="password"
                      value={nvdApiKey}
                      onChange={(e) => setNvdApiKey(e.target.value)}
                      className={inputClass}
                      placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    />
                  </div>

                  {/* Sync interval */}
                  <div>
                    <label className={labelClass}>{t("settings.vulnSyncInterval")}</label>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t("settings.vulnSyncIntervalHelp")}</p>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={168}
                        value={vulnSyncInterval}
                        onChange={(e) => setVulnSyncInterval(Math.max(1, parseInt(e.target.value) || 1))}
                        className={inputClass + " w-24"}
                      />
                      <span className="text-sm text-slate-500 dark:text-slate-400">{t("settings.hours")}</span>
                    </div>
                  </div>

                  {/* Score weights */}
                  <div>
                    <label className={labelClass}>{t("settings.vulnWeightLabel")}</label>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t("settings.vulnWeightHelp")}</p>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400">{t("settings.complianceWeight")}</label>
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.1}
                          value={Math.round((1 - vulnWeight) * 100) / 100}
                          onChange={(e) => {
                            const cw = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                            setVulnWeight(Math.round((1 - cw) * 100) / 100);
                          }}
                          className={inputClass}
                        />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 dark:text-slate-400">{t("settings.vulnerabilityWeight")}</label>
                        <input
                          type="number"
                          min={0}
                          max={1}
                          step={0.1}
                          value={vulnWeight}
                          onChange={(e) => setVulnWeight(Math.max(0, Math.min(1, parseFloat(e.target.value) || 0)))}
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Sync now */}
                  <div className="flex items-center gap-4">
                    <button
                      onClick={async () => {
                        if (!current?.id) return;
                        setVulnSyncing(true);
                        await fetch("/api/vulnerabilities/sync", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ contextId: current.id }),
                        });
                        setTimeout(() => setVulnSyncing(false), 2000);
                      }}
                      disabled={vulnSyncing}
                      className="rounded-lg border border-slate-200 dark:border-slate-700 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-50"
                    >
                      {vulnSyncing ? t("settings.vulnSyncing") : t("settings.vulnSyncNow")}
                    </button>
                    {current?.lastVulnerabilitySyncAt && (
                      <span className="text-xs text-slate-400">
                        {t("settings.vulnLastSync").replace("{date}", new Date(current.lastVulnerabilitySyncAt).toLocaleString())}
                      </span>
                    )}
                    {!current?.lastVulnerabilitySyncAt && (
                      <span className="text-xs text-slate-400">{t("settings.vulnNeverSynced")}</span>
                    )}
                  </div>
                </>
              )}

              {/* Save button */}
              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={async () => {
                    if (!current?.id) return;
                    setVulnSaving(true);
                    const res = await fetch(`/api/contexts/${current.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({
                        name: current.name,
                        vulnerabilityEnabled: vulnEnabled,
                        nvdApiKey: nvdApiKey || null,
                        vulnerabilitySyncIntervalHours: vulnSyncInterval,
                        vulnerabilityScoreWeight: vulnWeight,
                      }),
                    });
                    if (res.ok) {
                      setVulnSaved(true);
                      setTimeout(() => setVulnSaved(false), 2000);
                      reload();
                    }
                    setVulnSaving(false);
                  }}
                  disabled={vulnSaving}
                  className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50"
                >
                  {vulnSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : vulnSaved ? <Check className="h-4 w-4" /> : null}
                  {vulnSaved ? t("settings.saved") : t("common.save")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "systemUpdates" && (
        <div className="space-y-6">
          {/* Enable toggle */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("settings.systemUpdateEnabled")}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.systemUpdateEnabledHelp")}</p>
              </div>
              <button type="button" onClick={() => setSuEnabled(!suEnabled)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${suEnabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${suEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>

            {/* Score weights (all 3) */}
            <div>
              <label className={labelClass}>{t("settings.vulnWeightLabel")}</label>
              <p className="text-xs text-slate-400 dark:text-slate-500 mb-2">{t("settings.vulnWeightHelp")}</p>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">{t("settings.complianceWeight")}</label>
                  <input type="number" min={0} max={1} step={0.05}
                    value={Math.round((1 - vulnWeight - suWeight) * 100) / 100}
                    onChange={(e) => {
                      const cw = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                      const remaining = Math.max(0, 1 - cw);
                      const ratio = vulnWeight + suWeight > 0 ? vulnWeight / (vulnWeight + suWeight) : 0.5;
                      setVulnWeight(Math.round(remaining * ratio * 100) / 100);
                      setSuWeight(Math.round(remaining * (1 - ratio) * 100) / 100);
                    }}
                    className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">{t("settings.vulnerabilityWeight")}</label>
                  <input type="number" min={0} max={1} step={0.05}
                    value={vulnWeight}
                    onChange={(e) => {
                      const vw = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                      setVulnWeight(vw);
                      const compW = Math.round((1 - vw - suWeight) * 100) / 100;
                      if (compW < 0) setSuWeight(Math.round((1 - vw) * 100) / 100);
                    }}
                    className={inputClass} />
                </div>
                <div>
                  <label className="text-xs text-slate-500 dark:text-slate-400">{t("settings.systemUpdateWeight")}</label>
                  <input type="number" min={0} max={1} step={0.05}
                    value={suWeight}
                    onChange={(e) => {
                      const sw = Math.max(0, Math.min(1, parseFloat(e.target.value) || 0));
                      setSuWeight(sw);
                      const compW = Math.round((1 - vulnWeight - sw) * 100) / 100;
                      if (compW < 0) setVulnWeight(Math.round((1 - sw) * 100) / 100);
                    }}
                    className={inputClass} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button onClick={async () => {
                setSuSaving(true);
                const compW = Math.round((1 - vulnWeight - suWeight) * 100) / 100;
                await fetch(`/api/contexts/${current?.id}`, {
                  method: "PUT", credentials: "include",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: current?.name, systemUpdateEnabled: suEnabled,
                    complianceScoreWeight: Math.max(0, compW),
                    vulnerabilityScoreWeight: vulnWeight,
                    systemUpdateScoreWeight: suWeight,
                  }),
                });
                setSuSaving(false); setSuSaved(true); reload();
                setTimeout(() => setSuSaved(false), 2000);
              }}
                className="inline-flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-slate-100 px-4 py-2 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 transition-colors">
                {suSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : suSaved ? <Check className="h-4 w-4" /> : null}
                {suSaved ? t("settings.saved") : t("common.save")}
              </button>
            </div>
          </div>

          {/* Vendor plugins */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("settings.pluginsTitle")}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{t("settings.pluginsHelp")}</p>
            <PluginManager contextId={current?.id} t={t} plugins={plugins} setPlugins={setPlugins} pluginSyncing={pluginSyncing} setPluginSyncing={setPluginSyncing} />
          </div>
        </div>
      )}

      {tab === "lab" && (
        <div className="space-y-6">
          {/* Enable/Disable */}
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("settings.labTitle")}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{t("settings.labDesc")}</p>
              </div>
              <button
                onClick={() => setPublicEnabled(!publicEnabled)}
                className="p-1"
              >
                {publicEnabled ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    <Check className="h-3 w-3" />
                    {t("settings.labActive")}
                  </span>
                ) : (
                  <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-xs font-medium text-slate-500 dark:text-slate-400">
                    {t("settings.labInactive")}
                  </span>
                )}
              </button>
            </div>
          </div>

          {publicEnabled && (
            <>
              {/* Public URL */}
              {publicToken && (
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("settings.labUrl")}</h2>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`${typeof window !== "undefined" ? window.location.origin : ""}/lab/${publicToken}`}
                      className={`${inputClass} font-mono text-xs`}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                    />
                    <button
                      onClick={() => {
                        const url = `${window.location.origin}/lab/${publicToken}`;
                        if (navigator.clipboard && window.isSecureContext) {
                          navigator.clipboard.writeText(url).then(() => {
                            setLabCopied(true);
                            setTimeout(() => setLabCopied(false), 2000);
                          });
                        } else {
                          // Fallback for non-HTTPS contexts
                          const textArea = document.createElement("textarea");
                          textArea.value = url;
                          textArea.style.position = "fixed";
                          textArea.style.left = "-9999px";
                          document.body.appendChild(textArea);
                          textArea.select();
                          document.execCommand("copy");
                          document.body.removeChild(textArea);
                          setLabCopied(true);
                          setTimeout(() => setLabCopied(false), 2000);
                        }
                      }}
                      className="shrink-0 rounded-lg bg-slate-100 dark:bg-slate-800 px-3 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                    >
                      {labCopied ? <Check className="h-4 w-4 text-emerald-500" /> : t("settings.labCopy")}
                    </button>
                  </div>
                  <button
                    onClick={regenerateToken}
                    className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                  >
                    {t("settings.labRegenerate")}
                  </button>
                </div>
              )}
            </>
          )}

          {/* Save */}
          <div className="flex items-center gap-3">
            <button
              onClick={handleSaveLab}
              disabled={labSaving}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {labSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
            {labSaved && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                {t("settings.saved")}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Plugin Manager ─── */

function PluginManager({ contextId, t, plugins, setPlugins, pluginSyncing, setPluginSyncing }: {
  contextId: number | undefined;
  t: (k: string, v?: Record<string, string>) => string;
  plugins: any[];
  setPlugins: (p: any[]) => void;
  pluginSyncing: string | null;
  setPluginSyncing: (s: string | null) => void;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!contextId || loaded) return;
    (async () => {
      const res = await fetch(`/api/plugins?context=${contextId}`, { credentials: "include" });
      if (res.ok) setPlugins(await res.json());
      setLoaded(true);
    })();
  }, [contextId, loaded, setPlugins]);

  const togglePlugin = async (identifier: string, enabled: boolean) => {
    await fetch(`/api/plugins/${identifier}?context=${contextId}`, {
      method: "PUT", credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setPlugins(plugins.map((p) => p.identifier === identifier ? { ...p, enabled } : p));
  };

  const syncPlugin = async (identifier: string) => {
    setPluginSyncing(identifier);
    await fetch(`/api/plugins/${identifier}/sync?context=${contextId}`, {
      method: "POST", credentials: "include",
    });
    setTimeout(() => setPluginSyncing(null), 3000);
  };

  if (!loaded) return <div className="text-sm text-slate-400">...</div>;
  if (plugins.length === 0) return <p className="text-sm text-slate-400">{t("settings.pluginNoPlugins")}</p>;

  return (
    <div className="divide-y divide-slate-100 dark:divide-slate-800">
      {plugins.map((plugin) => (
        <div key={plugin.identifier} className="flex items-center justify-between py-3">
          <div>
            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{plugin.displayName}</span>
            <span className="ml-2 text-xs text-slate-400">{plugin.supportedManufacturers?.join(", ")}</span>
            {plugin.lastSyncAt && (
              <p className="text-xs text-slate-400 mt-0.5">
                {t("settings.pluginLastSync", { date: new Date(plugin.lastSyncAt).toLocaleString() })}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => togglePlugin(plugin.identifier, !plugin.enabled)}
              className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${plugin.enabled ? "bg-emerald-500" : "bg-slate-300 dark:bg-slate-600"}`}>
              <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${plugin.enabled ? "translate-x-5" : "translate-x-1"}`} />
            </button>
            {plugin.enabled && (
              <button onClick={() => syncPlugin(plugin.identifier)}
                disabled={pluginSyncing === plugin.identifier}
                className="text-xs px-2 py-1 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 disabled:opacity-50">
                {pluginSyncing === plugin.identifier ? t("settings.pluginSyncing") : t("settings.pluginSyncNow")}
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
