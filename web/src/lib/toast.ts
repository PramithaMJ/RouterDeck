"use client";

import { create } from "zustand";

export type ToastKind = "success" | "error" | "loading" | "info";

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastState {
  items: ToastItem[];
  push(kind: ToastKind, message: string, ttl?: number): number;
  dismiss(id: number): void;
}

let nextId = 1;

export const useToasts = create<ToastState>((set, get) => ({
  items: [],
  push(kind, message, ttl) {
    const id = nextId++;
    set({ items: [...get().items.slice(-3), { id, kind, message }] });
    const life = ttl ?? (kind === "loading" ? 0 : kind === "error" ? 7000 : 3500);
    if (life > 0) setTimeout(() => get().dismiss(id), life);
    return id;
  },
  dismiss(id) {
    set({ items: get().items.filter((t) => t.id !== id) });
  },
}));

export const toast = {
  success: (m: string) => useToasts.getState().push("success", m),
  error: (m: string) => useToasts.getState().push("error", m),
  info: (m: string) => useToasts.getState().push("info", m),
  loading: (m: string) => useToasts.getState().push("loading", m),
  dismiss: (id: number) => useToasts.getState().dismiss(id),
};
