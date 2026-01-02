---
mode: plan
cwd: /home/lin/Projects/claude-code-hub
task: cch-forwarder（Claude/Codex 精确转发 + Codex 推理等级别名模型）项目设计与实施计划
complexity: medium
planning_method: builtin
created_at: 2026-01-02T05:56:36Z
---

# Plan: cch-forwarder 项目设计与实施计划

🎯 任务概述

在当前仓库下创建一个独立目录项目 `cch-forwarder/`，复用 `claude-code-hub` 的技术栈与页面风格（Next.js App Router + Tailwind/shadcn + Server Actions 风格），实现一个本地易启动的请求转发网关。

核心目标是“精确转发”与“模型别名（virtual model）”：允许客户端直接用别名模型（例如 `model:"gpt52-low"`），网关将其解析为指定上游模型（例如 `gpt-5.2`）并强制注入推理等级（Codex / OpenAI Responses API 的 `reasoning.effort` / 配置侧 `reasoningEffort`）。

网关需同时提供三类入站协议：
1) Claude Messages API
2) OpenAI Chat Completions
3) OpenAI Responses API

并提供 Web UI 完成所有配置管理；草创阶段配置持久化采用本地 JSON 文件（严格模式：未命中路由/模型则返回 400）。

---

📌 关键设计结论（来自调研）

1) 本仓库现有 `modelRedirects: Record<string,string>` 只能“模型名→模型名”映射，无法附带 `options`（例如强制推理等级），因此新项目需引入“模型定义层（别名模型）”。
2) OpenAI Responses API 推理等级在类型层面表现为 `reasoning.effort`（可选 `minimal|low|medium|high`）。本仓库的 Codex 请求清洗逻辑默认不注入/覆盖 `reasoning`，因此需要新增“强制注入阶段”。
3) `any-api` 的配置模型（`upstreamModel + options.reasoningEffort`）与注入思路与本需求高度一致，可参考其“per-model options”设计。

参考（现仓库）：
- `src/app/v1/_lib/proxy/model-redirector.ts:20`
- `src/app/v1/_lib/codex/types/response.ts:7`
- `src/app/v1/_lib/codex/utils/request-sanitizer.ts:59`

参考（any-api）：
- `any-api/src/config.ts:6`
- `any-api/src/dispatch.ts:61`

---

📋 设计范围与非目标

范围（MVP）：
- 三协议入站与转发：Claude Messages / OpenAI Chat / OpenAI Responses
- 别名模型（virtual models）：`modelId -> providerId + upstreamModel + options`
- 路由规则（routes）：把“未知的入站模型名”路由到某个别名模型
- 严格模式：未命中别名模型、未命中路由、或路由指向不存在的模型 => 400
- Web UI：Providers / Models / Routes / Route Simulator（强烈建议）/ 可选 Logs
- 本地 JSON 配置文件读写 + 校验 + 原子写入

非目标（后续再做）：
- PostgreSQL/Redis、熔断/限流、复杂多租户鉴权体系
- Gemini 入站协议
- 高级请求过滤/重写 DSL（先只做最小必要的 options 注入）

---

🏗️ 总体架构（高层）

**核心抽象：两层配置 + 一条确定性管线**

1) Providers（上游渠道）
2) Models（别名模型：绑定 provider + upstreamModel + options）
3) Routes（入站模型匹配规则 -> 目标别名模型）

请求处理统一管线：
1. 解析入站协议（由路由确定：claude/openai-chat/openai-responses）
2. 读取请求 `requestedModel`
3. Model Resolution：
   - 3.1 若 `requestedModel` 命中 `config.models[requestedModel]` => 直接使用该别名模型
   - 3.2 否则按 `routes`（priority desc）匹配 => 得到 `targetModel` => 再查 `config.models[targetModel]`
   - 3.3 否则 => 400（严格模式）
4. Target Binding：得到 `{ provider, upstreamModel, options }`
5. Protocol Adaptation：把入站请求转换为 provider.type 对应上游协议请求体
6. Options Enforcement：在“上游请求体”上强制注入/覆盖 options（尤其 `reasoningEffort`)
7. Forward：发往 provider.baseUrl + endpoint，并流式/非流式透传响应

---

🧩 配置文件设计（本地 JSON）

建议单文件：`cch-forwarder/config/gateway.json`（或支持 jsonc）

顶层结构（建议）：

```jsonc
{
  "version": 1,
  "mode": { "strict": true },
  "providers": {
    "openai_main": {
      "name": "OpenAI Main",
      "type": "openai-responses",
      "baseUrl": "https://api.openai.com",
      "apiKey": "REPLACE_ME",
      "enabled": true,
      "endpoints": { "responsesPath": "/v1/responses", "chatCompletionsPath": "/v1/chat/completions" },
      "headers": {}
    },
    "anthropic_main": {
      "name": "Anthropic Main",
      "type": "claude",
      "baseUrl": "https://api.anthropic.com",
      "apiKey": "REPLACE_ME",
      "enabled": true,
      "endpoints": { "messagesPath": "/v1/messages" },
      "headers": {}
    }
  },
  "models": {
    "gpt52-low": {
      "provider": "openai_main",
      "upstreamModel": "gpt-5.2",
      "options": { "reasoningEffort": "low" }
    },
    "gpt52-med": {
      "provider": "openai_main",
      "upstreamModel": "gpt-5.2",
      "options": { "reasoningEffort": "medium" }
    },
    "gpt52-high": {
      "provider": "openai_main",
      "upstreamModel": "gpt-5.2",
      "options": { "reasoningEffort": "high" }
    },
    "haiku": {
      "provider": "anthropic_main",
      "upstreamModel": "claude-haiku-4-5-20251001",
      "options": {}
    }
  },
  "routes": [
    {
      "id": "route_haiku_passthrough",
      "enabled": true,
      "priority": 200,
      "match": { "model": "claude-haiku-4-5-20251001", "protocol": "claude" },
      "targetModel": "haiku"
    },
    {
      "id": "route_sonnet_to_gpt52_low",
      "enabled": true,
      "priority": 100,
      "match": { "modelPrefix": "claude-sonnet", "protocol": "claude" },
      "targetModel": "gpt52-low"
    },
    {
      "id": "route_opus_to_gpt52_high",
      "enabled": true,
      "priority": 90,
      "match": { "modelPrefix": "claude-opus", "protocol": "claude" },
      "targetModel": "gpt52-high"
    }
  ]
}
```

字段约束（建议默认校验）：
- `version`：目前固定 1
- `mode.strict`：默认 true（你已确认）
- `providers[*].id`：键名即 id；仅允许 `[a-zA-Z0-9._-]`
- `providers[*].type`：`openai-responses | openai-chat-completions | claude`
- `models[*].provider`：必须引用存在且 enabled 的 provider
- `models[*].options.reasoningEffort`：仅在 provider.type = `openai-responses` 时允许设置；否则保存时应报错/阻止
- `routes[*]`：必须有且仅有一种 match（`model|modelPrefix|modelRegex` 之一）
- `routes[*].targetModel`：必须引用存在的 models

---

🧭 路由匹配与优先级（严格模式）

1) 别名模型直达（最高优先级）
- `requestedModel` 命中 `models` => 直接使用（忽略 routes）

2) routes 匹配（次优先级）
- 仅考虑 `enabled=true`
- 排序：`priority` 降序；同 priority 按数组顺序
- 第一条命中即停止

3) 未命中 => 400
- 错误信息需明确区分：
  - `Unknown model: not in models and no route matched`
  - `Route matched but targetModel missing`
  - `Route matched but provider disabled/missing`

匹配语义：
- `model`：精确匹配（大小写敏感或不敏感需统一；建议不敏感）
- `modelPrefix`：前缀匹配
- `modelRegex`：正则匹配（默认关闭或需显式开关，避免 ReDoS）
- `protocol`：可选限定，仅当入站协议匹配才参与命中

---

🔧 三协议 × 三上游：协议适配矩阵（MVP 支持）

入站协议：Claude / OpenAI Chat / OpenAI Responses
上游协议：由 provider.type 决定：claude / openai-chat-completions / openai-responses

MVP 支持目标（建议全开，保证“精确转发”通用性）：

1) 入站 OpenAI Responses
- -> openai-responses：透传（仅替换 model 并注入 options）
- -> openai-chat-completions：Responses -> Chat 转换
- -> claude：Responses -> Claude 转换

2) 入站 OpenAI Chat
- -> openai-chat-completions：透传（仅替换 model）
- -> openai-responses：Chat -> Responses 转换（然后注入 options）
- -> claude：Chat -> Claude 转换

3) 入站 Claude Messages
- -> claude：透传（仅替换 model）
- -> openai-responses：Claude -> Responses 转换（然后注入 options）
- -> openai-chat-completions：Claude -> Chat 转换

转换策略（MVP 原则）：
- 只转换最必要字段（messages/content/tools/tool_choice/stream 等）
- 不支持的字段：丢弃或保留在 `metadata`（需统一策略）
- 流式响应：保持 SSE 透传（不做复杂聚合）

---

🧠 Codex 推理等级强制注入（Options Enforcement）

配置侧：
- `models[...].options.reasoningEffort = minimal|low|medium|high|unset`

注入点：
- 在“已经转换为上游协议请求体”之后执行

规则（强制覆盖）：
- 若模型定义设置了 `reasoningEffort`：
  - 当上游协议为 OpenAI Responses：强制设置 `reasoning.effort = <mapped>`
  - 其他上游协议：默认忽略（或后续做映射策略）
- 若模型定义未设置：不修改客户端原始推理字段

映射表：
- `low|medium|high|minimal` -> `reasoning.effort` 同名

严格性（建议）：
- 当 `reasoningEffort` 被设置但 provider.type != openai-responses：保存配置时直接报错（避免运行期歧义）。

---

🖥️ Web UI 信息架构（IA）

目标：所有配置可通过页面完成；并提供“可解释性”和“可调试性”。

页面列表（建议顺序实现）：
1) `/settings/providers`
- 管理 providers（type/baseUrl/apiKey/endpoints/headers/enabled）
- 提供“连通性测试”按钮（按 provider.type 发最小请求）

2) `/settings/models`
- 管理别名模型 `modelId`
- 字段：modelId、providerId、upstreamModel、options.reasoningEffort
- 对不支持 provider.type 的 options 做禁用与校验

3) `/settings/routes`
- 管理 routes：priority、match、targetModel、enabled
- 支持排序/拖拽（或直接编辑 priority）

4) `/tools/route-sim`（强烈建议）
- 输入：protocol + requestedModel
- 输出：是否命中别名模型直达/命中哪条 route/最终 provider+upstreamModel+注入后的 reasoning
- 未命中时给出严格模式 400 的原因与建议

5) `/logs`（可选：MVP 可用内存 ring buffer，不落库）
- 展示最近请求的解析结果与最终上游信息

---

🔐 安全与可运维（MVP 约定）

鉴权（最小版）：
- UI 管理端：可先用本地 `ADMIN_TOKEN`（环境变量）保护配置写操作
- 转发端：可先用 `WORKER_AUTH_KEY` 风格的单 key（或 `AUTH_KEYS` 多 key）保护外部访问

敏感信息：
- `apiKey` 在 UI 展示需 mask；导出配置时可选择是否包含明文 key

文件写入：
- 配置写入使用原子写：写临时文件 -> rename 覆盖
- 写入前进行 schema 校验（Zod），失败则拒绝写入并展示错误

---

📁 目录结构与迁移策略

要求：新项目位于当前仓库 `./cch-forwarder/` 下，尽量自包含，后续可整目录迁移出去。

建议结构：
- `cch-forwarder/`
  - `plan/`（本文件所在）
  - `config/gateway.json`（运行配置）
  - `src/`（项目源码；后续拆分 app/server/lib）
  - `README.md`（本地启动说明与示例配置）

迁移方式：
- 完成度足够后，直接将 `cch-forwarder/` 整目录移动到新仓库；避免引用根仓库的 `src/*` 或 DB/Redis 代码。

---

✅ 里程碑与实施步骤（建议）

Phase 1：项目骨架（可运行）
1. 在 `cch-forwarder/` 初始化 Next.js（Bun），建立三条入站路由：
   - `POST /v1/messages`
   - `POST /v1/chat/completions`
   - `POST /v1/responses`
2. 实现配置读取（文件）与严格模式校验（未命中 400）

Phase 2：核心转发链路
3. 实现 Model Resolution（alias + routes）
4. 实现 Protocol Adaptation（至少支持入站协议 -> 上游同协议透传）
5. 实现 Options Enforcement（Responses 上游注入 reasoning.effort）

Phase 3：UI 配置管理
6. Providers/Models/Routes 页面与表单校验
7. Route Simulator 页面（强烈建议）

Phase 4：可观测性与回归
8. 内存 Logs + 关键调试信息（命中 routeId、最终上游、注入后的 reasoning）
9. 基础 e2e（或最小 Vitest）覆盖：alias 命中、route 命中、严格 400、reasoning 注入覆盖

---

⚠️ 风险与注意事项

- 协议互转的边界复杂（tools/tool_choice/多模态/stream），MVP 应先覆盖最常用字段并明确不支持时的错误。
- `modelRegex` 若开放需防 ReDoS：建议默认关闭或限制长度/复杂度，并设置超时/安全正则库。
- 推理等级注入需清晰：当模型定义设置了 `reasoningEffort` 必须强制覆盖客户端值，避免“看似命中但实际没生效”的误用。
- 严格模式默认 400 会增加首次配置门槛，因此 Route Simulator 必须优先实现以降低排障成本。

