"use client";

import { useI18n } from "@/lib/i18n/i18n-provider";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

function QuickCard({
  title,
  description,
  href,
  cta,
}: {
  title: string;
  description: string;
  href: string;
  cta: string;
}) {
  return (
    <Card className="hover:border-primary/40">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <a href={href}>
          <Button>{cta}</Button>
        </a>
      </CardContent>
    </Card>
  );
}

export default function DashboardPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("dashboard.title")}</h1>
        <p className="text-sm text-muted-foreground">{t("dashboard.subtitle")}</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <QuickCard
          title={t("dashboard.card.providers.title")}
          description={t("dashboard.card.providers.desc")}
          href="/settings/providers"
          cta={t("common.open")}
        />
        <QuickCard
          title={t("dashboard.card.models.title")}
          description={t("dashboard.card.models.desc")}
          href="/settings/models"
          cta={t("common.open")}
        />
        <QuickCard
          title={t("dashboard.card.routes.title")}
          description={t("dashboard.card.routes.desc")}
          href="/settings/routes"
          cta={t("common.open")}
        />
        <QuickCard
          title={t("dashboard.card.routeSim.title")}
          description={t("dashboard.card.routeSim.desc")}
          href="/tools/route-sim"
          cta={t("common.simulate")}
        />
        <QuickCard
          title={t("dashboard.card.logs.title")}
          description={t("dashboard.card.logs.desc")}
          href="/logs"
          cta={t("common.viewLogs")}
        />
        <QuickCard
          title={t("dashboard.card.configApi.title")}
          description={t("dashboard.card.configApi.desc")}
          href="/api/gateway"
          cta={t("common.openJson")}
        />
      </div>
    </div>
  );
}
