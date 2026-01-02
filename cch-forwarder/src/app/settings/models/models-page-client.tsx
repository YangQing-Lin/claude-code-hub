"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/lib/i18n/i18n-provider";

// Builtin model lists by provider type
const BUILTIN_MODELS_GPT: string[] = [
  "gpt-5.2",
  "gpt-5.1-codex-max",
  "gpt-5.1",
  "gpt-5.1-codex",
  "gpt-5.1-codex-mini",
  "gpt-5",
  "gpt-5-codex",
  "gpt-5-codex-mini",
];
const BUILTIN_MODELS_CLAUDE: string[] = [
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

type Provider = {
  type: "codex" | "openai-responses" | "openai-chat-completions" | "claude";
  name: string;
  enabled: boolean;
};
type Model = {
  provider: string;
  upstreamModel: string;
  options?: { reasoningEffort?: "minimal" | "low" | "medium" | "high" };
};
type Config = {
  providers?: Record<string, Provider>;
  models?: Record<string, Model>;
};

export function ModelsPageClient({ initial }: { initial: { config?: Config } | null }) {
  const { t } = useI18n();
  const [data, setData] = useState<{ config?: Config } | null>(initial);
  useEffect(() => {
    if (data) return;
    fetch("/api/gateway")
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => setData({ config: {} }));
  }, [data]);

  const config = data?.config ?? {};
  const providerIds = useMemo(() => Object.keys(config.providers ?? {}).sort(), [config.providers]);
  const models = config.models ?? {};
  const modelIds = useMemo(() => Object.keys(models).sort(), [models]);

  const [selectedId, setSelectedId] = useState<string>(modelIds[0] ?? "");
  const selected = selectedId ? models[selectedId] : null;

  const selectedProviderType =
    selected?.provider && config.providers?.[selected.provider]?.type
      ? config.providers?.[selected.provider]?.type
      : "codex";

  const [form, setForm] = useState({
    id: selectedId,
    provider: selected?.provider ?? providerIds[0] ?? "",
    upstreamModel: selected?.upstreamModel ?? "",
    reasoningEffort: selected?.options?.reasoningEffort ?? "",
  });

  // Current form provider type (for upstream model suggestions)
  const formProviderType = form.provider && config.providers?.[form.provider]?.type
    ? config.providers?.[form.provider]?.type
    : "codex";
  const isClaudeType = formProviderType === "claude";

  const [status, setStatus] = useState<string>("");

  // 当 data 加载完成后，同步 form 的初始值
  useEffect(() => {
    if (!form.provider && providerIds.length > 0) {
      const firstModelId = modelIds[0] ?? "";
      const firstModel = firstModelId ? models[firstModelId] : null;
      setSelectedId(firstModelId);
      setForm({
        id: firstModelId,
        provider: firstModel?.provider ?? providerIds[0] ?? "",
        upstreamModel: firstModel?.upstreamModel ?? "",
        reasoningEffort: firstModel?.options?.reasoningEffort ?? "",
      });
    }
  }, [providerIds.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refreshConfig() {
    const j = await fetch("/api/gateway", { cache: "no-store" }).then((r) => r.json());
    setData(j);
    return j as { config?: Config };
  }

  function loadSelected(id: string) {
    const m = models[id];
    setSelectedId(id);
    setForm({
      id,
      provider: m?.provider ?? providerIds[0] ?? "",
      upstreamModel: m?.upstreamModel ?? "",
      reasoningEffort: m?.options?.reasoningEffort ?? "",
    });
  }

  async function save() {
    setStatus(t("providers.status.saving"));
    const res = await fetch("/api/gateway", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "upsertModel",
        modelId: form.id,
        model: {
          provider: form.provider,
          upstreamModel: form.upstreamModel,
          options: form.reasoningEffort ? { reasoningEffort: form.reasoningEffort } : {},
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(`Error: ${json?.error?.message ?? res.status}`);
      return;
    }
    setSelectedId(form.id);
    await refreshConfig().catch(() => {});
    setStatus(t("providers.status.saved"));
  }

  async function del() {
    setStatus(`${t("models.action.delete")}...`);
    const res = await fetch("/api/gateway", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "deleteModel", modelId: form.id }),
    });
    if (!res.ok) {
      setStatus(`Delete failed: ${res.status}`);
      return;
    }
    setSelectedId("");
    loadSelected("");
    await refreshConfig().catch(() => {});
    setStatus(t("providers.status.saved"));
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("models.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("models.subtitle")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("models.list.title")}</CardTitle>
            <CardDescription>{t("models.list.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button type="button" variant="secondary" onClick={() => loadSelected("")}>
              {t("models.action.new")}
            </Button>
            {modelIds.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t("providers.list.empty")}</div>
            ) : (
              <div className="grid gap-2">
                {modelIds.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => loadSelected(id)}
                    className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-left hover:border-primary/40"
                  >
                    <span className="font-medium">{id}</span>
                    <span className="text-xs text-muted-foreground">{models[id]?.upstreamModel}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("models.edit.title")}</CardTitle>
            <CardDescription>{t("models.edit.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("models.form.modelId")}</Label>
                <Input value={form.id} onChange={(e) => setForm((s) => ({ ...s, id: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("models.form.provider")}</Label>
                <Select
                  value={form.provider}
                  onChange={(e) => {
                    const newProviderId = e.target.value;
                    const oldType = config.providers?.[form.provider]?.type;
                    const newType = config.providers?.[newProviderId]?.type;
                    // Clear upstream model if provider type changed
                    const shouldClear = oldType !== newType;
                    setForm((s) => ({
                      ...s,
                      provider: newProviderId,
                      upstreamModel: shouldClear ? "" : s.upstreamModel,
                      reasoningEffort: newType === "claude" ? "" : s.reasoningEffort,
                    }));
                  }}
                >
                  {providerIds.map((id) => (
                    <option key={id} value={id}>
                      {config.providers?.[id]?.name || id} ({config.providers?.[id]?.type})
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("models.form.upstreamModel")}</Label>
                <Input
                  list="builtin-upstream-models"
                  value={form.upstreamModel}
                  onChange={(e) => setForm((s) => ({ ...s, upstreamModel: e.target.value }))}
                  placeholder={isClaudeType ? "claude-sonnet-4-5-20250929" : "gpt-5.1-codex"}
                />
                <datalist id="builtin-upstream-models">
                  {(isClaudeType ? BUILTIN_MODELS_CLAUDE : BUILTIN_MODELS_GPT).map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>

            <Separator />

            <div className="space-y-2">
              <Label>{t("models.form.reasoningEffort")}</Label>
              <Select
                value={form.reasoningEffort}
                onChange={(e) => setForm((s) => ({ ...s, reasoningEffort: e.target.value }))}
                disabled={isClaudeType}
              >
                <option value="">(none)</option>
                <option value="minimal">minimal</option>
                <option value="low">low</option>
                <option value="medium">medium</option>
                <option value="high">high</option>
              </Select>
              {isClaudeType ? (
                <p className="text-sm text-muted-foreground">{t("models.edit.desc")}</p>
              ) : null}
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="destructive" onClick={del} disabled={!form.id}>
                {t("models.action.delete")}
              </Button>
              <Button type="button" onClick={save} disabled={!form.id}>
                {t("providers.action.save")}
              </Button>
            </div>

            {status ? <div className="text-sm text-muted-foreground">{status}</div> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
