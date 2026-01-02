"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/50" onClick={() => onOpenChange(false)} />
      <div className="absolute left-1/2 top-1/2 w-[min(720px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2">
        <div className={cn("rounded-xl border bg-card text-card-foreground shadow-xl")}>
          <div className="flex items-start justify-between gap-4 border-b p-4">
            <div>
              <div className="text-base font-semibold">{title}</div>
              {description ? <div className="mt-1 text-sm text-muted-foreground">{description}</div> : null}
            </div>
            <Button type="button" variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
              ✕
            </Button>
          </div>
          <div className="p-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

