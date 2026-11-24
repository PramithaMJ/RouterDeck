"use client";

import { create } from "zustand";
import type { Device } from "./router/types";

/**
 * Remembers which device in the router's list is the one using RouterDeck.
 * Browsers can't see their own LAN address, so this is detected exactly when
 * the connector is used (it knows the computer's IP) and otherwise confirmed
 * once by the user, helped by a best-guess suggestion.
 */
const KEY = "routerdeck.thisDevice.v1"; // { [routerHost]: mac }

function load(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    return {};
  }
}

interface ThisDeviceState {
  byRouter: Record<string, string>;
  set(router: string, mac: string | null): void;
}

export const useThisDevice = create<ThisDeviceState>((set, get) => ({
  byRouter: typeof window === "undefined" ? {} : load(),
  set(router, mac) {
    const byRouter = { ...get().byRouter };
    if (mac) byRouter[router] = mac;
    else delete byRouter[router];
    try {
      localStorage.setItem(KEY, JSON.stringify(byRouter));
    } catch {}
    set({ byRouter });
  },
}));

/** Rough guess from the browser's platform and device names. Never auto-applied. */
export function suggestThisDevice(devices: Device[]): Device | undefined {
  if (typeof navigator === "undefined") return undefined;
  const ua = navigator.userAgent;
  const rules: RegExp[] = /iPhone/.test(ua)
    ? [/iphone/i]
    : /iPad/.test(ua)
      ? [/ipad/i]
      : /Android/.test(ua)
        ? [/android|galaxy|sm-|note|redmi|xiaomi|pixel|oppo|vivo|huawei|honor|realme|a\d{2}\b|phone/i]
        : /Mac OS X|Macintosh/.test(ua)
          ? [/macbook|imac|mac-?mini|\bmac\b|mbp/i]
          : /Windows/.test(ua)
            ? [/^desktop-|^laptop-|-pc\b|^[a-z0-9]{2}\d[a-z0-9]{9,}$/i]
            : [];
  const matches = devices.filter((d) => d.online && d.hostname && rules.some((r) => r.test(d.hostname!)));
  return matches.length === 1 ? matches[0] : undefined;
}
