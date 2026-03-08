"use client";

import { Construction } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

export default function UnderConstruction() {
  const { t } = useI18n();

  return (
    <div className="flex flex-col items-center justify-center py-32">
      <Construction className="h-12 w-12 text-slate-300 dark:text-slate-600 mb-4" />
      <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
        {t("common.underConstruction")}
      </h2>
      <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
        {t("common.underConstructionDesc")}
      </p>
    </div>
  );
}
