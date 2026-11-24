import { detectIsp } from "../isp";
import { md5 } from "../md5";
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
 * ZTE-style 4G/LTE routers and MiFi ("goform" web UI): ZTE MF283 / MF286 /
 * MF920 / MF971 and the many 4G CPE boxes that ship the same web interface
 * (e.g. RDA-based CPEs sold with SLT-Mobitel, Dialog and Mobitel SIMs).
 *
 * The web UI talks JSON to two endpoints:
 *   POST /goform/goform_get_cmd_process  cmd=a,b,c&multi_data=1   (read)
 *   POST /goform/goform_set_cmd_process  goformId=ACTION&…         (write)
 * Login is per client (no cookie). Values are only filled in once signed in.
 */

const GET = "/goform/goform_get_cmd_process";
const SET = "/goform/goform_set_cmd_process";

/** Wi-Fi MAC filter (the router's only device control) holds at most 10 entries. */
const MAX_FILTER = 10;

const LOGIN_ERRORS: Record<string, string> = {
  "1": "The router didn't accept the sign-in. Try again.",
  "2": "Someone else is signed in to this router right now. Sign out there first, or wait a few minutes.",
  "3": "Wrong password.",
  "5": "That username doesn't exist on this router.",
};

type Json = Record<string, unknown>;

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

function str(v: unknown): string {
  return v === undefined || v === null ? "" : String(v);
}

function num(v: unknown): number | undefined {
  const m = str(v).match(/-?\d+(\.\d+)?/);
  return m ? Number(m[0]) : undefined;
}

function fmtDuration(sec?: number) {
  if (!sec || !Number.isFinite(sec)) return undefined;
  const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60);
  return [d && `${d}d`, (d || h) && `${h}h`, `${m}m`].filter(Boolean).join(" ");
}

function networkType(t: string): string | undefined {
  const s = t.toUpperCase();
  if (!s || /NO_SERVICE|LIMITED/.test(s)) return undefined;
  if (/NR|5G/.test(s)) return "5G";
  if (/LTE[-_ ]?A|LTE\+|CA/.test(s)) return "4G+";
  if (/LTE|4G/.test(s)) return "4G";
  if (/HSPA\+|DC-HSPA/.test(s)) return "3G+";
  if (/WCDMA|UMTS|HSPA|HSDPA|HSUPA|TD|3G/.test(s)) return "3G";
  if (/GSM|EDGE|GPRS|2G/.test(s)) return "2G";
  return t;
}

const SECURITY: Record<string, string> = {
  OPEN: "Open (no password)",
  SHARED: "WEP",
  WPAPSK: "WPA-Personal",
  WPA2PSK: "WPA2-Personal",
  WPAPSKWPA2PSK: "WPA/WPA2-Personal",
  WPAWPA2PSKTKIP: "WPA/WPA2-Personal",
  WPAWPA2PSKAES: "WPA/WPA2-Personal",
  WPA3PSK: "WPA3-Personal",
  WPA3PSKWPA2PSK: "WPA2/WPA3-Personal",
};

const fmtMac = (mac: string) => mac.toUpperCase();

class ZteGoformDriver implements RouterDriver {
  readonly id = "zte-goform";
  readonly name = "4G router (ZTE-style)";
  readonly capabilities = {
    devices: true,
    blockDevices: true,
    wifi: true,
    siteBlocking: true,
    adminPassword: true,
    reboot: true,
    fiber: false,
    advanced: false,
    /** Blocking here keeps a device off the Wi-Fi entirely (MAC filter). */
    blockScope: "wifi" as const,
  };
  private lock = new Mutex();
  private username = "admin";
  private passwordEncode?: boolean;

  constructor(private ctx: DriverContext) {}

  get baseUrl() {
    return this.ctx.baseUrl;
  }

  // ---------------------------------------------------------------- transport

  private async post(path: string, params: Record<string, string>): Promise<Json> {
    const body = new URLSearchParams({ isTest: "false", ...params }).toString();
    const res = await this.ctx.transport.request({
      url: this.ctx.baseUrl + path,
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
      body,
      timeoutMs: 20000,
    });
    if (res.status >= 400) throw new RouterError(`The router answered ${res.status}.`, "unknown");
    try {
      return JSON.parse(res.body) as Json;
    } catch {
      if (/page not found|bad request/i.test(res.body)) throw new RouterError("The router refused that request.", "rejected");
      throw new RouterError("The router sent something RouterDeck couldn't read.", "parse");
    }
  }

  private read(cmds: string[]): Promise<Json> {
    return this.post(GET, cmds.length > 1 ? { cmd: cmds.join(","), multi_data: "1" } : { cmd: cmds[0] });
  }

  /** Reads that need a session: throws session-expired if we aren't signed in any more. */
  private async readAuthed(cmds: string[]): Promise<Json> {
    const r = await this.read([...cmds, "loginfo"]);
    if (str(r.loginfo) !== "ok") throw new RouterError("Your router session expired. Please sign in again.", "session-expired");
    return r;
  }

  private async action(goformId: string, params: Record<string, string> = {}): Promise<Json> {
    const r = await this.post(SET, { goformId, ...params });
    const result = str(r.result);
    if (result && result !== "success" && result !== "0") {
      if (/login|auth/i.test(result)) throw new RouterError("Your router session expired. Please sign in again.", "session-expired");
      throw new RouterError("The router rejected that change.", "rejected");
    }
    return r;
  }

  /** Some firmwares send passwords as base64 (PASSWORD_ENCODE), older ones as plain text. */
  private async encodes(): Promise<boolean> {
    if (this.passwordEncode !== undefined) return this.passwordEncode;
    this.passwordEncode = true;
    try {
      const res = await this.ctx.transport.request({ url: this.ctx.baseUrl + "/js/config/config.js", timeoutMs: 8000 });
      const m = res.body.match(/PASSWORD_ENCODE\s*:\s*(!0|!1|true|false)/);
      if (m) this.passwordEncode = m[1] === "!0" || m[1] === "true";
    } catch {}
    return this.passwordEncode;
  }

  private async enc(s: string) {
    return (await this.encodes()) ? b64(s) : s;
  }

  // ---------------------------------------------------------------- session

  async login(username: string, password: string) {
    const user = username.trim() || "admin";
    const encode = await this.encodes();
    const r = await this.post(SET, {
      goformId: "LOGIN",
      username: b64(user),
      password: encode ? b64(md5(password)) : password,
    });
    const code = str(r.result);
    if (code === "0" || code === "4") {
      this.username = user;
      return;
    }
    let msg = LOGIN_ERRORS[code] ?? "The router didn't accept the sign-in.";
    try {
      const s = await this.read(["psw_fail_num_str", "login_lock_time"]);
      const left = num(s.psw_fail_num_str);
      if (left === 0) msg = "Too many wrong passwords. The router is locked for a few minutes; try again later.";
      else if (code === "3" && left !== undefined) msg = `Wrong password. ${left} ${left === 1 ? "try" : "tries"} left before the router locks for a few minutes.`;
    } catch {}
    throw new RouterError(msg, code === "2" ? "rejected" : "auth");
  }

  async logout() {
    await this.action("LOGOUT").catch(() => undefined);
  }

  async isLoggedIn() {
    try {
      return str((await this.read(["loginfo"])).loginfo) === "ok";
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------- overview

  getOverview(): Promise<Overview> {
    return this.lock.run(async () => {
      const r = await this.readAuthed([
        "network_provider", "network_type", "signalbar", "rssi", "lte_rsrp", "lte_rsrq", "lte_snr", "lte_band",
        "ppp_status", "wan_ipaddr", "realtime_time", "prefer_dns_auto", "standby_dns_auto",
        "cr_version", "wa_inner_version", "hardware_version", "real_device_version",
        "lan_ipaddr", "lan_netmask", "mac_address", "dhcpEnabled", "sta_count", "lan_station_count",
      ]);
      const provider = str(r.network_provider);
      const online = str(r.ppp_status) === "ppp_connected";
      const type = networkType(str(r.network_type));
      const model = str(r.real_device_version).split("_")[0] || "4G LTE router";
      const up = online ? fmtDuration(num(r.realtime_time)) : undefined;
      return {
        identity: {
          model,
          vendor: "ZTE-style 4G",
          isp: detectIsp({ plmn: provider }),
          firmware: str(r.wa_inner_version) || str(r.cr_version) || undefined,
          hardware: str(r.hardware_version) || undefined,
        },
        dns: [str(r.prefer_dns_auto), str(r.standby_dns_auto)].filter(Boolean),
        lan: {
          ip: str(r.lan_ipaddr) || new URL(this.ctx.baseUrl).hostname,
          netmask: str(r.lan_netmask) || undefined,
          dhcp: r.dhcpEnabled === undefined || r.dhcpEnabled === "" ? undefined : str(r.dhcpEnabled) === "1",
          mac: str(r.mac_address) || undefined,
        },
        internet: { online, publicIp: str(r.wan_ipaddr) || undefined, uptime: up, protocol: type ? `Mobile data (${type})` : "Mobile data" },
        wan: [{ name: "Mobile data", kind: "internet", protocol: type ?? "Cellular", ipv4: str(r.wan_ipaddr) || undefined, up: online, uptime: up }],
        cellular: {
          operator: provider || undefined,
          networkType: type,
          bars: num(r.signalbar),
          rsrp: num(r.lte_rsrp),
          rsrq: num(r.lte_rsrq),
          sinr: num(r.lte_snr),
          rssi: num(r.rssi),
          band: str(r.lte_band) ? `B${str(r.lte_band).replace(/^B/i, "")}` : undefined,
        },
        deviceCount: (num(r.sta_count) ?? 0) + (num(r.lan_station_count) ?? 0),
        fetchedAt: Date.now(),
      } satisfies Overview;
    });
  }

  // ---------------------------------------------------------------- devices & access control

  private async readFilter() {
    const r = await this.readAuthed(["ACL_mode", "wifi_mac_black_list", "wifi_mac_white_list", "client_mac_address"]);
    const list = (v: unknown) => str(v).split(";").map((m) => normalizeMac(m)).filter((m): m is string => !!m);
    const aclMode = str(r.ACL_mode);
    return {
      mode: (aclMode === "1" ? "allowlist" : "blocklist") as AccessMode,
      on: aclMode === "1" || aclMode === "2",
      black: list(r.wifi_mac_black_list),
      white: list(r.wifi_mac_white_list),
    };
  }

  private async writeFilter(mode: AccessMode, macs: string[]) {
    const unique = [...new Set(macs)];
    if (unique.length > MAX_FILTER) throw new RouterError(`This router's list holds at most ${MAX_FILTER} devices.`, "validation");
    if (mode === "allowlist") {
      if (!unique.length) throw new RouterError("Add at least one device to the allow list first.", "validation");
      await this.action("WIFI_MAC_FILTER", { ACL_mode: "1", wifi_mac_white_list: unique.map(fmtMac).join(";") });
    } else if (unique.length) {
      await this.action("WIFI_MAC_FILTER", { ACL_mode: "2", wifi_mac_black_list: unique.map(fmtMac).join(";") });
    } else {
      await this.action("WIFI_MAC_FILTER", { ACL_mode: "0" });
    }
  }

  getDevices(): Promise<Device[]> {
    return this.lock.run(async () => {
      const wifi = await this.readAuthed(["station_list"]);
      const lan = await this.read(["lan_station_list"]).catch(() => ({}) as Json);
      const filter = await this.readFilter().catch(() => null);
      const listed = new Set(filter?.on ? (filter.mode === "allowlist" ? filter.white : filter.black) : []);
      const allow = !!filter?.on && filter.mode === "allowlist";
      const isBlocked = (mac: string) => (allow ? !listed.has(mac) : listed.has(mac));
      const devices = new Map<string, Device>();
      const add = (raw: unknown, medium: Device["medium"]) => {
        for (const s of Array.isArray(raw) ? (raw as Json[]) : []) {
          const mac = normalizeMac(str(s.mac_addr));
          if (!mac) continue;
          const host = str(s.hostname);
          devices.set(mac, {
            mac,
            hostname: host && !/^(unknown|--|-|\*)$/i.test(host) ? host : undefined,
            ipv4: str(s.ip_addr || s.ip) || undefined,
            medium,
            band: medium === "wifi" ? "2.4GHz" : undefined,
            online: true,
            // The filter only covers Wi-Fi; cabled devices are never blocked by it.
            blocked: medium === "wifi" ? isBlocked(mac) : false,
          });
        }
      };
      add(wifi.station_list, "wifi");
      add(lan.lan_station_list, "wired");
      for (const mac of listed) if (!devices.has(mac)) devices.set(mac, { mac, medium: "wifi", online: false, blocked: !allow });
      return [...devices.values()];
    });
  }

  getAccessControl(): Promise<AccessControl> {
    return this.lock.run(async () => {
      const f = await this.readFilter();
      return { mode: f.mode, macs: f.on ? (f.mode === "allowlist" ? f.white : f.black) : [], supported: ["blocklist", "allowlist"] };
    });
  }

  setAccessControl(mode: AccessMode, macs: string[]): Promise<void> {
    const list = macs.map((m) => normalizeMac(m)).filter((m): m is string => !!m);
    return this.lock.run(() => this.writeFilter(mode, list));
  }

  setDeviceBlocked(rawMac: string, blocked: boolean): Promise<void> {
    const mac = normalizeMac(rawMac);
    if (!mac) return Promise.reject(new RouterError("That doesn't look like a valid device address.", "validation"));
    return this.lock.run(async () => {
      const lan = await this.read(["lan_station_list"]).catch(() => ({}) as Json);
      const wired = Array.isArray(lan.lan_station_list) && (lan.lan_station_list as Json[]).some((s) => normalizeMac(str(s.mac_addr)) === mac);
      if (wired && blocked) throw new RouterError("This router can only block Wi-Fi devices. This one is connected by cable.", "unsupported");
      const f = await this.readFilter();
      if (f.on && f.mode === "allowlist") {
        const next = blocked ? f.white.filter((m) => m !== mac) : [...new Set([...f.white, mac])];
        if (!next.length) throw new RouterError("The allow list can't be empty. Switch back to the block list instead.", "validation");
        await this.writeFilter("allowlist", next);
      } else {
        const cur = f.on ? f.black : [];
        const next = blocked ? [...new Set([...cur, mac])] : cur.filter((m) => m !== mac);
        await this.writeFilter("blocklist", next);
      }
    });
  }

  // ---------------------------------------------------------------- Wi-Fi

  private async readWifi() {
    const encode = await this.encodes();
    const r = await this.readAuthed([
      "wifi_cur_state", "wifiEnabled", "SSID1", "AuthMode", "EncrypType", "HideSSID", "MAX_Access_num", "NoForwarding", "show_qrcode_flag", "m_show_qrcode_flag",
      encode ? "WPAPSK1_encode" : "WPAPSK1",
    ]);
    const raw = str(encode ? r.WPAPSK1_encode : r.WPAPSK1);
    return {
      r,
      enabled: str(r.wifi_cur_state || r.wifiEnabled) === "1",
      ssid: str(r.SSID1),
      password: raw ? (encode ? unb64(raw) : raw) : "",
      auth: str(r.AuthMode) || "WPA2PSK",
    };
  }

  getWifi(): Promise<WifiNetwork[]> {
    return this.lock.run(async () => {
      const w = await this.readWifi();
      return [
        {
          id: "ssid1",
          band: "2.4GHz",
          enabled: w.enabled,
          ssid: w.ssid,
          password: w.auth === "OPEN" ? undefined : w.password,
          security: SECURITY[w.auth] ?? w.auth,
          hidden: str(w.r.HideSSID) === "1",
          editable: { ssid: true, password: true, enabled: true },
        },
      ];
    });
  }

  updateWifi(_id: string, patch: WifiPatch): Promise<void> {
    if (patch.ssid !== undefined && (!patch.ssid.trim() || patch.ssid.length > 32)) return Promise.reject(new RouterError("Network name must be 1-32 characters.", "validation"));
    if (patch.password !== undefined && (patch.password.length < 8 || patch.password.length > 63)) return Promise.reject(new RouterError("Wi-Fi password must be 8-63 characters.", "validation"));
    return this.lock.run(async () => {
      if (patch.enabled !== undefined) {
        await this.action("SET_WIFI_INFO", { wifiEnabled: patch.enabled ? "1" : "0" });
        if (!patch.enabled) return;
      }
      if (patch.ssid === undefined && patch.password === undefined) return;
      const cur = await this.readWifi();
      const ssid = patch.ssid?.trim() ?? cur.ssid;
      const password = patch.password ?? cur.password;
      const auth = cur.auth === "OPEN" || cur.auth === "SHARED" ? "WPAPSKWPA2PSK" : cur.auth;
      const cipher = auth === "WPA2PSK" ? "1" : auth === "WPAPSKWPA2PSK" ? "2" : "3";
      const common = {
        ssid,
        broadcastSsidEnabled: str(cur.r.HideSSID) === "1" ? "1" : "0",
        security_mode: auth,
        cipher,
        security_shared_mode: cipher,
        NoForwarding: str(cur.r.NoForwarding) === "1" ? "1" : "0",
        show_qrcode_flag: str(cur.r.show_qrcode_flag || cur.r.m_show_qrcode_flag) === "1" ? "1" : "0",
        passphrase: await this.enc(password),
      };
      const station = str(cur.r.MAX_Access_num) || "32";
      // This firmware family saves the main network through SSID1 on most
      // builds and SSID4 on some: try each, then confirm it really changed.
      const attempts: [string, Record<string, string>][] = [
        ["SET_WIFI_SSID1_SETTINGS", { ...common, MAX_Access_num: station }],
        ["SET_WIFI_SSID4_SETTINGS", { ...common, MAX_Access_num2: station }],
      ];
      for (const [goformId, params] of attempts) {
        await this.action(goformId, params).catch(() => undefined);
        // Saving restarts the radio; give it time, then confirm it took.
        for (let i = 0; i < 6; i++) {
          await new Promise((r) => setTimeout(r, 2500));
          const after = await this.readWifi().catch(() => null);
          if (after && after.ssid === ssid && (patch.password === undefined || after.password === password)) return;
        }
      }
      throw new RouterError("The router didn't apply the new Wi-Fi settings. Try again, or change them on the router's own page.", "rejected");
    });
  }

  // ---------------------------------------------------------------- website blocking

  getSiteBlocking(): Promise<SiteBlocking> {
    return this.lock.run(async () => {
      const r = await this.readAuthed(["websURLFilters"]);
      const sites = str(r.websURLFilters)
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((pattern, i) => ({ id: String(i), pattern }));
      return { enabled: true, sites };
    });
  }

  async setSiteBlockingEnabled(enabled: boolean) {
    if (!enabled) throw new RouterError("This router blocks the listed websites whenever the list isn't empty. Remove them to allow them again.", "unsupported");
  }

  addBlockedSite(pattern: string): Promise<void> {
    const p = pattern.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "");
    if (!p) return Promise.reject(new RouterError("Enter a website, like youtube.com.", "validation"));
    return this.lock.run(async () => {
      await this.action("URL_FILTER_ADD", { addURLFilter: p });
    });
  }

  removeBlockedSite(id: string): Promise<void> {
    return this.lock.run(async () => {
      await this.action("URL_FILTER_DELETE", { url_filter_delete_id: `${id};` });
    });
  }

  // ---------------------------------------------------------------- admin

  changeAdminPassword(current: string, next: string): Promise<void> {
    return this.lock.run(async () => {
      const r = await this.post(SET, {
        goformId: "CHANGE_PASSWORD",
        newUsername: await this.enc(this.username),
        oldPassword: await this.enc(current),
        newPassword: await this.enc(next),
      });
      if (str(r.result) !== "success") throw new RouterError("The router didn't accept that. Check the current password.", "rejected");
    });
  }

  reboot(): Promise<void> {
    return this.lock.run(async () => {
      await this.action("REBOOT_DEVICE").catch((e) => {
        // The router often drops the connection as it restarts.
        if (!(e instanceof RouterError) || e.code === "rejected") throw e;
      });
    });
  }
}

export const zteGoform: DriverFactory = {
  id: "zte-goform",
  name: "ZTE-style 4G/LTE",
  knownModels: ["4G LTE routers with the ZTE web UI (ZTE MF283, MF286, MF920 and similar CPEs) · SLT-Mobitel, Dialog, Mobitel"],
  beta: true,
  async probe(ctx, home) {
    const looks = /goform|require-jquery|data-main="js\/main"/i.test(home.body) || /webs|goahead/i.test(home.headers["server"] ?? "");
    try {
      const res = await ctx.transport.request({
        url: ctx.baseUrl + GET,
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "X-Requested-With": "XMLHttpRequest" },
        body: "isTest=false&cmd=network_provider,network_type,cr_version,wa_inner_version,modem_main_state&multi_data=1",
        timeoutMs: 5000,
      });
      const j = JSON.parse(res.body) as Json;
      if (j && typeof j === "object" && ("network_provider" in j || "modem_main_state" in j)) {
        return { confidence: 0.92, model: "4G LTE router", defaultUsername: "admin", isp: detectIsp({ plmn: str(j.network_provider) }) };
      }
    } catch {}
    return looks ? { confidence: 0.3, model: "4G router", defaultUsername: "admin" } : null;
  },
  create: (ctx) => new ZteGoformDriver(ctx),
};
