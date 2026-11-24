import type { NetworkInfo, RouterRequest, RouterResponse, Transport } from "./types";
import { TransportError } from "./types";

/**
 * Inside the RouterDeck desktop app (Windows / macOS / Linux) the router is
 * reached natively from the app's main process. The preload script exposes
 * this narrow, typed bridge on window.routerdeckDesktop.
 */
type Result<T> = { ok: true; result: T } | { ok: false; error: string; code?: string };

export interface DesktopSettings {
  runInBackground: boolean;
  startAtLogin: boolean;
  shareWithPhones: boolean;
}

export interface ShareStatus {
  running: boolean;
  url?: string; // http://192.168.1.5:47800/#pair=CODE
  error?: string;
}

export interface DesktopBridge {
  version: string;
  platform: string;
  request(req: RouterRequest): Promise<Result<RouterResponse>>;
  probe(origins: string[], timeoutMs?: number): Promise<string[]>;
  network(): Promise<NetworkInfo>;
  reset(origin: string): Promise<void>;
  settings: { get(): Promise<DesktopSettings>; set(patch: Partial<DesktopSettings>): Promise<DesktopSettings> };
  credentials: {
    get(origin: string): Promise<{ username: string; password: string } | null>;
    set(origin: string, username: string, password: string): Promise<boolean>;
    clear(origin: string): Promise<void>;
    available(): Promise<boolean>;
  };
  share: { status(): Promise<ShareStatus>; set(on: boolean): Promise<ShareStatus> };
  /** status: available (downloading itself) | manual (needs a download) | latest | error | unavailable */
  checkForUpdates(): Promise<{ status: string; version?: string }>;
  openDownloads?(): Promise<void>;
  /** Keeps the window frame, menus and dialogs in the same light/dark mode. */
  setTheme?(theme: "system" | "light" | "dark"): Promise<string>;
  /** The tray / View menu changed the appearance. */
  onTheme?(cb: (theme: "system" | "light" | "dark") => void): void;
}

declare global {
  interface Window {
    routerdeckDesktop?: DesktopBridge;
  }
}

export function desktopBridge(): DesktopBridge | null {
  return typeof window !== "undefined" && window.routerdeckDesktop ? window.routerdeckDesktop : null;
}

export class DesktopTransport implements Transport {
  readonly kind = "desktop" as const;
  readonly label = "RouterDeck app";

  private get bridge() {
    const b = desktopBridge();
    if (!b) throw new TransportError("RouterDeck desktop features aren't available.", "unavailable");
    return b;
  }

  async request(req: RouterRequest): Promise<RouterResponse> {
    const r = await this.bridge.request(req);
    if (!r.ok) throw new TransportError(r.error, (r.code as TransportError["code"]) ?? "unknown");
    return r.result;
  }

  probe(origins: string[], timeoutMs = 1500) {
    return this.bridge.probe(origins, timeoutMs);
  }

  network() {
    return this.bridge.network();
  }

  resetSession(origin: string) {
    return this.bridge.reset(origin);
  }
}
