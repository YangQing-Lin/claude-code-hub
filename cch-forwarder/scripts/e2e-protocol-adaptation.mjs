import { spawn } from "node:child_process";
import { readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const DEFAULT_FORWARDER_PORT = 13510;
const UPSTREAM_PORT = 18080;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function startMockUpstream() {
  const lastBodies = new Map();
  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.statusCode = 405;
      res.end("method not allowed");
      return;
    }

    let body = "";
    req.setEncoding("utf-8");
    req.on("data", (chunk) => (body += chunk));
    await new Promise((resolve) => req.on("end", resolve));
    let json = {};
    try {
      json = body ? JSON.parse(body) : {};
    } catch {
      json = {};
    }
    lastBodies.set(req.url || "", json);

    const stream = json.stream === true;
    const path = req.url || "";
    if (stream) {
      res.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ ok: true, path })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    res.setHeader("content-type", "application/json; charset=utf-8");
    if (path === "/v1/responses") {
      res.end(
        JSON.stringify({
          id: "resp1",
          object: "response",
          output: [
            { type: "message", role: "assistant", content: [{ type: "output_text", text: "ok-responses" }] },
          ],
        }),
      );
      return;
    }
    if (path === "/v1/chat/completions") {
      res.end(
        JSON.stringify({
          id: "chat1",
          object: "chat.completion",
          choices: [{ index: 0, message: { role: "assistant", content: "ok-chat" }, finish_reason: "stop" }],
        }),
      );
      return;
    }
    if (path === "/v1/messages") {
      res.end(
        JSON.stringify({
          id: "claude1",
          type: "message",
          role: "assistant",
          content: [{ type: "text", text: "ok-claude" }],
          stop_reason: "end_turn",
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ error: "not found" }));
  });

  return new Promise((resolve) => {
    server.listen(UPSTREAM_PORT, "127.0.0.1", () =>
      resolve({ server, lastBodies }),
    );
  });
}

function startForwarderDev() {
  const child = spawn(
    process.execPath,
    ["./node_modules/.bin/next", "dev", "-p", String(process.env.FORWARDER_PORT)],
    {
      stdio: "inherit",
      env: { ...process.env },
    },
  );
  return child;
}

async function findFreePort(startPort) {
  for (let port = startPort; port < startPort + 50; port++) {
    const ok = await new Promise((resolve) => {
      const server = net.createServer();
      server.once("error", () => resolve(false));
      server.once("listening", () => {
        server.close(() => resolve(true));
      });
      server.listen(port, "127.0.0.1");
    });
    if (ok) return port;
  }
  throw new Error("no free port found");
}

function startForwarderDevWithPort(port) {
  const child = spawn(process.execPath, ["./node_modules/.bin/next", "dev", "-p", String(port)], {
    stdio: "inherit",
    env: { ...process.env, FORWARDER_PORT: String(port) },
  });
  return child;
}

async function waitForPort(port) {
  for (let i = 0; i < 80; i++) {
    try {
      await new Promise((resolve, reject) => {
        const socket = net.connect({ port }, () => {
          socket.end();
          resolve();
        });
        socket.on("error", (err) => {
          socket.destroy();
          reject(err);
        });
      });
      return;
    } catch {
      await delay(250);
    }
  }
  throw new Error(`port not ready: ${port}`);
}

async function postJson(url, body) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const json = await res.json();
    return { res, json };
  }
  const text = await res.text();
  return { res, text };
}

async function main() {
  const upstream = await startMockUpstream();
  const forwarderPort = await findFreePort(DEFAULT_FORWARDER_PORT);
  const configPath = "config/gateway.json";
  const config = {
    version: 1,
    mode: { strict: true, allowRegexRoutes: false },
    providers: {
      oai_responses: {
        name: "Mock OAI Responses",
        type: "codex",
        baseUrl: `http://127.0.0.1:${UPSTREAM_PORT}`,
        apiKey: "REPLACE_ME",
        enabled: true,
        endpoints: { responsesPath: "/v1/responses", chatCompletionsPath: "/v1/chat/completions" },
        headers: {},
      },
      oai_chat: {
        name: "Mock OAI Chat",
        type: "openai-chat-completions",
        baseUrl: `http://127.0.0.1:${UPSTREAM_PORT}`,
        apiKey: "REPLACE_ME",
        enabled: true,
        endpoints: { chatCompletionsPath: "/v1/chat/completions" },
        headers: {},
      },
      claude: {
        name: "Mock Claude",
        type: "claude",
        baseUrl: `http://127.0.0.1:${UPSTREAM_PORT}`,
        apiKey: "REPLACE_ME",
        enabled: true,
        endpoints: { messagesPath: "/v1/messages" },
        headers: {},
      },
    },
    models: {
      direct_responses: { provider: "oai_responses", upstreamModel: "u-responses", options: {} },
      direct_chat: { provider: "oai_chat", upstreamModel: "u-chat", options: {} },
      direct_claude: { provider: "claude", upstreamModel: "u-claude", options: {} },
      to_responses: {
        provider: "oai_responses",
        upstreamModel: "u-to-responses",
        options: { reasoningEffort: "minimal" },
      },
      to_claude: { provider: "claude", upstreamModel: "u-to-claude", options: {} },
    },
    routes: [
      {
        id: "claude_to_responses",
        enabled: true,
        priority: 100,
        match: { model: "x-claude-to-responses", protocol: "claude" },
        targetModel: "to_responses",
      },
      {
        id: "chat_to_responses",
        enabled: true,
        priority: 90,
        match: { model: "x-chat-to-responses", protocol: "openai-chat-completions" },
        targetModel: "to_responses",
      },
      {
        id: "responses_to_claude",
        enabled: true,
        priority: 80,
        match: { model: "x-responses-to-claude", protocol: "openai-responses" },
        targetModel: "to_claude",
      },
    ],
  };

  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf-8");

  const dev = startForwarderDevWithPort(forwarderPort);
  try {
    await waitForPort(forwarderPort);

    const base = `http://127.0.0.1:${forwarderPort}`;

    // Same-protocol passthrough (non-stream)
    {
      const { res, json } = await postJson(`${base}/v1/responses`, { model: "direct_responses", input: "hi" });
      assert(res.status === 200, "responses passthrough should be 200");
      assert(json?._cch_forwarder?.upstreamProtocol === "openai-responses", "audit upstreamProtocol mismatch");
    }
    {
      const { res, json } = await postJson(`${base}/v1/chat/completions`, {
        model: "direct_chat",
        messages: [{ role: "user", content: "hi" }],
      });
      assert(res.status === 200, "chat passthrough should be 200");
      assert(json?._cch_forwarder?.upstreamProtocol === "openai-chat-completions", "audit upstreamProtocol mismatch");
    }
    {
      const { res, json } = await postJson(`${base}/v1/messages`, {
        model: "direct_claude",
        max_tokens: 16,
        messages: [{ role: "user", content: "hi" }],
      });
      assert(res.status === 200, "claude passthrough should be 200");
      assert(json?._cch_forwarder?.upstreamProtocol === "claude", "audit upstreamProtocol mismatch");
    }

    // Cross-protocol (non-stream)
    {
      const { res, json } = await postJson(`${base}/v1/messages`, {
        model: "x-claude-to-responses",
        max_tokens: 16,
        messages: [{ role: "user", content: "hi" }],
      });
      assert(res.status === 200, "claude->responses should be 200");
      assert(json?._cch_forwarder?.upstreamProtocol === "openai-responses", "expected openai-responses upstream");
      assert(
        json?._cch_forwarder?.enforcedReasoningEffort === "minimal",
        "expected enforcedReasoningEffort=minimal",
      );
      const last = upstream.lastBodies.get("/v1/responses");
      assert(last?.reasoning?.effort === "minimal", "upstream reasoning.effort should be overridden");
    }
    {
      const { res, json } = await postJson(`${base}/v1/chat/completions`, {
        model: "x-chat-to-responses",
        messages: [{ role: "user", content: "hi" }],
      });
      assert(res.status === 200, "chat->responses should be 200");
      assert(json?._cch_forwarder?.upstreamProtocol === "openai-responses", "expected openai-responses upstream");
    }
    {
      const { res, json } = await postJson(`${base}/v1/responses`, { model: "x-responses-to-claude", input: "hi" });
      assert(res.status === 200, "responses->claude should be 200");
      assert(json?._cch_forwarder?.upstreamProtocol === "claude", "expected claude upstream");
    }

    // Streaming passthrough should not crash and keep SSE
    {
      const res = await fetch(`${base}/v1/responses`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "direct_responses", input: "hi", stream: true }),
      });
      const ct = res.headers.get("content-type") || "";
      const text = await res.text();
      assert(res.status === 200, "stream passthrough should be 200");
      assert(ct.includes("text/event-stream"), "stream passthrough should be sse");
      assert(text.includes("[DONE]"), "stream should include [DONE]");
    }

    // Cross-protocol streaming should fail with 400 (explicit)
    {
      const res = await fetch(`${base}/v1/messages`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ model: "x-claude-to-responses", messages: [{ role: "user", content: "hi" }], stream: true }),
      });
      const ct = res.headers.get("content-type") || "";
      const text = await res.text();
      assert(res.status === 400, "cross-protocol stream should be 400");
      assert(ct.includes("text/event-stream"), "cross-protocol stream should still be sse error");
      assert(text.includes("unsupported_stream_conversion"), "should return explicit unsupported code");
    }

    // Strict 400 for unknown model + ensure log recorded
    {
      const { res, json } = await postJson(`${base}/v1/responses`, { model: "unknown-model", input: "hi" });
      assert(res.status === 400, "unknown model should be 400");
      assert(json?.error?.code === "model_not_found", "expected model_not_found");
      const logsRes = await fetch(`${base}/api/logs?limit=20`);
      const logsJson = await logsRes.json().catch(() => ({ logs: [] }));
      assert(Array.isArray(logsJson.logs), "logs should be array");
      assert(
        logsJson.logs.some((l) => l.requestedModel === "unknown-model" && l.statusCode === 400),
        "expected unknown-model log entry",
      );
    }

    console.log("e2e:protocol OK");
  } finally {
    dev.kill("SIGTERM");
    upstream.server.close();
    await rm(configPath, { force: true });
  }
}

try {
  await main();
} catch (e) {
  console.error(e);
  process.exitCode = 1;
}
