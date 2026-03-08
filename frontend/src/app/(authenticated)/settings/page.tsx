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

type TabKey = "general" | "monitoring" | "members";

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
      setIsDefault(current.isDefault);
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

  const filteredUsers = allUsers.filter(
    (u) =>
      u.username.toLowerCase().includes(memberSearch.toLowerCase()) ||
      (u.firstName ?? "").toLowerCase().includes(memberSearch.toLowerCase()) ||
      (u.lastName ?? "").toLowerCase().includes(memberSearch.toLowerCase())
  );

  const tabs: { key: TabKey; label: string }[] = [
    { key: "general", label: t("settings.tabGeneral") },
    { key: "monitoring", label: t("settings.tabMonitoring") },
    ...(!isDefault ? [{ key: "members" as TabKey, label: t("settings.tabMembers") }] : []),
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
    </div>
  );
}
