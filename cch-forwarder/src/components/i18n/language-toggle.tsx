"use client";

import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { Locale } from "@/lib/i18n/messages";

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();

  const next: Locale = locale === "zh-CN" ? "en" : "zh-CN";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setLocale(next)}
      aria-label={t("lang.toggle")}
      title={t("lang.toggle")}
    >
      <Languages className="size-4" />
    </Button>
  );
}

