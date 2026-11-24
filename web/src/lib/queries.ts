"use client";

import { useMutation, useQuery, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { create } from "zustand";
import type { RouterDriver } from "./router/types";
import { describeError, useSession } from "./session";
import { toast } from "./toast";

export const qk = {
  overview: ["overview"] as const,
  devices: ["devices"] as const,
  wifi: ["wifi"] as const,
  sites: ["sites"] as const,
  access: ["access"] as const,
};

function useDriver(): RouterDriver | null {
  return useSession((s) => s.driver);
}

export function useOverview() {
  const driver = useDriver();
  return useQuery({
    queryKey: qk.overview,
    queryFn: () => driver!.getOverview(),
    enabled: !!driver,
    refetchInterval: 20_000,
  });
}

export function useDevices() {
  const driver = useDriver();
  return useQuery({
    queryKey: qk.devices,
    queryFn: () => driver!.getDevices(),
    enabled: !!driver && driver.capabilities.devices,
    refetchInterval: 30_000,
  });
}

export function useWifi() {
  const driver = useDriver();
  return useQuery({
    queryKey: qk.wifi,
    queryFn: () => driver!.getWifi(),
    enabled: !!driver && driver.capabilities.wifi,
    staleTime: 60_000,
  });
}

export function useSiteBlocking() {
  const driver = useDriver();
  return useQuery({
    queryKey: qk.sites,
    queryFn: () => driver!.getSiteBlocking(),
    enabled: !!driver && driver.capabilities.siteBlocking,
    staleTime: 60_000,
  });
}

export function useAccessControl() {
  const driver = useDriver();
  return useQuery({
    queryKey: qk.access,
    queryFn: () => driver!.getAccessControl!(),
    enabled: !!driver?.getAccessControl,
    staleTime: 30_000,
  });
}

/** IP of the computer running the bridge (connector only) → "This device". */
export function useLocalIp() {
  const transport = useSession((s) => s.transport);
  return useQuery({
    queryKey: ["local-ip", transport?.kind],
    queryFn: async () => (await transport?.network?.())?.localIp ?? null,
    enabled: !!transport?.network,
    staleTime: Infinity,
  });
}

/**
 * Wraps a router action with toasts + cache invalidation.
 * Router writes are slow (seconds), so every action shows progress.
 */
export function useRouterAction<V>(
  fn: (driver: RouterDriver, vars: V) => Promise<void>,
  opts: { invalidate?: QueryKey[]; success?: string | ((v: V) => string); pending?: string | ((v: V) => string) } = {},
) {
  const driver = useDriver();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (vars: V) => {
      if (!driver) throw new Error("Not connected to a router.");
      const msg = typeof opts.pending === "function" ? opts.pending(vars) : opts.pending;
      const id = msg ? toast.loading(msg) : undefined;
      try {
        await fn(driver, vars);
        if (id) toast.dismiss(id);
      } catch (e) {
        if (id) toast.dismiss(id);
        throw e;
      }
    },
    onSuccess: (_d, vars) => {
      const msg = typeof opts.success === "function" ? opts.success(vars) : opts.success;
      if (msg) toast.success(msg);
    },
    onError: (e) => toast.error(describeError(e)),
    onSettled: () => {
      for (const k of opts.invalidate ?? []) qc.invalidateQueries({ queryKey: k });
    },
  });
}

// ------------------------------------------------------------ device nicknames

const NICK_KEY = "routerdeck.nicknames.v1";

interface NicknameState {
  names: Record<string, string>;
  setName(mac: string, name: string): void;
}

function loadNames(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(NICK_KEY) ?? "{}");
  } catch {
    return {};
  }
}

export const useNicknames = create<NicknameState>((set, get) => ({
  names: typeof window === "undefined" ? {} : loadNames(),
  setName(mac, name) {
    const names = { ...get().names };
    if (name.trim()) names[mac] = name.trim();
    else delete names[mac];
    try {
      localStorage.setItem(NICK_KEY, JSON.stringify(names));
    } catch {}
    set({ names });
  },
}));
