import type { InboundProtocol } from "@/lib/model-resolution";

export type UpstreamProtocol = InboundProtocol;

export function providerTypeToProtocol(type: string): UpstreamProtocol | null {
  if (type === "claude") return "claude";
  if (type === "openai-chat-completions") return "openai-chat-completions";
  if (type === "codex" || type === "openai-responses") return "openai-responses";
  return null;
}

export function protocolToDebugName(protocol: InboundProtocol): string {
  switch (protocol) {
    case "claude":
      return "Claude Messages";
    case "openai-chat-completions":
      return "OpenAI Chat Completions";
    case "openai-responses":
      return "OpenAI Responses";
  }
}
