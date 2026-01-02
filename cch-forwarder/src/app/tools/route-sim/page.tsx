"use client";

import { RouteSimClient } from "@/app/tools/route-sim/route-sim-client";
import { useI18n } from "@/lib/i18n/i18n-provider";

export const runtime = "nodejs";

export default function RouteSimPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("routeSim.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("routeSim.subtitle")}</p>
      </div>
      <RouteSimClient />
    </div>
  );
}
