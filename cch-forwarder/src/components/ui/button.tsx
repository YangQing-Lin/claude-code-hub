"use client";

import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils/cn";

type ButtonVariant = "default" | "secondary" | "ghost" | "destructive";
type ButtonSize = "default" | "sm" | "icon";

export function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-50",
        size === "default" && "h-9 px-4 py-2",
        size === "sm" && "h-8 px-3",
        size === "icon" && "h-9 w-9",
        variant === "default" && "bg-primary text-primary-foreground hover:bg-primary/90",
        variant === "secondary" && "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        variant === "ghost" && "hover:bg-accent hover:text-accent-foreground",
        variant === "destructive" && "bg-destructive text-white hover:bg-destructive/90",
        className,
      )}
      {...props}
    />
  );
}

