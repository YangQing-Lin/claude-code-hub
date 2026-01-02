"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n/i18n-provider";

type ApiKey = {
  name: string;
  enabled: boolean;
  createdAt: string;
};

type Config = {
  keys?: Record<string, ApiKey>;
};

export function KeysPageClient({ initial }: { initial: { config?: Config } | null }) {
  const { t } = useI18n();
  const [data, setData] = useState<{ config?: Config } | null>(initial);
  const [newKeyName, setNewKeyName] = useState("");
  const [status, setStatus] = useState("");
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (data) return;
    fetch("/api/gateway")
      .then((r) => r.json())
      .then((j) => setData(j))
      .catch(() => setData({ config: {} }));
  }, [data]);

  const keys = data?.config?.keys ?? {};
  const keyIds = useMemo(() => Object.keys(keys).sort((a, b) => {
    const aTime = keys[a]?.createdAt ?? "";
    const bTime = keys[b]?.createdAt ?? "";
    return bTime.localeCompare(aTime);
  }), [keys]);

  async function refreshConfig() {
    const j = await fetch("/api/gateway", { cache: "no-store" }).then((r) => r.json());
    setData(j);
  }

  async function createKey() {
    if (!newKeyName.trim()) return;
    setStatus(t("providers.status.saving"));
    const res = await fetch("/api/gateway", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "createKey", name: newKeyName.trim() }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setStatus(`Error: ${json?.error?.message ?? res.status}`);
      return;
    }
    // Auto show the newly created key
    if (json.keyId) {
      setVisibleKeys((prev) => new Set(prev).add(json.keyId));
    }
    setNewKeyName("");
    await refreshConfig();
    setStatus(t("providers.status.saved"));
  }

  async function toggleKey(keyId: string, enabled: boolean) {
    setStatus(t("providers.status.saving"));
    const res = await fetch("/api/gateway", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "updateKey", keyId, enabled }),
    });
    if (!res.ok) {
      setStatus(`Error: ${res.status}`);
      return;
    }
    await refreshConfig();
    setStatus(t("providers.status.saved"));
  }

  async function deleteKey(keyId: string) {
    if (!confirm(t("keys.confirm.delete"))) return;
    setStatus(`${t("models.action.delete")}...`);
    const res = await fetch("/api/gateway", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "deleteKey", keyId }),
    });
    if (!res.ok) {
      setStatus(`Error: ${res.status}`);
      return;
    }
    await refreshConfig();
    setStatus(t("providers.status.saved"));
  }

  function toggleKeyVisibility(keyId: string) {
    setVisibleKeys((prev) => {
      const next = new Set(prev);
      if (next.has(keyId)) next.delete(keyId);
      else next.add(keyId);
      return next;
    });
  }

  async function copyKey(keyId: string) {
    await navigator.clipboard.writeText(keyId);
    setStatus(t("providers.details.copied"));
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">{t("keys.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("keys.subtitle")}</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[400px_1fr]">
        <Card>
          <CardHeader>
            <CardTitle>{t("keys.create.title")}</CardTitle>
            <CardDescription>{t("keys.create.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>{t("keys.form.name")}</Label>
              <Input
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                placeholder={t("keys.form.namePlaceholder")}
              />
            </div>
            <Button type="button" onClick={createKey} disabled={!newKeyName.trim()}>
              {t("keys.action.create")}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("keys.list.title")}</CardTitle>
            <CardDescription>{t("keys.list.desc")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {keyIds.length === 0 ? (
              <div className="text-sm text-muted-foreground">{t("keys.list.empty")}</div>
            ) : (
              <div className="grid gap-2">
                {keyIds.map((keyId) => {
                  const key = keys[keyId];
                  const isVisible = visibleKeys.has(keyId);
                  return (
                    <div
                      key={keyId}
                      className="rounded-md border bg-card px-3 py-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{key?.name}</span>
                          {key?.enabled ? null : <Badge>{t("providers.disabled")}</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleKeyVisibility(keyId)}
                          >
                            {isVisible ? t("keys.action.hide") : t("keys.action.show")}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => copyKey(keyId)}
                          >
                            {t("providers.details.copy")}
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleKey(keyId, !key?.enabled)}
                          >
                            {key?.enabled ? t("keys.action.disable") : t("keys.action.enable")}
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            size="sm"
                            onClick={() => deleteKey(keyId)}
                          >
                            {t("models.action.delete")}
                          </Button>
                        </div>
                      </div>
                      <code className="mt-1 block break-all text-xs text-muted-foreground">
                        {isVisible ? keyId : `${keyId.slice(0, 10)}...${keyId.slice(-4)}`}
                      </code>
                      <div className="text-xs text-muted-foreground">
                        {key?.createdAt ? new Date(key.createdAt).toLocaleString() : ""}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {status ? <div className="text-sm text-muted-foreground">{status}</div> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
