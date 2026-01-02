import { ModelsPageClient } from "@/app/settings/models/models-page-client";

export const runtime = "nodejs";

export default function ModelsPage() {
  return <ModelsPageClient initial={null} />;
}

