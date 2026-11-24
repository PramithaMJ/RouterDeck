import { detectIsp } from "../isp";
import type {
  AccessControl,
  AccessMode,
  Band,
  Device,
  DriverContext,
  DriverFactory,
  GuestWifi,
  GuestWifiConfig,
  Overview,
  RouterDriver,
  SiteBlocking,
  WifiNetwork,
  WifiPatch,
} from "../router/types";
import { RouterError } from "../router/types";
import { Mutex, normalizeMac } from "../router/util";

/**
 * Tozed / "Highwmg" (Marvell ASR) 4G & 5G CPEs, e.g. Dialog Home Broadband
 * routers. The web UI posts JSON to /cgi-bin/http.cgi:
 *   { cmd: <number>, method: "GET" | "POST", sessionId, language, ... }
 * Login: cmd 232 gives a one-time token, cmd 100 takes sha256(token + password)
 * and returns a sessionId that every later request carries (no cookies).
 * A request without a valid session answers { success: false, message: "NO_AUTH" }.
 */

const CGI = "/cgi-bin/http.cgi";

const CMD = {
  SYS_INFO: 0,
  WIRELESS_CONFIG: 2, // 2.4 GHz networks (subcmd 0 = main, 2..4 = extra networks)
  SYS_REBOOT: 6,
  APPLY_FILTER: 20,
  MAC_FILTER: 23,
  URL_FILTER: 26,
  URL_DEFAULT_FILTER: 29,
  MAC_DEFAULT_FILTER: 30,
  DEVICE_VERSION_INFO: 43,
  INIT_PAGE: 80,
  LOGIN: 100,
  LOGOUT: 101,
  CHANGE_PASSWD: 102,
  SYS_INFO_NETWORK: 205,
  WIRELESS5G_CONFIG: 211, // 5 GHz networks, same subcmds
  DHCPCLIENT_INFO: 223,
  WIFI24G_LIST_INFO: 224,
  WIFI5G_LIST_INFO: 225,
  GET_NEXT_LOGIN_TIME: 232, // also hands out the login token
} as const;

/** Guest pass slot i = the router's network 2+i on each band (networks 2, 3 and 4). */
const GUEST_SUBCMD = 2;
const GUEST_SLOTS = 3;
const guestSubcmd = (slot = 0) => GUEST_SUBCMD + Math.min(Math.max(0, slot), GUEST_SLOTS - 1);
const MAX_RULES = 32;

type Json = Record<string, unknown>;

function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

function num(v: unknown): number | undefined {
  const m = str(v).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

function b64(s: string) {
  return btoa(unescape(encodeURIComponent(s)));
}

function unb64(s: string) {
  try {
    return decodeURIComponent(escape(atob(s)));
  } catch {
    return s;
  }
}

async function sha256hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(d), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** " 23:56:16 up 57 min,  load average: …" / "up 3 days,  2:41," → "57m" / "3d 2h 41m". */
function parseUptime(s: string): string | undefined {
  const m = s.match(/up\s+(?:(\d+)\s+days?,\s*)?(?:(\d+):(\d+)|(\d+)\s+min)/i);
  if (!m) return undefined;
  const d = Number(m[1] ?? 0), h = m[2] ? Number(m[2]) : 0, min = m[3] ? Number(m[3]) : Number(m[4] ?? 0);
  return [d && `${d}d`, (d || h) && `${h}h`, `${min}m`].filter(Boolean).join(" ");
}

function networkType(t: string): string | undefined {
  const s = t.toUpperCase();
  if (!s || /NO|NONE|UNKNOWN/.test(s)) return undefined;
  if (/NR|5G/.test(s)) return "5G";
  if (/LTE\+|LTE-A|CA/.test(s)) return "4G+";
  if (/LTE|4G/.test(s)) return "4G";
  if (/WCDMA|UMTS|HSPA|3G/.test(s)) return "3G";
  if (/GSM|EDGE|GPRS|2G/.test(s)) return "2G";
  return t;
}

interface Rule {
  enableLink?: boolean | string;
  remark?: string;
  ippro?: string;
  mac?: string;
  url?: string;
  [k: string]: unknown;
}

const enabled = (v: unknown) => v === true || v === "true" || v === "1" || v === 1;

class TozedDriver implements RouterDriver {
  readonly id = "tozed";
  readonly name = "Dialog / Tozed 4G";
  readonly capabilities = {
    devices: true,
    blockDevices: true,
    wifi: true,
    siteBlocking: true,
    adminPassword: true,
    reboot: true,
    fiber: false,
    advanced: false,
  };
  private lock = new Mutex();
  private sessionId = "";

  constructor(private ctx: DriverContext) {
    // Keep the router session across page reloads (per tab, like the router's own page).
    try {
      this.sessionId = sessionStorage.getItem(this.storeKey) ?? "";
    } catch {}
  }

  private get storeKey() {
    return `routerdeck.tozed.session:${this.ctx.baseUrl}`;
  }

  private remember(id: string) {
    this.sessionId = id;
    try {
      if (id) sessionStorage.setItem(this.storeKey, id);
      else sessionStorage.removeItem(this.storeKey);
    } catch {}
  }

  get baseUrl() {
    return this.ctx.baseUrl;
  }

  // ---------------------------------------------------------------- transport

  private async call(json: Json, opts: { auth?: boolean; timeoutMs?: number } = {}): Promise<Json> {
    const body = JSON.stringify({ method: "GET", language: "EN", sessionId: this.sessionId, ...json });
    const res = await this.ctx.transport.request({
      url: this.ctx.baseUrl + CGI,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      timeoutMs: opts.timeoutMs ?? 20000,
    });
    if (res.status >= 400) throw new RouterError(`The router answered ${res.status}.`, "unknown");
    const i = res.body.indexOf("{");
    let data: Json;
    try {
      data = JSON.parse(i > 0 ? res.body.slice(i) : res.body) as Json;
    } catch {
      throw new RouterError("The router sent something RouterDeck couldn't read.", "parse");
    }
    if (str(data.message) === "NO_AUTH" || str(data.message) === "OTHER_AUTH") {
      if (opts.auth === false) return data;
      throw new RouterError(
        str(data.message) === "OTHER_AUTH" ? "Someone else signed in to the router. Please sign in again." : "Your router session expired. Please sign in again.",
        "session-expired",
      );
    }
    return data;
  }

  private get(cmd: number, extra: Json = {}) {
    return this.call({ cmd, method: "GET", ...extra });
  }

  private async post(cmd: number, extra: Json = {}) {
    const r = await this.call({ cmd, method: "POST", ...extra });
    const msg = str(r.message);
    if (r.success === false || (msg && msg !== "0" && msg !== "success" && msg !== "SUCCESS")) {
      throw new RouterError("The router rejected that change.", "rejected");
    }
    return r;
  }

  // ---------------------------------------------------------------- session

  async login(username: string, password: string) {
    const t = await this.call({ cmd: CMD.GET_NEXT_LOGIN_TIME, method: "GET", sessionId: "" }, { auth: false });
    const token = str(t.token);
    if (!token) throw new RouterError("The router didn't start a sign-in. Try again in a moment.", "unknown");
    const r = await this.call(
      {
        cmd: CMD.LOGIN,
        method: "POST",
        sessionId: "",
        username: username.trim() || "admin",
        passwd: await sha256hex(token + password),
        isAutoUpgrade: "0",
        subcmd: 0,
      },
      { auth: false },
    );
    if (str(r.login_fail) === "fail" || str(r.login_fail2) === "fail") {
      const left = num(r.login_times);
      const locked = str(r.login_fail2) === "fail" || left === 0;
      throw new RouterError(
        locked
          ? `Too many wrong passwords. The router is locked${num(r.login_time) ? ` for about ${Math.ceil(num(r.login_time)! / 60)} min` : " for a while"}.`
          : `Wrong username or password.${left !== undefined ? ` ${left} ${left === 1 ? "try" : "tries"} left.` : ""}`,
        "auth",
      );
    }
    if (!r.sessionId) throw new RouterError("The router didn't accept the sign-in.", "auth");
    this.remember(str(r.sessionId));
  }

  async logout() {
    if (!this.sessionId) return;
    await this.call({ cmd: CMD.LOGOUT, method: "POST" }, { auth: false }).catch(() => undefined);
    this.remember("");
  }

  async isLoggedIn() {
    if (!this.sessionId) return false;
    try {
      const r = await this.call({ cmd: CMD.DHCPCLIENT_INFO, method: "GET" }, { auth: false });
      return r.success !== false && str(r.message) !== "NO_AUTH";
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- overview

  getOverview(): Promise<Overview> {
    return this.lock.run(async () => {
      const [sys, net, ver, init] = await Promise.all([
        this.get(CMD.SYS_INFO),
        this.get(CMD.SYS_INFO_NETWORK).catch(() => ({}) as Json),
        this.get(CMD.DEVICE_VERSION_INFO).catch(() => ({}) as Json),
        this.get(CMD.INIT_PAGE).catch(() => ({}) as Json),
      ]);
      const operator = str(net.spn_network_operator) || str(net.network_operator) || str(net.PLMN);
      const isp = detectIsp({ plmn: str(net.PLMN) || operator });
      const type = networkType(str(net.network_type_str));
      const online = /connect/i.test(str(sys.connectStatus)) && !/disconnect/i.test(str(sys.connectStatus));
      const devices = await this.deviceList().catch(() => [] as Device[]);
      const model = str(ver.board_type) || str(init.deviceType) || str(ver.module) || "4G router";
      const ispName: Record<string, string> = { dialog: "Dialog", mobitel: "Mobitel", slt: "SLT-Mobitel", hutch: "Hutch", airtel: "Airtel" };
      return {
        identity: {
          model,
          vendor: "Tozed",
          isp,
          firmware: str(ver.real_fwversion) || str(init.displayedVersion) || str(ver.modversion) || str(sys.softwareVersion) || undefined,
          hardware: str(ver.hwversion) || undefined,
        },
        uptime: parseUptime(str(sys.uptime)),
        dns: [str(sys.dns1 ?? sys.priDns), str(sys.dns2 ?? sys.secDns)].filter((d) => d && d !== "0.0.0.0"),
        lan: { ip: str(sys.lanIP) || new URL(this.ctx.baseUrl).hostname, netmask: str(sys.lanMaskIp) || undefined, mac: str(sys.lanMac) || undefined, dhcp: sys.dhcpServer === undefined || sys.dhcpServer === "" ? undefined : enabled(sys.dhcpServer) },
        internet: { online, publicIp: str(sys.wanIP ?? sys.wan_ip) || undefined, protocol: type ? `Mobile data (${type})` : "Mobile data" },
        wan: [{ name: "Mobile data", kind: "internet", protocol: type ?? "Cellular", ipv4: str(sys.wanIP ?? sys.wan_ip) || undefined, up: online }],
        cellular: {
          // The router reports a numeric network code (e.g. 41311); show the provider's name.
          operator: (/^\d+$/.test(operator) && isp ? ispName[isp] : operator) || undefined,
          networkType: type,
          bars: num(net.signal_lvl),
          rsrp: num(net.RSRP),
          rsrq: num(net.RSRQ),
          sinr: num(net.SINR),
          rssi: num(net.RSSI),
          band: str(net.currentband) ? `B${str(net.currentband).replace(/^B/i, "")}` : undefined,
        },
        deviceCount: devices.filter((d) => d.online).length,
        fetchedAt: Date.now(),
      } satisfies Overview;
    });
  }

  // ---------------------------------------------------------------- devices & access control

  private async deviceList(): Promise<Device[]> {
    const [dhcp, w24, w5] = await Promise.all([
      this.get(CMD.DHCPCLIENT_INFO),
      this.get(CMD.WIFI24G_LIST_INFO).catch(() => ({}) as Json),
      this.get(CMD.WIFI5G_LIST_INFO).catch(() => ({}) as Json),
    ]);
    const list = (v: unknown) => (Array.isArray(v) ? (v as Json[]) : []);
    const wifi = new Map<string, { band: Band; ip?: string; rssi?: number; host?: string; rate?: number }>();
    for (const [band, rows] of [
      ["2.4GHz", list(w24.wlan24g_wifi_info)],
      ["5GHz", list(w5.wlan5g_wifi_info ?? w5.wlan24g_wifi_info)],
    ] as [Band, Json[]][]) {
      for (const r of rows) {
        const mac = normalizeMac(str(r.mac));
        // rssi comes without its sign ("51" = -51 dBm).
        const rssi = num(r.rssi);
        if (mac) wifi.set(mac, { band, ip: str(r.ip) || undefined, rssi: rssi === undefined ? undefined : -Math.abs(rssi), host: str(r.user) || undefined, rate: num(r.rxrate) });
      }
    }
    const devices = new Map<string, Device>();
    for (const r of list(dhcp.dhcp_list_info)) {
      const mac = normalizeMac(str(r.mac));
      if (!mac) continue;
      const w = wifi.get(mac);
      const host = str(r.hostname);
      devices.set(mac, {
        mac,
        hostname: host && !/^(unknown|\*|-)$/i.test(host) ? host : w?.host,
        ipv4: str(r.ip) || w?.ip,
        medium: w ? "wifi" : "wired",
        band: w?.band,
        signal: w?.rssi,
        linkMbps: w?.rate,
        online: true,
        blocked: false,
      });
    }
    for (const [mac, w] of wifi)
      if (!devices.has(mac)) devices.set(mac, { mac, hostname: w.host, ipv4: w.ip, medium: "wifi", band: w.band, signal: w.rssi, online: true, blocked: false });
    return [...devices.values()];
  }

  /** MAC rules + default policy. acceptAll=true: rules block (block list); false: rules allow (allow list). */
  private async readMacFilter() {
    const [rules, def] = await Promise.all([this.get(CMD.MAC_FILTER, { getfun: true }), this.get(CMD.MAC_DEFAULT_FILTER)]);
    const list = (Array.isArray(rules.datas) ? rules.datas : []) as Rule[];
    const defaults = (Array.isArray(def.datas) ? def.datas : []) as Json[];
    const acceptAll = defaults.length ? enabled(defaults[0].acceptAll) : true;
    return {
      rules: list,
      defaults,
      mode: (acceptAll ? "blocklist" : "allowlist") as AccessMode,
      macs: list.filter((r) => enabled(r.enableLink ?? true)).map((r) => normalizeMac(str(r.mac))).filter((m): m is string => !!m),
    };
  }

  private async writeMacFilter(mode: AccessMode, macs: string[], keep: Rule[]) {
    const unique = [...new Set(macs)];
    if (unique.length > MAX_RULES) throw new RouterError(`This router's list holds at most ${MAX_RULES} devices.`, "validation");
    if (mode === "allowlist" && !unique.length) throw new RouterError("Add at least one device to the allow list first.", "validation");
    const byMac = new Map(keep.map((r) => [normalizeMac(str(r.mac)), r]));
    const datas: Rule[] = unique.map((mac) => ({
      ...(byMac.get(mac) ?? {}),
      enableLink: true,
      remark: str(byMac.get(mac)?.remark) || "RouterDeck",
      ippro: "IPV4V6", // block over IPv6 too
      mac: mac.toUpperCase(),
    }));
    await this.post(CMD.MAC_FILTER, { success: true, datas });
    const acceptAll = mode === "blocklist" ? "true" : "false";
    await this.post(CMD.MAC_DEFAULT_FILTER, {
      success: true,
      datas: [
        { enableRule: true, acceptAll, ippro: "IPV4" },
        { enableRule: true, acceptAll, ippro: "IPV6" },
      ],
    });
    await this.post(CMD.APPLY_FILTER);
  }

  getDevices(): Promise<Device[]> {
    return this.lock.run(async () => {
      const devices = await this.deviceList();
      const f = await this.readMacFilter().catch(() => null);
      if (!f) return devices;
      const listed = new Set(f.macs);
      const allow = f.mode === "allowlist";
      for (const d of devices) d.blocked = allow ? !listed.has(d.mac) : listed.has(d.mac);
      for (const mac of listed) if (!devices.some((d) => d.mac === mac)) devices.push({ mac, medium: "unknown", online: false, blocked: !allow });
      return devices;
    });
  }

  getAccessControl(): Promise<AccessControl> {
    return this.lock.run(async () => {
      const f = await this.readMacFilter();
      return { mode: f.mode, macs: f.macs, supported: ["blocklist", "allowlist"] };
    });
  }

  setAccessControl(mode: AccessMode, macs: string[]): Promise<void> {
    const list = macs.map((m) => normalizeMac(m)).filter((m): m is string => !!m);
    return this.lock.run(async () => {
      const f = await this.readMacFilter();
      await this.writeMacFilter(mode, list, f.rules);
    });
  }

  setDeviceBlocked(rawMac: string, blocked: boolean): Promise<void> {
    const mac = normalizeMac(rawMac);
    if (!mac) return Promise.reject(new RouterError("That doesn't look like a valid device address.", "validation"));
    return this.lock.run(async () => {
      const f = await this.readMacFilter();
      if (f.mode === "allowlist") {
        const next = blocked ? f.macs.filter((m) => m !== mac) : [...new Set([...f.macs, mac])];
        await this.writeMacFilter("allowlist", next, f.rules);
      } else {
        const next = blocked ? [...new Set([...f.macs, mac])] : f.macs.filter((m) => m !== mac);
        await this.writeMacFilter("blocklist", next, f.rules);
      }
    });
  }

  // ---------------------------------------------------------------- Wi-Fi

  private async readNet(cmd: number, subcmd: number) {
    const r = await this.get(cmd, { subcmd });
    return {
      r,
      on: str(r.wifiOpen) === "1",
      broadcast: str(r.broadcast) !== "0",
      ssid: str(r.ssid) ? unb64(str(r.ssid)) : "",
      key: str(r.key),
      cipherSuite: str(r.cipherSuite),
      auth: str(r.authenticationType),
    };
  }

  private async writeNet(cmd: number, subcmd: number, v: { on: boolean; broadcast: boolean; ssid: string; key: string; cipherSuite: string; auth: string }) {
    await this.post(cmd, {
      subcmd,
      wifiOpen: v.on ? "1" : "0",
      broadcast: v.broadcast ? "1" : "0",
      ssid: b64(v.ssid),
      key: v.key,
      cipherSuite: v.cipherSuite,
      authenticationType: v.auth,
    });
  }

  private radios(): { band: Band; cmd: number }[] {
    return [
      { band: "2.4GHz", cmd: CMD.WIRELESS_CONFIG },
      { band: "5GHz", cmd: CMD.WIRELESS5G_CONFIG },
    ];
  }

  getWifi(): Promise<WifiNetwork[]> {
    return this.lock.run(async () => {
      const out: WifiNetwork[] = [];
      for (const { band, cmd } of this.radios()) {
        const n = await this.readNet(cmd, 0).catch(() => null);
        if (!n || (!n.ssid && !n.on)) continue;
        out.push({
          id: String(cmd),
          band,
          enabled: n.on,
          ssid: n.ssid,
          password: n.auth === "0" ? undefined : n.key,
          security: n.auth === "0" ? "Open (no password)" : n.auth === "4" || n.auth === "5" ? "WPA3-Personal" : "WPA2-Personal",
          hidden: !n.broadcast,
          editable: { ssid: true, password: n.auth !== "0", enabled: true },
        });
      }
      return out;
    });
  }

  updateWifi(id: string, patch: WifiPatch): Promise<void> {
    if (patch.ssid !== undefined && (!patch.ssid.trim() || patch.ssid.length > 32)) return Promise.reject(new RouterError("Network name must be 1-32 characters.", "validation"));
    if (patch.password !== undefined && (patch.password.length < 8 || patch.password.length > 63)) return Promise.reject(new RouterError("Wi-Fi password must be 8-63 characters.", "validation"));
    const cmd = Number(id);
    return this.lock.run(async () => {
      const cur = await this.readNet(cmd, 0);
      await this.writeNet(cmd, 0, {
        on: patch.enabled ?? cur.on,
        broadcast: cur.broadcast,
        ssid: patch.ssid?.trim() ?? cur.ssid,
        key: patch.password ?? cur.key,
        cipherSuite: cur.cipherSuite,
        auth: cur.auth,
      });
    });
  }

  // ---------------------------------------------------------------- guest Wi-Fi (second network per band)

  getGuestWifi(slot = 0): Promise<GuestWifi> {
    const sub = guestSubcmd(slot);
    return this.lock.run(async () => {
      const bands: Band[] = [];
      let ssid = "", password = "";
      for (const { band, cmd } of this.radios()) {
        const g = await this.readNet(cmd, sub).catch(() => null);
        if (g?.on) {
          bands.push(band);
          ssid ||= g.ssid;
          password ||= g.key;
        }
      }
      return {
        enabled: bands.length > 0,
        ssid: ssid || undefined,
        password: password || undefined,
        bands,
        availableBands: ["2.4GHz", "5GHz"],
        canIsolate: false,
        networkSlots: GUEST_SLOTS,
        slot,
      };
    });
  }

  setGuestWifi(cfg: GuestWifiConfig): Promise<void> {
    if (cfg.enabled) {
      if (!cfg.ssid?.trim() || cfg.ssid.length > 32) return Promise.reject(new RouterError("Guest network name must be 1-32 characters.", "validation"));
      if (!cfg.password || cfg.password.length < 8 || cfg.password.length > 63) return Promise.reject(new RouterError("Guest password must be 8-63 characters.", "validation"));
    }
    const sub = guestSubcmd(cfg.slot);
    return this.lock.run(async () => {
      for (const { band, cmd } of this.radios()) {
        const cur = await this.readNet(cmd, sub).catch(() => null);
        if (!cur) continue;
        const want = cfg.enabled && (!cfg.bands?.length || cfg.bands.includes(band));
        if (!want) {
          if (cur.on) await this.writeNet(cmd, sub, { ...cur, on: false });
          continue;
        }
        // Same security as the main network on this band (WPA2/WPA3-Personal), never open.
        const main = await this.readNet(cmd, 0);
        const auth = cur.auth && cur.auth !== "0" ? cur.auth : main.auth && main.auth !== "0" ? main.auth : cur.auth;
        const cipherSuite = cur.cipherSuite || main.cipherSuite;
        const ssid = cfg.ssid!.trim();
        if (cur.on && cur.ssid === ssid && cur.key === cfg.password && cur.broadcast) continue;
        await this.writeNet(cmd, sub, { on: true, broadcast: true, ssid, key: cfg.password!, cipherSuite, auth });
      }
    });
  }

  // ---------------------------------------------------------------- website blocking

  private async readUrls() {
    const [rules, def] = await Promise.all([this.get(CMD.URL_FILTER, { getfun: true }), this.get(CMD.URL_DEFAULT_FILTER).catch(() => ({}) as Json)]);
    const defaults = (Array.isArray(def.datas) ? def.datas : []) as Json[];
    return { rules: (Array.isArray(rules.datas) ? rules.datas : []) as Rule[], acceptAll: defaults.length ? enabled(defaults[0].acceptAll) : true };
  }

  getSiteBlocking(): Promise<SiteBlocking> {
    return this.lock.run(async () => {
      const u = await this.readUrls();
      return {
        enabled: u.acceptAll && u.rules.some((r) => enabled(r.enableLink ?? true)),
        sites: u.rules.map((r, i) => ({ id: String(i), pattern: str(r.url) })).filter((s) => s.pattern),
      };
    });
  }

  setSiteBlockingEnabled(on: boolean): Promise<void> {
    return this.lock.run(async () => {
      const u = await this.readUrls();
      await this.post(CMD.URL_FILTER, { success: true, datas: u.rules.map((r) => ({ ...r, enableLink: on })) });
      await this.post(CMD.APPLY_FILTER);
    });
  }

  addBlockedSite(pattern: string): Promise<void> {
    const url = pattern.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    if (!url) return Promise.reject(new RouterError("Enter a website, like youtube.com.", "validation"));
    return this.lock.run(async () => {
      const u = await this.readUrls();
      if (u.rules.some((r) => str(r.url) === url)) return;
      if (u.rules.length >= MAX_RULES) throw new RouterError(`This router's website list holds at most ${MAX_RULES} entries.`, "validation");
      await this.post(CMD.URL_FILTER, { success: true, datas: [...u.rules, { enableLink: true, remark: "RouterDeck", ippro: "IPV4V6", url }] });
      await this.post(CMD.APPLY_FILTER);
    });
  }

  removeBlockedSite(id: string): Promise<void> {
    return this.lock.run(async () => {
      const u = await this.readUrls();
      await this.post(CMD.URL_FILTER, { success: true, datas: u.rules.filter((_, i) => String(i) !== id) });
      await this.post(CMD.APPLY_FILTER);
    });
  }

  // ---------------------------------------------------------------- admin

  changeAdminPassword(current: string, next: string): Promise<void> {
    return this.lock.run(async () => {
      const r = await this.call({ cmd: CMD.CHANGE_PASSWD, method: "POST", newPasswd: b64(next), old_passwd: b64(current), subcmd: 0 });
      if (str(r.message) !== "success") throw new RouterError("The router didn't accept that. Check the current password.", "rejected");
    });
  }

  reboot(): Promise<void> {
    return this.lock.run(async () => {
      await this.call({ cmd: CMD.SYS_REBOOT, method: "POST", rebootType: 1 }, { timeoutMs: 8000 }).catch((e) => {
        // The router often drops the connection as it restarts.
        if (e instanceof RouterError && e.code === "session-expired") throw e;
      });
    });
  }
}

export const tozed: DriverFactory = {
  id: "tozed",
  name: "Dialog / Tozed 4G",
  knownModels: ["Dialog Home Broadband 4G routers (Tozed / Highwmg web UI) · Dialog"],
  beta: true,
  candidateHosts: ["http://192.168.8.1"],
  async probe(ctx, home) {
    const looks = /cgi-bin\/http\.cgi|js\/helper\.js|fy-alert\.js/i.test(home.body);
    try {
      const res = await ctx.transport.request({
        url: ctx.baseUrl + CGI,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cmd: CMD.SYS_INFO_NETWORK, method: "GET", sessionId: "", language: "EN" }),
        timeoutMs: 5000,
      });
      const j = JSON.parse(res.body.slice(Math.max(0, res.body.indexOf("{")))) as Json;
      if (j && j.cmd !== undefined && ("success" in j || "RSRP" in j)) {
        return { confidence: 0.93, model: "Dialog 4G router", defaultUsername: "admin", isp: detectIsp({ plmn: str(j.PLMN) || str(j.network_operator) }) };
      }
    } catch {}
    return looks ? { confidence: 0.4, model: "4G router", defaultUsername: "admin" } : null;
  },
  create: (ctx) => new TozedDriver(ctx),
};
