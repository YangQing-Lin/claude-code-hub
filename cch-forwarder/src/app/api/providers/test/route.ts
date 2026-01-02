import { jsonError } from "@/lib/error-response";
import { loadGatewayConfig } from "@/lib/gateway-config";
import { readJsonBody } from "@/lib/request";

export const runtime = "nodejs";

// User-Agent strings for different provider types (critical for relay service authentication)
const USER_AGENTS: Record<string, string> = {
  claude: "claude-cli/2.0.50 (external, cli)",
  codex: "codex_cli_rs/0.63.0",
  "openai-responses": "codex_cli_rs/0.63.0",
  "openai-chat-completions": "OpenAI/NodeJS/3.2.1",
};

// Base headers for all API requests (mimic real CLI client behavior)
const BASE_HEADERS = {
  Accept: "application/json, text/event-stream",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  Connection: "keep-alive",
};

function maskHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of headers.entries()) {
    if (k.toLowerCase() === "authorization") out[k] = "***";
    else if (k.toLowerCase() === "x-api-key") out[k] = "***";
    else out[k] = v;
  }
  return out;
}

function safeStringify(v: unknown, maxLen = 2000): string {
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
}

async function probeProvider(params: {
  provider: any;
  model?: string;
}): Promise<
  | {
      ok: true;
      latencyMs: number;
      request: { url: string; headers: Record<string, string>; bodyPreview: string };
      response: { status: number; headers: Record<string, string>; bodyPreview: string };
    }
  | {
      ok: false;
      latencyMs: number;
      error: string;
      request?: { url: string; headers: Record<string, string>; bodyPreview: string };
      response?: { status: number; headers: Record<string, string>; bodyPreview: string };
    }
> {
  const provider = params.provider;
  const model = (params.model ?? "").trim();
  const start = Date.now();

  const providerType = String(provider.type ?? "");
  const isCodex = providerType === "codex" || providerType === "openai-responses";
  const endpoint =
    providerType === "claude"
      ? (provider.endpoints?.messagesPath ?? "/v1/messages")
      : providerType === "openai-chat-completions"
        ? (provider.endpoints?.chatCompletionsPath ?? "/v1/chat/completions")
        : (provider.endpoints?.responsesPath ?? "/v1/responses");
  const base = String(provider.baseUrl ?? "").replace(/\/+$/, "");
  const endpointPath = `${endpoint}`.startsWith("/") ? `${endpoint}` : `/${endpoint}`;
  const url = base.endsWith(endpointPath) ? base : `${base}${endpointPath}`;

  // Build headers with User-Agent and base headers (critical for relay service authentication)
  const headers = new Headers({ "content-type": "application/json" });
  for (const [k, v] of Object.entries(BASE_HEADERS)) headers.set(k, v);
  headers.set("User-Agent", USER_AGENTS[providerType] ?? USER_AGENTS.codex);
  for (const [k, v] of Object.entries(provider.headers ?? {})) headers.set(k, String(v));

  let body: unknown;
  if (providerType === "claude") {
    headers.set("x-api-key", String(provider.apiKey ?? ""));
    headers.set("anthropic-version", headers.get("anthropic-version") ?? "2023-06-01");
    // Claude test body matching cch format
    body = {
      model: model || "claude-sonnet-4-5-20250929",
      messages: [{ role: "user", content: [{ type: "text", text: "ping, please reply pong" }] }],
      system: [{ type: "text", text: "You are a echo bot. Always say pong.", cache_control: { type: "ephemeral" } }],
      max_tokens: 20,
      stream: false,
      metadata: { user_id: "cch_forwarder_probe" },
    };
  } else if (providerType === "openai-chat-completions") {
    headers.set("authorization", `Bearer ${String(provider.apiKey ?? "")}`);
    body = {
      model: model || "gpt-4o",
      messages: [
        { role: "system", content: "You are a echo bot. Always say pong." },
        { role: "user", content: "ping" },
      ],
      max_tokens: 20,
      stream: false,
    };
  } else {
    headers.set("authorization", `Bearer ${String(provider.apiKey ?? "")}`);
    // Codex (OpenAI Responses-style) probe matching cch format
    body = {
      model: model || "gpt-5-codex",
      instructions: "You are a echo bot. Always say pong.",
      input: [{ type: "message", role: "user", content: [{ type: "input_text", text: "ping" }] }],
      tools: [],
      tool_choice: "auto",
      reasoning: { effort: "low", summary: "auto" },
      store: false,
      stream: true,
    };
  }

  const requestSnapshot = {
    url,
    headers: maskHeaders(headers),
    bodyPreview: safeStringify(body),
  };

  try {
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const ct = res.headers.get("content-type") ?? "";
    const text = ct.includes("application/json") ? await res.text() : await res.text();
    const responseSnapshot = {
      status: res.status,
      headers: maskHeaders(res.headers),
      bodyPreview: text.slice(0, 2000),
    };

    const latencyMs = Date.now() - start;
    if (!res.ok) {
      return { ok: false, latencyMs, error: `Upstream responded with status ${res.status}`, request: requestSnapshot, response: responseSnapshot };
    }
    return { ok: true, latencyMs, request: requestSnapshot, response: responseSnapshot };
  } catch (error) {
    return { ok: false, latencyMs: Date.now() - start, error: String(error), request: requestSnapshot };
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const providerId = url.searchParams.get("providerId") ?? "";
  if (!providerId) return jsonError(400, "invalid_request", "providerId is required");
  const model = url.searchParams.get("model") ?? undefined;

  const loaded = await loadGatewayConfig();
  if (!loaded.ok) return jsonError(400, "not_configured", "Missing or invalid config.");
  const provider = loaded.value.providers[providerId];
  if (!provider) return jsonError(404, "not_found", "provider not found");

  const result = await probeProvider({ provider, model });
  if (result.ok) return Response.json(result, { status: 200 });
  return Response.json(result, { status: 502 });
}

export async function POST(req: Request) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return jsonError(400, "invalid_json", "Request body must be valid JSON.");
  const body = parsed.value as any;
  const provider = body?.provider;
  const model = typeof body?.model === "string" ? body.model : undefined;
  if (!provider || typeof provider !== "object") return jsonError(400, "invalid_request", "provider is required");
  if (!provider.type || !provider.baseUrl) return jsonError(400, "invalid_request", "provider.type and provider.baseUrl are required");
  if (!provider.apiKey) return jsonError(400, "invalid_request", "provider.apiKey is required for testing");

  const result = await probeProvider({ provider, model });
  if (result.ok) return Response.json(result, { status: 200 });
  return Response.json(result, { status: 502 });
}
