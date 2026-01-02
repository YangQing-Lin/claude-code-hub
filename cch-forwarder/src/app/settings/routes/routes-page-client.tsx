"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { useI18n } from "@/lib/i18n/i18n-provider";

type Route = {
  id: string;
  enabled: boolean;
  priority: number;
  match: { protocol?: string; model?: string; modelPrefix?: string; modelRegex?: string };
  targetModel: string;
};

type Config = {
  mode?: { allowRegexRoutes?: boolean };
  models?: Record<string, unknown>;
  routes?: Route[];
};

export function RoutesPageClient({ initial }: { initial: { config?: Config } | null }) {
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
  const routes = useMemo(() => [...(config.routes ?? [])].sort((a, b) => b.priority - a.priority), [config.routes]);
  const modelIds = useMemo(() => Object.keys(config.models ?? {}).sort(), [config.models]);
  const allowRegex = config.mode?.allowRegexRoutes === true;

  const [form, setForm] = useState({
    id: routes[0]?.id ?? "",
    enabled: routes[0]?.enabled ?? true,
    priority: routes[0]?.priority ?? 100,
    protocol: routes[0]?.match?.protocol ?? "",
    matchType: routes[0]?.match?.model ? "model" : routes[0]?.match?.modelPrefix ? "modelPrefix" : "model",
    matchValue: routes[0]?.match?.model ?? routes[0]?.match?.modelPrefix ?? "",
    targetModel: routes[0]?.targetModel ?? modelIds[0] ?? "",
  });

  const [status, setStatus] = useState("");

  async function refreshConfig() {
    const j = await fetch("/api/gateway", { cache: "no-store" }).then((r) => r.json());
    setData(j);
    return j as { config?: Config };
  }

  function newRoute() {
    setForm({
      id: "",
      enabled: true,
      priority: 100,
      protocol: "",
      matchType: "model",
      matchValue: "",
      targetModel: modelIds[0] ?? "",
    });
  }

  function loadRoute(r: Route) {
    const matchType = r.match.model ? "model" : r.match.modelPrefix ? "modelPrefix" : r.match.modelRegex ? "modelRegex" : "model";
    const matchValue = r.match.model ?? r.match.modelPrefix ?? r.match.modelRegex ?? "";
    setForm({
      id: r.id,
      enabled: r.enabled,
      priority: r.priority,
      protocol: r.match.protocol ?? "",
      matchType,
      matchValue,
      targetModel: r.targetModel,
    });
  }

  async function save() {
    setStatus(t("providers.status.saving"));
    const match: any = { protocol: form.protocol || undefined };
    if (form.matchType === "model") match.model = form.matchValue;
    if (form.matchType === "modelPrefix") match.modelPrefix = form.matchValue;
    if (form.matchType === "modelRegex") match.modelRegex = form.matchValue;

    const res = await fetch("/api/gateway", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        op: "upsertRoute",
        routeId: form.id,
        route: {
          enabled: form.enabled,
          priority: Number(form.priority),
          match,
          targetModel: form.targetModel,
        },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(`Error: ${json?.error?.message ?? res.status}`);
      return;
    }
    await refreshConfig().catch(() => {});
    setStatus(t("providers.status.saved"));
  }

  async function del() {
    setStatus(`${t("models.action.delete")}...`);
    const res = await fetch("/api/gateway", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "deleteRoute", routeId: form.id }),
    });
    if (!res.ok) {
      setStatus(`Delete failed: ${res.status}`);
      return;
    }
    newRoute();
    await refreshConfig().catch(() => {});
    setStatus(t("providers.status.saved"));
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("routes.title")}</h2>
        <p className="text-sm text-muted-foreground">
          {t("routes.subtitle")} Regex routes: {allowRegex ? t("routes.regex.enabled") : t("routes.regex.disabled")}.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("routes.list.title")}</CardTitle>
            <CardDescription>{t("routes.list.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button type="button" variant="secondary" onClick={newRoute}>
              {t("routes.action.new")}
            </Button>
            {routes.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t("providers.list.empty")}</div>
            ) : (
              <div className="grid gap-2">
                {routes.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => loadRoute(r)}
                    className="flex items-center justify-between rounded-md border bg-card px-3 py-2 text-left hover:border-primary/40"
                  >
                    <div>
                      <span className="font-medium">{r.priority} · {r.id}</span>
                      <div className="text-xs text-muted-foreground">
                        {r.match.protocol ? `${r.match.protocol} · ` : ""}
                        {r.match.model ? `model=${r.match.model}` : r.match.modelPrefix ? `prefix=${r.match.modelPrefix}` : `regex=${r.match.modelRegex}`}
                        {" → "}
                        {r.targetModel}
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{r.enabled ? "" : t("providers.disabled")}</span>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("routes.edit.title")}</CardTitle>
            <CardDescription>{t("routes.edit.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("routes.form.id")}</Label>
                <Input value={form.id} onChange={(e) => setForm((s) => ({ ...s, id: e.target.value }))} />
              </div>
              <div className="flex items-end gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={form.enabled} onChange={(e) => setForm((s) => ({ ...s, enabled: e.target.checked }))} />
                  {t("routes.form.enabled")}
                </label>
              </div>
              <div className="space-y-2">
                <Label>{t("routes.form.priority")}</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm((s) => ({ ...s, priority: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>{t("routes.form.protocol")}</Label>
                <Select value={form.protocol} onChange={(e) => setForm((s) => ({ ...s, protocol: e.target.value }))}>
                  <option value="">(any)</option>
                  <option value="codex">codex</option>
                  <option value="openai-chat-completions">openai-chat-completions</option>
                  <option value="claude">claude</option>
                </Select>
              </div>
            </div>

            <Separator />

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-2">
                <Label>{t("routes.form.matchType")}</Label>
                <Select
                  value={form.matchType}
                  onChange={(e) => setForm((s) => ({ ...s, matchType: e.target.value, matchValue: "" }))}
                >
                  <option value="model">model</option>
                  <option value="modelPrefix">modelPrefix</option>
                  <option value="modelRegex" disabled={!allowRegex}>
                    modelRegex {allowRegex ? "" : "(disabled)"}
                  </option>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t("routes.form.matchValue")}</Label>
                <Input value={form.matchValue} onChange={(e) => setForm((s) => ({ ...s, matchValue: e.target.value }))} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>{t("routes.form.targetModel")}</Label>
                <Select value={form.targetModel} onChange={(e) => setForm((s) => ({ ...s, targetModel: e.target.value }))}>
                  {modelIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </Select>
              </div>
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
