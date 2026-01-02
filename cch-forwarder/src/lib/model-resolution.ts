import type { GatewayConfig } from "@/lib/gateway-config";

export type InboundProtocol = "claude" | "openai-chat-completions" | "openai-responses";

export type SelectionPath = "models" | "routes";

export type ModelResolutionErrorCode =
  | "model_not_found"
  | "route_target_missing"
  | "provider_missing"
  | "provider_disabled";

export type ModelResolutionError = {
  code: ModelResolutionErrorCode;
  message: string;
  details?: unknown;
};

export type ModelBinding = {
  requestedModel: string;
  targetModel: string;
  providerId: string;
  upstreamModel: string;
  options: {
    reasoningEffort?: "minimal" | "low" | "medium" | "high";
  };

  matchedRouteId?: string;
  selectionPath: SelectionPath;
};

function normalizeModel(model: string): string {
  return model.trim().toLowerCase();
}

export function resolveModelBinding(params: {
  config: GatewayConfig;
  requestedModel: string;
  protocol: InboundProtocol;
}): { ok: true; value: ModelBinding } | { ok: false; error: ModelResolutionError } {
  const { config, protocol } = params;
  const requestedModelRaw = params.requestedModel.trim();
  const requestedModel = normalizeModel(params.requestedModel);

  const directKey = Object.keys(config.models).find((k) => normalizeModel(k) === requestedModel);
  const direct = directKey ? config.models[directKey] : undefined;
  if (direct && directKey) {
    const provider = config.providers[direct.provider];
    if (!provider) {
      return {
        ok: false,
        error: {
          code: "provider_missing",
          message: `Model '${directKey}' references missing provider '${direct.provider}'.`,
        },
      };
    }
    if (!provider.enabled) {
      return {
        ok: false,
        error: {
          code: "provider_disabled",
          message: `Provider '${direct.provider}' is disabled for model '${directKey}'.`,
        },
      };
    }
    return {
      ok: true,
      value: {
        requestedModel: requestedModelRaw,
        targetModel: directKey,
        providerId: direct.provider,
        upstreamModel: direct.upstreamModel,
        options: direct.options ?? {},
        selectionPath: "models",
      },
    };
  }

  const routes = config.routes
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.enabled)
    .sort((a, b) => (b.r.priority - a.r.priority) || (a.i - b.i));

  const allowRegex = config.mode.allowRegexRoutes === true;
  const matched = routes.find(({ r }) => {
    if (r.match.protocol && r.match.protocol !== protocol) return false;
    const m = requestedModel;
    if (r.match.model) return normalizeModel(r.match.model) === m;
    if (r.match.modelPrefix) return m.startsWith(normalizeModel(r.match.modelPrefix));
    if (r.match.modelRegex) {
      if (!allowRegex) return false;
      if (r.match.modelRegex.length > 200) return false;
      try {
        const re = new RegExp(r.match.modelRegex, "i");
        return re.test(m);
      } catch {
        return false;
      }
    }
    return false;
  });

  if (!matched) {
    return {
      ok: false,
      error: {
        code: "model_not_found",
        message:
          "Unknown model: not in models and no route matched (strict mode).",
        details: { requestedModel: requestedModelRaw, protocol },
      },
    };
  }

  const matchedRoute = matched.r;
  const targetKey = Object.keys(config.models).find(
    (k) => normalizeModel(k) === normalizeModel(matchedRoute.targetModel),
  );
  const target = targetKey ? config.models[targetKey] : undefined;
  if (!target) {
    return {
      ok: false,
      error: {
        code: "route_target_missing",
        message: `Route '${matchedRoute.id}' matched but targetModel '${matchedRoute.targetModel}' is missing.`,
        details: { routeId: matchedRoute.id, targetModel: matchedRoute.targetModel },
      },
    };
  }

  const provider = config.providers[target.provider];
  if (!provider) {
    return {
      ok: false,
      error: {
        code: "provider_missing",
        message: `Route '${matchedRoute.id}' matched but provider '${target.provider}' is missing.`,
        details: { routeId: matchedRoute.id, providerId: target.provider },
      },
    };
  }
  if (!provider.enabled) {
    return {
      ok: false,
      error: {
        code: "provider_disabled",
        message: `Route '${matchedRoute.id}' matched but provider '${target.provider}' is disabled.`,
        details: { routeId: matchedRoute.id, providerId: target.provider },
      },
    };
  }

  return {
    ok: true,
    value: {
      requestedModel: requestedModelRaw,
      targetModel: targetKey ?? matchedRoute.targetModel,
      providerId: target.provider,
      upstreamModel: target.upstreamModel,
      options: target.options ?? {},
      matchedRouteId: matchedRoute.id,
      selectionPath: "routes",
    },
  };
}
