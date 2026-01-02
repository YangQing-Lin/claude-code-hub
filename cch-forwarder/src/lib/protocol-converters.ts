import type { InboundProtocol } from "@/lib/model-resolution";

type JsonObject = Record<string, unknown>;

function asString(v: unknown): string | null {
  return typeof v === "string" ? v : null;
}

function normalizeMessageContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === "object" && (item as any).type === "text") {
        const t = asString((item as any).text);
        if (t) return t;
      }
    }
  }
  return "";
}

// Convert Claude content blocks to OpenAI Chat format
function claudeContentBlocksToOpenaiParts(blocks: unknown): unknown {
  if (typeof blocks === "string") return blocks;
  const list = Array.isArray(blocks) ? blocks : [];
  const parts: unknown[] = [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const bObj = b as Record<string, unknown>;
    if (bObj.type === "text" && typeof bObj.text === "string") {
      parts.push({ type: "text", text: bObj.text });
    } else if (bObj.type === "image") {
      const src = bObj.source as Record<string, unknown> | undefined;
      if (src?.type === "base64" && typeof src.data === "string") {
        const mt = typeof src.media_type === "string" ? src.media_type : "image/png";
        parts.push({ type: "image_url", image_url: { url: `data:${mt};base64,${src.data}` } });
      }
    }
  }
  if (!parts.length) return "";
  return parts;
}

// Convert Claude content blocks to OpenAI Responses API format (uses input_text/input_image)
function claudeContentBlocksToResponsesParts(blocks: unknown): unknown {
  if (typeof blocks === "string") return blocks;
  const list = Array.isArray(blocks) ? blocks : [];
  const parts: unknown[] = [];
  for (const b of list) {
    if (!b || typeof b !== "object") continue;
    const bObj = b as Record<string, unknown>;
    if (bObj.type === "text" && typeof bObj.text === "string") {
      parts.push({ type: "input_text", text: bObj.text });
    } else if (bObj.type === "image") {
      const src = bObj.source as Record<string, unknown> | undefined;
      if (src?.type === "base64" && typeof src.data === "string") {
        const mt = typeof src.media_type === "string" ? src.media_type : "image/png";
        parts.push({ type: "input_image", image_url: `data:${mt};base64,${src.data}` });
      }
    }
  }
  if (!parts.length) return "";
  return parts;
}

// Convert Claude messages to OpenAI Responses API format (uses input_text/input_image)
function claudeMessagesToResponsesMessages(messages: unknown): unknown[] {
  const out: unknown[] = [];
  for (const msg of Array.isArray(messages) ? messages : []) {
    if (!msg || typeof msg !== "object") continue;
    const msgObj = msg as Record<string, unknown>;
    const role = msgObj.role === "assistant" ? "assistant" : "user";
    const content = msgObj.content;

    // Handle tool results
    if (Array.isArray(content)) {
      const toolResultBlocks = content.filter(
        (b) => b && typeof b === "object" && (b as any).type === "tool_result"
      );
      if (toolResultBlocks.length) {
        for (const tr of toolResultBlocks) {
          const trObj = tr as Record<string, unknown>;
          const id = typeof trObj.tool_use_id === "string" ? trObj.tool_use_id : "";
          if (!id) continue;
          out.push({ type: "function_call_output", call_id: id, output: normalizeMessageContent(trObj.content) });
        }
        const nonTool = content.filter((b) => !(b && typeof b === "object" && (b as any).type === "tool_result"));
        if (!nonTool.length) continue;
        out.push({ role: "user", content: claudeContentBlocksToResponsesParts(nonTool) });
        continue;
      }
    }

    // Handle assistant messages - use string content, not array with input_text
    if (role === "assistant") {
      const text = normalizeMessageContent(content);
      if (text.trim()) {
        out.push({ role: "assistant", content: text });
      }
      // Handle tool_use blocks
      if (Array.isArray(content)) {
        for (const b of content) {
          if (!b || typeof b !== "object") continue;
          const bObj = b as Record<string, unknown>;
          if (bObj.type === "tool_use") {
            const id = typeof bObj.id === "string" ? bObj.id : `call_${Date.now()}`;
            const name = typeof bObj.name === "string" ? bObj.name : "";
            let args = "{}";
            try { args = JSON.stringify(bObj.input ?? {}); } catch {}
            out.push({ type: "function_call", call_id: id, name, arguments: args });
          }
        }
      }
      continue;
    }

    // User messages use input_text/input_image format
    out.push({ role, content: claudeContentBlocksToResponsesParts(content) });
  }
  return out;
}

// Convert Claude messages to OpenAI Chat messages format
function claudeMessagesToOpenaiChatMessages(messages: unknown): unknown[] {
  const out: unknown[] = [];
  for (const msg of Array.isArray(messages) ? messages : []) {
    if (!msg || typeof msg !== "object") continue;
    const msgObj = msg as Record<string, unknown>;
    const role = msgObj.role === "assistant" ? "assistant" : "user";
    const content = msgObj.content;

    // Handle tool results
    if (Array.isArray(content)) {
      const toolResultBlocks = content.filter(
        (b) => b && typeof b === "object" && (b as any).type === "tool_result"
      );
      if (toolResultBlocks.length) {
        for (const tr of toolResultBlocks) {
          const trObj = tr as Record<string, unknown>;
          const id = typeof trObj.tool_use_id === "string" ? trObj.tool_use_id : "";
          if (!id) continue;
          out.push({ role: "tool", tool_call_id: id, content: normalizeMessageContent(trObj.content) });
        }
        const nonTool = content.filter((b) => !(b && typeof b === "object" && (b as any).type === "tool_result"));
        if (!nonTool.length) continue;
        out.push({ role: "user", content: claudeContentBlocksToOpenaiParts(nonTool) });
        continue;
      }
    }

    // Handle assistant tool_use blocks
    if (role === "assistant" && Array.isArray(content)) {
      const toolCalls: unknown[] = [];
      const nonToolBlocks: unknown[] = [];
      for (const b of content) {
        if (!b || typeof b !== "object") continue;
        const bObj = b as Record<string, unknown>;
        if (bObj.type === "tool_use") {
          const id = typeof bObj.id === "string" ? bObj.id : `call_${Date.now()}`;
          const name = typeof bObj.name === "string" ? bObj.name : "";
          let args = "{}";
          try { args = JSON.stringify(bObj.input ?? {}); } catch {}
          toolCalls.push({ id, type: "function", function: { name, arguments: args } });
          continue;
        }
        if (bObj.type === "tool_result") continue;
        nonToolBlocks.push(b);
      }
      const msgOut: Record<string, unknown> = { role: "assistant", content: claudeContentBlocksToOpenaiParts(nonToolBlocks) };
      if (toolCalls.length) msgOut.tool_calls = toolCalls;
      out.push(msgOut);
      continue;
    }

    out.push({ role, content: claudeContentBlocksToOpenaiParts(content) });
  }
  return out;
}

// Convert Claude system to OpenAI messages
function claudeSystemToOpenaiMessages(system: unknown): unknown[] {
  if (system == null) return [];
  if (typeof system === "string") {
    const txt = system.trim();
    return txt ? [{ role: "system", content: txt }] : [];
  }
  if (Array.isArray(system)) {
    const parts: string[] = [];
    for (const b of system) {
      if (b && typeof b === "object" && (b as any).type === "text" && typeof (b as any).text === "string") {
        parts.push((b as any).text.trim());
      }
    }
    const txt = parts.join("\n\n").trim();
    return txt ? [{ role: "system", content: txt }] : [];
  }
  return [];
}

// Convert Claude tools to OpenAI Chat Completions format
function claudeToolsToOpenai(tools: unknown): unknown[] {
  const list = Array.isArray(tools) ? tools : [];
  const out: unknown[] = [];
  for (const t of list) {
    if (!t || typeof t !== "object") continue;
    const tObj = t as Record<string, unknown>;
    const name = typeof tObj.name === "string" ? tObj.name.trim() : "";
    if (!name) continue;
    const description = typeof tObj.description === "string" ? tObj.description : "";
    const parameters = tObj.input_schema && typeof tObj.input_schema === "object"
      ? tObj.input_schema
      : { type: "object", properties: {} };
    out.push({ type: "function", function: { name, description, parameters } });
  }
  return out;
}

// Convert Claude tools to OpenAI Responses API format (name at top level, not nested in function)
function claudeToolsToResponses(tools: unknown): unknown[] {
  const list = Array.isArray(tools) ? tools : [];
  const out: unknown[] = [];
  for (const t of list) {
    if (!t || typeof t !== "object") continue;
    const tObj = t as Record<string, unknown>;
    const name = typeof tObj.name === "string" ? tObj.name.trim() : "";
    if (!name) continue;
    const tool: Record<string, unknown> = { type: "function", name };
    const description = typeof tObj.description === "string" ? tObj.description : "";
    if (description) tool.description = description;
    const parameters = tObj.input_schema && typeof tObj.input_schema === "object"
      ? tObj.input_schema
      : null;
    if (parameters) tool.parameters = parameters;
    out.push(tool);
  }
  return out;
}

// Convert Claude tool_choice to OpenAI Chat Completions format
function claudeToolChoiceToOpenai(toolChoice: unknown): unknown {
  if (!toolChoice || typeof toolChoice !== "object") return undefined;
  const tc = toolChoice as Record<string, unknown>;
  if (tc.type === "auto") return "auto";
  if (tc.type === "any") return "required";
  if (tc.type === "tool" && typeof tc.name === "string") {
    return { type: "function", function: { name: tc.name } };
  }
  return undefined;
}

// Convert Claude tool_choice to OpenAI Responses API format (name at top level)
function claudeToolChoiceToResponses(toolChoice: unknown): unknown {
  if (!toolChoice || typeof toolChoice !== "object") return undefined;
  const tc = toolChoice as Record<string, unknown>;
  if (tc.type === "auto") return "auto";
  if (tc.type === "any") return "required";
  if (tc.type === "tool" && typeof tc.name === "string") {
    return { type: "function", name: tc.name };
  }
  return undefined;
}

function extractFirstTextFromResponses(body: JsonObject): string {
  // Check output_text first (simplified response)
  if (typeof body.output_text === "string") return body.output_text;

  const output = body.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as any).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (!part || typeof part !== "object") continue;
        const t = asString((part as any).text);
        if (t) return t;
      }
    }
  }
  return "";
}

function extractFirstTextFromChat(body: JsonObject): string {
  const choices = body.choices;
  if (Array.isArray(choices) && choices[0] && typeof choices[0] === "object") {
    const msg = (choices[0] as any).message;
    if (msg && typeof msg === "object") {
      return normalizeMessageContent((msg as any).content);
    }
  }
  return "";
}

function extractFirstTextFromClaude(body: JsonObject): string {
  const content = body.content;
  if (Array.isArray(content)) {
    for (const item of content) {
      if (item && typeof item === "object" && (item as any).type === "text") {
        const t = asString((item as any).text);
        if (t) return t;
      }
    }
  }
  return "";
}

export function convertRequestBody(params: {
  inboundProtocol: InboundProtocol;
  upstreamProtocol: InboundProtocol;
  inboundBody: JsonObject;
  upstreamModel: string;
}): JsonObject {
  const { inboundProtocol, upstreamProtocol, inboundBody, upstreamModel } = params;

  // Same-protocol passthrough (only replace model).
  if (inboundProtocol === upstreamProtocol) {
    return { ...inboundBody, model: upstreamModel };
  }

  const stream = inboundBody.stream === true;

  // Claude -> OpenAI Chat Completions
  if (inboundProtocol === "claude" && upstreamProtocol === "openai-chat-completions") {
    const messages = [
      ...claudeSystemToOpenaiMessages(inboundBody.system),
      ...claudeMessagesToOpenaiChatMessages(inboundBody.messages),
    ];
    const out: JsonObject = { model: upstreamModel, messages, stream };
    if (typeof inboundBody.max_tokens === "number") out.max_tokens = inboundBody.max_tokens;
    if (typeof inboundBody.temperature === "number") out.temperature = inboundBody.temperature;
    if (typeof inboundBody.top_p === "number") out.top_p = inboundBody.top_p;
    const tools = claudeToolsToOpenai(inboundBody.tools);
    if (tools.length) out.tools = tools;
    const toolChoice = claudeToolChoiceToOpenai(inboundBody.tool_choice);
    if (toolChoice != null) out.tool_choice = toolChoice;
    return out;
  }

  // Claude -> OpenAI Responses (Codex)
  if (inboundProtocol === "claude" && upstreamProtocol === "openai-responses") {
    // Extract system content
    const system = inboundBody.system;
    const systemText = typeof system === "string"
      ? system.trim()
      : Array.isArray(system)
        ? system.filter((b: any) => b?.type === "text").map((b: any) => b.text).join("\n\n").trim()
        : "";

    // Convert messages to Responses API format
    const inputMessages = claudeMessagesToResponsesMessages(inboundBody.messages);

    // Prepend system as first input message (NOT as instructions field)
    // Many OpenAI Responses API implementations don't accept instructions field
    const input: unknown[] = [];
    if (systemText) {
      input.push({ role: "system", content: systemText });
    }
    input.push(...(inputMessages as unknown[]));

    const out: JsonObject = { model: upstreamModel, input, stream };
    // Do NOT set instructions field - use input messages instead
    if (typeof inboundBody.max_tokens === "number") out.max_output_tokens = inboundBody.max_tokens;
    if (typeof inboundBody.temperature === "number") out.temperature = inboundBody.temperature;
    if (typeof inboundBody.top_p === "number") out.top_p = inboundBody.top_p;
    const tools = claudeToolsToResponses(inboundBody.tools);
    if (tools.length) out.tools = tools;
    const toolChoice = claudeToolChoiceToResponses(inboundBody.tool_choice);
    if (toolChoice != null) out.tool_choice = toolChoice;
    return out;
  }

  // OpenAI Chat -> Claude
  if (inboundProtocol === "openai-chat-completions" && upstreamProtocol === "claude") {
    const messages = Array.isArray(inboundBody.messages) ? inboundBody.messages : [];
    const claudeMessages: unknown[] = [];
    let system: string | undefined;
    for (const msg of messages) {
      if (!msg || typeof msg !== "object") continue;
      const m = msg as Record<string, unknown>;
      if (m.role === "system") {
        system = normalizeMessageContent(m.content);
        continue;
      }
      claudeMessages.push({ role: m.role === "assistant" ? "assistant" : "user", content: m.content });
    }
    const out: JsonObject = {
      model: upstreamModel,
      max_tokens: inboundBody.max_tokens ?? 4096,
      messages: claudeMessages,
      stream,
    };
    if (system) out.system = system;
    return out;
  }

  // OpenAI Chat -> Responses
  if (inboundProtocol === "openai-chat-completions" && upstreamProtocol === "openai-responses") {
    return {
      model: upstreamModel,
      input: inboundBody.messages ?? [],
      stream,
      max_output_tokens: inboundBody.max_tokens,
      temperature: inboundBody.temperature,
      top_p: inboundBody.top_p,
      tools: inboundBody.tools,
      tool_choice: inboundBody.tool_choice,
    };
  }

  // Responses -> OpenAI Chat
  if (inboundProtocol === "openai-responses" && upstreamProtocol === "openai-chat-completions") {
    const input = inboundBody.input;
    let messages: unknown[];
    if (typeof input === "string") {
      messages = [{ role: "user", content: input }];
    } else if (Array.isArray(input)) {
      messages = input;
    } else {
      messages = [];
    }
    return {
      model: upstreamModel,
      messages,
      stream,
      max_tokens: inboundBody.max_output_tokens,
      temperature: inboundBody.temperature,
      top_p: inboundBody.top_p,
      tools: inboundBody.tools,
      tool_choice: inboundBody.tool_choice,
    };
  }

  // Responses -> Claude
  if (inboundProtocol === "openai-responses" && upstreamProtocol === "claude") {
    const input = inboundBody.input;
    let messages: unknown[];
    if (typeof input === "string") {
      messages = [{ role: "user", content: input }];
    } else if (Array.isArray(input)) {
      messages = input.map((m: any) => ({
        role: m?.role === "assistant" ? "assistant" : m?.role === "system" ? "user" : "user",
        content: m?.content ?? "",
      }));
    } else {
      messages = [];
    }
    return {
      model: upstreamModel,
      max_tokens: inboundBody.max_output_tokens ?? 4096,
      messages,
      stream,
    };
  }

  // Fallback: still replace model.
  return { ...inboundBody, model: upstreamModel };
}

export function convertResponseBody(params: {
  inboundProtocol: InboundProtocol;
  upstreamProtocol: InboundProtocol;
  upstreamBody: JsonObject;
}): JsonObject {
  const { inboundProtocol, upstreamProtocol, upstreamBody } = params;
  if (inboundProtocol === upstreamProtocol) return upstreamBody;

  let text = "";
  if (upstreamProtocol === "claude") text = extractFirstTextFromClaude(upstreamBody);
  if (upstreamProtocol === "openai-chat-completions") text = extractFirstTextFromChat(upstreamBody);
  if (upstreamProtocol === "openai-responses") text = extractFirstTextFromResponses(upstreamBody);

  if (inboundProtocol === "claude") {
    return {
      id: upstreamBody.id ?? "cch-forwarder",
      type: "message",
      role: "assistant",
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: upstreamBody.usage ?? { input_tokens: 0, output_tokens: 0 },
    };
  }

  if (inboundProtocol === "openai-chat-completions") {
    return {
      id: upstreamBody.id ?? "cch-forwarder",
      object: "chat.completion",
      choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }],
      usage: upstreamBody.usage,
    };
  }

  return {
    id: upstreamBody.id ?? "cch-forwarder",
    object: "response",
    output: [
      {
        type: "message",
        role: "assistant",
        content: [{ type: "output_text", text }],
      },
    ],
    usage: upstreamBody.usage,
  };
}
