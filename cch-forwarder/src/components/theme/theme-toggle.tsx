"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch: resolvedTheme is only reliable on client after mount.
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
