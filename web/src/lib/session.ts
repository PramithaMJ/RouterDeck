"use client";

import { create } from "zustand";
import { autoDetect, demoDriver, detectRouter, DRIVERS, type DetectedRouter } from "./drivers";
import type { DriverFactory, RouterDriver } from "./router/types";
import { RouterError } from "./router/types";
import { ConnectorTransport, DEFAULT_CONNECTOR_URL, detectConnector } from "./transport/connector";
import { detectExtension, ExtensionTransport } from "./transport/extension";
import type { Transport, TransportKind } from "./transport/types";
import { isPrivateHost, TransportError } from "./transport/types";

/**
 * Connection/session state. The router password is never stored anywhere;
 * only "which router, through which pipe" is remembered so a page reload can
 * resume the router's own session.
 */
const SAVED_KEY = "routerdeck.connection.v1";
const TOKEN_KEY = "routerdeck.connectorToken";

export interface SavedConnection {
  transport: TransportKind;
  host: string;
  driverId: string;
  model?: string;
}

export interface Availability {
  extension: string | null; // version
  connector: { version: string } | null;
  checkedAt: number;
}

type Phase = "booting" | "disconnected" | "connected";

export interface Identified {
  factory: DriverFactory;
  host: string;
  model?: string;
  defaultUsername?: string;
  requiresLogin: boolean;
  isp?: string;
}

function toIdentified(d: DetectedRouter): Identified {
  return {
    factory: d.factory,
    host: d.baseUrl,
    model: d.probe.model,
    defaultUsername: d.probe.defaultUsername,
    requiresLogin: d.probe.requiresLogin !== false,
    isp: d.probe.isp,
  };
}

interface SessionState {
  phase: Phase;
  availability: Availability | null;
  saved: SavedConnection | null;
  driver: RouterDriver | null;
  transport: Transport | null;
  connection: SavedConnection | null;
  boot(): Promise<void>;
  refreshAvailability(): Promise<Availability>;
  /** Step 1: find what's at `host`. */
  identify(kind: TransportKind, host: string): Promise<Identified>;
  /** Step 1 (automatic): find the router on this network. */
  discover(kind: TransportKind, onStep?: (m: string) => void): Promise<Identified | null>;
  /** Step 2: sign in. */
  signIn(kind: TransportKind, router: Identified, username: string, password: string): Promise<void>;
  signOut(opts?: { forget?: boolean }): Promise<void>;
  /** Called when the router says the session is gone. */
  expire(): void;
}

function readSaved(): SavedConnection | null {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as SavedConnection) : null;
  } catch {
    return null;
  }
}

function writeSaved(c: SavedConnection | null) {
  try {
    if (c) localStorage.setItem(SAVED_KEY, JSON.stringify(c));
    else localStorage.removeItem(SAVED_KEY);
  } catch {}
}

export function getConnectorToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setConnectorToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token.trim());
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

/** Accept "192.168.1.1", "http://192.168.1.1/", "192.168.1.1:8080" … */
export function normalizeHost(input: string): string {
  const s = input.trim().replace(/\/+$/, "");
  const url = new URL(/^https?:\/\//i.test(s) ? s : `http://${s}`);
  return url.origin;
}

function makeTransport(kind: TransportKind): Transport {
  if (kind === "extension") return new ExtensionTransport();
  if (kind === "connector") {
    const token = getConnectorToken();
    if (!token) throw new TransportError("Enter the pairing code shown by the RouterDeck connector.", "unauthorized");
    return new ConnectorTransport(token, DEFAULT_CONNECTOR_URL);
  }
  if (kind === "demo") return { kind: "demo", label: "Demo", request: async () => ({ status: 200, url: "", headers: {}, body: "" }) };
  throw new Error(`Unsupported transport ${kind}`);
}

export const useSession = create<SessionState>((set, get) => ({
  phase: "booting",
  availability: null,
  saved: null,
  driver: null,
  transport: null,
  connection: null,

  async refreshAvailability() {
    const [extension, connector] = await Promise.all([detectExtension(), detectConnector()]);
    const availability = { extension, connector, checkedAt: Date.now() };
    set({ availability });
    return availability;
  },

  async boot() {
    // #pair=CODE links printed by the connector
    if (typeof window !== "undefined" && window.location.hash.startsWith("#pair=")) {
      setConnectorToken(decodeURIComponent(window.location.hash.slice(6)));
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    const saved = readSaved();
    set({ saved });
    const availability = await get().refreshAvailability();
    if (!saved) return set({ phase: "disconnected" });
    try {
      if (saved.transport === "demo") {
        const driver = demoDriver.create({ transport: makeTransport("demo"), baseUrl: saved.host });
        if (await driver.isLoggedIn()) return set({ phase: "connected", driver, transport: makeTransport("demo"), connection: saved });
        return set({ phase: "disconnected" });
      }
      if (saved.transport === "extension" && !availability.extension) return set({ phase: "disconnected" });
      if (saved.transport === "connector" && !availability.connector) return set({ phase: "disconnected" });
      const transport = makeTransport(saved.transport);
      const factory = DRIVERS.find((d) => d.id === saved.driverId);
      if (!factory) return set({ phase: "disconnected" });
      const driver = factory.create({ transport, baseUrl: saved.host });
      if (await driver.isLoggedIn()) return set({ phase: "connected", driver, transport, connection: saved });
    } catch {
      /* fall through */
    }
    set({ phase: "disconnected" });
  },

  async identify(kind, host) {
    if (kind === "demo") return { factory: demoDriver, host: "http://192.168.1.1", model: "HG7 (demo)", defaultUsername: "admin", requiresLogin: true, isp: "slt" };
    const baseUrl = normalizeHost(host);
    if (!isPrivateHost(new URL(baseUrl).hostname)) {
      throw new RouterError("For safety RouterDeck only talks to devices on your home network (like 192.168.1.1).", "validation");
    }
    const transport = makeTransport(kind);
    if (transport instanceof ConnectorTransport) await transport.verify();
    return toIdentified(await detectRouter({ transport, baseUrl }));
  },

  async discover(kind, onStep) {
    if (kind === "demo") return get().identify("demo", "");
    const transport = makeTransport(kind);
    if (transport instanceof ConnectorTransport) await transport.verify();
    const found = await autoDetect(transport, onStep);
    return found[0] ? toIdentified(found[0]) : null;
  },

  async signIn(kind, router, username, password) {
    const transport = makeTransport(kind);
    const baseUrl = kind === "demo" ? "http://192.168.1.1" : normalizeHost(router.host);
    const driver = router.factory.create({ transport, baseUrl });
    if (router.requiresLogin) await driver.login(username, password);
    const connection: SavedConnection = { transport: kind, host: baseUrl, driverId: router.factory.id, model: router.model };
    writeSaved(connection);
    set({ phase: "connected", driver, transport, connection, saved: connection });
  },

  async signOut(opts) {
    const { driver } = get();
    try {
      await driver?.logout();
    } catch {}
    if (opts?.forget) writeSaved(null);
    set({ phase: "disconnected", driver: null, transport: null, connection: null, saved: opts?.forget ? null : readSaved() });
  },

  expire() {
    set({ phase: "disconnected", driver: null, transport: null, connection: null, saved: readSaved() });
  },
}));

export function describeError(e: unknown): string {
  if (e instanceof RouterError || e instanceof TransportError) return e.message;
  if (e instanceof Error) return e.message;
  return "Something went wrong.";
}
