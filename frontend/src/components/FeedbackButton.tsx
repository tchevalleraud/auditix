"use client";

import { useState } from "react";
import { Lightbulb } from "lucide-react";
import { useI18n } from "@/components/I18nProvider";

const FEEDBACK_URL = "https://auditix.featurebase.app/";

export default function FeedbackButton() {
  const { t } = useI18n();
  const [hovered, setHovered] = useState(false);

  return (
    <a
      href={FEEDBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={t("common.featureRequest")}
      aria-label={t("common.featureRequest")}
      className="fixed bottom-5 right-5 z-40 group flex items-center gap-2 rounded-full bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/30 hover:shadow-xl hover:shadow-amber-500/40 transition-all duration-200 hover:scale-105 active:scale-95"
    >
      <span className="flex h-12 w-12 items-center justify-center">
        <Lightbulb className="h-5 w-5" />
      </span>
      <span
        className={`overflow-hidden whitespace-nowrap text-sm font-medium transition-all duration-200 ${
          hovered ? "max-w-xs pr-4 opacity-100" : "max-w-0 opacity-0"
        }`}
      >
        {t("common.featureRequest")}
      </span>
    </a>
  );
}
