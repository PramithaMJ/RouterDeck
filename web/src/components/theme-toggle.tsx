"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { usePrefs, type Theme } from "@/lib/preferences";
import { cn } from "./ui";

export type { Theme };

/** Shared theme state (every toggle and the Settings page stay in sync). */
export function useTheme() {
  const theme = usePrefs((s) => s.theme);
  const setTheme = usePrefs((s) => s.setTheme);
  // Server render and first client render both use "system" to avoid a hydration mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return { theme: mounted ? theme : ("system" as Theme), setTheme };
}

const LABEL: Record<Theme, string> = { system: "System", light: "Light", dark: "Dark" };

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const Icon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;
  return (
    <button
      onClick={() => setTheme(next)}
      className={cn("inline-flex size-9 items-center justify-center rounded-xl text-muted transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]", className)}
      aria-label={`Appearance: ${LABEL[theme]}. Switch to ${LABEL[next]}`}
      title={`Appearance: ${LABEL[theme]} (click for ${LABEL[next]})`}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
