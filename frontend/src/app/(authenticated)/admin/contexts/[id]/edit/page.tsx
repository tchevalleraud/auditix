"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useAppContext } from "@/components/ContextProvider";
import { useI18n } from "@/components/I18nProvider";
import { ArrowLeft, Loader2, Search, CircleUser, Check, UserPlus, UserMinus } from "lucide-react";

interface ContextUser {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  avatar: string | null;
}

export default function EditContextPage() {
  const router = useRouter();
  const params = useParams();
  const { contexts, reload } = useAppContext();
  const { t } = useI18n();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [monitoringEnabled, setMonitoringEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [isDefault, setIsDefault] = useState(false);

  // Members management
  const [allUsers, setAllUsers] = useState<ContextUser[]>([]);
  const [memberIds, setMemberIds] = useState<Set<number>>(new Set());
  const [memberSearch, setMemberSearch] = useState("");
  const [membersSaving, setMembersSaving] = useState(false);
  const [membersSuccess, setMembersSuccess] = useState(false);

  const contextId = params.id as string;

  const loadMembers = useCallback(async () => {
    const [usersRes, membersRes] = await Promise.all([
      fetch("/api/users"),
      fetch(`/api/contexts/${contextId}/users`),
    ]);

    if (usersRes.ok) {
      setAllUsers(await usersRes.json());
    }
    if (membersRes.ok) {
      const members: ContextUser[] = await membersRes.json();
      setMemberIds(new Set(members.map((u) => u.id)));
    }
  }, [contextId]);

  useEffect(() => {
    const ctx = contexts.find((c) => c.id === Number(contextId));
    if (ctx) {
      setName(ctx.name);
      setDescription(ctx.description ?? "");
      setMonitoringEnabled(ctx.monitoringEnabled);
      setIsDefault(ctx.isDefault);
      setReady(true);
    }
  }, [contexts, contextId]);

  useEffect(() => {
    loadMembers();
  }, [loadMembers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);

    try {
      const res = await fetch(`/api/contexts/${contextId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || null, monitoringEnabled }),
      });

      if (res.ok) {
        await reload();
        router.push("/admin/contexts");
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleMember = (userId: number) => {
    setMemberIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }
      return next;
    });
  };

  const saveMembers = async () => {
    setMembersSaving(true);
    setMembersSuccess(false);

    try {
      const res = await fetch(`/api/contexts/${contextId}/users`, {
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

  if (!ready) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/contexts"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("admin_contexts.title")}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("admin_contexts.editContext")}</h1>
      </div>

      {/* General info */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("context_switcher.contextName")}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
              placeholder={t("context_switcher.contextNamePlaceholder")}
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
              {t("context_switcher.contextDescription")}
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors resize-none"
              placeholder={t("context_switcher.contextDescriptionPlaceholder")}
            />
          </div>

          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="submit"
              disabled={loading || !name.trim()}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
            <Link
              href="/admin/contexts"
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {t("common.cancel")}
            </Link>
          </div>
        </form>
      </div>

      {/* Monitoring toggle */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center justify-between px-6 py-5">
          <div>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {t("context_switcher.enableMonitoring")}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {t("admin_contexts.monitoringDescription")}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={monitoringEnabled}
            onClick={async () => {
              const next = !monitoringEnabled;
              setMonitoringEnabled(next);
              await fetch(`/api/contexts/${contextId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, description: description || null, monitoringEnabled: next }),
              });
              await reload();
            }}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-slate-400/20 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${
              monitoringEnabled ? "bg-slate-900 dark:bg-white" : "bg-slate-200 dark:bg-slate-700"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform duration-200 ease-in-out ${
                monitoringEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Members management */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              {t("admin_contexts.members")}
            </h2>
            <span className="inline-flex items-center rounded-full bg-slate-100 dark:bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:text-slate-400">
              {memberIds.size}
            </span>
          </div>
          <div className="flex items-center gap-3">
            {membersSuccess && (
              <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="h-4 w-4" />
                {t("admin_contexts.membersSaved")}
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
              placeholder={t("admin_contexts.searchUsers")}
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
              <p className="text-sm text-slate-400 dark:text-slate-500">
                {memberSearch ? t("admin_users.noResult") : t("admin_users.noUsers")}
              </p>
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
                          <span className="ml-2 text-slate-500 dark:text-slate-400">
                            {t("admin_users.roleAdmin")}
                          </span>
                        )}
                      </p>
                    </div>
                  </div>
                  {isMember && isDefault ? (
                    <span className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-slate-400 dark:text-slate-500">
                      <Check className="h-4 w-4" />
                      {t("admin_contexts.memberLocked")}
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
                          {t("admin_contexts.removeMember")}
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" />
                          {t("admin_contexts.addMember")}
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
    </div>
  );
}
