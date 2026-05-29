"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, KeyRound, ServerCog, Moon, Sun, ChevronDown } from "lucide-react";
import { useI18n, locales } from "@/components/I18nProvider";
import { useTheme } from "@/components/ThemeProvider";
import flagComponents from "@/components/Flags";
import { useBackendReady } from "@/hooks/useBackendReady";
import Logo from "@/components/Logo";

type Step = "credentials" | "totp";

interface OidcProvider {
  slug: string;
  name: string;
  buttonLabel: string | null;
  buttonColor: string | null;
  buttonIconUrl: string | null;
  startUrl: string;
}
interface OidcStatus {
  providers: OidcProvider[];
}

function pickTextColor(bg: string | null | undefined): string {
  if (!bg) return "#ffffff";
  const hex = bg.replace("#", "");
  if (hex.length !== 6) return "#ffffff";
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6 ? "#1f2937" : "#ffffff";
}

export default function LoginPage() {
  const router = useRouter();
  const { t, locale, setLocale } = useI18n();
  const { setTheme, resolved } = useTheme();
  const [langOpen, setLangOpen] = useState(false);
  const langRef = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<Step>("credentials");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [challenge, setChallenge] = useState("");
  const [code, setCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [oidc, setOidc] = useState<OidcStatus | null>(null);

  const backend = useBackendReady();
  const backendReady = backend.status === "ready";
  const backendBlocked = backend.status === "not_ready" || backend.status === "checking";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!backendReady) return;
    fetch("/api/auth/oidc/status")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setOidc(data))
      .catch(() => setOidc(null));
  }, [backendReady]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const oidcError = params.get("oidc_error");
    const reason = params.get("reason");
    if (oidcError) {
      setError(oidcError);
    } else if (reason === "idle") {
      setError(t("auth.idleLogout"));
    }
    if (oidcError || reason) {
      params.delete("oidc_error");
      params.delete("reason");
      const qs = params.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
  }, [t]);

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
        // Keep the spinner up: a full reload is about to happen, so we must NOT
        // flip the button back to its idle state in the meantime.
        window.location.href = "/";
        return;
      }

      if (res.status === 409) {
        const data = await res.json();
        if (data?.totp_required && data?.challenge) {
          setChallenge(data.challenge);
          setCode("");
          setUseBackupCode(false);
          setStep("totp");
          setLoading(false);
          return;
        }
      }

      setError(t("auth.invalidCredentials"));
      setLoading(false);
    } catch {
      setError(t("auth.serverError"));
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
        // Keep the spinner up through the full reload (see handleCredentialsSubmit).
        window.location.href = "/";
        return;
      }

      setError(t("auth.invalidTotpCode"));
      setLoading(false);
    } catch {
      setError(t("auth.serverError"));
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
          <div className="mb-4 flex items-center justify-center">
            {step === "totp" ? (
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 dark:bg-slate-800">
                <KeyRound className="h-8 w-8 text-white" />
              </div>
            ) : (
              <Logo size={56} />
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
                disabled={backendBlocked}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
                disabled={backendBlocked}
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3.5 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                placeholder={t("auth.passwordPlaceholder")}
              />
            </div>

            <button
              type="submit"
              disabled={loading || backendBlocked}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-900 dark:bg-white px-4 py-2.5 text-sm font-medium text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-slate-400/20 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("auth.login")}
            </button>

            {backendBlocked && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3 py-2.5 text-xs text-amber-800 dark:text-amber-300">
                <ServerCog className="h-4 w-4 shrink-0 mt-0.5 animate-pulse" />
                <div className="flex-1">
                  <p className="font-medium">{t("auth.backendStartingTitle")}</p>
                  <p className="text-amber-700 dark:text-amber-400/80 mt-0.5">{t("auth.backendStartingDesc")}</p>
                </div>
              </div>
            )}

            {oidc && oidc.providers.length > 0 && (
              <>
                <div className="relative my-1">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-slate-200 dark:border-slate-700" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-white dark:bg-slate-900 px-2 text-slate-400 dark:text-slate-500">{t("auth.or")}</span>
                  </div>
                </div>
                <div className="space-y-2">
                  {oidc.providers.map((p) => {
                    const label = p.buttonLabel ?? t("auth.ssoLogin");
                    const styled = !!p.buttonColor;
                    const textColor = pickTextColor(p.buttonColor);
                    return (
                      <a
                        key={p.slug}
                        href={p.startUrl}
                        className={
                          styled
                            ? "flex w-full items-center justify-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
                            : "flex w-full items-center justify-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
                        }
                        style={styled ? {
                          backgroundColor: p.buttonColor ?? undefined,
                          color: textColor,
                          borderColor: p.buttonColor === "#ffffff" ? "#e2e8f0" : (p.buttonColor ?? undefined),
                        } : undefined}
                      >
                        {p.buttonIconUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.buttonIconUrl} alt="" className="h-4 w-4 object-contain" />
                        ) : (
                          <KeyRound className="h-4 w-4" />
                        )}
                        {label}
                      </a>
                    );
                  })}
                </div>
              </>
            )}
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

        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="relative" ref={langRef}>
              <button
                type="button"
                onClick={() => setLangOpen(!langOpen)}
                className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                {(() => { const Flag = flagComponents[locale]; return <Flag size={20} />; })()}
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 dark:text-slate-500 transition-transform ${langOpen ? "rotate-180" : ""}`} />
              </button>

              {langOpen && (
                <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 z-50">
                  {locales.map((l) => (
                    <button
                      key={l.code}
                      type="button"
                      onClick={() => {
                        setLocale(l.code);
                        setLangOpen(false);
                      }}
                      className={`flex w-full items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                        locale === l.code
                          ? "bg-slate-100 dark:bg-slate-700 text-slate-900 dark:text-white"
                          : "text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50"
                      }`}
                    >
                      {(() => { const Flag = flagComponents[l.code]; return <Flag size={20} />; })()}
                      <span className="font-medium">{l.label}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setTheme(resolved === "light" ? "dark" : "light")}
              aria-label={resolved === "light" ? "Switch to dark theme" : "Switch to light theme"}
              className="rounded-lg p-2 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              {resolved === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
            </button>
          </div>

          <span className="text-xs text-slate-400 dark:text-slate-500">
            Auditix v{process.env.APP_VERSION}
          </span>
        </div>
      </div>
    </div>
  );
}
