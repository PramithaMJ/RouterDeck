import type { AccessControl, AccessMode, Device, DriverFactory, GuestWifi, GuestWifiConfig, Overview, RouterDriver, SiteBlocking, WifiNetwork, WifiPatch } from "../router/types";
import { RouterError } from "../router/types";
import { normalizeMac, sleep } from "../router/util";

/**
 * A simulated SLT HG7 so anyone can explore RouterDeck without a router,
 * and so the UI can be developed and tested offline.
 */
const STORAGE_KEY = "routerdeck.demo.v1";

interface DemoState {
  password: string;
  wifi: WifiNetwork[];
  blocked: string[];
  mode?: AccessMode;
  guest?: GuestWifi;
  allowed?: string[];
  sites: SiteBlocking;
  bootedAt: number;
}

const DEVICES: Omit<Device, "blocked">[] = [
  { mac: "3a:61:c2:0e:9b:14", hostname: "Galaxy-Note10", ipv4: "192.168.1.5", medium: "wifi", band: "5GHz", signal: -52, linkMbps: 866, online: true },
  { mac: "3c:22:fb:91:0e:17", hostname: "MacBook-Pro", ipv4: "192.168.1.8", medium: "wifi", band: "5GHz", signal: -61, linkMbps: 585, online: true },
  { mac: "b6:2d:51:aa:03:7e", ipv4: "192.168.1.2", medium: "wifi", band: "2.4GHz", signal: -78, linkMbps: 39, online: true },
  { mac: "f4:f5:d8:22:aa:31", hostname: "Living-Room-TV", ipv4: "192.168.1.11", medium: "wired", online: true },
  { mac: "b8:27:eb:5c:10:02", hostname: "raspberrypi", ipv4: "192.168.1.20", medium: "wired", online: true },
  { mac: "d2:41:0c:7e:33:9a", hostname: "iPhone", ipv4: "192.168.1.14", medium: "wifi", band: "5GHz", signal: -67, linkMbps: 390, online: true },
  { mac: "50:ec:50:11:2b:c4", hostname: "DESKTOP-7Q2LK3M", ipv4: "192.168.1.9", medium: "wifi", band: "2.4GHz", signal: -58, linkMbps: 144, online: true },
];

function initial(): DemoState {
  return {
    password: "admin",
    wifi: [
      { id: "1", band: "2.4GHz", enabled: true, ssid: "SLT-Fiber-2.4G_demo", password: "sunset-mango-42", security: "WPA/WPA2-Personal", channel: "Auto", editable: { ssid: true, password: true, enabled: true } },
      { id: "0", band: "5GHz", enabled: true, ssid: "SLT-Fiber-5G_demo", password: "sunset-mango-42", security: "WPA/WPA2-Personal", channel: "Auto", editable: { ssid: true, password: true, enabled: true } },
    ],
    blocked: [],
    sites: { enabled: false, sites: [] },
    bootedAt: Date.now() - (2 * 86400 + 5 * 3600 + 17 * 60) * 1000,
  };
}

function load(): DemoState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as DemoState;
  } catch {}
  return initial();
}

function fmtUptime(ms: number) {
  const m = Math.floor(ms / 60000);
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return [d && `${d}d`, (d || h) && `${h}h`, `${mm}m`].filter(Boolean).join(" ");
}

class DemoDriver implements RouterDriver {
  readonly id = "demo";
  readonly name = "Demo router";
  readonly capabilities = { devices: true, blockDevices: true, wifi: true, siteBlocking: true, adminPassword: true, reboot: true, fiber: true };
  private s = load();
  private get loggedIn() {
    try {
      return sessionStorage.getItem(STORAGE_KEY + ".session") === "1";
    } catch {
      return false;
    }
  }
  private set loggedIn(v: boolean) {
    try {
      if (v) sessionStorage.setItem(STORAGE_KEY + ".session", "1");
      else sessionStorage.removeItem(STORAGE_KEY + ".session");
    } catch {}
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.s));
    } catch {}
  }
  private async lag(ms = 350) {
    await sleep(ms + Math.random() * 250);
  }

  async login(username: string, password: string) {
    await this.lag(600);
    if (username !== "admin" || password !== this.s.password) throw new RouterError("Wrong username or password. (Demo: admin / admin)", "auth");
    this.loggedIn = true;
  }
  async logout() {
    this.loggedIn = false;
  }
  async isLoggedIn() {
    return this.loggedIn;
  }

  async getOverview(): Promise<Overview> {
    await this.lag();
    const jitter = (b: number, r: number) => Math.round((b + (Math.random() - 0.5) * r) * 10) / 10;
    return {
      identity: { model: "HG7 (demo)", vendor: "Realtek", isp: "slt", firmware: "v1.0.18", hardware: "v2.0" },
      uptime: fmtUptime(Date.now() - this.s.bootedAt),
      cpuPercent: Math.round(jitter(6, 8)),
      memoryPercent: Math.round(jitter(27, 2)),
      dns: ["203.0.113.53", "203.0.113.54"],
      lan: { ip: "192.168.1.1", netmask: "255.255.255.0", dhcp: true, mac: "d4:6e:0e:12:34:56" },
      internet: { online: true, publicIp: "100.72.10.24", gateway: "100.72.0.1", uptime: fmtUptime(Date.now() - this.s.bootedAt - 60000), protocol: "PPPoE" },
      wan: [
        { name: "ppp0_nas0_0", kind: "internet", protocol: "PPPoE", ipv4: "100.72.10.24", gateway: "100.72.0.1", vlan: "20", up: true },
        { name: "nas0_1", kind: "voice", protocol: "IPoE", ipv4: "10.77.20.15", gateway: "10.77.0.1", vlan: "10", up: true },
        { name: "nas0_2", kind: "iptv", protocol: "Bridged", vlan: "30", up: true },
      ],
      fiber: { rxPowerDbm: jitter(-19.4, 0.4), txPowerDbm: jitter(2.2, 0.1), temperatureC: jitter(38, 1), status: "O5" },
      deviceCount: DEVICES.length,
      fetchedAt: Date.now(),
    };
  }

  async getAccessControl(): Promise<AccessControl> {
    await this.lag(200);
    const mode = this.s.mode ?? "blocklist";
    return { mode, macs: mode === "allowlist" ? this.s.allowed ?? [] : this.s.blocked, supported: ["blocklist", "allowlist"] };
  }

  async setAccessControl(mode: AccessMode, macs: string[]) {
    await this.lag(1200);
    const list = [...new Set(macs.map((m) => normalizeMac(m)).filter((m): m is string => !!m))];
    if (mode === "allowlist" && !list.length) throw new RouterError("Add at least one device to the allow list.", "validation");
    this.s.mode = mode;
    if (mode === "allowlist") {
      this.s.allowed = list;
      this.s.blocked = [];
    } else {
      this.s.allowed = [];
      this.s.blocked = list;
    }
    this.save();
  }

  async getDevices(): Promise<Device[]> {
    await this.lag();
    if (this.s.mode === "allowlist") {
      const allowed = this.s.allowed ?? [];
      return [
        ...DEVICES.map((d) => ({ ...d, blocked: !allowed.includes(d.mac) })),
        ...allowed.filter((m) => !DEVICES.some((d) => d.mac === m)).map((mac) => ({ mac, medium: "unknown" as const, online: false, blocked: false })),
      ];
    }
    const online = DEVICES.map((d) => ({ ...d, blocked: this.s.blocked.includes(d.mac) }));
    const extra = this.s.blocked.filter((m) => !DEVICES.some((d) => d.mac === m)).map((mac) => ({ mac, medium: "unknown" as const, online: false, blocked: true }));
    return [...online, ...extra];
  }

  async setDeviceBlocked(rawMac: string, blocked: boolean) {
    const mac = normalizeMac(rawMac);
    if (!mac) throw new RouterError("That doesn't look like a valid device address.", "validation");
    await this.lag(900);
    if (this.s.mode === "allowlist") {
      const a = this.s.allowed ?? [];
      this.s.allowed = blocked ? a.filter((m) => m !== mac) : [...new Set([...a, mac])];
      this.save();
      return;
    }
    this.s.blocked = blocked ? [...new Set([...this.s.blocked, mac])] : this.s.blocked.filter((m) => m !== mac);
    this.save();
  }

  async getWifi() {
    await this.lag(500);
    return structuredClone(this.s.wifi);
  }

  async updateWifi(id: string, patch: WifiPatch) {
    await this.lag(1400);
    const n = this.s.wifi.find((w) => w.id === id);
    if (!n) throw new RouterError("Unknown Wi-Fi network", "unknown");
    if (patch.ssid !== undefined) {
      if (!patch.ssid.trim() || patch.ssid.length > 32) throw new RouterError("Network name must be 1-32 characters.", "validation");
      n.ssid = patch.ssid.trim();
    }
    if (patch.password !== undefined) {
      if (patch.password.length < 8 || patch.password.length > 63) throw new RouterError("Wi-Fi password must be 8-63 characters.", "validation");
      n.password = patch.password;
    }
    if (patch.enabled !== undefined) n.enabled = patch.enabled;
    this.save();
  }

  async getGuestWifi(): Promise<GuestWifi> {
    await this.lag(400);
    return { maxDevices: 8, ...(this.s.guest ?? { enabled: false, bands: [] }), availableBands: ["2.4GHz", "5GHz"], deviceLimit: { min: 1, max: 16 }, networkSlots: 2 };
  }

  async setGuestWifi(cfg: GuestWifiConfig) {
    await this.lag(1400);
    if (cfg.enabled && (!cfg.password || cfg.password.length < 8)) throw new RouterError("Guest password must be at least 8 characters.", "validation");
    this.s.guest = cfg.enabled
      ? { enabled: true, ssid: cfg.ssid ?? this.s.guest?.ssid, password: cfg.password, isolated: cfg.isolated ?? true, bands: cfg.bands?.length ? cfg.bands : ["2.4GHz", "5GHz"], maxDevices: cfg.maxDevices ?? 8 }
      : { ...(this.s.guest ?? { bands: [] }), enabled: false, bands: [] };
    this.save();
  }

  async getSiteBlocking() {
    await this.lag();
    return structuredClone(this.s.sites);
  }
  async setSiteBlockingEnabled(enabled: boolean) {
    await this.lag(700);
    this.s.sites.enabled = enabled;
    this.save();
  }
  async addBlockedSite(pattern: string) {
    await this.lag(700);
    const site = pattern.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
    if (!site.includes(".")) throw new RouterError("Enter a website like youtube.com", "validation");
    this.s.sites.enabled = true;
    if (!this.s.sites.sites.some((x) => x.pattern === site)) this.s.sites.sites.push({ id: site, pattern: site });
    this.save();
  }
  async removeBlockedSite(id: string) {
    await this.lag(600);
    this.s.sites.sites = this.s.sites.sites.filter((x) => x.id !== id);
    this.save();
  }

  async changeAdminPassword(current: string, next: string) {
    await this.lag(800);
    if (current !== this.s.password) throw new RouterError("Current password is incorrect.", "rejected");
    this.s.password = next;
    this.save();
  }

  async reboot() {
    await this.lag(1000);
    this.s.bootedAt = Date.now();
    this.save();
  }
}

export const demoDriver: DriverFactory = {
  id: "demo",
  name: "Demo router",
  knownModels: ["Simulated SLT HG7"],
  async probe() {
    return { confidence: 1, model: "HG7 (demo)", defaultUsername: "admin" };
  },
  create: () => new DemoDriver(),
};

export function resetDemo() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {}
}
