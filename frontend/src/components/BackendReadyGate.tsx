"use client";

import { useEffect, useRef } from "react";
import { ServerCog, Loader2 } from "lucide-react";
import { useBackendReady } from "@/hooks/useBackendReady";
import { useI18n } from "@/components/I18nProvider";

const FORCE_LOGOUT_AFTER_MS = 8000;

export default function BackendReadyGate({ children }: { children: React.ReactNode }) {
  const { t } = useI18n();
  const state = useBackendReady();
  const wasReadyRef = useRef(false);
  const notReadySinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (state.status === "ready") {
      wasReadyRef.current = true;
      notReadySinceRef.current = null;
      return;
    }
    if (state.status !== "not_ready") return;

    if (notReadySinceRef.current === null) {
      notReadySinceRef.current = Date.now();
    }

    // Only force logout if the backend went down after we had a confirmed ready state
    if (!wasReadyRef.current) return;

    const elapsed = Date.now() - notReadySinceRef.current;
    if (elapsed >= FORCE_LOGOUT_AFTER_MS) {
      // Best-effort logout, then redirect
      fetch("/api/logout", { method: "POST" }).catch(() => {}).finally(() => {
        window.location.href = "/login";
      });
    } else {
      const remaining = FORCE_LOGOUT_AFTER_MS - elapsed;
      const timer = setTimeout(() => {
        fetch("/api/logout", { method: "POST" }).catch(() => {}).finally(() => {
          window.location.href = "/login";
        });
      }, remaining);
      return () => clearTimeout(timer);
    }
  }, [state]);

  if (state.status === "not_ready") {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="flex flex-col items-center gap-4 max-w-sm text-center px-6">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-100 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
            <ServerCog className="h-7 w-7 text-amber-600 dark:text-amber-400 animate-pulse" />
          </div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            {t("auth.backendStartingTitle")}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("auth.backendStartingDesc")}
          </p>
          <Loader2 className="h-4 w-4 text-slate-400 animate-spin" />
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
