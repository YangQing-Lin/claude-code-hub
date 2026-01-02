"use client";

import { LogsClient } from "@/app/logs/logs-client";
import { useI18n } from "@/lib/i18n/i18n-provider";

export const runtime = "nodejs";

export default function LogsPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("logs.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("logs.subtitle")}</p>
      </div>
      <LogsClient />
    </div>
  );
}
