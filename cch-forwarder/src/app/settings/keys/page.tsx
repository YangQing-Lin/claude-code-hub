import { KeysPageClient } from "@/app/settings/keys/keys-page-client";

export const runtime = "nodejs";

export default async function KeysPage() {
  return <KeysPageClient initial={null} />;
}
