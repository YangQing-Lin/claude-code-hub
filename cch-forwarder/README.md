# cch-forwarder

独立可迁移的最小转发器（Next.js App Router）。提供三条入站路由：

- `POST /v1/messages`（Claude Messages）
- `POST /v1/chat/completions`（OpenAI Chat Completions）
- `POST /v1/responses`（OpenAI Responses）

## 本地启动

```bash
cd cch-forwarder
bun install
bun run dev
```

默认端口：`13510`

## 现状（Phase 1-1）

当前仅提供三入口与结构化错误返回；尚未实现配置加载/路由命中/上游转发。

## 快速验证

### 1) /v1/messages

```bash
curl -sS -X POST 'http://localhost:13510/v1/messages' \\
  -H 'content-type: application/json' \\
  -d '{\"model\":\"claude-3-5-sonnet\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}' | jq .
```

### 2) /v1/chat/completions

```bash
curl -sS -X POST 'http://localhost:13510/v1/chat/completions' \\
  -H 'content-type: application/json' \\
  -d '{\"model\":\"gpt-4.1\",\"messages\":[{\"role\":\"user\",\"content\":\"hi\"}]}' | jq .
```

### 3) /v1/responses

```bash
curl -sS -X POST 'http://localhost:13510/v1/responses' \\
  -H 'content-type: application/json' \\
  -d '{\"model\":\"gpt-4.1\",\"input\":\"hi\"}' | jq .
```

