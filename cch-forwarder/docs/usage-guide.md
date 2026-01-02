# cch-forwarder 使用指南

cch-forwarder 是一个轻量级 API 网关，支持在 Claude、OpenAI Chat Completions、OpenAI Responses (Codex) 三种协议之间进行转发和转换。

## 目录

- [快速开始](#快速开始)
- [配置文件](#配置文件)
- [供应商配置](#供应商配置)
- [模型配置](#模型配置)
- [路由配置](#路由配置)
- [API 密钥管理](#api-密钥管理)
- [与 Claude Code 集成](#与-claude-code-集成)
- [API 端点](#api-端点)
- [管理界面](#管理界面)
- [常见问题](#常见问题)

---

## 快速开始

### 安装与启动

```bash
cd cch-forwarder
bun install
bun run dev
```

默认端口：`13510`

### 访问管理界面

打开浏览器访问 `http://localhost:13510/dashboard`

---

## 配置文件

配置文件位于 `config/gateway.json`，包含以下主要部分：

```json
{
  "version": 1,
  "mode": {
    "strict": true,
    "allowRegexRoutes": false
  },
  "providers": {},
  "models": {},
  "routes": [],
  "keys": {}
}
```

### 配置项说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `version` | number | 配置版本，固定为 `1` |
| `mode.strict` | boolean | 严格模式，未匹配的模型将返回错误 |
| `mode.allowRegexRoutes` | boolean | 是否允许正则表达式路由匹配 |
| `providers` | object | 供应商配置 |
| `models` | object | 模型映射配置 |
| `routes` | array | 路由规则配置 |
| `keys` | object | API 密钥配置 |

---

## 供应商配置

供应商是上游 API 服务的配置，支持四种类型：

| 类型 | 说明 | 协议 |
|------|------|------|
| `claude` | Anthropic Claude API | `/v1/messages` |
| `openai-chat-completions` | OpenAI Chat Completions | `/v1/chat/completions` |
| `codex` | OpenAI Responses API (Codex) | `/v1/responses` |
| `openai-responses` | 同 `codex`，向后兼容 | `/v1/responses` |

### 供应商配置示例

```json
{
  "providers": {
    "my-codex": {
      "name": "Codex Provider",
      "type": "codex",
      "baseUrl": "https://api.openai.com",
      "apiKey": "sk-xxx",
      "enabled": true,
      "endpoints": {
        "responsesPath": "/v1/responses",
        "chatCompletionsPath": "/v1/chat/completions",
        "messagesPath": "/v1/messages"
      },
      "headers": {}
    },
    "my-claude": {
      "name": "Claude Provider",
      "type": "claude",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "sk-ant-xxx",
      "enabled": true,
      "endpoints": {},
      "headers": {}
    }
  }
}
```

### 供应商字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `name` | 是 | 供应商显示名称 |
| `type` | 是 | 供应商类型：`codex`、`claude`、`openai-chat-completions` |
| `baseUrl` | 是 | API 基础 URL |
| `apiKey` | 是 | API 密钥 |
| `enabled` | 否 | 是否启用，默认 `true` |
| `endpoints` | 否 | 自定义端点路径 |
| `headers` | 否 | 额外请求头 |

---

## 模型配置

模型配置定义了请求模型到上游模型的映射关系。

### 模型配置示例

```json
{
  "models": {
    "gpt-5.2-minimal": {
      "provider": "my-codex",
      "upstreamModel": "gpt-5.2",
      "options": {
        "reasoningEffort": "minimal"
      }
    },
    "claude-fast": {
      "provider": "my-claude",
      "upstreamModel": "claude-3-5-sonnet-20241022",
      "options": {}
    }
  }
}
```

### 模型字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `provider` | 是 | 关联的供应商 ID |
| `upstreamModel` | 是 | 上游实际模型名称 |
| `options.reasoningEffort` | 否 | 推理等级（仅 `codex` 类型有效）：`minimal`、`low`、`medium`、`high` |

---

## 路由配置

路由允许基于规则将请求动态映射到模型。路由是可选的，如果直接配置了模型映射，可以不使用路由。

### 路由配置示例

```json
{
  "routes": [
    {
      "id": "route-gpt",
      "enabled": true,
      "priority": 100,
      "match": {
        "modelPrefix": "gpt-"
      },
      "targetModel": "gpt-5.2-minimal"
    },
    {
      "id": "route-claude",
      "enabled": true,
      "priority": 50,
      "match": {
        "protocol": "claude",
        "model": "claude-3-5-sonnet"
      },
      "targetModel": "claude-fast"
    }
  ]
}
```

### 路由字段说明

| 字段 | 必填 | 说明 |
|------|------|------|
| `id` | 是 | 路由唯一标识 |
| `enabled` | 否 | 是否启用，默认 `true` |
| `priority` | 否 | 优先级，数值越大越先匹配，默认 `0` |
| `match.protocol` | 否 | 限定协议：`claude`、`openai-chat-completions`、`openai-responses` |
| `match.model` | 条件 | 精确匹配模型名（三选一） |
| `match.modelPrefix` | 条件 | 前缀匹配模型名（三选一） |
| `match.modelRegex` | 条件 | 正则匹配模型名（三选一，需开启 `allowRegexRoutes`） |
| `targetModel` | 是 | 匹配后转发到的目标模型 ID |

### 模型解析优先级

1. 首先在 `models` 中查找精确匹配
2. 如果未找到，按优先级遍历 `routes` 进行匹配
3. 如果都未匹配且 `strict: true`，返回错误

---

## API 密钥管理

API 密钥用于保护 cch-forwarder 服务，防止未授权访问。

### 密钥特性

- 格式：`cch-sk-` 前缀 + 随机字符串
- 如果未配置任何密钥，服务允许所有请求（开放模式）
- 配置密钥后，所有请求必须携带有效密钥

### 密钥配置示例

```json
{
  "keys": {
    "cch-sk-vHRn83HCqyj5OQDpX78UuuU68xjIFFdC": {
      "name": "my-app",
      "enabled": true,
      "createdAt": "2026-01-02T09:20:36.392Z"
    }
  }
}
```

### 请求时携带密钥

方式一：Authorization Header
```bash
curl -H "Authorization: Bearer cch-sk-xxx" ...
```

方式二：x-api-key Header
```bash
curl -H "x-api-key: cch-sk-xxx" ...
```

---

## 与 Claude Code 集成

cch-forwarder 可以作为 Claude Code 的代理服务，让你使用自定义模型。

### 配置步骤

#### 1. 配置 cch-forwarder

在 `config/gateway.json` 中配置供应商和模型：

```json
{
  "version": 1,
  "mode": { "strict": true, "allowRegexRoutes": false },
  "providers": {
    "codex-provider": {
      "name": "Codex",
      "type": "codex",
      "baseUrl": "https://api.openai.com",
      "apiKey": "sk-xxx",
      "enabled": true
    }
  },
  "models": {
    "gpt-5.2-minimal": {
      "provider": "codex-provider",
      "upstreamModel": "gpt-5.2",
      "options": { "reasoningEffort": "minimal" }
    },
    "gpt-5.2-medium": {
      "provider": "codex-provider",
      "upstreamModel": "gpt-5.2",
      "options": { "reasoningEffort": "medium" }
    },
    "gpt-5.2-high": {
      "provider": "codex-provider",
      "upstreamModel": "gpt-5.2",
      "options": { "reasoningEffort": "high" }
    }
  },
  "routes": [],
  "keys": {
    "cch-sk-your-key-here": {
      "name": "claude-code",
      "enabled": true,
      "createdAt": "2026-01-02T00:00:00.000Z"
    }
  }
}
```

#### 2. 配置 Claude Code 环境变量

在 Claude Code 的配置文件或环境变量中设置：

```bash
# 指向 cch-forwarder 服务
export ANTHROPIC_BASE_URL="http://localhost:13510"

# 使用 cch-forwarder 的 API 密钥
export ANTHROPIC_AUTH_TOKEN="cch-sk-your-key-here"

# 自定义模型映射
export ANTHROPIC_DEFAULT_HAIKU_MODEL="gpt-5.2-minimal"
export ANTHROPIC_DEFAULT_SONNET_MODEL="gpt-5.2-medium"
export ANTHROPIC_DEFAULT_OPUS_MODEL="gpt-5.2-high"
```

#### 3. 工作流程

```
Claude Code                    cch-forwarder                 Upstream
    |                               |                            |
    |-- POST /v1/messages --------->|                            |
    |   model: gpt-5.2-minimal      |                            |
    |   (Claude 协议)               |                            |
    |                               |-- 查找模型配置 ------------>|
    |                               |   provider: codex-provider |
    |                               |   upstreamModel: gpt-5.2   |
    |                               |                            |
    |                               |-- POST /v1/responses ----->|
    |                               |   model: gpt-5.2           |
    |                               |   (Codex 协议)             |
    |                               |                            |
    |                               |<-- 响应 -------------------|
    |<-- 转换后的响应 --------------|                            |
```

### 注意事项

1. **协议转换**：cch-forwarder 会自动在 Claude 和 Codex 协议之间转换
2. **流式请求限制**：跨协议的流式请求（如 Claude -> Codex）目前不支持，会返回错误
3. **模型名称**：Claude Code 发送的模型名称必须在 cch-forwarder 的 `models` 中配置

---

## API 端点

cch-forwarder 提供三个入站端点：

| 端点 | 协议 | 说明 |
|------|------|------|
| `POST /v1/messages` | Claude | Anthropic Messages API |
| `POST /v1/chat/completions` | OpenAI | Chat Completions API |
| `POST /v1/responses` | Codex | OpenAI Responses API |

### 请求示例

#### Claude 协议

```bash
curl -X POST 'http://localhost:13510/v1/messages' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer cch-sk-xxx' \
  -d '{
    "model": "gpt-5.2-minimal",
    "max_tokens": 1024,
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

#### OpenAI Chat Completions 协议

```bash
curl -X POST 'http://localhost:13510/v1/chat/completions' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer cch-sk-xxx' \
  -d '{
    "model": "gpt-5.2-minimal",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

#### Codex 协议

```bash
curl -X POST 'http://localhost:13510/v1/responses' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer cch-sk-xxx' \
  -d '{
    "model": "gpt-5.2-minimal",
    "input": "Hello"
  }'
```

---

## 管理界面

cch-forwarder 提供 Web 管理界面，访问 `http://localhost:13510/dashboard`。

### 功能页面

| 页面 | 路径 | 说明 |
|------|------|------|
| 仪表盘 | `/dashboard` | 快速操作入口 |
| API 密钥 | `/settings/keys` | 创建、管理 API 密钥 |
| 供应商 | `/settings/providers` | 配置上游服务 |
| 模型 | `/settings/models` | 配置模型映射 |
| 路由 | `/settings/routes` | 配置路由规则 |
| 路由模拟器 | `/tools/route-sim` | 测试模型解析 |
| 日志 | `/logs` | 查看请求日志 |

---

## 常见问题

### Q: 不配置路由可以使用吗？

可以。如果在 `models` 中直接配置了模型映射，请求会直接匹配到对应模型，不需要路由。

### Q: 流式请求报错 "unsupported_stream_conversion"

跨协议的流式请求（如 Claude 协议请求转发到 Codex 供应商）目前不支持。解决方案：
- 使用非流式请求（`stream: false`）
- 或使用相同协议的供应商

### Q: 如何测试配置是否正确？

使用路由模拟器（`/tools/route-sim`）输入协议和模型名称，查看解析结果。

### Q: API 密钥丢失怎么办？

在管理界面的 API 密钥页面可以随时查看和复制已创建的密钥。

### Q: 如何添加自定义请求头？

在供应商配置的 `headers` 字段中添加：

```json
{
  "providers": {
    "my-provider": {
      "headers": {
        "X-Custom-Header": "value"
      }
    }
  }
}
```
