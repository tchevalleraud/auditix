"use client";

import { Lock } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

/**
 * Read-only notice shown above forms whose underlying record is owned by a
 * vendor plugin. Editing is blocked both here (disabled inputs) and server-side
 * (HTTP 403). Disabling the plugin removes the record entirely.
 */
export function PluginManagedBanner({ pluginId }: { pluginId: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
      <Lock className="h-4 w-4 shrink-0" />
      <span>{t("pluginManaged.banner", { plugin: pluginId })}</span>
    </div>
  );
}
