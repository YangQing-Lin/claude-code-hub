import { ProvidersPageClient } from "@/app/settings/providers/providers-page-client";

export const runtime = "nodejs";

export default async function ProvidersPage() {
  return <ProvidersPageClient initial={null} />;
}
