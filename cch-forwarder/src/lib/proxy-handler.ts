import { jsonError, sseError } from "@/lib/error-response";
import { loadGatewayConfig, maskGatewayConfigSecrets, type GatewayConfig } from "@/lib/gateway-config";
import type { InboundProtocol } from "@/lib/model-resolution";
import { resolveModelBinding } from "@/lib/model-resolution";
import { providerTypeToProtocol } from "@/lib/protocol";
import { convertRequestBody, convertResponseBody } from "@/lib/protocol-converters";
import { isStreamRequest, readJsonBody } from "@/lib/request";
import { pushLog } from "@/lib/logs";

function extractApiKey(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const xApiKey = req.headers.get("x-api-key");
  if (xApiKey) return xApiKey;
  return null;
}

function validateApiKey(config: GatewayConfig, apiKey: string | null): { ok: true } | { ok: false; code: string; message: string } {
  const keys = config.keys ?? {};
  if (Object.keys(keys).length === 0) {
    return { ok: true }; // No keys configured, allow all
  }
  if (!apiKey) {
    return { ok: false, code: "unauthorized", message: "Missing API key" };
  }
  const keyEntry = keys[apiKey];
  if (!keyEntry) {
    return { ok: false, code: "unauthorized", message: "Invalid API key" };
  }
  if (!keyEntry.enabled) {
    return { ok: false, code: "forbidden", message: "API key is disabled" };
  }
  return { ok: true };
}

function enforceOpenAIResponsesOptions(params: {
  upstreamBody: Record<string, unknown>;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
}): { enforcedReasoningEffort?: string } {
  if (!params.reasoningEffort) return {};
  const reasoning =
    params.upstreamBody.reasoning && typeof params.upstreamBody.reasoning === "object"
      ? (params.upstreamBody.reasoning as Record<string, unknown>)
      : {};
  reasoning.effort = params.reasoningEffort;
  params.upstreamBody.reasoning = reasoning;
  return { enforcedReasoningEffort: params.reasoningEffort };
}

function mergeHeaders(base: HeadersInit, extra: Record<string, string>): Headers {
  const h = new Headers(base);
  for (const [k, v] of Object.entries(extra)) h.set(k, v);
  return h;
}

// Parse OpenAI Responses API SSE stream into a JSON response object
async function parseResponsesSseToJson(res: Response): Promise<Record<string, unknown> | null> {
  const body = res.body;
  if (!body) return null;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let fullText = "";
  let responseId: string | null = null;
  let model: string | null = null;
  const toolCalls: Array<{ call_id: string; name: string; arguments: string }> = [];
  const toolCallsById = new Map<string, { name: string; args: string }>();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") break;

        let payload: any;
        try {
          payload = JSON.parse(data);
        } catch {
          continue;
        }

        const evt = payload?.type;

        if (evt === "response.created" && payload?.response) {
          const rid = payload.response.id;
          if (typeof rid === "string") responseId = rid;
          const m = payload.response.model;
          if (typeof m === "string") model = m;
          continue;
        }

        if (evt === "response.output_text.delta" && typeof payload.delta === "string") {
          fullText += payload.delta;
          continue;
        }

        if (evt === "response.output_text.done" && typeof payload.text === "string") {
          if (!fullText) fullText = payload.text;
          continue;
        }

        if (evt === "response.function_call_arguments.delta") {
          const callId = payload.call_id ?? payload.id;
          if (typeof callId === "string") {
            const existing = toolCallsById.get(callId) || { name: payload.name || "", args: "" };
            if (typeof payload.delta === "string") existing.args += payload.delta;
            if (typeof payload.name === "string") existing.name = payload.name;
            toolCallsById.set(callId, existing);
          }
          continue;
        }

        if (evt === "response.function_call_arguments.done" || evt === "response.function_call.done") {
          const callId = payload.call_id ?? payload.id;
          if (typeof callId === "string") {
            const existing = toolCallsById.get(callId) || { name: "", args: "" };
            if (typeof payload.arguments === "string") existing.args = payload.arguments;
            if (typeof payload.name === "string") existing.name = payload.name;
            toolCallsById.set(callId, existing);
          }
          continue;
        }

        if (evt === "response.completed" && payload?.response) {
          const rid = payload.response.id;
          if (!responseId && typeof rid === "string") responseId = rid;
          // Extract text from completed response if not already captured
          if (!fullText && payload.response.output_text) {
            fullText = payload.response.output_text;
          }
          break;
        }
      }
    }
  } finally {
    try { await reader.cancel(); } catch {}
  }

  // Convert tool calls map to array
  for (const [callId, tc] of toolCallsById) {
    toolCalls.push({ call_id: callId, name: tc.name, arguments: tc.args });
  }

  // Build Responses API format response
  const output: unknown[] = [];
  if (fullText || toolCalls.length === 0) {
    output.push({
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: fullText }],
    });
  }
  for (const tc of toolCalls) {
    output.push({
      type: "function_call",
      call_id: tc.call_id,
      name: tc.name,
      arguments: tc.arguments,
    });
  }

  return {
    id: responseId || `resp_${Date.now()}`,
    object: "response",
    model: model || "",
    output,
    output_text: fullText,
  };
}

function buildUpstreamUrl(params: {
  baseUrl: string;
  upstreamProtocol: InboundProtocol;
  endpoints: Record<string, unknown>;
}): string {
  const base = params.baseUrl.replace(/\/+$/, "");
  const endpoints = params.endpoints;
  const path =
    params.upstreamProtocol === "claude"
      ? (typeof endpoints.messagesPath === "string" ? endpoints.messagesPath : "/v1/messages")
      : params.upstreamProtocol === "openai-chat-completions"
        ? (typeof endpoints.chatCompletionsPath === "string"
            ? endpoints.chatCompletionsPath
            : "/v1/chat/completions")
        : (typeof endpoints.responsesPath === "string" ? endpoints.responsesPath : "/v1/responses");
  const endpointPath = path.startsWith("/") ? path : `/${path}`;
  return base.endsWith(endpointPath) ? base : `${base}${endpointPath}`;
}

export async function handleProxyRequest(params: { req: Request; inboundProtocol: InboundProtocol }) {
  const start = Date.now();
  const parsed = await readJsonBody(params.req);
  if (!parsed.ok) {
    return jsonError(400, "invalid_json", "Request body must be valid JSON.");
  }

  const inboundBody = parsed.value as Record<string, unknown>;
  const stream = isStreamRequest(inboundBody);
  const requestedModel = typeof inboundBody.model === "string" ? inboundBody.model : "";
  if (!requestedModel) {
    return stream
      ? sseError(400, "invalid_request", "Missing required field: model")
      : jsonError(400, "invalid_request", "Missing required field: model");
  }

  const configResult = await loadGatewayConfig();
  if (!configResult.ok) {
    if (configResult.error.type === "not_found") {
      return stream
        ? sseError(400, "not_configured", "Missing config file: config/gateway.json")
        : jsonError(400, "not_configured", "Missing config file: config/gateway.json");
    }
    return stream
      ? sseError(
          500,
          "invalid_config",
          "Failed to load gateway config.",
          maskGatewayConfigSecrets(configResult.error),
        )
      : jsonError(
          500,
          "invalid_config",
          "Failed to load gateway config.",
          maskGatewayConfigSecrets(configResult.error),
        );
  }

  const apiKey = extractApiKey(params.req);
  const authResult = validateApiKey(configResult.value, apiKey);
  if (!authResult.ok) {
    return stream
      ? sseError(401, authResult.code, authResult.message)
      : jsonError(401, authResult.code, authResult.message);
  }

  const resolved = resolveModelBinding({
    config: configResult.value,
    requestedModel,
    protocol: params.inboundProtocol,
  });
  if (!resolved.ok) {
    pushLog({
      time: new Date().toISOString(),
      protocol: params.inboundProtocol,
      requestedModel,
      statusCode: 400,
      latencyMs: Date.now() - start,
    });
    return stream
      ? sseError(400, resolved.error.code, resolved.error.message, resolved.error.details)
      : jsonError(400, resolved.error.code, resolved.error.message, resolved.error.details);
  }

  const provider = configResult.value.providers[resolved.value.providerId];
  const upstreamProtocol = providerTypeToProtocol(provider.type);
  if (!upstreamProtocol) {
    return jsonError(500, "invalid_provider", "Unknown provider.type");
  }

  if (stream && upstreamProtocol !== params.inboundProtocol) {
    pushLog({
      time: new Date().toISOString(),
      protocol: params.inboundProtocol,
      requestedModel,
      selectionPath: resolved.value.selectionPath,
      matchedRouteId: resolved.value.matchedRouteId ?? null,
      providerId: resolved.value.providerId,
      upstreamModel: resolved.value.upstreamModel,
      enforcedReasoningEffort: resolved.value.options.reasoningEffort ?? null,
      statusCode: 400,
      latencyMs: Date.now() - start,
    });
    return sseError(
      400,
      "unsupported_stream_conversion",
      "Streaming cross-protocol conversion is not supported in MVP.",
      { inboundProtocol: params.inboundProtocol, upstreamProtocol },
    );
  }

  const upstreamUrl = buildUpstreamUrl({
    baseUrl: provider.baseUrl,
    upstreamProtocol,
    endpoints: provider.endpoints ?? {},
  });

  const upstreamBody = convertRequestBody({
    inboundProtocol: params.inboundProtocol,
    upstreamProtocol,
    inboundBody,
    upstreamModel: resolved.value.upstreamModel,
  });

  // OpenAI Responses API (Codex) always returns SSE, so force stream: true
  const forceUpstreamStream = upstreamProtocol === "openai-responses";
  if (forceUpstreamStream) {
    upstreamBody.stream = true;
  }

  const enforcement =
    upstreamProtocol === "openai-responses"
      ? enforceOpenAIResponsesOptions({
          upstreamBody,
          reasoningEffort: resolved.value.options.reasoningEffort,
        })
      : {};

  const headers = mergeHeaders(
    {
      "content-type": "application/json",
      "accept": (stream || forceUpstreamStream) ? "text/event-stream" : "application/json",
    },
    provider.headers ?? {},
  );

  if (upstreamProtocol === "claude") {
    headers.set("x-api-key", provider.apiKey);
    headers.set("anthropic-version", headers.get("anthropic-version") ?? "2023-06-01");
  } else {
    headers.set("authorization", `Bearer ${provider.apiKey}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);
  let upstreamRes: Response;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(upstreamBody),
      signal: controller.signal,
    });
  } catch (error) {
    return stream
      ? sseError(502, "upstream_error", "Failed to reach upstream.", { error: String(error) })
      : jsonError(502, "upstream_error", "Failed to reach upstream.", { error: String(error) });
  } finally {
    clearTimeout(timeout);
  }

  if (stream) {
    const respHeaders = new Headers();
    const ct = upstreamRes.headers.get("content-type");
    if (ct) respHeaders.set("content-type", ct);
    for (const k of ["cache-control", "connection"]) {
      const v = upstreamRes.headers.get(k);
      if (v) respHeaders.set(k, v);
    }
    pushLog({
      time: new Date().toISOString(),
      protocol: params.inboundProtocol,
      requestedModel,
      selectionPath: resolved.value.selectionPath,
      matchedRouteId: resolved.value.matchedRouteId ?? null,
      providerId: resolved.value.providerId,
      upstreamModel: resolved.value.upstreamModel,
      enforcedReasoningEffort: enforcement.enforcedReasoningEffort ?? null,
      statusCode: upstreamRes.status,
      latencyMs: Date.now() - start,
    });
    return new Response(upstreamRes.body, { status: upstreamRes.status, headers: respHeaders });
  }

  const ct = upstreamRes.headers.get("content-type") ?? "";

  // Handle SSE response for OpenAI Responses API when client requested non-stream
  if (forceUpstreamStream && ct.includes("text/event-stream")) {
    const upstreamJson = await parseResponsesSseToJson(upstreamRes);
    if (!upstreamJson) {
      return jsonError(502, "bad_upstream_response", "Failed to parse SSE response.");
    }

    const outboundJson = convertResponseBody({
      inboundProtocol: params.inboundProtocol,
      upstreamProtocol,
      upstreamBody: upstreamJson,
    });

    (outboundJson as any)._cch_forwarder = {
      selectionPath: resolved.value.selectionPath,
      matchedRouteId: resolved.value.matchedRouteId ?? null,
      targetModel: resolved.value.targetModel,
      providerId: resolved.value.providerId,
      upstreamModel: resolved.value.upstreamModel,
      upstreamProtocol,
      enforcedReasoningEffort: enforcement.enforcedReasoningEffort ?? null,
    };

    pushLog({
      time: new Date().toISOString(),
      protocol: params.inboundProtocol,
      requestedModel,
      selectionPath: resolved.value.selectionPath,
      matchedRouteId: resolved.value.matchedRouteId ?? null,
      providerId: resolved.value.providerId,
      upstreamModel: resolved.value.upstreamModel,
      enforcedReasoningEffort: enforcement.enforcedReasoningEffort ?? null,
      statusCode: 200,
      latencyMs: Date.now() - start,
    });

    return Response.json(outboundJson, { status: 200 });
  }

  if (!ct.includes("application/json")) {
    const text = await upstreamRes.text();
    return jsonError(502, "bad_upstream_response", "Upstream did not return JSON.", {
      status: upstreamRes.status,
      contentType: ct,
      bodyPreview: text.slice(0, 200),
    });
  }

  const upstreamJson = (await upstreamRes.json().catch(() => null)) as Record<string, unknown> | null;
  if (!upstreamJson) {
    return jsonError(502, "bad_upstream_response", "Upstream JSON parse failed.");
  }

  // If upstream returned an error, pass it through with debug info
  if (!upstreamRes.ok) {
    pushLog({
      time: new Date().toISOString(),
      protocol: params.inboundProtocol,
      requestedModel,
      selectionPath: resolved.value.selectionPath,
      matchedRouteId: resolved.value.matchedRouteId ?? null,
      providerId: resolved.value.providerId,
      upstreamModel: resolved.value.upstreamModel,
      enforcedReasoningEffort: enforcement.enforcedReasoningEffort ?? null,
      statusCode: upstreamRes.status,
      latencyMs: Date.now() - start,
    });
    return Response.json({
      error: {
        code: "upstream_error",
        message: "Upstream returned an error",
        upstream_status: upstreamRes.status,
        upstream_error: upstreamJson,
      },
      _cch_forwarder: {
        selectionPath: resolved.value.selectionPath,
        matchedRouteId: resolved.value.matchedRouteId ?? null,
        targetModel: resolved.value.targetModel,
        providerId: resolved.value.providerId,
        upstreamModel: resolved.value.upstreamModel,
        upstreamProtocol,
        enforcedReasoningEffort: enforcement.enforcedReasoningEffort ?? null,
      },
    }, { status: upstreamRes.status });
  }

  const outboundJson = convertResponseBody({
    inboundProtocol: params.inboundProtocol,
    upstreamProtocol,
    upstreamBody: upstreamJson,
  });

  // Attach audit info in a non-standard field (debug only, stable for MVP).
  (outboundJson as any)._cch_forwarder = {
    selectionPath: resolved.value.selectionPath,
    matchedRouteId: resolved.value.matchedRouteId ?? null,
    targetModel: resolved.value.targetModel,
    providerId: resolved.value.providerId,
    upstreamModel: resolved.value.upstreamModel,
    upstreamProtocol,
    enforcedReasoningEffort: enforcement.enforcedReasoningEffort ?? null,
  };

  pushLog({
    time: new Date().toISOString(),
    protocol: params.inboundProtocol,
    requestedModel,
    selectionPath: resolved.value.selectionPath,
    matchedRouteId: resolved.value.matchedRouteId ?? null,
    providerId: resolved.value.providerId,
    upstreamModel: resolved.value.upstreamModel,
    enforcedReasoningEffort: enforcement.enforcedReasoningEffort ?? null,
    statusCode: upstreamRes.status,
    latencyMs: Date.now() - start,
  });

  return Response.json(outboundJson, { status: upstreamRes.status });
}
