export type ForwarderLog = {
  time: string;
  protocol: string;
  requestedModel: string;
  selectionPath?: string;
  matchedRouteId?: string | null;
  providerId?: string;
  upstreamModel?: string;
  enforcedReasoningEffort?: string | null;
  statusCode: number;
  latencyMs: number;
};

type LogState = {
  max: number;
  items: ForwarderLog[];
};

function getState(): LogState {
  const g = globalThis as any;
  if (!g.__cchForwarderLogs) {
    g.__cchForwarderLogs = { max: 200, items: [] } satisfies LogState;
  }
  return g.__cchForwarderLogs as LogState;
}

export function pushLog(entry: ForwarderLog) {
  const state = getState();
  state.items.push(entry);
  if (state.items.length > state.max) state.items.splice(0, state.items.length - state.max);
}

export function getLogs(limit = 50): ForwarderLog[] {
  const state = getState();
  return state.items.slice(-limit).reverse();
}

