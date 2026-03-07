"use client";

import { useI18n } from "@/components/I18nProvider";
import { FileSearch } from "lucide-react";

export default function CollectionRulesPage() {
  const { t } = useI18n();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t("collection_rules.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("collection_rules.subtitle")}
        </p>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-12 text-center shadow-sm">
        <FileSearch className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600 mb-2" />
        <p className="text-sm text-slate-400 dark:text-slate-500">
          {t("common.noResult")}
        </p>
      </div>
    </div>
  );
}
