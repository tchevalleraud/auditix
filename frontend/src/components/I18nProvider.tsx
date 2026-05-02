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

type TranslationNode = string | { [key: string]: TranslationNode };
type TranslationTree = Record<string, TranslationNode>;

const translations: Record<Locale, TranslationTree> = {
  en: en as TranslationTree,
  fr: fr as TranslationTree,
  es: es as TranslationTree,
  it: it as TranslationTree,
  de: de as TranslationTree,
  ja: ja as TranslationTree,
};

function resolvePath(tree: TranslationTree, path: string[]): string | undefined {
  let node: TranslationNode | undefined = tree as TranslationNode;
  for (const segment of path) {
    if (node === null || typeof node !== "object") {
      node = undefined;
      break;
    }
    node = (node as { [key: string]: TranslationNode })[segment];
    if (node === undefined) break;
  }
  if (typeof node === "string") return node;

  if (path.length >= 2) {
    const section = tree[path[0]];
    if (section !== null && typeof section === "object") {
      const flat = (section as { [key: string]: TranslationNode })[
        path.slice(1).join(".")
      ];
      if (typeof flat === "string") return flat;
    }
  }
  return undefined;
}

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
    const path = key.split(".");
    let value =
      resolvePath(translations[locale], path) ??
      (locale === "en" ? undefined : resolvePath(translations.en, path)) ??
      key;

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
