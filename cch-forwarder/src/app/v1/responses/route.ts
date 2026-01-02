import { handleProxyRequest } from "@/lib/proxy-handler";

export const runtime = "nodejs";

export async function POST(req: Request) {
  return handleProxyRequest({ req, inboundProtocol: "openai-responses" });
}
