"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { CircleUser, LogOut, Moon, Sparkles, Sun, ChevronDown, UserCog } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useAppContext } from "@/components/ContextProvider";
import { useI18n, locales, type Locale } from "@/components/I18nProvider";
import flagComponents from "@/components/Flags";
import ContextSwitcher from "@/components/layout/ContextSwitcher";
import { AiAssistantPanel } from "@/components/AiAssistantPanel";

export default function Topbar() {
  const { theme, setTheme, resolved } = useTheme();
  const { userRoles, userInfo, current } = useAppContext();
  const isUserAdmin = userRoles.includes("ROLE_ADMIN");
  const { locale, setLocale, t } = useI18n();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [hasAnyAi, setHasAnyAi] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

  // The bot icon only appears when the *currently open* context has at least
  // one reachable assistant — the chat panel is scoped to that context, so
  // showing the icon for a context with no assistants would just dead-end.
  // We refetch on context change and on window focus (admins adding an
  // assistant from another tab).
  useEffect(() => {
    if (!current) {
      setHasAnyAi(false);
      return;
    }
    let cancelled = false;
    const probe = async () => {
      try {
        const res = await fetch(`/api/ai/assistants?context=${current.id}`);
        if (!cancelled && res.ok) {
          const list = await res.json();
          setHasAnyAi(Array.isArray(list) && list.length > 0);
        }
      } catch {}
    };
    probe();
    const onFocus = () => probe();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [current]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
      if (langRef.current && !langRef.current.contains(e.target as Node)) {
        setLangOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const CurrentFlag = flagComponents[locale];

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-sm px-6 gap-4">
      <div className="flex flex-1 items-center gap-3">
        <ContextSwitcher />
      </div>

      <div className="flex items-center gap-2">
        {hasAnyAi && (
          <>
            <button
              onClick={() => setAiPanelOpen(true)}
              aria-label={t("ai.title")}
              title={t("ai.title")}
              className="group relative flex items-center"
            >
              {/* Soft animated halo. `animate-pulse` is gentle (1s easeInOut)
                  and the blur-md spread makes it read as a glow, not a ring. */}
              <span
                aria-hidden
                className="pointer-events-none absolute inset-0 rounded-full bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-pink-500 opacity-50 blur-md animate-pulse transition-opacity group-hover:opacity-80"
              />
              {/* Foreground pill with the same gradient (sharp), Sparkles icon
                  and a tiny shimmering "online" dot. */}
              <span className="relative flex items-center gap-1.5 rounded-full bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-pink-500 px-2.5 py-1.5 text-white shadow-md shadow-fuchsia-500/40 ring-1 ring-white/20 transition-transform group-hover:scale-[1.04] group-active:scale-95">
                <Sparkles className="h-4 w-4 drop-shadow-[0_0_4px_rgba(255,255,255,0.7)]" />
                <span className="text-[11px] font-semibold tracking-wider">{t("ai.shortLabel")}</span>
                <span
                  aria-hidden
                  className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-emerald-400 ring-2 ring-white dark:ring-slate-900"
                >
                  <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-75" />
                </span>
              </span>
            </button>
            <div className="mx-2 h-8 w-px bg-slate-200 dark:bg-slate-700" />
          </>
        )}
        <div className="relative" ref={langRef}>
          <button
            onClick={() => setLangOpen(!langOpen)}
            className="flex items-center gap-1 rounded-lg px-2 py-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <CurrentFlag size={20} />
            <ChevronDown className={`h-3.5 w-3.5 text-slate-400 dark:text-slate-500 transition-transform ${langOpen ? "rotate-180" : ""}`} />
          </button>

          {langOpen && (
            <div className="absolute right-0 mt-2 w-48 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 z-50">
              {locales.map((l) => (
                <button
                  key={l.code}
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
          onClick={() => setTheme(resolved === "light" ? "dark" : "light")}
          className="rounded-lg p-2 text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
        >
          {resolved === "light" ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
        </button>

        <div className="mx-2 h-8 w-px bg-slate-200 dark:bg-slate-700" />

        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setMenuOpen(!menuOpen)}
            className="flex items-center gap-3 rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            {userInfo?.avatar ? (
              <img src={userInfo.avatar} alt="" className="h-8 w-8 rounded-full object-cover" />
            ) : (
              <CircleUser className="h-8 w-8 text-slate-400 dark:text-slate-500" />
            )}
            <div className="text-left hidden sm:block">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                {userInfo?.firstName && userInfo?.lastName
                  ? `${userInfo.firstName} ${userInfo.lastName}`
                  : userInfo?.username ?? ""}
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {isUserAdmin ? t("topbar.administrator") : t("topbar.user")}
              </p>
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-400 dark:text-slate-500 transition-transform hidden sm:block ${menuOpen ? "rotate-180" : ""}`} />
          </button>

          {menuOpen && (
            <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1">
              <Link
                href="/profile"
                onClick={() => setMenuOpen(false)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <UserCog className="h-4 w-4" />
                {t("topbar.profile")}
              </Link>
              <div className="my-1 border-t border-slate-100 dark:border-slate-700" />
              <button
                onClick={async () => {
                  await fetch("/api/logout", { method: "POST" });
                  window.location.href = "/login";
                }}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                {t("topbar.logout")}
              </button>
            </div>
          )}
        </div>
      </div>
      <AiAssistantPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
    </header>
  );
}
