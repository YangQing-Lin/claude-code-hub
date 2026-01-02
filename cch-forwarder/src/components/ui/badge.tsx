import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border bg-secondary px-2 py-0.5 text-xs font-medium text-secondary-foreground",
        className,
      )}
      {...props}
    />
  );
}

