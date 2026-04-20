"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/components/I18nProvider";

export default function ApiDocsPage() {
  const { t } = useI18n();
  const [SwaggerUI, setSwaggerUI] = useState<any>(null);

  useEffect(() => {
    import("swagger-ui-react").then((mod) => setSwaggerUI(() => mod.default));
    // Load swagger-ui CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/swagger-ui-dist@5/swagger-ui.css";
    document.head.appendChild(link);
    return () => {
      document.head.removeChild(link);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
          {t("apiDocs.title")}
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {t("apiDocs.subtitle")}
        </p>
      </div>
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
        {SwaggerUI ? (
          <SwaggerUI url="/api/v1/doc.json" />
        ) : (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-slate-900 dark:border-slate-700 dark:border-t-white" />
          </div>
        )}
      </div>
    </div>
  );
}
