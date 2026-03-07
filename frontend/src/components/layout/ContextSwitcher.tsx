"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Search,
  Building2,
} from "lucide-react";
import { useAppContext } from "@/components/ContextProvider";
import { useI18n } from "@/components/I18nProvider";

export default function ContextSwitcher() {
  const { contexts, current, setCurrent } = useAppContext();
  const { t } = useI18n();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        close();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const close = () => {
    setOpen(false);
    setSearch("");
  };

  const filtered = contexts.filter((c) =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => (open ? close() : setOpen(true))}
        className="flex items-center gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors min-w-[200px]"
      >
        <div className="relative shrink-0">
          <Building2 className="h-4 w-4 text-slate-400 dark:text-slate-500" />
          {current && (
            <span className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${current.monitoringEnabled ? "bg-emerald-500" : "bg-red-500"}`} />
          )}
        </div>
        <span className="text-sm font-medium text-slate-700 dark:text-slate-200 truncate flex-1 text-left">
          {current?.name ?? t("context_switcher.noContext")}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-slate-400 dark:text-slate-500 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-80 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg z-50">
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" />
              <input
                type="text"
                placeholder={t("context_switcher.searchContext")}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                autoFocus
                className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 py-1.5 pl-9 pr-3 text-sm text-slate-700 dark:text-slate-200 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:border-slate-400 dark:focus:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-400/20 transition-colors"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <p className="px-4 py-3 text-sm text-slate-400 dark:text-slate-500 text-center">
                {t("context_switcher.noContextFound")}
              </p>
            ) : (
              filtered.map((ctx) => (
                <button
                  key={ctx.id}
                  onClick={() => {
                    setCurrent(ctx);
                    close();
                    router.push("/");
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors text-left ${
                    current?.id === ctx.id ? "bg-slate-100 dark:bg-slate-700" : ""
                  }`}
                >
                  <p
                    className={`text-sm font-medium truncate flex items-center gap-2 flex-1 ${
                      current?.id === ctx.id
                        ? "text-slate-900 dark:text-white font-semibold"
                        : "text-slate-700 dark:text-slate-200"
                    }`}
                  >
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${ctx.monitoringEnabled ? "bg-emerald-500" : "bg-red-500"}`} />
                    {ctx.name}
                  </p>
                  {ctx.description && (
                    <p className="text-xs text-slate-400 dark:text-slate-500 truncate shrink-0 max-w-[120px]">
                      {ctx.description}
                    </p>
                  )}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
