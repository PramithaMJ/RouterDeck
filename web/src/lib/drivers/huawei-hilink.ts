import { detectIsp } from "../isp";
import type {
  AccessControl,
  AccessMode,
  Device,
  DriverContext,
  DriverFactory,
  Overview,
  RouterDriver,
  SiteBlocking,
  WifiNetwork,
  WifiPatch,
} from "../router/types";
import { RouterError } from "../router/types";
import { Mutex, normalizeMac } from "../router/util";

/**
 * Huawei "HiLink" 4G/5G routers and MiFi (B310, B311, B315, B525, B535,
 * B618, E5576, E5783 …). These are the home-broadband boxes sold by Dialog,
 * Mobitel, Hutch and Airtel in Sri Lanka and many ISPs worldwide.
 *
 * HiLink exposes an XML API under /api/… protected by a session cookie and a
 * rotating __RequestVerificationToken. Built from the public API behaviour;
 * marked beta until verified on each model.
 */

const XML_HEAD = '<?xml version="1.0" encoding="UTF-8"?>';

const NET_TYPES: Record<string, string> = {
  "0": "No service", "1": "2G", "2": "2G", "3": "2G", "4": "3G", "5": "3G", "6": "3G", "7": "3G", "8": "3G", "9": "3G+",
  "19": "4G", "101": "4G", "1011": "4G+", "111": "5G", "1021": "4G+",
};

const ERRORS: Record<string, string> = {
  "108001": "Wrong username.",
  "108002": "Wrong password.",
  "108006": "Wrong username or password.",
  "108007": "Too many failed attempts. Wait a few minutes and try again.",
  "108003": "Someone else is already signed in to this router. Sign out there first.",
  "125002": "Session expired. Please sign in again.",
  "125003": "Session expired. Please sign in again.",
  "100003": "You don't have permission for this. Please sign in again.",
  "9003": "The router rejected these settings.",
};

function parseXml(text: string): Document {
  return new DOMParser().parseFromString(text, "application/xml");
}

function tag(doc: Document | Element, name: string): string | undefined {
  const el = doc.getElementsByTagName(name)[0];
  return el?.textContent ?? undefined;
}

function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

async function sha256hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

function b64(s: string) {
  return btoa(unescape(encodeURIComponent(s)));
}

function toNumber(s?: string) {
  const m = s?.match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

function fmtDuration(sec?: number) {
  if (!sec || !Number.isFinite(sec)) return undefined;
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}

class HiLinkDriver implements RouterDriver {
  readonly id = "huawei-hilink";
  readonly name = "Huawei HiLink (4G/5G)";
  readonly capabilities = {
    devices: true,
    blockDevices: true,
    wifi: true,
    siteBlocking: false,
    adminPassword: false,
    reboot: true,
    fiber: false,
    advanced: false,
  };
  private readonly lock = new Mutex();
  private tokens: string[] = [];
  constructor(private readonly ctx: DriverContext) {}

  get baseUrl() {
    return this.ctx.baseUrl;
  }

  private url(p: string) {
    return this.ctx.baseUrl + p;
  }

  private async fetchToken(): Promise<string> {
    if (this.tokens.length) return this.tokens.shift()!;
    const a = await this.ctx.transport.request({ url: this.url("/api/webserver/SesTokInfo") }).catch(() => null);
    const tok = a ? tag(parseXml(a.body), "TokInfo") : undefined;
    if (tok) return tok;
    const b = await this.ctx.transport.request({ url: this.url("/api/webserver/token") });
    const t = tag(parseXml(b.body), "token") ?? "";
    return t.length > 32 ? t.slice(-32) : t;
  }

  private remember(headers: Record<string, string>) {
    const h = headers["__requestverificationtoken"] || headers["__requestverificationtokenone"];
    if (h) this.tokens = h.split("#").filter(Boolean);
  }

  private check(doc: Document) {
    const code = tag(doc, "code");
    if (doc.getElementsByTagName("error").length && code) {
      if (code === "125002" || code === "125003" || code === "100003") throw new RouterError(ERRORS[code], "session-expired");
      throw new RouterError(ERRORS[code] ?? `The router returned error ${code}.`, code.startsWith("108") ? "auth" : "rejected");
    }
  }

  private async apiGet(path: string): Promise<Document> {
    const res = await this.ctx.transport.request({ url: this.url(path), headers: { "x-requested-with": "XMLHttpRequest" } });
    this.remember(res.headers);
    const doc = parseXml(res.body);
    this.check(doc);
    return doc;
  }

  private async apiPost(path: string, inner: string): Promise<Document> {
    const token = await this.fetchToken();
    const res = await this.ctx.transport.request({
      url: this.url(path),
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        __RequestVerificationToken: token,
      },
      body: `${XML_HEAD}<request>${inner}</request>`,
    });
    this.remember(res.headers);
    const doc = parseXml(res.body);
    this.check(doc);
    return doc;
  }

  // ------------------------------------------------------------ session

  async login(username: string, password: string) {
    return this.lock.run(async () => {
      // Opening the home page makes the router issue its session cookie.
      await this.ctx.transport.request({ url: this.url("/") }).catch(() => null);
      const state = await this.apiGet("/api/user/state-login").catch(() => null);
      if (state && tag(state, "State") === "0") return; // already signed in
      const type = state ? tag(state, "password_type") ?? "4" : "4";
      const token = await this.fetchToken();
      const hashed = type === "4" ? b64(await sha256hex(username + b64(await sha256hex(password)) + token)) : b64(password);
      this.tokens = [token];
      await this.apiPost("/api/user/login", `<Username>${esc(username)}</Username><Password>${hashed}</Password><password_type>${type}</password_type>`);
    });
  }

  async isLoggedIn() {
    try {
      const d = await this.apiGet("/api/user/state-login");
      return tag(d, "State") === "0";
    } catch {
      return false;
    }
  }

  async logout() {
    await this.lock.run(() => this.apiPost("/api/user/logout", "<Logout>1</Logout>").catch(() => null));
  }

  // ------------------------------------------------------------ status

  getOverview(): Promise<Overview> {
    return this.lock.run(async () => {
      const [info, status, plmn, signal, traffic] = await Promise.all([
        this.apiGet("/api/device/information"),
        this.apiGet("/api/monitoring/status"),
        this.apiGet("/api/net/current-plmn").catch(() => null),
        this.apiGet("/api/device/signal").catch(() => null),
        this.apiGet("/api/monitoring/traffic-statistics").catch(() => null),
      ]);
      const operator = (plmn && (tag(plmn, "FullName") || tag(plmn, "ShortName"))) || undefined;
      const connected = tag(status, "ConnectionStatus") === "901";
      const wanIp = tag(status, "WanIPAddress") || tag(info, "WanIPAddress") || undefined;
      const dns = [tag(status, "PrimaryDns"), tag(status, "SecondaryDns")].filter((x): x is string => !!x);
      const netType = tag(status, "CurrentNetworkTypeEx") || tag(status, "CurrentNetworkType") || "";
      return {
        identity: {
          model: tag(info, "DeviceName") ?? "Huawei 4G router",
          vendor: "Huawei",
          isp: detectIsp({ plmn: operator, dns }),
          firmware: tag(info, "SoftwareVersion"),
          hardware: tag(info, "HardwareVersion"),
        },
        uptime: fmtDuration(toNumber(traffic ? tag(traffic, "CurrentConnectTime") : undefined)),
        dns,
        lan: { ip: new URL(this.ctx.baseUrl).hostname, mac: normalizeMac(tag(info, "MacAddress1") ?? "") ?? undefined },
        internet: {
          online: connected,
          publicIp: wanIp,
          uptime: fmtDuration(toNumber(traffic ? tag(traffic, "CurrentConnectTime") : undefined)),
          protocol: NET_TYPES[netType] ?? "Mobile",
        },
        wan: [{ name: "Mobile data", kind: "internet", protocol: NET_TYPES[netType] ?? "Mobile", ipv4: wanIp, up: connected }],
        cellular: {
          operator,
          networkType: NET_TYPES[netType],
          bars: toNumber(tag(status, "SignalIcon")),
          rsrp: toNumber(signal ? tag(signal, "rsrp") : undefined),
          rsrq: toNumber(signal ? tag(signal, "rsrq") : undefined),
          sinr: toNumber(signal ? tag(signal, "sinr") : undefined),
          rssi: toNumber(signal ? tag(signal, "rssi") : undefined),
          band: signal ? tag(signal, "band") : undefined,
        },
        deviceCount: toNumber(tag(status, "CurrentWifiUser")) ?? 0,
        fetchedAt: Date.now(),
      };
    });
  }

  // ------------------------------------------------------------ devices & access

  private async readMacFilter() {
    const doc = await this.apiGet("/api/wlan/multi-macfilter-settings");
    const ssid = doc.getElementsByTagName("Ssid")[0];
    if (!ssid) throw new RouterError("This router doesn't expose device filtering.", "unsupported");
    const status = tag(ssid, "WifiMacFilterStatus") ?? "0";
    const slots: { idx: number; mac: string }[] = [];
    for (let i = 0; i < 32; i++) {
      const v = tag(ssid, `WifiMacFilterMac${i}`);
      if (v === undefined) break;
      slots.push({ idx: i, mac: normalizeMac(v) ?? "" });
    }
    return { doc, ssid, status, slots };
  }

  private async writeMacFilter(status: string, macs: string[]) {
    const f = await this.readMacFilter();
    if (macs.length > f.slots.length) throw new RouterError(`This router can only hold ${f.slots.length} devices in its list.`, "validation");
    const parts: string[] = [];
    for (const child of Array.from(f.ssid.children)) {
      const n = child.tagName;
      let v = child.textContent ?? "";
      if (n === "WifiMacFilterStatus") v = status;
      const m = n.match(/^WifiMacFilterMac(\d+)$/);
      if (m) v = (macs[Number(m[1])] ?? "").toUpperCase();
      const h = n.match(/^wifihostname(\d+)$/i);
      if (h) v = macs[Number(h[1])] ? v : "";
      parts.push(`<${n}>${esc(v)}</${n}>`);
    }
    await this.apiPost("/api/wlan/multi-macfilter-settings", `<Ssids><Ssid>${parts.join("")}</Ssid></Ssids>`);
  }

  getDevices(): Promise<Device[]> {
    return this.lock.run(async () => {
      const hosts = await this.apiGet("/api/wlan/host-list").catch(() => this.apiGet("/api/lan/HostInfo"));
      const filter = await this.readMacFilter().catch(() => null);
      const listed = new Set(filter?.slots.map((s) => s.mac).filter(Boolean) ?? []);
      const mode = filter?.status === "1" ? "allow" : filter?.status === "2" ? "deny" : "off";
      const out = new Map<string, Device>();
      for (const h of Array.from(hosts.getElementsByTagName("Host"))) {
        const mac = normalizeMac(tag(h, "MacAddress") ?? "");
        if (!mac) continue;
        out.set(mac, {
          mac,
          hostname: tag(h, "HostName") || tag(h, "ActualName") || undefined,
          ipv4: (tag(h, "IpAddress") ?? "").split(";")[0] || undefined,
          medium: (tag(h, "InterfaceType") ?? "Wireless").toLowerCase().includes("ether") ? "wired" : "wifi",
          online: true,
          blocked: mode === "deny" ? listed.has(mac) : mode === "allow" ? !listed.has(mac) : false,
        });
      }
      for (const mac of listed) if (!out.has(mac)) out.set(mac, { mac, medium: "unknown", online: false, blocked: mode === "deny" });
      return [...out.values()];
    });
  }

  setDeviceBlocked(raw: string, blocked: boolean) {
    const mac = normalizeMac(raw);
    if (!mac) return Promise.reject(new RouterError("That doesn't look like a valid device address.", "validation"));
    return this.lock.run(async () => {
      const f = await this.readMacFilter();
      const current = f.slots.map((s) => s.mac).filter(Boolean);
      const allow = f.status === "1";
      const listed = allow ? !blocked : blocked;
      const next = listed ? [...new Set([...current, mac])] : current.filter((m) => m !== mac);
      await this.writeMacFilter(allow ? "1" : next.length ? "2" : f.status === "2" ? "2" : "0", next);
    });
  }

  getAccessControl(): Promise<AccessControl> {
    return this.lock.run(async () => {
      const f = await this.readMacFilter();
      return { mode: f.status === "1" ? "allowlist" : "blocklist", macs: f.status === "0" ? [] : f.slots.map((s) => s.mac).filter(Boolean), supported: ["blocklist", "allowlist"] };
    });
  }

  setAccessControl(mode: AccessMode, macs: string[]) {
    const list = [...new Set(macs.map((m) => normalizeMac(m)).filter((m): m is string => !!m))];
    if (mode === "allowlist" && !list.length) return Promise.reject(new RouterError("Add at least one device to the allow list.", "validation"));
    return this.lock.run(() => this.writeMacFilter(mode === "allowlist" ? "1" : list.length ? "2" : "0", list));
  }

  // ------------------------------------------------------------ wi-fi

  getWifi(): Promise<WifiNetwork[]> {
    return this.lock.run(async () => {
      const multi = await this.apiGet("/api/wlan/multi-basic-settings").catch(() => null);
      const ssids = multi ? Array.from(multi.getElementsByTagName("Ssid")) : [];
      if (ssids.length) {
        return ssids.map((s, i) => ({
          id: `m${tag(s, "Index") ?? i}`,
          band: /5/.test(tag(s, "WifiFrequency") ?? tag(s, "wififrequency") ?? "") || /5g/i.test(tag(s, "WifiSsid") ?? "") ? "5GHz" : "2.4GHz",
          enabled: tag(s, "WifiEnable") === "1",
          ssid: tag(s, "WifiSsid") ?? "",
          password: tag(s, "WifiWpapsk") || undefined,
          security: /open/i.test(tag(s, "WifiAuthmode") ?? "") ? "Open (no password)" : (tag(s, "WifiAuthmode") ?? "WPA2").replace(/PSK/i, "-Personal"),
          hidden: tag(s, "WifiHide") === "1",
          editable: { ssid: true, password: true, enabled: true },
        }));
      }
      const basic = await this.apiGet("/api/wlan/basic-settings");
      const sec = await this.apiGet("/api/wlan/security-settings").catch(() => null);
      return [
        {
          id: "basic",
          band: "2.4GHz",
          enabled: tag(basic, "WifiEnable") === "1",
          ssid: tag(basic, "WifiSsid") ?? "",
          password: sec ? tag(sec, "WifiWpapsk") || undefined : undefined,
          security: sec ? (tag(sec, "WifiAuthmode") ?? "WPA2").replace(/PSK/i, "-Personal") : "WPA2-Personal",
          editable: { ssid: true, password: !!sec, enabled: true },
        },
      ];
    });
  }

  updateWifi(id: string, patch: WifiPatch) {
    return this.lock.run(async () => {
      if (id.startsWith("m")) {
        const doc = await this.apiGet("/api/wlan/multi-basic-settings");
        const parts: string[] = [];
        for (const s of Array.from(doc.getElementsByTagName("Ssid"))) {
          const isTarget = `m${tag(s, "Index")}` === id;
          const fields = Array.from(s.children).map((c) => {
            let v = c.textContent ?? "";
            if (isTarget) {
              if (c.tagName === "WifiSsid" && patch.ssid !== undefined) v = patch.ssid;
              if (c.tagName === "WifiWpapsk" && patch.password !== undefined) v = patch.password;
              if (c.tagName === "WifiEnable" && patch.enabled !== undefined) v = patch.enabled ? "1" : "0";
            }
            return `<${c.tagName}>${esc(v)}</${c.tagName}>`;
          });
          parts.push(`<Ssid>${fields.join("")}</Ssid>`);
        }
        await this.apiPost("/api/wlan/multi-basic-settings", `<Ssids>${parts.join("")}</Ssids><WifiRestart>1</WifiRestart>`);
        return;
      }
      if (patch.ssid !== undefined || patch.enabled !== undefined) {
        const basic = await this.apiGet("/api/wlan/basic-settings");
        const inner = Array.from(basic.documentElement.children)
          .map((c) => {
            let v = c.textContent ?? "";
            if (c.tagName === "WifiSsid" && patch.ssid !== undefined) v = patch.ssid;
            if (c.tagName === "WifiEnable" && patch.enabled !== undefined) v = patch.enabled ? "1" : "0";
            return `<${c.tagName}>${esc(v)}</${c.tagName}>`;
          })
          .join("");
        await this.apiPost("/api/wlan/basic-settings", inner + "<WifiRestart>1</WifiRestart>");
      }
      if (patch.password !== undefined) {
        const sec = await this.apiGet("/api/wlan/security-settings");
        const inner = Array.from(sec.documentElement.children)
          .map((c) => `<${c.tagName}>${esc(c.tagName === "WifiWpapsk" ? patch.password! : c.textContent ?? "")}</${c.tagName}>`)
          .join("");
        await this.apiPost("/api/wlan/security-settings", inner + "<WifiRestart>1</WifiRestart>");
      }
    });
  }

  // ------------------------------------------------------------ misc

  async getSiteBlocking(): Promise<SiteBlocking> {
    throw new RouterError("Website blocking isn't available for this router yet.", "unsupported");
  }
  async setSiteBlockingEnabled() {
    throw new RouterError("Website blocking isn't available for this router yet.", "unsupported");
  }
  async addBlockedSite() {
    throw new RouterError("Website blocking isn't available for this router yet.", "unsupported");
  }
  async removeBlockedSite() {
    throw new RouterError("Website blocking isn't available for this router yet.", "unsupported");
  }
  async changeAdminPassword() {
    throw new RouterError("Change this router's password from its own page for now.", "unsupported");
  }

  reboot() {
    return this.lock.run(async () => {
      await this.apiPost("/api/device/control", "<Control>1</Control>").catch((e) => {
        if (!(e instanceof RouterError)) return; // connection drop while rebooting is fine
        throw e;
      });
    });
  }
}

export const huaweiHiLink: DriverFactory = {
  id: "huawei-hilink",
  name: "Huawei HiLink 4G/5G",
  knownModels: ["Huawei 4G routers (B310, B311, B315, B525, B535…) · Dialog, Mobitel, Hutch, Airtel"],
  beta: true,
  candidateHosts: ["http://192.168.8.1"],
  async probe(ctx, home) {
    const looks = /hilink|huawei|\/api\/|html\/home\.html|lib\/jquery/i.test(home.body) || /huawei/i.test(home.headers["server"] ?? "");
    try {
      const r = await ctx.transport.request({ url: ctx.baseUrl + "/api/device/basic_information", timeoutMs: 4000 });
      const doc = parseXml(r.body);
      const name = tag(doc, "devicename") || tag(doc, "DeviceName");
      if (name || tag(doc, "productfamily")) {
        return { confidence: 0.95, model: `Huawei ${name ?? "4G router"}`, defaultUsername: "admin" };
      }
      if (doc.getElementsByTagName("error").length && looks) return { confidence: 0.7, model: "Huawei 4G router", defaultUsername: "admin" };
    } catch {}
    return looks ? { confidence: 0.4, model: "Huawei router", defaultUsername: "admin" } : null;
  },
  create: (ctx) => new HiLinkDriver(ctx),
};
