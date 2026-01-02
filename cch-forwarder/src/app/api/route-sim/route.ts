import { jsonError } from "@/lib/error-response";
import { loadGatewayConfig, maskGatewayConfigSecrets } from "@/lib/gateway-config";
import { resolveModelBinding } from "@/lib/model-resolution";
import { providerTypeToProtocol, protocolToDebugName } from "@/lib/protocol";
import { readJsonBody } from "@/lib/request";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return jsonError(400, "invalid_json", "Request body must be valid JSON.");
  const body = parsed.value as any;
  const protocol = body.protocol as any;
  const requestedModel = typeof body.requestedModel === "string" ? body.requestedModel : "";
  if (!protocol || !requestedModel) {
    return jsonError(400, "invalid_request", "protocol and requestedModel are required");
  }

  const loaded = await loadGatewayConfig();
  if (!loaded.ok) {
    if (loaded.error.type === "not_found") {
      return jsonError(400, "not_configured", "Missing config file: config/gateway.json");
    }
    return jsonError(500, "invalid_config", "Failed to load gateway config.", maskGatewayConfigSecrets(loaded.error));
  }

  const resolved = resolveModelBinding({ config: loaded.value, requestedModel, protocol });
  if (!resolved.ok) {
    return Response.json(
      {
        ok: false,
        inbound: { protocol, protocolName: protocolToDebugName(protocol), requestedModel },
        error: resolved.error,
      },
      { status: 400 },
    );
  }

  const provider = loaded.value.providers[resolved.value.providerId];
  const upstreamProtocol = providerTypeToProtocol(provider.type);

  return Response.json(
    {
      ok: true,
      inbound: { protocol, protocolName: protocolToDebugName(protocol), requestedModel },
      resolution: {
        selectionPath: resolved.value.selectionPath,
        matchedRouteId: resolved.value.matchedRouteId ?? null,
        targetModel: resolved.value.targetModel,
        providerId: resolved.value.providerId,
        upstreamModel: resolved.value.upstreamModel,
        options: resolved.value.options,
        upstreamProtocol,
      },
    },
    { status: 200 },
  );
}

