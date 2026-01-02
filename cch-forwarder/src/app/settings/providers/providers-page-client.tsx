"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { Dialog } from "@/components/ui/dialog";

type GatewayProvider = {
  name: string;
  type: "codex" | "openai-responses" | "openai-chat-completions" | "claude";
  baseUrl: string;
  apiKeyMasked?: string;
  hasApiKey?: boolean;
  enabled: boolean;
  endpoints?: Record<string, string | undefined>;
  headers?: Record<string, string>;
};

const BUILTIN_TEST_MODELS_GPT: string[] = [
  "gpt-5.2",
  "gpt-5.1-codex-max",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5",
  "gpt-5-codex",
  "gpt-5-codex-mini",
];

const BUILTIN_TEST_MODELS_CLAUDE: string[] = [
  "claude-3-7-sonnet-20250219",
  "claude-3-7-sonnet-20250219-thinking",
  "claude-haiku-4-5-20251001",
  "claude-opus-4-5-20251101",
  "claude-opus-4-1-20250805",
  "claude-opus-4-1-20250805-thinking",
  "claude-opus-4-20250514",
  "claude-opus-4-20250514-thinking",
  "claude-sonnet-4-20250514",
  "claude-sonnet-4-20250514-thinking",
  "claude-sonnet-4-5-20250929",
  "claude-sonnet-4-5-20250929-thinking",
];

type GatewayConfigMasked = {
  providers?: Record<string, GatewayProvider>;
  mode?: { strict?: boolean; allowRegexRoutes?: boolean };
};

export function ProvidersPageClient({ initial }: { initial: { config?: GatewayConfigMasked } | null }) {
  const { t } = useI18n();
  const [data, setData] = useState<{ config?: GatewayConfigMasked } | null>(initial);
  useEffect(() => {
    if (data) return;
    fetch("/api/gateway")
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => setData({ config: {} }));
  }, [data]);

  const providers = data?.config?.providers ?? {};
  const providerIds = useMemo(() => Object.keys(providers).sort(), [providers]);
  const [selectedId, setSelectedId] = useState<string>(providerIds[0] ?? "");
  const selected = selectedId ? providers[selectedId] : null;
  const isNew = !selectedId;

  const [form, setForm] = useState({
    id: selectedId,
    name: selected?.name ?? "",
    type: selected?.type === "openai-responses" ? "codex" : (selected?.type ?? "codex"),
    baseUrl: selected?.baseUrl ?? "",
    apiKey: "",
    enabled: selected?.enabled ?? true,
    responsesPath: selected?.endpoints?.responsesPath ?? "/v1/responses",
    chatCompletionsPath: selected?.endpoints?.chatCompletionsPath ?? "/v1/chat/completions",
    messagesPath: selected?.endpoints?.messagesPath ?? "/v1/messages",
    testModel: "",
  });
  const isClaudeType = form.type === "claude";

  const [status, setStatus] = useState<string>("");

  const canSave = Boolean(form.name.trim() && form.baseUrl.trim() && (form.apiKey.trim() || selected?.hasApiKey));
  const canTestDraft = Boolean(form.baseUrl.trim() && (form.apiKey.trim() || selected?.hasApiKey) && form.type);
  const [testResult, setTestResult] = useState<any>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [copyStatus, setCopyStatus] = useState<string>("");

  async function refreshConfig() {
    const j = await fetch("/api/gateway", { cache: "no-store" }).then((r) => r.json());
    setData(j);
    return j as { config?: GatewayConfigMasked };
  }

  function newProvider() {
    setSelectedId("");
    setForm({
      id: "",
      name: "",
      type: "codex",
      baseUrl: "",
      apiKey: "",
      enabled: true,
      responsesPath: "/v1/responses",
      chatCompletionsPath: "/v1/chat/completions",
      messagesPath: "/v1/messages",
      testModel: "",
    });
    setStatus("");
    setTestResult(null);
  }

  function loadSelected(id: string) {
    const p = providers[id];
    setSelectedId(id);
    setForm({
      id,
      name: p?.name ?? "",
      type: p?.type === "openai-responses" ? "codex" : (p?.type ?? "codex"),
      baseUrl: p?.baseUrl ?? "",
      apiKey: "",
      enabled: p?.enabled ?? true,
      responsesPath: p?.endpoints?.responsesPath ?? "/v1/responses",
      chatCompletionsPath: p?.endpoints?.chatCompletionsPath ?? "/v1/chat/completions",
      messagesPath: p?.endpoints?.messagesPath ?? "/v1/messages",
      testModel: "",
    });
    setStatus("");
    setTestResult(null);
  }

  async function save() {
    setStatus(t("providers.status.saving"));
    const res = await fetch("/api/gateway", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "upsertProvider",
        providerId: form.id || undefined,
        provider: {
          name: form.name,
          type: form.type,
          baseUrl: form.baseUrl,
          apiKey: form.apiKey,
          enabled: form.enabled,
          endpoints: {
            responsesPath: form.responsesPath,
            chatCompletionsPath: form.chatCompletionsPath,
            messagesPath: form.messagesPath,
          },
          headers: {},
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(`Error: ${json?.error?.message ?? res.status}`);
      return;
    }
    const newId = !form.id && json?.providerId ? String(json.providerId) : form.id;
    if (newId) setSelectedId(newId);
    setForm((s) => ({ ...s, id: newId, apiKey: "" }));
    await refreshConfig().catch(() => {});
    setStatus(t("providers.status.saved"));
  }

  async function testConnectivity() {
    setStatus(t("providers.status.testing"));
    setTestResult(null);
    const res =
      !form.apiKey.trim() && selectedId
        ? await fetch(
            `/api/providers/test?providerId=${encodeURIComponent(selectedId)}&model=${encodeURIComponent(form.testModel || "")}`,
          )
        : await fetch("/api/providers/test", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              model: form.testModel || undefined,
              provider: {
                type: form.type,
                baseUrl: form.baseUrl,
                apiKey: form.apiKey,
                enabled: form.enabled,
                endpoints: {
                  responsesPath: form.responsesPath,
                  chatCompletionsPath: form.chatCompletionsPath,
                  messagesPath: form.messagesPath,
                },
                headers: {},
              },
            }),
          });
    const json = await res.json().catch(() => ({}));
    setTestResult(json);
    setStatus(res.ok ? `OK (${json.latencyMs}ms)` : `Fail (${json.latencyMs ?? "?"}ms): ${json?.error ?? res.status}`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("providers.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("providers.subtitle")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("providers.list.title")}</CardTitle>
            <CardDescription>{t("providers.list.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button type="button" variant="secondary" onClick={newProvider}>
              {t("providers.action.new")}
            </Button>
            {providerIds.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t("providers.list.empty")}</div>
            ) : (
              <div className="grid gap-2">
                {providerIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => loadSelected(id)}
                    className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-left hover:border-primary/40"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{providers[id]?.name || id}</span>
                      {providers[id]?.enabled ? null : <Badge>{t("providers.disabled")}</Badge>}
                    </div>
                    <span className="text-xs text-muted-foreground">{providers[id]?.type ?? ""}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("providers.edit.title")}</CardTitle>
            <CardDescription>{t("providers.edit.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2 md:col-span-2">
                <Label>{t("providers.form.name")}</Label>
                <Input value={form.name} onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("providers.form.type")}</Label>
                <Select value={form.type} onChange={(e) => setForm((s) => ({ ...s, type: e.target.value as any }))}>
                  <option value="codex">codex</option>
                  <option value="openai-chat-completions">openai-chat-completions</option>
                  <option value="claude">claude</option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("providers.form.baseUrl")}</Label>
                <Input value={form.baseUrl} onChange={(e) => setForm((s) => ({ ...s, baseUrl: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("providers.form.apiKey")}</Label>
                <Input value={form.apiKey} onChange={(e) => setForm((s) => ({ ...s, apiKey: e.target.value }))} />
              </div>
            </div>

            <Separator />

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-2">
                <Label>{t("providers.form.responsesPath")}</Label>
                <Input value={form.responsesPath} onChange={(e) => setForm((s) => ({ ...s, responsesPath: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("providers.form.chatCompletionsPath")}</Label>
                <Input
                  value={form.chatCompletionsPath}
                  onChange={(e) => setForm((s) => ({ ...s, chatCompletionsPath: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>{t("providers.form.messagesPath")}</Label>
                <Input value={form.messagesPath} onChange={(e) => setForm((s) => ({ ...s, messagesPath: e.target.value }))} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>{t("providers.test.model")}</Label>
              <Input
                value={form.testModel}
                list="builtin-test-models"
                placeholder="(auto)"
                onChange={(e) => setForm((s) => ({ ...s, testModel: e.target.value }))}
              />
              <datalist id="builtin-test-models">
                {(isClaudeType ? BUILTIN_TEST_MODELS_CLAUDE : BUILTIN_TEST_MODELS_GPT).map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
              <div className="text-xs text-muted-foreground">
                可输入/选择模型；留空则按 provider.type 使用默认探测模型。
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))} />
                {t("providers.form.enabled")}
              </label>
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" onClick={testConnectivity} disabled={!canTestDraft}>
                  {t("providers.action.test")}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setDetailsOpen(true)} disabled={!testResult}>
                  {t("providers.action.details")}
                </Button>
                <Button type="button" onClick={save} disabled={!canSave}>
                  {t("providers.action.save")}
                </Button>
              </div>
            </div>

            {status ? <div className="text-sm text-muted-foreground">{status}</div> : null}
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        title={t("providers.details.title")}
        description={t("providers.details.desc")}
      >
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{copyStatus}</div>
          <Button
            type="button"
            variant="secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(JSON.stringify(testResult ?? {}, null, 2));
                setCopyStatus(t("providers.details.copied"));
                setTimeout(() => setCopyStatus(""), 1500);
              } catch {
                setCopyStatus(t("providers.details.copyFailed"));
                setTimeout(() => setCopyStatus(""), 1500);
              }
            }}
            disabled={!testResult}
          >
            {t("providers.details.copy")}
          </Button>
        </div>
        <pre className="max-h-[520px] overflow-auto rounded-md bg-muted p-3 text-xs">
          {testResult ? JSON.stringify(testResult, null, 2) : "No test result"}
        </pre>
      </Dialog>
    </div>
  );
}
