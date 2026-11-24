"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "./ui";

export type Theme = "system" | "light" | "dark";
const KEY = "routerdeck.theme";

function apply(t: Theme) {
  const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>("system");
  useEffect(() => {
    try {
      setTheme((localStorage.getItem(KEY) as Theme) || "system");
    } catch {}
  }, []);
  useEffect(() => {
    apply(theme);
    if (theme !== "system") return;
    const mq = matchMedia("(prefers-color-scheme: dark)");
    const on = () => apply("system");
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [theme]);
  return {
    theme,
    setTheme(t: Theme) {
      try {
        localStorage.setItem(KEY, t);
      } catch {}
      setTheme(t);
    },
  };
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const next: Theme = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
  const Icon = theme === "system" ? Monitor : theme === "light" ? Sun : Moon;
  return (
    <button
      onClick={() => setTheme(next)}
      className={cn("inline-flex size-9 items-center justify-center rounded-xl text-muted transition hover:bg-[var(--surface-2)] hover:text-[var(--text)]", className)}
      aria-label={`Theme: ${theme}. Switch to ${next}`}
      title={`Theme: ${theme}`}
    >
      <Icon className="size-[18px]" />
    </button>
  );
}
