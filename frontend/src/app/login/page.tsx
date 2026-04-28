"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Loader2, KeyRound } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

type Step = "credentials" | "totp";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [step, setStep] = useState<Step>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleCredentialsSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
        return;
      }

      if (res.status === 409) {
        const data = await res.json();
        if (data?.totp_required && data?.challenge) {
          setChallenge(data.challenge);
          setCode("");
          setUseBackupCode(false);
          setStep("totp");
          return;
        }
      }

      setError(t("auth.invalidCredentials"));
    } catch {
      setError(t("auth.serverError"));
    } finally {
      setLoading(false);
    }
  };

  const handleTotpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/login/totp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challenge, code: code.trim() }),
      });

      if (res.ok) {
        router.push("/");
        router.refresh();
      } else {
        setError(t("auth.invalidTotpCode"));
      }
    } catch {
      setError(t("auth.serverError"));
    } finally {
      setLoading(false);
    }
  };

  const cancelTotp = () => {
    setStep("credentials");
    setChallenge("");
    setCode("");
    setUseBackupCode(false);
    setError("");
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 dark:bg-slate-800 mb-4">
            {step === "totp" ? (
              <KeyRound className="h-8 w-8 text-white" />
            ) : (
              <ShieldCheck className="h-8 w-8 text-white" />
            )}
          </div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {step === "totp" ? t("auth.totpTitle") : t("auth.title")}
          </h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {step === "totp"
              ? useBackupCode
                ? t("auth.totpBackupSubtitle")
                : t("auth.totpSubtitle")
              : t("auth.subtitle")}
          </p>
        </div>

        {step === "credentials" && (
          <form
            onSubmit={handleCredentialsSubmit}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4"
          >
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="username"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                {t("auth.username")}
              </label>
              <input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                placeholder={t("auth.usernamePlaceholder")}
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="password"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                {t("auth.password")}
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
                placeholder={t("auth.passwordPlaceholder")}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400/20 disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("auth.login")}
            </button>
          </form>
        )}

        {step === "totp" && (
          <form
            onSubmit={handleTotpSubmit}
            className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm space-y-4"
          >
            {error && (
              <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-sm text-red-700 dark:text-red-400">
                {error}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="totp-code"
                className="block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                {useBackupCode ? t("auth.backupCode") : t("auth.totpCode")}
              </label>
              <input
                id="totp-code"
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
                autoFocus
                inputMode={useBackupCode ? "text" : "numeric"}
                autoComplete="one-time-code"
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors tracking-widest font-mono"
                placeholder={useBackupCode ? "xxxxx-xxxxx" : "000000"}
              />
            </div>

            <button
              type="submit"
              disabled={loading || !code.trim()}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400/20 disabled:opacity-50 transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("auth.totpVerify")}
            </button>

            <div className="flex justify-between text-xs">
              <button
                type="button"
                onClick={cancelTotp}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                {t("auth.totpCancel")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setUseBackupCode((v) => !v);
                  setCode("");
                  setError("");
                }}
                className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
              >
                {useBackupCode ? t("auth.totpUseApp") : t("auth.totpUseBackup")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
