"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { I18nProvider } from "@/lib/i18n/i18n-provider";

export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <I18nProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        storageKey="cch-forwarder-theme"
        enableColorScheme
        disableTransitionOnChange
      >
        {children}
      </ThemeProvider>
    </I18nProvider>
  );
}
