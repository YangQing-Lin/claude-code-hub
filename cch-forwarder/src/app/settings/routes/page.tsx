import { RoutesPageClient } from "@/app/settings/routes/routes-page-client";

export const runtime = "nodejs";

export default function RoutesPage() {
  return <RoutesPageClient initial={null} />;
}

