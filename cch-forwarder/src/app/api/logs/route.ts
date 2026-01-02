import { getLogs } from "@/lib/logs";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Number(url.searchParams.get("limit") ?? "50");
  return Response.json({ logs: getLogs(Number.isFinite(limit) ? limit : 50) }, { status: 200 });
}

