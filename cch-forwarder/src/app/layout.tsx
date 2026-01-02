import type { ReactNode } from "react";
import { AppProviders } from "@/app/providers";
import "@/app/globals.css";
import { AppShell } from "@/components/nav/app-shell";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
