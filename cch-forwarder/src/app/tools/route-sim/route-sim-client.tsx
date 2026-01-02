"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function RouteSimClient() {
  const { t } = useI18n();
  const [protocol, setProtocol] = useState("claude");
  const [requestedModel, setRequestedModel] = useState("claude-haiku-4-5-20251001");
  const [out, setOut] = useState<any>(null);
  const [status, setStatus] = useState("");

  async function run() {
    setStatus(`${t("common.simulate")}...`);
    const res = await fetch("/api/route-sim", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ protocol, requestedModel }),
    });
    const json = await res.json().catch(() => ({}));
    setOut(json);
    setStatus(res.ok ? "OK" : "Error");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
      <Card>
        <CardHeader>
          <CardTitle>{t("routeSim.input.title")}</CardTitle>
          <CardDescription>{t("routeSim.input.desc")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>{t("routeSim.form.protocol")}</Label>
            <Select value={protocol} onChange={(e) => setProtocol(e.target.value)}>
              <option value="claude">claude</option>
              <option value="openai-chat-completions">openai-chat-completions</option>
              <option value="openai-responses">openai-responses</option>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>{t("routeSim.form.requestedModel")}</Label>
            <Input value={requestedModel} onChange={(e) => setRequestedModel(e.target.value)} />
          </div>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">{status}</div>
            <Button type="button" onClick={run}>
              {t("common.simulate")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("routeSim.output.title")}</CardTitle>
          <CardDescription>{t("routeSim.output.desc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="max-h-[520px] overflow-auto rounded-md bg-muted p-3 text-xs">
            {out ? JSON.stringify(out, null, 2) : "No output yet"}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
