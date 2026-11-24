"use client";

import { create } from "zustand";
import type { Band } from "./router/types";

/**
 * Guest passes: a temporary password for the router's separate guest Wi-Fi.
 * The router itself has no timer, so expiry is enforced by RouterDeck:
 *  - the desktop app keeps running in the background and does it on time,
 *  - in a browser it happens while RouterDeck is open (or next time it opens).
 */
export interface GuestPass {
  id: string;
  router: string; // router origin
  ssid: string;
  password: string;
  /** Bands it broadcasts on; missing = all bands (older passes). */
  bands?: Band[];
  /** Device limit set for this pass, if the router supports one. */
  maxDevices?: number;
  /** Which of the router's guest networks it uses (0 = first). */
  slot?: number;
  createdAt: number;
  /** null = no automatic expiry */
  expiresAt: number | null;
  endedAt?: number;
  endReason?: "revoked" | "expired" | "replaced";
  note?: string;
}

const KEY = "routerdeck.guestPasses.v1";

function load(): GuestPass[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]");
  } catch {
    return [];
  }
}

function save(list: GuestPass[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, 30)));
  } catch {}
}

interface GuestPassState {
  passes: GuestPass[];
  active(router: string): GuestPass | undefined;
  start(p: Omit<GuestPass, "id" | "createdAt">): GuestPass;
  end(id: string, reason: GuestPass["endReason"]): void;
  extend(id: string, expiresAt: number | null): void;
  reload(): void;
}

export const useGuestPasses = create<GuestPassState>((set, get) => ({
  passes: typeof window === "undefined" ? [] : load(),
  active(router) {
    return get().passes.find((p) => p.router === router && !p.endedAt);
  },
  start(p) {
    const now = Date.now();
    // Several passes can run at once, one per guest network; a new pass only
    // replaces the one on the same network.
    const slot = p.slot ?? 0;
    const passes = get().passes.map((x) => (x.router === p.router && !x.endedAt && (x.slot ?? 0) === slot ? { ...x, endedAt: now, endReason: "replaced" as const } : x));
    const pass: GuestPass = { ...p, id: `${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`, createdAt: now };
    const next = [pass, ...passes];
    save(next);
    set({ passes: next });
    return pass;
  },
  end(id, reason) {
    const next = get().passes.map((x) => (x.id === id && !x.endedAt ? { ...x, endedAt: Date.now(), endReason: reason } : x));
    save(next);
    set({ passes: next });
  },
  extend(id, expiresAt) {
    const next = get().passes.map((x) => (x.id === id ? { ...x, expiresAt } : x));
    save(next);
    set({ passes: next });
  },
  reload() {
    set({ passes: load() });
  },
}));

export const DURATIONS: { label: string; ms: number | null }[] = [
  { label: "1 hour", ms: 3_600_000 },
  { label: "4 hours", ms: 4 * 3_600_000 },
  { label: "1 day", ms: 86_400_000 },
  { label: "3 days", ms: 3 * 86_400_000 },
  { label: "1 week", ms: 7 * 86_400_000 },
  { label: "Until I revoke", ms: null },
];

export function untilMidnight(): number {
  const d = new Date();
  d.setHours(23, 59, 0, 0);
  return d.getTime();
}

export function formatRemaining(ms: number): string {
  if (ms <= 0) return "expired";
  const m = Math.ceil(ms / 60000);
  if (m < 60) return `${m} min left`;
  const h = Math.floor(m / 60), mm = m % 60;
  if (h < 24) return `${h}h ${mm}m left`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h left`;
}

/** Readable, typeable guest password (letters + digits, no look-alikes). */
export function guestPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const a = new Uint32Array(10);
  crypto.getRandomValues(a);
  const s = Array.from(a, (n) => alphabet[n % alphabet.length]).join("");
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

export function bandsLabel(bands?: Band[], available?: Band[]): string {
  if (!bands?.length || (available && available.every((b) => bands.includes(b)))) return available && available.length < 2 ? (available[0] ?? "").replace("GHz", " GHz") : "All bands";
  return bands.map((b) => b.replace("GHz", " GHz")).join(" + ");
}

/** Text to send a guest (WhatsApp/SMS/etc). */
export function shareText(p: GuestPass): string {
  const until = p.expiresAt ? `\nValid until ${new Date(p.expiresAt).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.` : "";
  return `Wi-Fi for you 👋\nNetwork: ${p.ssid}\nPassword: ${p.password}${until}`;
}
