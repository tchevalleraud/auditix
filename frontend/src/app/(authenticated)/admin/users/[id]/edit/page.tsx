"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { useI18n } from "@/components/I18nProvider";
import { ArrowLeft, Loader2, KeyRound } from "lucide-react";

interface AppUser {
  id: number;
  username: string;
  firstName: string | null;
  lastName: string | null;
  roles: string[];
  createdAt: string;
  oidcProvisioned?: boolean;
  oidcSubject?: string | null;
  oidcClaims?: Record<string, unknown> | null;
}

export default function EditUserPage() {
  const router = useRouter();
  const params = useParams();
  const { t } = useI18n();
  const userId = params.id as string;

  const [user, setUser] = useState<AppUser | null>(null);
  const [username, setUsername] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchLoading, setFetchLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/users/${userId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((found: AppUser | null) => {
        if (found) {
          setUser(found);
          setUsername(found.username);
          setFirstName(found.firstName ?? "");
          setLastName(found.lastName ?? "");
          setIsAdmin(found.roles.includes("ROLE_ADMIN"));
        }
      })
      .finally(() => setFetchLoading(false));
  }, [userId]);

  const isProtected = user?.username === "admin";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const body: Record<string, unknown> = {
      firstName: firstName || null,
      lastName: lastName || null,
    };

    if (!isProtected) {
      body.username = username;
      body.roles = isAdmin ? ["ROLE_ADMIN"] : [];
    }

    if (password) {
      body.password = password;
    }

    try {
      const res = await fetch(`/api/users/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        router.push("/admin/users");
      }
    } finally {
      setLoading(false);
    }
  };

  if (fetchLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-slate-900 dark:text-white" />
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/admin/users"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          {t("admin_users.title")}
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">{t("admin_users.editUser")}</h1>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("admin_users.colUsername")}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={isProtected}
                autoFocus
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder={t("admin_users.usernamePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("admin_users.firstName")}
              </label>
              <input
                type="text"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                placeholder={t("admin_users.firstNamePlaceholder")}
              />
            </div>
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("admin_users.lastName")}
              </label>
              <input
                type="text"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                placeholder={t("admin_users.lastNamePlaceholder")}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                {t("admin_users.password")}
                <span className="ml-1 text-xs text-slate-400 dark:text-slate-500 font-normal">
                  ({t("admin_users.passwordOptional")})
                </span>
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                placeholder={t("admin_users.passwordPlaceholderEdit")}
              />
            </div>
          </div>

          {!isProtected && (
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-slate-900 dark:text-white focus:ring-slate-400/20"
              />
              <span className="text-sm text-slate-700 dark:text-slate-300">
                {t("admin_users.grantAdmin")}
              </span>
            </label>
          )}

          <div className="flex items-center gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="submit"
              disabled={loading}
              className="flex items-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-5 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save")}
            </button>
            <Link
              href="/admin/users"
              className="rounded-lg border border-slate-200 dark:border-slate-700 px-5 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              {t("common.cancel")}
            </Link>
          </div>
        </form>
      </div>

      {user.oidcProvisioned && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm p-6 space-y-4">
          <div className="flex items-center gap-2">
            <KeyRound className="h-4 w-4 text-slate-500 dark:text-slate-400" />
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Identit&eacute; OIDC</h2>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ce compte a &eacute;t&eacute; provisionn&eacute; via SSO. Les informations ci-dessous proviennent du dernier ID token re&ccedil;u du fournisseur d'identit&eacute;.
          </p>
          <dl className="text-sm space-y-2">
            <div className="flex flex-col sm:flex-row gap-1 sm:gap-3">
              <dt className="font-medium text-slate-600 dark:text-slate-400 sm:w-40">Subject (sub)</dt>
              <dd className="font-mono text-xs text-slate-900 dark:text-slate-200 break-all">{user.oidcSubject ?? "\u2014"}</dd>
            </div>
          </dl>
          {user.oidcClaims && (
            <div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Claims du dernier login</p>
              <pre className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-800 dark:text-slate-200 overflow-x-auto whitespace-pre-wrap break-all max-h-96">
{JSON.stringify(user.oidcClaims, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
