"use client";

import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { Locale } from "@/lib/i18n/messages";
import { LOCALE_STORAGE_KEY, detectDefaultLocale, isSupportedLocale, t } from "@/lib/i18n/i18n";

type I18nContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");

  useEffect(() => {
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(LOCALE_STORAGE_KEY) : null;
    if (stored && isSupportedLocale(stored)) {
      setLocaleState(stored);
      return;
    }
    setLocaleState(detectDefaultLocale());
  }, []);

  const setLocale = (next: Locale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
    } catch {}
  };

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key) => t(locale, key),
    }),
    [locale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

