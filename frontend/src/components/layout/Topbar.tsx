"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CircleUser, LogOut, Moon, Sun, ChevronDown, Settings, ArrowLeft, UserCog } from "lucide-react";
import { useTheme } from "@/components/ThemeProvider";
import { useAppContext } from "@/components/ContextProvider";
import { useI18n, locales, type Locale } from "@/components/I18nProvider";
import flagComponents from "@/components/Flags";
import ContextSwitcher from "@/components/layout/ContextSwitcher";

export default function Topbar() {
  const { theme, setTheme, resolved } = useTheme();
  const { adminMode, setAdminMode, userRoles, userInfo } = useAppContext();
  const isUserAdmin = userRoles.includes("ROLE_ADMIN");
  const { locale, setLocale, t } = useI18n();
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [langOpen, setLangOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const langRef = useRef<HTMLDivElement>(null);

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
        {adminMode ? (
          <button
            onClick={() => {
              setAdminMode(false);
              router.push("/");
            }}
            className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-sm font-medium text-slate-700 dark:text-slate-200"
          >
            <ArrowLeft className="h-4 w-4 text-slate-400 dark:text-slate-500" />
            {t("topbar.backToContext")}
          </button>
        ) : (
          <ContextSwitcher />
        )}
      </div>

      <div className="flex items-center gap-2">
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

        {isUserAdmin && (
          <button
            onClick={() => {
              if (!adminMode) {
                setAdminMode(true);
                router.push("/admin");
              } else {
                setAdminMode(false);
                router.push("/");
              }
            }}
            className={`rounded-lg p-2 transition-colors ${
              adminMode
                ? "text-slate-900 dark:text-white bg-slate-100 dark:bg-slate-800"
                : "text-slate-400 dark:text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-600 dark:hover:text-slate-300"
            }`}
          >
            <Settings className="h-5 w-5" />
          </button>
        )}

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
    </header>
  );
}
