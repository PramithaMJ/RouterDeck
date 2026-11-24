"use client";

import { create } from "zustand";
import { desktopBridge } from "./transport/desktop";

/**
 * App-wide display preferences, shared by every screen (website, phones,
 * desktop app). Stored in this browser / app only.
 *  - theme: light, dark, or follow the system
 *  - view:  "simple" hides technical details and the router's raw settings,
 *           "advanced" shows everything
 */
export type Theme = "system" | "light" | "dark";
export type ViewMode = "simple" | "advanced";

const THEME_KEY = "routerdeck.theme"; // also read by the no-flash script in app/layout.tsx
const VIEW_KEY = "routerdeck.view";

function read<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  try {
    const v = localStorage.getItem(key) as T | null;
    return v && allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

export function systemDark() {
  return typeof matchMedia !== "undefined" && matchMedia("(prefers-color-scheme: dark)").matches;
}

export function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const dark = t === "dark" || (t === "system" && systemDark());
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

interface PrefsState {
  theme: Theme;
  view: ViewMode;
  setTheme(t: Theme): void;
  setView(v: ViewMode): void;
}

const isBrowser = typeof window !== "undefined";

export const usePrefs = create<PrefsState>((set) => ({
  theme: isBrowser ? read(THEME_KEY, ["system", "light", "dark"] as const, "system") : "system",
  view: isBrowser ? read(VIEW_KEY, ["simple", "advanced"] as const, "advanced") : "advanced",
  setTheme(theme) {
    write(THEME_KEY, theme);
    applyTheme(theme);
    void desktopBridge()?.setTheme?.(theme);
    set({ theme });
  },
  setView(view) {
    write(VIEW_KEY, view);
    set({ view });
  },
}));

if (isBrowser) {
  // Follow the OS while on "system".
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (usePrefs.getState().theme === "system") applyTheme("system");
  });
  // Another tab/window changed it.
  window.addEventListener("storage", (e) => {
    if (e.key === THEME_KEY || e.key === VIEW_KEY) {
      const theme = read(THEME_KEY, ["system", "light", "dark"] as const, "system");
      applyTheme(theme);
      usePrefs.setState({ theme, view: read(VIEW_KEY, ["simple", "advanced"] as const, "advanced") });
    }
  });
  // Desktop app: the tray/menu "Appearance" choice.
  desktopBridge()?.onTheme?.((t) => {
    if (t !== usePrefs.getState().theme) usePrefs.getState().setTheme(t);
  });
  // Tell the desktop app the saved choice at startup so its window frame matches.
  void desktopBridge()?.setTheme?.(usePrefs.getState().theme);
}

/** True when technical details should be shown. */
export function useAdvanced() {
  return usePrefs((s) => s.view === "advanced");
}
