"use client";

import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { LanguageToggle } from "@/components/i18n/language-toggle";
import { cn } from "@/lib/utils/cn";
import { useI18n } from "@/lib/i18n/i18n-provider";

function NavItem({
  href,
  label,
  description,
}: {
  href: string;
  label: string;
  description?: string;
}) {
  return (
    <a
      href={href}
      className={cn(
        "group flex flex-col gap-0.5 rounded-md px-3 py-2 text-sm",
        "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
      )}
    >
      <span className="font-medium">{label}</span>
      {description ? (
        <span className="text-xs text-muted-foreground group-hover:text-sidebar-accent-foreground/80">
          {description}
        </span>
      ) : null}
    </a>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <div className="min-h-dvh bg-background">
      <div className="grid min-h-dvh grid-cols-1 md:grid-cols-[280px_1fr]">
        <aside className="border-b bg-sidebar text-sidebar-foreground md:border-b-0 md:border-r">
          <div className="flex items-center justify-between px-4 py-4">
            <a href="/" className="flex items-center gap-2">
              <div className="size-8 rounded-md bg-primary/15" />
              <div className="leading-tight">
                <div className="text-sm font-semibold">{t("app.name")}</div>
                <div className="text-xs text-muted-foreground">{t("app.subtitle")}</div>
              </div>
            </a>
            <div className="flex items-center gap-1">
              <LanguageToggle />
              <ThemeToggle />
            </div>
          </div>

          <div className="px-4 pb-2">
            <Badge className="bg-sidebar-accent text-sidebar-accent-foreground">Local</Badge>
          </div>

          <nav className="px-2 pb-6">
            <div className="px-2 py-2 text-xs font-medium text-muted-foreground">{t("nav.section.overview")}</div>
            <NavItem href="/dashboard" label={t("nav.dashboard.title")} description={t("nav.dashboard.desc")} />
            <NavItem href="/tools/route-sim" label={t("nav.routeSim.title")} description={t("nav.routeSim.desc")} />
            <NavItem href="/logs" label={t("nav.logs.title")} description={t("nav.logs.desc")} />

            <Separator className="my-4" />

            <div className="px-2 py-2 text-xs font-medium text-muted-foreground">{t("nav.section.settings")}</div>
            <NavItem href="/settings/keys" label={t("nav.keys.title")} description={t("nav.keys.desc")} />
            <NavItem href="/settings/providers" label={t("nav.providers.title")} description={t("nav.providers.desc")} />
            <NavItem href="/settings/models" label={t("nav.models.title")} description={t("nav.models.desc")} />
            <NavItem href="/settings/routes" label={t("nav.routes.title")} description={t("nav.routes.desc")} />

            <Separator className="my-4" />

            <div className="px-2 py-2 text-xs font-medium text-muted-foreground">{t("nav.section.api")}</div>
            <div className="grid gap-1 px-2">
              <span className="text-xs text-muted-foreground">POST /v1/messages</span>
              <span className="text-xs text-muted-foreground">POST /v1/chat/completions</span>
              <span className="text-xs text-muted-foreground">POST /v1/responses</span>
            </div>
          </nav>
        </aside>

        <main className="p-4 md:p-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
