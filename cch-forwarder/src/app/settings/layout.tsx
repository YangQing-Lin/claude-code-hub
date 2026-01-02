"use client";

import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n/i18n-provider";

export default function SettingsLayout({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("settings.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("settings.subtitle")}</p>
      </div>
      {children}
    </div>
  );
}
