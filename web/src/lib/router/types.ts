import type { PageSnapshot } from "../runtime/page";
import type { Transport } from "../transport/types";

export type Band = "2.4GHz" | "5GHz" | "6GHz";

export interface RouterIdentity {
  model: string;
  vendor: string;
  /** Internet provider id from lib/isp.ts (e.g. "slt", "dialog"). */
  isp?: string;
  firmware?: string;
  hardware?: string;
}

export interface WanConnection {
  name: string;
  kind: "internet" | "voice" | "iptv" | "other";
  protocol: string;
  ipv4?: string;
  gateway?: string;
  up: boolean;
  uptime?: string;
  vlan?: string;
}

export interface Overview {
  identity: RouterIdentity;
  uptime?: string;
  cpuPercent?: number;
  memoryPercent?: number;
  dns: string[];
  lan: { ip: string; netmask?: string; dhcp?: boolean; mac?: string };
  internet: { online: boolean; publicIp?: string; gateway?: string; uptime?: string; protocol?: string };
  wan: WanConnection[];
  fiber?: { rxPowerDbm?: number; txPowerDbm?: number; status?: string; temperatureC?: number };
  cellular?: {
    operator?: string;
    networkType?: string; // "4G", "4G+", "5G", "3G"
    bars?: number; // 0..5
    rsrp?: number;
    rsrq?: number;
    sinr?: number;
    rssi?: number;
    band?: string;
  };
  satellite?: {
    latencyMs?: number;
    downlinkMbps?: number;
    uplinkMbps?: number;
    dropRatePercent?: number;
    obstructedPercent?: number;
    currentlyObstructed?: boolean;
    alerts?: string[];
  };
  deviceCount: number;
  fetchedAt: number;
}

export type ConnectionMedium = "wifi" | "wired" | "unknown";

export interface Device {
  mac: string; // normalized aa:bb:cc:dd:ee:ff
  hostname?: string;
  ipv4?: string;
  ipv6?: string;
  medium: ConnectionMedium;
  band?: Band;
  online: boolean;
  blocked: boolean;
  /** Wi-Fi signal strength at the router, in dBm (e.g. -55). */
  signal?: number;
  /** Current Wi-Fi link speed, Mbit/s. */
  linkMbps?: number;
}

export interface WifiNetwork {
  id: string; // driver-specific band id
  band: Band;
  enabled: boolean;
  ssid: string;
  password?: string;
  security: string; // human label, e.g. "WPA2-Personal"
  channel?: string;
  hidden?: boolean;
  /** Fields the driver can change. */
  editable: { ssid: boolean; password: boolean; enabled: boolean };
}

export interface WifiPatch {
  ssid?: string;
  password?: string;
  enabled?: boolean;
}

/**
 * blocklist: everyone may use the internet except listed devices.
 * allowlist: ONLY listed devices may use the internet.
 */
export type AccessMode = "blocklist" | "allowlist";

export interface AccessControl {
  mode: AccessMode;
  /** Devices on the list (blocked in blocklist mode, allowed in allowlist mode). */
  macs: string[];
  /** Modes this router supports. */
  supported: AccessMode[];
}

/** A separate Wi-Fi network for visitors (its own name and password). */
export interface GuestWifi {
  enabled: boolean;
  ssid?: string;
  password?: string;
  /** Bands the guest network is broadcasting on right now. */
  bands: Band[];
  /** Bands the router has, i.e. what the guest network can be put on. */
  availableBands?: Band[];
  /** Guests can't reach each other (and, on most routers, your devices). */
  isolated?: boolean;
}

export interface GuestWifiConfig {
  enabled: boolean;
  ssid?: string;
  password?: string;
  isolated?: boolean;
  /** Which bands to broadcast on. Omitted = every band the router has. */
  bands?: Band[];
}

export interface BlockedSite {
  id: string;
  pattern: string;
}

export interface SiteBlocking {
  enabled: boolean;
  sites: BlockedSite[];
}

export interface DriverCapabilities {
  devices: boolean;
  blockDevices: boolean;
  wifi: boolean;
  siteBlocking: boolean;
  adminPassword: boolean;
  reboot: boolean;
  fiber: boolean;
  /** Every router settings page, rendered generically ("All settings"). */
  advanced?: boolean;
}

export interface AdvancedItem {
  id: string;
  title: string;
}

export interface AdvancedGroup {
  title: string;
  items: AdvancedItem[];
}

export interface PressResult {
  /** Text the router showed after the action (e.g. ping output), if any. */
  message?: string;
  snapshot: PageSnapshot;
}

/** A router settings page kept alive in the sandbox while the user edits it. */
export interface LivePage {
  title: string;
  snapshot: PageSnapshot;
  fill(form: string | number, values: Record<string, string | boolean | string[]>): Promise<PageSnapshot>;
  press(form: string | number, button: string): Promise<PressResult>;
  dispose(): void;
}

export interface DriverContext {
  transport: Transport;
  /** e.g. http://192.168.1.1 (no trailing slash) */
  baseUrl: string;
}

export interface ProbeResult {
  /** 0..1 how sure the driver is that it can manage this router. */
  confidence: number;
  model?: string;
  defaultUsername?: string;
  /** Usernames the login page offers (some routers have a fixed list). */
  usernames?: string[];
  /** false for devices without a password (e.g. Starlink dish). */
  requiresLogin?: boolean;
  /** Internet provider id guessed before login (lib/isp.ts). */
  isp?: string;
}

export interface RouterDriver {
  readonly id: string;
  readonly name: string;
  readonly capabilities: DriverCapabilities;
  login(username: string, password: string): Promise<void>;
  logout(): Promise<void>;
  isLoggedIn(): Promise<boolean>;
  getOverview(): Promise<Overview>;
  getDevices(): Promise<Device[]>;
  /** In allowlist mode, blocked=false adds to the allow list and blocked=true removes. */
  setDeviceBlocked(mac: string, blocked: boolean): Promise<void>;
  getAccessControl?(): Promise<AccessControl>;
  /** Switch mode and replace the list in one go (allowlist needs ≥1 device). */
  setAccessControl?(mode: AccessMode, macs: string[]): Promise<void>;
  getWifi(): Promise<WifiNetwork[]>;
  updateWifi(id: string, patch: WifiPatch): Promise<void>;
  getSiteBlocking(): Promise<SiteBlocking>;
  setSiteBlockingEnabled(enabled: boolean): Promise<void>;
  addBlockedSite(pattern: string): Promise<void>;
  removeBlockedSite(id: string): Promise<void>;
  changeAdminPassword(current: string, next: string): Promise<void>;
  reboot(): Promise<void>;
  /**
   * Many ISP routers only filter IPv4. If IPv6 is on, blocked devices and
   * websites can slip through over IPv6. Drivers that can switch it expose this.
   */
  getIpv6?(): Promise<{ enabled: boolean }>;
  setIpv6?(enabled: boolean): Promise<void>;
  getGuestWifi?(): Promise<GuestWifi>;
  setGuestWifi?(cfg: GuestWifiConfig): Promise<void>;
  getAdvancedMenu?(): Promise<AdvancedGroup[]>;
  openAdvanced?(id: string): Promise<LivePage>;
  /** Address of the router's own admin page, for "open classic page". */
  readonly baseUrl?: string;
}

export interface DriverFactory {
  readonly id: string;
  readonly name: string;
  /** Brands/ISPs this driver is known to work with, shown in the UI. */
  readonly knownModels: string[];
  /** Beta drivers are built from documentation, not yet hardware-verified. */
  readonly beta?: boolean;
  /** Extra addresses to try during auto-detect (e.g. Starlink dish). */
  readonly candidateHosts?: string[];
  probe(ctx: DriverContext, home: { status: number; url: string; body: string; headers: Record<string, string> }): Promise<ProbeResult | null>;
  create(ctx: DriverContext): RouterDriver;
}

/** Errors meant to be shown to the user as-is. */
export class RouterError extends Error {
  constructor(
    message: string,
    readonly code: "auth" | "session-expired" | "validation" | "rejected" | "unsupported" | "parse" | "unknown" = "unknown",
  ) {
    super(message);
    this.name = "RouterError";
  }
}
