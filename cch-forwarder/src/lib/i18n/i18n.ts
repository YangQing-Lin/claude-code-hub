import type { Locale, Messages } from "@/lib/i18n/messages";
import { SUPPORTED_LOCALES, messages } from "@/lib/i18n/messages";

export const LOCALE_STORAGE_KEY = "cch-forwarder-locale";

export function detectDefaultLocale(): Locale {
  if (typeof navigator !== "undefined") {
    const lang = (navigator.language || "").toLowerCase();
    if (lang.startsWith("zh")) return "zh-CN";
  }
  return "en";
}

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as string[]).includes(value);
}

export function getMessages(locale: Locale): Messages {
  return messages[locale] ?? messages.en;
}

export function t(locale: Locale, key: string): string {
  const dict = getMessages(locale);
  return dict[key] ?? messages.en[key] ?? key;
}

