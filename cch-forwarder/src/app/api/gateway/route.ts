import { jsonError } from "@/lib/error-response";
import {
  GatewayConfigSchema,
  generateApiKey,
  loadGatewayConfig,
  maskGatewayConfigSecrets,
  writeGatewayConfigAtomic,
} from "@/lib/gateway-config";
import { readJsonBody } from "@/lib/request";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";

function maskConfigForUi(config: any) {
  const masked = maskGatewayConfigSecrets(config) as any;
  if (masked && masked.providers) {
    for (const [id, p] of Object.entries(masked.providers as Record<string, any>)) {
      const raw = (config.providers ?? {})[id];
      if (p?.type === "openai-responses") {
        p.type = "codex";
      }
      p.hasApiKey = Boolean(raw?.apiKey);
      p.apiKeyMasked = raw?.apiKey ? "***" : "";
      delete p.apiKey;
    }
  }
  return masked;
}

type UpsertProviderBody = {
  op: "upsertProvider";
  providerId?: string;
  provider: any;
};

type UpsertModelBody = {
  op: "upsertModel";
  modelId: string;
  model: any;
};

type DeleteModelBody = {
  op: "deleteModel";
  modelId: string;
};

type UpsertRouteBody = {
  op: "upsertRoute";
  routeId: string;
  route: any;
};

type DeleteRouteBody = {
  op: "deleteRoute";
  routeId: string;
};

type CreateKeyBody = {
  op: "createKey";
  name: string;
};

type UpdateKeyBody = {
  op: "updateKey";
  keyId: string;
  enabled: boolean;
};

type DeleteKeyBody = {
  op: "deleteKey";
  keyId: string;
};

function emptyConfig() {
  return GatewayConfigSchema.parse({
    version: 1,
    mode: { strict: true, allowRegexRoutes: false },
    providers: {},
    models: {},
    routes: [],
    keys: {},
  });
}

function slugify(input: string): string {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "provider";
}

function generateProviderId(existing: Record<string, unknown>, name?: string): string {
  const base = slugify(name ?? "provider");
  for (let i = 0; i < 10; i++) {
    const suffix = randomUUID().slice(0, 8);
    const id = `${base}-${suffix}`;
    if (!existing[id]) return id;
  }
  // Extremely unlikely; last resort.
  return `${base}-${Date.now()}`;
}

export async function GET() {
  const loaded = await loadGatewayConfig();
  if (!loaded.ok) {
    if (loaded.error.type === "not_found") {
      return Response.json({ config: null, error: { code: "not_configured" } }, { status: 200 });
    }
    return jsonError(500, "invalid_config", "Failed to load gateway config.", maskGatewayConfigSecrets(loaded.error));
  }
  return Response.json({ config: maskConfigForUi(loaded.value) }, { status: 200 });
}

export async function PUT(req: Request) {
  const parsed = await readJsonBody(req);
  if (!parsed.ok) return jsonError(400, "invalid_json", "Request body must be valid JSON.");

  const body = parsed.value as any;
  const current = await loadGatewayConfig();
  const base = current.ok ? current.value : emptyConfig();

  if (body?.op === "upsertProvider") {
    const input = body as UpsertProviderBody;
    const providerIdRaw = typeof input.providerId === "string" ? input.providerId.trim() : "";
    const providerId = providerIdRaw || generateProviderId(base.providers as any, input.provider?.name);

    const existing = (base.providers as any)[providerId];
    const nextProvider = { ...(existing ?? {}), ...(input.provider ?? {}) };

    if (!input.provider?.apiKey && existing?.apiKey) {
      nextProvider.apiKey = existing.apiKey;
    }
    if (!nextProvider.apiKey) {
      return jsonError(400, "invalid_request", "apiKey is required (or keep existing by leaving blank)");
    }

    const next = {
      ...base,
      providers: {
        ...base.providers,
        [providerId]: nextProvider,
      },
    };

    try {
      await writeGatewayConfigAtomic(GatewayConfigSchema.parse(next));
    } catch (error: any) {
      return jsonError(400, "invalid_config", "Config validation failed.", {
        message: String(error?.message ?? error),
      });
    }

    return Response.json({ ok: true, providerId }, { status: 200 });
  }

  if (body?.op === "upsertModel") {
    const input = body as UpsertModelBody;
    if (!input.modelId || typeof input.modelId !== "string") {
      return jsonError(400, "invalid_request", "modelId is required");
    }
    const next = {
      ...base,
      models: {
        ...base.models,
        [input.modelId]: input.model ?? {},
      },
    };
    try {
      await writeGatewayConfigAtomic(GatewayConfigSchema.parse(next));
    } catch (error: any) {
      return jsonError(400, "invalid_config", "Config validation failed.", {
        message: String(error?.message ?? error),
      });
    }
    return Response.json({ ok: true }, { status: 200 });
  }

  if (body?.op === "deleteModel") {
    const input = body as DeleteModelBody;
    if (!input.modelId || typeof input.modelId !== "string") {
      return jsonError(400, "invalid_request", "modelId is required");
    }
    const nextModels = { ...base.models } as any;
    delete nextModels[input.modelId];
    const next = { ...base, models: nextModels };
    try {
      await writeGatewayConfigAtomic(GatewayConfigSchema.parse(next));
    } catch (error: any) {
      return jsonError(400, "invalid_config", "Config validation failed.", {
        message: String(error?.message ?? error),
      });
    }
    return Response.json({ ok: true }, { status: 200 });
  }

  if (body?.op === "upsertRoute") {
    const input = body as UpsertRouteBody;
    if (!input.routeId || typeof input.routeId !== "string") {
      return jsonError(400, "invalid_request", "routeId is required");
    }
    const routes = Array.isArray(base.routes) ? [...base.routes] : [];
    const idx = routes.findIndex((r: any) => r && r.id === input.routeId);
    const nextRoute = { ...(idx >= 0 ? routes[idx] : {}), ...(input.route ?? {}), id: input.routeId };
    if (idx >= 0) routes[idx] = nextRoute;
    else routes.push(nextRoute);
    const next = { ...base, routes };
    try {
      await writeGatewayConfigAtomic(GatewayConfigSchema.parse(next));
    } catch (error: any) {
      return jsonError(400, "invalid_config", "Config validation failed.", {
        message: String(error?.message ?? error),
      });
    }
    return Response.json({ ok: true }, { status: 200 });
  }

  if (body?.op === "deleteRoute") {
    const input = body as DeleteRouteBody;
    if (!input.routeId || typeof input.routeId !== "string") {
      return jsonError(400, "invalid_request", "routeId is required");
    }
    const routes = Array.isArray(base.routes) ? base.routes.filter((r: any) => r && r.id !== input.routeId) : [];
    const next = { ...base, routes };
    try {
      await writeGatewayConfigAtomic(GatewayConfigSchema.parse(next));
    } catch (error: any) {
      return jsonError(400, "invalid_config", "Config validation failed.", {
        message: String(error?.message ?? error),
      });
    }
    return Response.json({ ok: true }, { status: 200 });
  }

  if (body?.op === "createKey") {
    const input = body as CreateKeyBody;
    if (!input.name || typeof input.name !== "string") {
      return jsonError(400, "invalid_request", "name is required");
    }
    const keyId = generateApiKey();
    const next = {
      ...base,
      keys: {
        ...base.keys,
        [keyId]: {
          name: input.name.trim(),
          enabled: true,
          createdAt: new Date().toISOString(),
        },
      },
    };
    try {
      await writeGatewayConfigAtomic(GatewayConfigSchema.parse(next));
    } catch (error: any) {
      return jsonError(400, "invalid_config", "Config validation failed.", {
        message: String(error?.message ?? error),
      });
    }
    return Response.json({ ok: true, keyId }, { status: 200 });
  }

  if (body?.op === "updateKey") {
    const input = body as UpdateKeyBody;
    if (!input.keyId || typeof input.keyId !== "string") {
      return jsonError(400, "invalid_request", "keyId is required");
    }
    const existing = (base.keys as any)[input.keyId];
    if (!existing) {
      return jsonError(404, "not_found", "Key not found");
    }
    const next = {
      ...base,
      keys: {
        ...base.keys,
        [input.keyId]: {
          ...existing,
          enabled: Boolean(input.enabled),
        },
      },
    };
    try {
      await writeGatewayConfigAtomic(GatewayConfigSchema.parse(next));
    } catch (error: any) {
      return jsonError(400, "invalid_config", "Config validation failed.", {
        message: String(error?.message ?? error),
      });
    }
    return Response.json({ ok: true }, { status: 200 });
  }

  if (body?.op === "deleteKey") {
    const input = body as DeleteKeyBody;
    if (!input.keyId || typeof input.keyId !== "string") {
      return jsonError(400, "invalid_request", "keyId is required");
    }
    const nextKeys = { ...base.keys } as any;
    delete nextKeys[input.keyId];
    const next = { ...base, keys: nextKeys };
    try {
      await writeGatewayConfigAtomic(GatewayConfigSchema.parse(next));
    } catch (error: any) {
      return jsonError(400, "invalid_config", "Config validation failed.", {
        message: String(error?.message ?? error),
      });
    }
    return Response.json({ ok: true }, { status: 200 });
  }

  return jsonError(400, "invalid_request", "Unsupported operation.");
}
