"use client";

import { createContext, useContext, useEffect, useState } from "react";
import en from "@/i18n/en.json";
import fr from "@/i18n/fr.json";
import es from "@/i18n/es.json";
import it from "@/i18n/it.json";
import de from "@/i18n/de.json";
import ja from "@/i18n/ja.json";

export type Locale = "en" | "fr" | "es" | "it" | "de" | "ja";

export const locales: { code: Locale; label: string }[] = [
  { code: "en", label: "English" },
  { code: "fr", label: "Fran\u00e7ais" },
  { code: "es", label: "Espa\u00f1ol" },
  { code: "it", label: "Italiano" },
  { code: "de", label: "Deutsch" },
  { code: "ja", label: "\u65E5\u672C\u8A9E" },
];

const translations: Record<Locale, Record<string, Record<string, string>>> = {
  en, fr, es, it, de, ja,
};

interface I18nContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue>({
  locale: "en",
  setLocale: () => {},
  t: (key) => key,
});

export function useI18n() {
  return useContext(I18nContext);
}

export default function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("locale") as Locale | null;
    if (stored && translations[stored]) {
      setLocaleState(stored);
    }
    setMounted(true);
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    localStorage.setItem("locale", l);
    document.documentElement.lang = l;
  };

  const t = (key: string, params?: Record<string, string>): string => {
    const [section, ...rest] = key.split(".");
    const k = rest.join(".");
    let value = translations[locale]?.[section]?.[k] ?? key;

    if (params) {
      for (const [param, val] of Object.entries(params)) {
        value = value.replace(`{${param}}`, val);
      }
    }

    return value;
  };

  if (!mounted) return null;

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}
