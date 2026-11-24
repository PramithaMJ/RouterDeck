import type { DriverFactory, Overview, RouterDriver } from "../router/types";
import { RouterError } from "../router/types";

/**
 * Starlink dish status (read-only) via the dish's local gRPC-web API at
 * http://192.168.100.1:9201. Starlink's Wi-Fi router is managed from the
 * Starlink app (cloud), so only dish health is shown here.
 *
 * Message layout follows the community-documented SpaceX.API.Device schema:
 *   Request.get_status = 1004   →   Response.dish_get_status = 2004
 *   DishGetStatusResponse: 1 device_info{1 id,2 hw,3 sw}, 2 device_state{1 uptime_s},
 *   1003 pop_ping_drop_rate, 1004 obstruction_stats{1 currently_obstructed, 9 fraction_obstructed},
 *   1005 alerts{bool flags}, 1007 downlink_bps, 1008 uplink_bps, 1009 pop_ping_latency_ms
 * Values are sanity-checked before display.
 */

const DISH = "http://192.168.100.1:9201";

// ---------------------------------------------------------------- tiny protobuf reader
type Field = { no: number; wire: number; varint?: bigint; bytes?: Uint8Array; f32?: number; f64?: number };

function readVarint(b: Uint8Array, p: { i: number }): bigint {
  let r = 0n, shift = 0n;
  for (;;) {
    const x = b[p.i++];
    if (x === undefined) throw new Error("eof");
    r |= BigInt(x & 0x7f) << shift;
    if (!(x & 0x80)) return r;
    shift += 7n;
  }
}

function decode(b: Uint8Array): Field[] {
  const out: Field[] = [];
  const p = { i: 0 };
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (p.i < b.length) {
    const key = Number(readVarint(b, p));
    const no = key >>> 3, wire = key & 7;
    if (wire === 0) out.push({ no, wire, varint: readVarint(b, p) });
    else if (wire === 1) {
      out.push({ no, wire, f64: dv.getFloat64(p.i, true) });
      p.i += 8;
    } else if (wire === 2) {
      const len = Number(readVarint(b, p));
      out.push({ no, wire, bytes: b.subarray(p.i, p.i + len) });
      p.i += len;
    } else if (wire === 5) {
      out.push({ no, wire, f32: dv.getFloat32(p.i, true) });
      p.i += 4;
    } else throw new Error("bad wire type");
  }
  return out;
}

const get = (fs: Field[], no: number) => fs.find((f) => f.no === no);
const str = (f?: Field) => (f?.bytes ? new TextDecoder().decode(f.bytes) : undefined);
const num = (f?: Field) => (f?.f32 ?? f?.f64 ?? (f?.varint !== undefined ? Number(f.varint) : undefined));

const ALERT_NAMES: Record<number, string> = {
  1: "Motors stuck",
  2: "Dish overheating",
  3: "Thermal shutdown",
  4: "Mast not vertical",
  5: "Unexpected location",
  6: "Slow Ethernet",
  7: "Roaming",
  8: "Install pending",
  9: "Software update pending",
  11: "Power supply limiting",
};

function b64(bytes: Uint8Array) {
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return btoa(s);
}

class StarlinkDriver implements RouterDriver {
  readonly id = "starlink";
  readonly name = "Starlink";
  readonly capabilities = { devices: false, blockDevices: false, wifi: false, siteBlocking: false, adminPassword: false, reboot: false, fiber: false, advanced: false };
  constructor(private readonly ctx: { transport: import("../transport/types").Transport }) {}

  get baseUrl() {
    return DISH;
  }

  private async status(): Promise<Field[]> {
    // gRPC-web frame: flag 0, 4-byte length, Request{ get_status (1004) {} }
    const msg = new Uint8Array([0xe2, 0x3e, 0x00]);
    const frame = new Uint8Array([0, 0, 0, 0, msg.length, ...msg]);
    const res = await this.ctx.transport.request({
      url: `${DISH}/SpaceX.API.Device.Device/Handle`,
      method: "POST",
      headers: { "content-type": "application/grpc-web+proto", "x-grpc-web": "1", accept: "application/grpc-web+proto" },
      bodyBase64: b64(frame),
      responseType: "base64",
      timeoutMs: 6000,
    });
    if (res.status !== 200 || !res.bodyBase64) throw new RouterError("The Starlink dish didn't answer.", "unknown");
    const bytes = Uint8Array.from(atob(res.bodyBase64), (c) => c.charCodeAt(0));
    if (bytes[0] !== 0) throw new RouterError("Unexpected answer from the Starlink dish.", "parse");
    const len = (bytes[1] << 24) | (bytes[2] << 16) | (bytes[3] << 8) | bytes[4];
    const response = decode(bytes.subarray(5, 5 + len));
    const dish = get(response, 2004);
    if (!dish?.bytes) throw new RouterError("Unexpected answer from the Starlink dish.", "parse");
    return decode(dish.bytes);
  }

  async login() {}
  async logout() {}
  async isLoggedIn() {
    try {
      await this.status();
      return true;
    } catch {
      return false;
    }
  }

  async getOverview(): Promise<Overview> {
    const s = await this.status();
    const info = get(s, 1)?.bytes ? decode(get(s, 1)!.bytes!) : [];
    const state = get(s, 2)?.bytes ? decode(get(s, 2)!.bytes!) : [];
    const obst = get(s, 1004)?.bytes ? decode(get(s, 1004)!.bytes!) : [];
    const alertsF = get(s, 1005)?.bytes ? decode(get(s, 1005)!.bytes!) : [];
    const sane = (v: number | undefined, lo: number, hi: number) => (v !== undefined && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined);
    const uptime = sane(num(get(state, 1)), 0, 10 * 365 * 86400);
    const latency = sane(num(get(s, 1009)), 0, 5000);
    const drop = sane(num(get(s, 1003)), 0, 1);
    const down = sane(num(get(s, 1007)), 0, 1e10);
    const up = sane(num(get(s, 1008)), 0, 1e10);
    const frac = sane(num(get(obst, 9)), 0, 1);
    const alerts = alertsF.filter((f) => f.varint === 1n).map((f) => ALERT_NAMES[f.no] ?? `Alert ${f.no}`);
    const fmt = (sec?: number) => {
      if (sec === undefined) return undefined;
      const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
      return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(" ");
    };
    const online = latency !== undefined && (drop ?? 0) < 1;
    return {
      identity: { model: "Starlink dish", vendor: "SpaceX", isp: "starlink", firmware: str(get(info, 3)), hardware: str(get(info, 2)) },
      uptime: fmt(uptime),
      dns: [],
      lan: { ip: "192.168.100.1" },
      internet: { online, uptime: fmt(uptime), protocol: "Satellite" },
      wan: [{ name: "Starlink", kind: "internet", protocol: "Satellite", up: online }],
      satellite: {
        latencyMs: latency !== undefined ? Math.round(latency) : undefined,
        downlinkMbps: down !== undefined ? Math.round((down / 1e6) * 10) / 10 : undefined,
        uplinkMbps: up !== undefined ? Math.round((up / 1e6) * 10) / 10 : undefined,
        dropRatePercent: drop !== undefined ? Math.round(drop * 1000) / 10 : undefined,
        obstructedPercent: frac !== undefined ? Math.round(frac * 1000) / 10 : undefined,
        currentlyObstructed: get(obst, 1)?.varint === 1n,
        alerts,
      },
      deviceCount: 0,
      fetchedAt: Date.now(),
    };
  }

  private unsupported(): never {
    throw new RouterError("Manage Starlink Wi-Fi and devices in the Starlink app.", "unsupported");
  }
  async getDevices() {
    return this.unsupported();
  }
  async setDeviceBlocked() {
    return this.unsupported();
  }
  async getWifi() {
    return this.unsupported();
  }
  async updateWifi() {
    return this.unsupported();
  }
  async getSiteBlocking() {
    return this.unsupported();
  }
  async setSiteBlockingEnabled() {
    return this.unsupported();
  }
  async addBlockedSite() {
    return this.unsupported();
  }
  async removeBlockedSite() {
    return this.unsupported();
  }
  async changeAdminPassword() {
    return this.unsupported();
  }
  async reboot() {
    return this.unsupported();
  }
}

export const starlink: DriverFactory = {
  id: "starlink",
  name: "Starlink dish",
  knownModels: ["Starlink (dish status)"],
  beta: true,
  candidateHosts: ["http://192.168.100.1"],
  async probe(ctx) {
    if (!/192\.168\.100\.1/.test(ctx.baseUrl)) return null;
    try {
      const d = new StarlinkDriver(ctx);
      const ok = await d.isLoggedIn();
      return ok ? { confidence: 0.95, model: "Starlink dish", requiresLogin: false, isp: "starlink" } : null;
    } catch {
      return null;
    }
  },
  create: (ctx) => new StarlinkDriver(ctx),
};
