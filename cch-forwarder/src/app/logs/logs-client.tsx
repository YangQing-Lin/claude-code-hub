"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/lib/i18n/i18n-provider";

export function LogsClient() {
  const { t } = useI18n();
  const [logs, setLogs] = useState<any[]>([]);
  const [status, setStatus] = useState("");

  async function refresh() {
    setStatus(t("logs.status.loading"));
    const res = await fetch("/api/logs?limit=100");
    const json = await res.json().catch(() => ({ logs: [] }));
    setLogs(json.logs ?? []);
    setStatus("");
  }

  useEffect(() => {
    refresh().catch(() => setStatus(t("logs.status.failed")));
    const intervalId = setInterval(() => refresh().catch(() => {}), 2000);
    return () => clearInterval(intervalId);
  }, []);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("logs.card.title")}</CardTitle>
        <CardDescription>{t("logs.card.desc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">{status}</div>
          <Button type="button" variant="secondary" onClick={() => refresh()}>
            {t("logs.action.refresh")}
          </Button>
        </div>
        <pre className="max-h-[520px] overflow-auto rounded-md bg-muted p-3 text-xs">
          {JSON.stringify(logs, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
