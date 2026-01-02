import { readFile, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";

// provider.type: prefer "codex" (aligned with main project). Keep "openai-responses" for backward compatibility.
const ProviderTypeSchema = z.enum(["codex", "openai-responses", "openai-chat-completions", "claude"]);

const ProviderSchema = z
  .object({
    name: z.string().min(1),
    type: ProviderTypeSchema,
    baseUrl: z.string().url(),
    apiKey: z.string().min(1),
    enabled: z.boolean().default(true),
    endpoints: z
      .object({
        responsesPath: z.string().optional(),
        chatCompletionsPath: z.string().optional(),
        messagesPath: z.string().optional(),
      })
      .default({}),
    headers: z.record(z.string()).default({}),
  })
  .strict();

const ReasoningEffortSchema = z.enum(["minimal", "low", "medium", "high"]);

const ModelSchema = z
  .object({
    provider: z.string().min(1),
    upstreamModel: z.string().min(1),
    options: z
      .object({
        reasoningEffort: ReasoningEffortSchema.optional(),
      })
      .default({}),
  })
  .strict();

const ProtocolSchema = z.enum(["claude", "openai-chat-completions", "openai-responses"]);

const RouteMatchSchema = z
  .object({
    protocol: ProtocolSchema.optional(),
    model: z.string().min(1).optional(),
    modelPrefix: z.string().min(1).optional(),
    modelRegex: z.string().min(1).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    const keys = ["model", "modelPrefix", "modelRegex"].filter((k) => (v as any)[k] != null);
    if (keys.length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "match must contain exactly one of model|modelPrefix|modelRegex",
      });
    }
  });

const RouteSchema = z
  .object({
    id: z.string().min(1),
    enabled: z.boolean().default(true),
    priority: z.number().int().default(0),
    match: RouteMatchSchema,
    targetModel: z.string().min(1),
  })
  .strict();

const ApiKeySchema = z
  .object({
    name: z.string().min(1),
    enabled: z.boolean().default(true),
    createdAt: z.string().datetime(),
  })
  .strict();

export const GatewayConfigSchema = z
  .object({
    version: z.literal(1),
    mode: z
      .object({
        strict: z.boolean().default(true),
        allowRegexRoutes: z.boolean().default(false),
      })
      .default({ strict: true, allowRegexRoutes: false }),
    providers: z.record(ProviderSchema).default({}),
    models: z.record(ModelSchema).default({}),
    routes: z.array(RouteSchema).default([]),
    keys: z.record(ApiKeySchema).default({}),
  })
  .strict()
  .superRefine((cfg, ctx) => {
    for (const [modelId, model] of Object.entries(cfg.models)) {
      const provider = cfg.providers[model.provider];
      if (!provider) continue;
      if (model.options.reasoningEffort && provider.type !== "codex" && provider.type !== "openai-responses") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["models", modelId, "options", "reasoningEffort"],
          message: "reasoningEffort is only allowed when provider.type is codex",
        });
      }
    }
  });

export type GatewayConfig = z.infer<typeof GatewayConfigSchema>;
export type ApiKey = z.infer<typeof ApiKeySchema>;

export function generateApiKey(): string {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const base64 = btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "")
    .replace(/\//g, "")
    .replace(/=/g, "");
  return `cch-sk-${base64}`;
}

export type GatewayConfigLoadError =
  | { type: "not_found" }
  | { type: "invalid_json"; error: unknown }
  | { type: "invalid_schema"; issues: z.ZodIssue[] }
  | { type: "io_error"; error: unknown };

const DEFAULT_CONFIG_PATH = "config/gateway.json";

let cached: { at: number; value: GatewayConfig } | null = null;
let cacheTtlMs = 5_000;

export function setGatewayConfigCacheTtlMs(ttlMs: number) {
  cacheTtlMs = Math.max(0, ttlMs);
}

export function clearGatewayConfigCache() {
  cached = null;
}

export function maskGatewayConfigSecrets(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  if (Array.isArray(input)) return input.map(maskGatewayConfigSecrets);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (k.toLowerCase().includes("apikey")) {
      out[k] = "***";
      continue;
    }
    out[k] = maskGatewayConfigSecrets(v);
  }
  return out;
}

export async function loadGatewayConfig(params?: {
  path?: string;
  now?: number;
}): Promise<{ ok: true; value: GatewayConfig } | { ok: false; error: GatewayConfigLoadError }> {
  const path = params?.path ?? DEFAULT_CONFIG_PATH;
  const now = params?.now ?? Date.now();
  if (cached && now - cached.at <= cacheTtlMs) {
    return { ok: true, value: cached.value };
  }

  let text: string;
  try {
    text = await readFile(path, "utf-8");
  } catch (error: any) {
    if (error && typeof error === "object" && "code" in error && (error as any).code === "ENOENT") {
      return { ok: false, error: { type: "not_found" } };
    }
    return { ok: false, error: { type: "io_error", error } };
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: { type: "invalid_json", error } };
  }

  const parsed = GatewayConfigSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: { type: "invalid_schema", issues: parsed.error.issues } };
  }

  cached = { at: now, value: parsed.data };
  return { ok: true, value: parsed.data };
}

export async function writeGatewayConfigAtomic(
  config: GatewayConfig,
  params?: { path?: string },
): Promise<void> {
  const path = params?.path ?? DEFAULT_CONFIG_PATH;
  const parsed = GatewayConfigSchema.parse(config);
  const maskedForDisk = parsed; // apiKey must be written as-is; masking is only for error surfaces
  const content = `${JSON.stringify(maskedForDisk, null, 2)}\n`;

  const tmpPath = join(
    tmpdir(),
    `cch-forwarder-gateway.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`,
  );

  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, path);
  clearGatewayConfigCache();
}
