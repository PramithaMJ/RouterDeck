import { RouterPage, type CapturedSubmit, type PageSnapshot, type SubmitSpec, type TableSnapshot } from "../../runtime/page";
import { detectIsp } from "../../isp";
import type {
  GuestWifi,
  GuestWifiConfig,
  AccessControl,
  AccessMode,
  AdvancedGroup,
  Band,
  LivePage,
  Device,
  DriverContext,
  DriverFactory,
  Overview,
  RouterDriver,
  SiteBlocking,
  WanConnection,
  WifiNetwork,
  WifiPatch,
} from "../../router/types";
import { RouterError } from "../../router/types";
import { TransportError } from "../../transport/types";
import { compactMac, encodeForm, Mutex, normalizeMac, parseNumber, parsePercent, sleep } from "../../router/util";
import { postSecurityFlag } from "./checksum";

/**
 * Driver for Realtek RTL960x based GPON/XPON ONTs running the "Boa" web
 * server. Verified on SLT-Mobitel HG7 (fw v1.0.18). Many ISP-branded fiber
 * routers in Sri Lanka and elsewhere share this firmware family.
 *
 * Every change is made by rendering the router's own settings page in a
 * sandbox, filling the form and capturing the request the page would send.
 * That keeps the router's own validation, hashing and form signing intact.
 */

const PAGES = {
  status: "/status.asp",
  pon: "/status_pon.asp",
  macFilter: "/fw-macfilter_rg.asp",
  wlanBasic: "/wlbasic.asp",
  wlanSecurity: "/wlwpa.asp",
  urlBlocking: "/url_blocking.asp",
  password: "/password.asp",
  reboot: "/reboot.asp",
  ipv6: "/ipv6_enabledisable.asp",
  multiAp: "/admin/wlmultipleap.asp",
  wlStations: "/wlstatbl.asp",
  loginCandidates: ["/admin/login.asp", "/login.asp"],
};

type Station = { band: Band; signal?: number; linkMbps?: number };

const ALREADY_LOGGED_IN = /logined|logout at first|already (logged|login)|another user/i;
const ERROR_WORDS = /\b(error|fail(ed|ure)?|invalid|incorrect|wrong|not allowed|denied|exceed(ed)?|duplicate|already exist|cannot|can't|illegal)\b/i;

function looksLikeLogin(body: string, url = "") {
  return /name=["']?cmlogin|formLogin|<title>\s*login\s*<\/title>/i.test(body) || /\/login\.asp/i.test(url);
}

/** Like htmlToText but keeps line structure (for diagnostics output). */
function htmlToLines(html: string) {
  const marked = html.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|tr|li|h\d|pre)>/gi, "\n");
  const t = new DOMParser().parseFromString(marked, "text/html").body?.textContent ?? "";
  return t
    .split("\n")
    .map((l) => l.replace(/[ \t\u00a0]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

function htmlToText(html: string) {
  return new DOMParser().parseFromString(html, "text/html").body?.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

/** Find a data table by (some of) its header labels. */
function findTable(snap: PageSnapshot, headers: string[]): { header: string[]; rows: TableSnapshot["rows"] } | null {
  for (const t of snap.tables) {
    const hi = t.rows.findIndex((r) => headers.every((h) => r.cells.some((c) => c.toLowerCase() === h.toLowerCase())));
    if (hi >= 0) return { header: t.rows[hi].cells, rows: t.rows.slice(hi + 1) };
  }
  return null;
}

/** All two-column "Label | value" rows across the page. */
function keyValues(snap: PageSnapshot): Map<string, string> {
  const m = new Map<string, string>();
  for (const t of snap.tables)
    for (const r of t.rows)
      if (r.cells.length === 2 && r.cells[0] && !m.has(r.cells[0].toLowerCase().replace(/:$/, "")))
        m.set(r.cells[0].toLowerCase().replace(/:$/, ""), r.cells[1]);
  return m;
}

function field(snap: PageSnapshot, form: string, name: string) {
  return snap.forms.find((f) => f.name === form)?.fields.filter((x) => x.name === name) ?? [];
}

function checkedValue(snap: PageSnapshot, form: string, name: string): string | undefined {
  const els = field(snap, form, name);
  if (!els.length) return undefined;
  if (els[0].type === "radio") return els.find((e) => e.checked)?.value;
  if (els[0].options) return els[0].options.find((o) => o.selected)?.value;
  return els[0].value;
}

function selectedLabel(snap: PageSnapshot, form: string, name: string): string | undefined {
  return field(snap, form, name)[0]?.options?.find((o) => o.selected)?.label;
}

function rowWithMac(rows: TableSnapshot["rows"], mac: string) {
  return rows.find((r) => r.cells.some((c) => normalizeMac(c) === mac));
}

function prettyUptime(raw?: string): string | undefined {
  if (!raw) return undefined;
  const m = raw.match(/(?:(\d+)\s*days?,?\s*)?(\d{1,2}):(\d{2})(?::(\d{2}))?/i);
  if (!m) return raw;
  const d = Number(m[1] ?? 0), h = Number(m[2]), min = Number(m[3]);
  return [d && `${d}d`, (d || h) && `${h}h`, `${min}m`].filter(Boolean).join(" ");
}

function wanKind(type: string): WanConnection["kind"] {
  const t = type.toUpperCase();
  if (t.includes("INTERNET")) return "internet";
  if (t.includes("VOICE") || t.includes("VOIP")) return "voice";
  if (t.includes("IPTV") || t.includes("OTHER")) return t.includes("IPTV") ? "iptv" : "other";
  return "other";
}

function securityLabel(raw?: string) {
  if (!raw) return "Unknown";
  if (/none/i.test(raw)) return "Open (no password)";
  if (/wpa\/wpa2|wpa2\/wpa/i.test(raw)) return "WPA/WPA2-Personal";
  if (/wpa3/i.test(raw)) return raw.replace(/-?PSK/i, "-Personal");
  if (/wpa2/i.test(raw)) return "WPA2-Personal";
  if (/wpa/i.test(raw)) return "WPA-Personal";
  if (/wep/i.test(raw)) return "WEP (insecure)";
  return raw;
}

class RealtekBoaDriver implements RouterDriver {
  readonly id = "realtek-boa";
  readonly name = "Realtek GPON (Boa)";
  readonly capabilities = {
    devices: true,
    blockDevices: true,
    wifi: true,
    siteBlocking: true,
    adminPassword: true,
    reboot: true,
    fiber: true,
    advanced: true,
  };

  private readonly lock = new Mutex();
  private ssidHint: string[] = [];
  constructor(private readonly ctx: DriverContext) {}

  get baseUrl() {
    return this.ctx.baseUrl;
  }

  private url(path: string) {
    return new URL(path, this.ctx.baseUrl + "/").toString();
  }

  private async get(path: string) {
    return this.ctx.transport.request({ url: this.url(path), timeoutMs: 30000 });
  }

  /** Render a page in the sandbox, failing fast if the session expired. */
  private async open(path: string): Promise<RouterPage> {
    const res = await this.get(path);
    if (looksLikeLogin(res.body, res.url)) throw new RouterError("Your router session expired. Please sign in again.", "session-expired");
    if (res.status >= 400) throw new RouterError(`The router answered ${res.status} for ${path}.`, "unknown");
    return RouterPage.open(this.ctx.transport, this.url(path), { html: res.body });
  }

  private async read(path: string): Promise<PageSnapshot> {
    const page = await this.open(path);
    try {
      return await page.snapshot();
    } finally {
      page.dispose();
    }
  }

  /** Send a captured form exactly as the router UI would. */
  private async send(pageUrl: string, cap: CapturedSubmit, opts: { tolerateDrop?: boolean } = {}) {
    if (!cap.submitted || !cap.pairs || !cap.action) {
      const msg = cap.alerts.filter(Boolean).join(" ") || "The router rejected these settings.";
      throw new RouterError(msg, "validation");
    }
    const pairs = cap.pairs.map(([k, v]) => [k, v] as [string, string]);
    const flag = pairs.find(([k]) => k === "postSecurityFlag");
    if (flag && !flag[1]) flag[1] = String(postSecurityFlag(pairs));
    const target = new URL(cap.action, pageUrl).toString();
    let res;
    try {
      res = await this.ctx.transport.request({
        url: target,
        method: cap.method === "get" ? "GET" : "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: encodeForm(pairs),
        // Some changes (MAC filter on/off, Wi-Fi) make the router reload its
        // firewall/radio before it answers. Give it time.
        timeoutMs: opts.tolerateDrop ? 8000 : 45000,
      });
    } catch (e) {
      if (opts.tolerateDrop) return;
      // The router often applies the change but answers late. Wait until it's
      // responsive again; callers then re-read state to confirm the result.
      if (e instanceof TransportError && e.code === "timeout") {
        await this.waitUntilResponsive();
        return;
      }
      throw e;
    }
    if (looksLikeLogin(res.body, res.url) && !/formLogin/.test(target)) {
      throw new RouterError("Your router session expired. Please sign in again.", "session-expired");
    }
    const text = htmlToText(res.body);
    if (text.length < 800 && ERROR_WORDS.test(text) && !/success/i.test(text)) {
      throw new RouterError(text.replace(/\s*(OK|Back|Close)\s*$/i, "").trim(), "rejected");
    }
    return res;
  }

  /** Polls the router until it answers again (after a slow apply), up to ~60s. */
  private async waitUntilResponsive() {
    const until = Date.now() + 60_000;
    while (Date.now() < until) {
      try {
        const r = await this.ctx.transport.request({ url: this.url(PAGES.status), timeoutMs: 8000 });
        if (r.status < 500) return;
      } catch {}
      await sleep(2500);
    }
    throw new RouterError("Your router is taking very long to apply the change. Wait a minute, then refresh to check.", "unknown");
  }

  /** open → fill → click → send → dispose */
  private async submit(path: string, spec: SubmitSpec, opts?: { tolerateDrop?: boolean }) {
    const page = await this.open(path);
    let cap: CapturedSubmit;
    try {
      cap = await page.capture(spec);
    } finally {
      page.dispose();
    }
    return this.send(page.url, cap, opts);
  }

  // ---------------------------------------------------------------- session

  async login(username: string, password: string): Promise<void> {
    return this.lock.run(async () => {
      // Already signed in (e.g. the browser shares a session with an open router tab)?
      // Use it. A second sign-in would be refused ("you have logined!").
      if (await this.checkSession()) return;
      try {
        await this.submitLogin(username, password);
      } catch (e) {
        if (!(e instanceof RouterError) || !ALREADY_LOGGED_IN.test(e.message)) throw e;
        // The router allows one admin at a time. Ask it to end that session, then retry once.
        await this.forceLogout();
        try {
          await this.submitLogin(username, password);
        } catch (e2) {
          if (e2 instanceof RouterError && ALREADY_LOGGED_IN.test(e2.message)) {
            throw new RouterError(
              "Your router allows only one sign-in at a time and someone is already signed in, often the router's own page (192.168.1.1) in another tab or device. Sign out or close it there, or wait about 5 minutes for the router to end it, then try again.",
              "auth",
            );
          }
          throw e2;
        }
      }
    });
  }

  private async findLoginPath(): Promise<string> {
    const home = await this.get("/");
    if (looksLikeLogin(home.body, home.url) && new URL(home.url).pathname !== "/") return new URL(home.url).pathname;
    for (const p of PAGES.loginCandidates) {
      const r = await this.get(p).catch(() => null);
      if (r && r.status < 400 && /cmlogin/i.test(r.body)) return p;
    }
    return "/";
  }

  private async submitLogin(username: string, password: string) {
    const loginPath = await this.findLoginPath();
    const page = await RouterPage.open(this.ctx.transport, this.url(loginPath));
    let cap: CapturedSubmit;
    try {
      cap = await page.capture({ form: "cmlogin", button: "save", values: { username, password } });
    } finally {
      page.dispose();
    }
    if (!cap.submitted) throw new RouterError(cap.alerts.join(" ") || "Enter your username and password.", "validation");
    const res = await this.send(page.url, cap).catch((e: Error) => {
      throw new RouterError(e.message || "Sign-in failed.", "auth");
    });
    const text = res ? htmlToText(res.body) : "";
    if (ALREADY_LOGGED_IN.test(text)) throw new RouterError(text.slice(0, 200), "auth");
    if (!(await this.checkSession())) {
      throw new RouterError(/locked|too many|try again later/i.test(text) ? text.slice(0, 200) : "Wrong username or password.", "auth");
    }
  }

  /** Best effort: end the router's current admin session. */
  private async forceLogout() {
    const tryPage = async (path: string) => {
      const r = await this.get(path).catch(() => null);
      if (!r || r.status >= 400 || !/formLogout/i.test(r.body)) return false;
      const page = await RouterPage.open(this.ctx.transport, this.url(path), { html: r.body });
      try {
        const snap = await page.snapshot();
        const form = snap.forms.find((f) => /formLogout/i.test(f.action));
        if (!form) return false;
        const btn = form.fields.find((f) => f.type === "submit" || f.type === "button");
        const cap = await page.capture({ form: form.index, button: btn?.name || btn?.text || "save" });
        await this.send(page.url, cap, { tolerateDrop: true }).catch(() => undefined);
        return true;
      } finally {
        page.dispose();
      }
    };
    if (await tryPage("/admin/logout.asp")) return;
    if (await tryPage("/")) return;
    await this.ctx.transport
      .request({ url: this.url("/boaform/admin/formLogout"), method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "save=Logout&submit-url=%2Fadmin%2Flogin.asp", timeoutMs: 6000 })
      .catch(() => undefined);
  }

  private async checkSession() {
    try {
      const r = await this.get(PAGES.status);
      return r.status < 400 && !looksLikeLogin(r.body, r.url);
    } catch {
      return false;
    }
  }

  isLoggedIn() {
    return this.lock.run(() => this.checkSession());
  }

  async logout(): Promise<void> {
    await this.lock.run(async () => {
      try {
        const home = await this.get("/");
        if (!looksLikeLogin(home.body, home.url)) {
          const page = await RouterPage.open(this.ctx.transport, this.url("/"), { html: home.body });
          const snap = await page.snapshot();
          const form = snap.forms.find((f) => /formLogout/i.test(f.action));
          if (form) {
            const cap = await page.capture({ form: form.index, button: form.fields.find((f) => f.type === "submit")?.name || "save" });
            page.dispose();
            await this.send(page.url, cap, { tolerateDrop: true });
          } else page.dispose();
        }
      } finally {
        await this.ctx.transport.resetSession?.(this.ctx.baseUrl);
      }
    });
  }

  // ---------------------------------------------------------------- status

  async getOverview(): Promise<Overview> {
    return this.lock.run(async () => {
      const snap = await this.read(PAGES.status);
      const kv = keyValues(snap);
      const wanT = findTable(snap, ["Interface", "Protocol", "Status"]);
      const wan: WanConnection[] = (wanT?.rows ?? []).map((r) => {
        const col = (h: string) => r.cells[wanT!.header.findIndex((x) => x.toLowerCase() === h.toLowerCase())] ?? "";
        const status = col("Status");
        return {
          name: col("Interface"),
          kind: wanKind(col("Connection Type")),
          protocol: col("Protocol"),
          ipv4: col("IP Address") || undefined,
          gateway: col("Gateway") || undefined,
          vlan: col("VLAN ID") || undefined,
          up: /^up/i.test(status),
          uptime: prettyUptime(status.split("/")[0]?.replace(/^up\s*/i, "")),
        };
      });
      const inet = wan.find((w) => w.kind === "internet") ?? wan.find((w) => w.ipv4);
      const devices = findTable(snap, ["MAC Address", "IPv4 Address"]);

      let fiber: Overview["fiber"];
      let ponVendor: string | undefined;
      try {
        const pon = keyValues(await this.read(PAGES.pon));
        ponVendor = pon.get("vendor name");
        fiber = {
          rxPowerDbm: parseNumber(pon.get("rx power")),
          txPowerDbm: parseNumber(pon.get("tx power")),
          temperatureC: parseNumber(pon.get("temperature")),
          status: pon.get("onu state"),
        };
      } catch {
        fiber = undefined;
      }

      return {
        identity: {
          model: kv.get("device name") || "Realtek GPON router",
          vendor: "Realtek",
          isp: detectIsp({ vendor: ponVendor, dns: (kv.get("name servers") ?? "").split(/[,\s]+/), ssids: this.ssidHint }),
          firmware: kv.get("software version"),
          hardware: kv.get("hardware version"),
        },
        uptime: prettyUptime(kv.get("uptime")),
        cpuPercent: parsePercent(kv.get("cpu usage")),
        memoryPercent: parsePercent(kv.get("memory usage")),
        dns: (kv.get("name servers") ?? "").split(/[,\s]+/).filter(Boolean),
        lan: {
          ip: kv.get("ip address") ?? new URL(this.ctx.baseUrl).hostname,
          netmask: kv.get("subnet mask"),
          dhcp: kv.has("dhcp server") ? /enable/i.test(kv.get("dhcp server")!) : undefined,
          mac: kv.get("mac address") ? normalizeMac(kv.get("mac address")!) ?? undefined : undefined,
        },
        internet: {
          online: !!inet?.up && !!inet.ipv4,
          publicIp: inet?.ipv4,
          gateway: inet?.gateway,
          uptime: inet?.uptime,
          protocol: inet?.protocol,
        },
        wan,
        fiber,
        deviceCount: devices?.rows.filter((r) => r.cells.some((c) => normalizeMac(c))).length ?? 0,
        fetchedAt: Date.now(),
      };
    });
  }

  // ---------------------------------------------------------------- devices

  private async readMacFilter() {
    const snap = await this.read(PAGES.macFilter);
    const table = findTable(snap, ["Source MAC Address"]);
    const blocked = (table?.rows ?? [])
      .map((r) => ({ row: r, mac: r.cells.map((c) => normalizeMac(c)).find(Boolean) ?? null }))
      .filter((x): x is { row: TableSnapshot["rows"][number]; mac: string } => !!x.mac);
    return {
      snap,
      enabled: checkedValue(snap, "formFilterDefault", "maccap") === "1",
      blacklist: checkedValue(snap, "formFilterDefault", "outAct") !== "0",
      rows: table?.rows ?? [],
      blocked,
    };
  }

  async getDevices(): Promise<Device[]> {
    return this.lock.run(async () => {
      const snap = await this.read(PAGES.status);
      const t = findTable(snap, ["MAC Address", "IPv4 Address"]);
      const idx = (h: string) => t?.header.findIndex((x) => x.toLowerCase().includes(h)) ?? -1;
      const [iDev, iName, iMac, iV4, iV6] = [idx("device"), idx("name"), idx("mac"), idx("ipv4"), idx("ipv6")];
      const filter = await this.readMacFilter().catch(() => null);
      const listed = new Set(filter?.enabled ? filter.blocked.map((b) => b.mac) : []);
      const allowlist = !!filter?.enabled && !filter.blacklist;
      const isBlocked = (mac: string) => (allowlist ? !listed.has(mac) : listed.has(mac));
      const blockedSet = new Set(allowlist ? [] : listed);

      const devices = new Map<string, Device>();
      for (const r of t?.rows ?? []) {
        const mac = normalizeMac(r.cells[iMac] ?? "");
        if (!mac) continue;
        const kind = (r.cells[iDev] ?? "").toUpperCase();
        const name = r.cells[iName];
        devices.set(mac, {
          mac,
          hostname: name && !/^(unknown|--|-)$/i.test(name) ? name : undefined,
          ipv4: r.cells[iV4] && r.cells[iV4] !== "--" ? r.cells[iV4] : undefined,
          ipv6: r.cells[iV6] && r.cells[iV6] !== "--" ? r.cells[iV6] : undefined,
          medium: kind.includes("WLAN") || kind.includes("WIFI") ? "wifi" : kind.includes("LAN") || kind.includes("ETH") ? "wired" : "unknown",
          online: true,
          blocked: isBlocked(mac),
        });
      }
      // Live Wi-Fi association tables: who is connected right now, on which band.
      const stations = await this.readStations().catch(() => new Map<string, Station>());
      for (const [mac, st] of stations) {
        const d = devices.get(mac) ?? { mac, medium: "wifi" as const, online: true, blocked: isBlocked(mac) };
        devices.set(mac, { ...d, medium: "wifi", online: true, band: st.band, signal: st.signal, linkMbps: st.linkMbps });
      }
      for (const mac of blockedSet)
        if (!devices.has(mac)) devices.set(mac, { mac, medium: "unknown", online: false, blocked: true });
      if (allowlist)
        for (const mac of listed)
          if (!devices.has(mac)) devices.set(mac, { mac, medium: "unknown", online: false, blocked: false });
      return [...devices.values()];
    });
  }

  private radioBands?: { idx: number; band: Band }[];

  /** Which wlan_idx is which band (HG7: 1 = 2.4 GHz, 0 = 5 GHz). Detected once. */
  private async radios() {
    if (!this.radioBands?.length) this.radioBands = await this.guestBands();
    return this.radioBands;
  }

  /** Wi-Fi clients associated right now, from the per-radio station tables. */
  private async readStations(): Promise<Map<string, Station>> {
    const out = new Map<string, Station>();
    for (const { idx, band } of await this.radios()) {
      let res = await this.get(`/boaform/formWlanRedirect?redirect-url=${encodeURIComponent(PAGES.wlStations)}&wlan_idx=${idx}`);
      if (!/RSSI|Tx Rate/i.test(res.body)) res = await this.get(PAGES.wlStations);
      if (looksLikeLogin(res.body, res.url)) throw new RouterError("Your router session expired. Please sign in again.", "session-expired");
      const doc = new DOMParser().parseFromString(res.body, "text/html");
      const rows = [...doc.querySelectorAll("tr")].map((tr) => [...tr.children].map((c) => (c.textContent ?? "").replace(/\s+/g, " ").trim()));
      const head = rows.find((r) => r.some((c) => /mac address/i.test(c)))?.map((c) => c.toLowerCase()) ?? [];
      const col = (re: RegExp) => head.findIndex((c) => re.test(c));
      const [iRate, iRssi] = [col(/rate/), col(/rssi|signal/)];
      for (const r of rows) {
        const mac = r.map((c) => normalizeMac(c)).find(Boolean);
        if (!mac) continue;
        const num = (i: number) => (i >= 0 ? parseFloat(r[i] ?? "") : NaN);
        const signal = num(iRssi), rate = num(iRate);
        out.set(mac, { band, signal: Number.isFinite(signal) ? signal : undefined, linkMbps: Number.isFinite(rate) ? rate : undefined });
      }
    }
    return out;
  }

  async setDeviceBlocked(rawMac: string, blocked: boolean): Promise<void> {
    const mac = normalizeMac(rawMac);
    if (!mac) throw new RouterError("That doesn't look like a valid device address.", "validation");
    return this.lock.run(async () => {
      let f = await this.readMacFilter();
      const allowlist = f.enabled && !f.blacklist;
      // In allow-list mode the list holds ALLOWED devices: blocking = removing.
      const wantListed = allowlist ? !blocked : blocked;
      if (allowlist) {
        if (wantListed) await this.addFilterMac(mac, f);
        else await this.removeFilterMac(mac, f);
        const after = await this.readMacFilter();
        if (after.blocked.some((b) => b.mac === mac) !== wantListed) throw new RouterError("The router accepted the request but the change didn't stick.", "rejected");
        return;
      }
      if (blocked) {
        if (!f.enabled) {
          await this.submit(PAGES.macFilter, { form: "formFilterDefault", button: "setSwitch", values: { maccap: "1" } });
          f = await this.readMacFilter();
        }
        if (!f.blacklist) {
          await this.submit(PAGES.macFilter, { form: "formFilterDefault", button: "setMacDft", values: { outAct: "1" } });
          f = await this.readMacFilter();
        }
        await this.addFilterMac(mac, f);
      } else {
        await this.removeFilterMac(mac, f);
      }
      const after = await this.readMacFilter();
      const isBlocked = after.blocked.some((b) => b.mac === mac);
      if (isBlocked !== blocked) throw new RouterError("The router accepted the request but the change didn't stick.", "rejected");
    });
  }

  private async addFilterMac(mac: string, f: Awaited<ReturnType<RealtekBoaDriver["readMacFilter"]>>) {
    if (f.blocked.some((b) => b.mac === mac)) return;
    // Try the compact format first (the router's own examples use it), then colons.
    let lastErr: unknown;
    for (const fmt of [compactMac(mac), mac.toUpperCase(), mac]) {
      try {
        await this.submit(PAGES.macFilter, { form: "formFilterAdd", button: "addFilterMac", values: { srcmac: fmt } });
        return;
      } catch (e) {
        lastErr = e;
        if (!(e instanceof RouterError && e.code === "validation")) break;
      }
    }
    throw lastErr;
  }

  private async removeFilterMac(mac: string, f: Awaited<ReturnType<RealtekBoaDriver["readMacFilter"]>>) {
    const row = rowWithMac(f.rows, mac);
    if (!row) return;
    const box = row.inputs.find((i) => i.type === "checkbox" && i.name);
    if (!box) throw new RouterError("Couldn't find this device in the router's list.", "parse");
    await this.submit(PAGES.macFilter, { form: "formFilterDel", button: "deleteSelFilterMac", values: { [box.name]: true } });
  }

  getAccessControl(): Promise<AccessControl> {
    return this.lock.run(async () => {
      const f = await this.readMacFilter();
      return {
        mode: f.enabled && !f.blacklist ? "allowlist" : "blocklist",
        macs: f.enabled ? f.blocked.map((b) => b.mac) : [],
        supported: ["blocklist", "allowlist"],
      };
    });
  }

  /**
   * Order matters so nobody gets locked out half-way:
   *  1. empty the list while still in block-list mode (blocks nobody),
   *  2. switch the mode,
   *  3. add the new entries.
   * If anything fails while turning on the allow list, we fall back to an
   * empty block list (= everyone allowed).
   */
  setAccessControl(mode: AccessMode, rawMacs: string[]): Promise<void> {
    const macs = [...new Set(rawMacs.map((m) => normalizeMac(m)).filter((m): m is string => !!m))];
    if (mode === "allowlist" && macs.length === 0) return Promise.reject(new RouterError("Add at least one device to the allow list.", "validation"));
    return this.lock.run(async () => {
      let f = await this.readMacFilter();
      if (!f.enabled) {
        await this.submit(PAGES.macFilter, { form: "formFilterDefault", button: "setSwitch", values: { maccap: "1" } });
        f = await this.readMacFilter();
      }
      const wantBlacklist = mode === "blocklist";
      try {
        if (f.blocked.length) {
          if (f.blacklist || mode === "blocklist") {
            await this.submit(PAGES.macFilter, { form: "formFilterDel", button: "deleteAllFilterMac" });
            f = await this.readMacFilter();
          }
        }
        if (f.blacklist !== wantBlacklist) {
          await this.submit(PAGES.macFilter, { form: "formFilterDefault", button: "setMacDft", values: { outAct: wantBlacklist ? "1" : "0" } });
          f = await this.readMacFilter();
        }
        if (!wantBlacklist && f.blocked.length) {
          // Coming from an existing allow list: drop entries not wanted any more.
          for (const b of f.blocked) if (!macs.includes(b.mac)) await this.removeFilterMac(b.mac, await this.readMacFilter());
        }
        for (const mac of macs) await this.addFilterMac(mac, await this.readMacFilter());
      } catch (e) {
        if (!wantBlacklist) {
          try {
            await this.submit(PAGES.macFilter, { form: "formFilterDefault", button: "setMacDft", values: { outAct: "1" } });
            await this.submit(PAGES.macFilter, { form: "formFilterDel", button: "deleteAllFilterMac" });
          } catch {}
        }
        throw e;
      }
    });
  }

  // ---------------------------------------------------------------- wi-fi

  private async selectRadio(index: number) {
    await this.get(`/boaform/formWlanRedirect?redirect-url=${encodeURIComponent(PAGES.wlanBasic)}&wlan_idx=${index}`);
  }

  private async readRadio(index: number): Promise<WifiNetwork | null> {
    await this.selectRadio(index);
    const basic = await this.read(PAGES.wlanBasic);
    if (checkedValue(basic, "wlanSetup", "wlan_idx") !== String(index)) return null;
    const sec = await this.read(PAGES.wlanSecurity);
    const bandLabel = selectedLabel(basic, "wlanSetup", "band") ?? "";
    const band: Band = /5\s*G/i.test(bandLabel) ? "5GHz" : /6\s*G/i.test(bandLabel) ? "6GHz" : "2.4GHz";
    const method = selectedLabel(sec, "formEncrypt", "security_method");
    const psk = field(sec, "formEncrypt", "pskValue")[0]?.value;
    return {
      id: String(index),
      band,
      enabled: !field(basic, "wlanSetup", "wlanDisabled")[0]?.checked,
      ssid: field(basic, "wlanSetup", "ssid")[0]?.value ?? "",
      password: /none/i.test(method ?? "") ? undefined : psk,
      security: securityLabel(method),
      channel: selectedLabel(basic, "wlanSetup", "chan"),
      editable: { ssid: true, password: true, enabled: true },
    };
  }

  async getWifi(): Promise<WifiNetwork[]> {
    return this.lock.run(async () => {
      const out: WifiNetwork[] = [];
      for (const i of [0, 1]) {
        const n = await this.readRadio(i).catch(() => null);
        if (n) out.push(n);
      }
      this.ssidHint = out.map((n) => n.ssid);
      return out.sort((a, b) => a.band.localeCompare(b.band));
    });
  }

  async updateWifi(id: string, patch: WifiPatch): Promise<void> {
    const index = Number(id);
    return this.lock.run(async () => {
      if (patch.ssid !== undefined || patch.enabled !== undefined) {
        await this.selectRadio(index);
        const values: Record<string, string | boolean> = {};
        if (patch.enabled !== undefined) values.wlanDisabled = !patch.enabled;
        if (patch.ssid !== undefined) values.ssid = patch.ssid.trim();
        await this.submit(PAGES.wlanBasic, { form: "wlanSetup", button: "save", values });
        await sleep(1500);
      }
      if (patch.password !== undefined) {
        await this.selectRadio(index);
        const snap = await this.read(PAGES.wlanSecurity);
        const method = checkedValue(snap, "formEncrypt", "security_method");
        const values: Record<string, string> = {};
        const order: string[] = [];
        if (checkedValue(snap, "formEncrypt", "wpaSSID") !== "0") {
          values.wpaSSID = "0";
          order.push("wpaSSID");
        }
        if (!method || method === "0" || method === "1") {
          // Open or WEP → upgrade to WPA2-Personal
          const opt = field(snap, "formEncrypt", "security_method")[0]?.options?.find((o) => /wpa2/i.test(o.label) && !/wpa\//i.test(o.label));
          values.security_method = opt?.value ?? "4";
          values.wpaAuth = "psk";
          order.push("security_method", "wpaAuth");
        }
        values.pskFormat = "0";
        values.pskValue = patch.password;
        order.push("pskFormat", "pskValue");
        await this.selectRadio(index);
        await this.submit(PAGES.wlanSecurity, { form: "formEncrypt", button: "save", values, order });
        await sleep(1500);
      }
    });
  }

  // ---------------------------------------------------------------- website blocking

  private async readUrlBlocking() {
    const snap = await this.read(PAGES.urlBlocking);
    const t = findTable(snap, ["FQDN"]);
    const rows = (t?.rows ?? []).filter((r) => r.cells.some((c) => c && c.toLowerCase() !== "select"));
    const iF = t?.header.findIndex((h) => h.toLowerCase() === "fqdn") ?? -1;
    return {
      enabled: checkedValue(snap, "url", "urlcap") === "1",
      rows,
      sites: rows.map((r) => (iF >= 0 ? r.cells[iF] : r.cells.find((c) => c.includes("."))) ?? "").filter(Boolean),
    };
  }

  getSiteBlocking(): Promise<SiteBlocking> {
    return this.lock.run(async () => {
      const r = await this.readUrlBlocking();
      return { enabled: r.enabled, sites: r.sites.map((s) => ({ id: s, pattern: s })) };
    });
  }

  setSiteBlockingEnabled(enabled: boolean) {
    return this.lock.run(async () => {
      await this.submit(PAGES.urlBlocking, { form: "url", button: "apply", values: { urlcap: enabled ? "1" : "0" } });
    });
  }

  addBlockedSite(pattern: string) {
    const site = pattern.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
    return this.lock.run(async () => {
      if (!site) throw new RouterError("Enter a website like youtube.com", "validation");
      const cur = await this.readUrlBlocking();
      if (!cur.enabled) await this.submit(PAGES.urlBlocking, { form: "url", button: "apply", values: { urlcap: "1" } });
      if (cur.sites.includes(site)) return;
      await this.submit(PAGES.urlBlocking, { form: "url", button: "addFQDN", values: { urlFQDN: site } });
    });
  }

  removeBlockedSite(id: string) {
    return this.lock.run(async () => {
      const cur = await this.readUrlBlocking();
      const row = cur.rows.find((r) => r.cells.includes(id));
      const box = row?.inputs.find((i) => i.type === "checkbox" && i.name);
      if (!box) return;
      await this.submit(PAGES.urlBlocking, { form: "url", button: "delFQDN", values: { [box.name]: true } });
    });
  }

  // ---------------------------------------------------------------- guest Wi-Fi
  //
  // Uses virtual access point slot 3 on each band. Slots 1-2 are taken by the
  // ISP (EasyMesh backhaul, PEO TV) and are never touched. Slot 3 gets its own
  // name and WPA2 password, broadcast on, "Relay Blocking" (client isolation) on.

  private static GUEST_SLOT = 3;

  private async guestBands(): Promise<{ idx: number; band: Band }[]> {
    const out: { idx: number; band: Band }[] = [];
    for (const idx of [1, 0]) {
      await this.selectRadio(idx);
      const basic = await this.read(PAGES.wlanBasic).catch(() => null);
      if (!basic || checkedValue(basic, "wlanSetup", "wlan_idx") !== String(idx)) continue;
      const label = selectedLabel(basic, "wlanSetup", "band") ?? "";
      out.push({ idx, band: /5\s*G/i.test(label) ? "5GHz" : "2.4GHz" });
    }
    return out;
  }

  private async readGuestSlot(idx: number) {
    const n = RealtekBoaDriver.GUEST_SLOT;
    await this.get(`/boaform/formWlanRedirect?redirect-url=${encodeURIComponent(PAGES.multiAp)}&wlan_idx=${idx}`);
    const snap = await this.read(PAGES.multiAp);
    const f = (name: string) => field(snap, "MultipleAP", name)[0];
    return {
      enabled: !!f(`wl_disable${n}`)?.checked,
      ssid: f(`wl_ssid${n}`)?.value,
      isolated: checkedValue(snap, "MultipleAP", `wl_access${n}`) === "1",
    };
  }

  /** Opens the security page for the guest slot and returns its live state. */
  private async openGuestSecurity(idx: number) {
    await this.selectRadio(idx);
    const page = await this.open(PAGES.wlanSecurity);
    const snap = await page.snapshot();
    const sel = field(snap, "formEncrypt", "wpaSSID")[0];
    const opt = sel?.options?.find((o) => new RegExp(`AP\\s*${RealtekBoaDriver.GUEST_SLOT}\\b`, "i").test(o.label) || o.value === String(RealtekBoaDriver.GUEST_SLOT));
    return { page, opt };
  }

  getGuestWifi(): Promise<GuestWifi> {
    return this.lock.run(async () => {
      const bands = await this.guestBands();
      let enabled = false, ssid: string | undefined, isolated: boolean | undefined, password: string | undefined;
      const onBands: Band[] = [];
      for (const b of bands) {
        const g = await this.readGuestSlot(b.idx);
        if (g.enabled) {
          enabled = true;
          onBands.push(b.band);
          ssid ??= g.ssid;
          isolated ??= g.isolated;
          if (password === undefined) {
            const { page, opt } = await this.openGuestSecurity(b.idx);
            try {
              if (opt) {
                const s2 = await page.fill("formEncrypt", { wpaSSID: opt.value });
                password = field(s2, "formEncrypt", "pskValue")[0]?.value || undefined;
              }
            } finally {
              page.dispose();
            }
          }
        }
      }
      return { enabled, ssid, password, isolated, bands: onBands, availableBands: bands.map((b) => b.band) };
    });
  }

  setGuestWifi(cfg: GuestWifiConfig): Promise<void> {
    const n = RealtekBoaDriver.GUEST_SLOT;
    if (cfg.enabled) {
      if (!cfg.ssid?.trim() || cfg.ssid.length > 32) return Promise.reject(new RouterError("Guest network name must be 1-32 characters.", "validation"));
      if (!cfg.password || cfg.password.length < 8 || cfg.password.length > 63) return Promise.reject(new RouterError("Guest password must be 8-63 characters.", "validation"));
    }
    return this.lock.run(async () => {
      const bands = await this.guestBands();
      const wanted = cfg.enabled ? bands.filter((b) => !cfg.bands?.length || cfg.bands.includes(b.band)) : [];
      if (cfg.enabled && !wanted.length) throw new RouterError("This router doesn't have the chosen Wi-Fi band.", "validation");
      for (const b of bands) {
        await this.get(`/boaform/formWlanRedirect?redirect-url=${encodeURIComponent(PAGES.multiAp)}&wlan_idx=${b.idx}`);
        if (!wanted.includes(b)) {
          // Not wanted on this band (or guest Wi-Fi turned off): switch it off if it's on.
          const cur = await this.readGuestSlot(b.idx);
          if (!cur.enabled) continue;
          await this.get(`/boaform/formWlanRedirect?redirect-url=${encodeURIComponent(PAGES.multiAp)}&wlan_idx=${b.idx}`);
          await this.submit(PAGES.multiAp, { form: "MultipleAP", button: "Apply Changes", values: { [`wl_disable${n}`]: false } });
          await sleep(1500);
          continue;
        }
        // Every "Apply" restarts this band's Wi-Fi (everyone on it drops for a
        // few seconds), so only apply what actually changes.
        const isolated = cfg.isolated !== false;
        const cur = await this.readGuestSlot(b.idx);
        if (!cur.enabled || cur.ssid !== cfg.ssid!.trim() || cur.isolated !== isolated) {
          const values: Record<string, string | boolean> = {
            [`wl_disable${n}`]: true,
            [`wl_ssid${n}`]: cfg.ssid!.trim(),
            [`wl_hide_ssid${n}`]: "0", // broadcast the name
            [`wl_access${n}`]: isolated ? "1" : "0", // relay blocking
          };
          await this.get(`/boaform/formWlanRedirect?redirect-url=${encodeURIComponent(PAGES.multiAp)}&wlan_idx=${b.idx}`);
          await this.submit(PAGES.multiAp, { form: "MultipleAP", button: "Apply Changes", values, order: Object.keys(values) });
          await sleep(1500);
        }
        // Password lives on the security page, per access point.
        const { page, opt } = await this.openGuestSecurity(b.idx);
        let cap: CapturedSubmit | null = null;
        try {
          if (!opt) throw new RouterError("The router didn't create the guest network. Try again in a minute.", "rejected");
          const snap = await page.fill("formEncrypt", { wpaSSID: opt.value });
          const f = (name: string) => field(snap, "formEncrypt", name)[0];
          const methods = f("security_method")?.options ?? [];
          const wpa2 = methods.find((o) => /wpa2/i.test(o.label) && !/wpa\//i.test(o.label))?.value ?? "4";
          // WPA2 with AES only: iPhones refuse or warn on TKIP, which some
          // firmwares default to for a new guest network.
          const values: Record<string, string | boolean> = { security_method: wpa2, wpaAuth: "psk", pskFormat: "0", pskValue: cfg.password! };
          if (f("wpa2ciphersuite_a")) values.wpa2ciphersuite_a = true;
          if (f("wpa2ciphersuite_t")) values.wpa2ciphersuite_t = false;
          if (f("ciphersuite_a")) values.ciphersuite_a = true;
          if (f("ciphersuite_t")) values.ciphersuite_t = false;
          const same =
            f("security_method")?.value === wpa2 &&
            f("pskValue")?.value === cfg.password &&
            (!f("wpa2ciphersuite_a") || !!f("wpa2ciphersuite_a")?.checked) &&
            (!f("wpa2ciphersuite_t") || !f("wpa2ciphersuite_t")?.checked);
          if (!same) cap = await page.capture({ form: "formEncrypt", button: "save", values, order: Object.keys(values) });
        } finally {
          page.dispose();
        }
        if (!cap) continue;
        await this.selectRadio(b.idx);
        await this.send(page.url, cap);
        await sleep(1500);
      }
    });
  }

  // ---------------------------------------------------------------- IPv6 (filter bypass)

  getIpv6() {
    return this.lock.run(async () => {
      const snap = await this.read(PAGES.ipv6);
      return { enabled: checkedValue(snap, "ipv6enabledisable", "ipv6switch") !== "0" };
    });
  }

  setIpv6(enabled: boolean) {
    return this.lock.run(async () => {
      await this.submit(PAGES.ipv6, { form: "ipv6enabledisable", button: "Apply Changes", values: { ipv6switch: enabled ? "1" : "0" } });
      const snap = await this.read(PAGES.ipv6);
      if ((checkedValue(snap, "ipv6enabledisable", "ipv6switch") !== "0") !== enabled) {
        throw new RouterError("The router didn't apply the IPv6 change. Try again in a minute.", "rejected");
      }
    });
  }

  // ---------------------------------------------------------------- all settings

  async getAdvancedMenu(): Promise<AdvancedGroup[]> {
    const res = await this.get("/admin/userMenu.js");
    if (res.status >= 400 || !res.body) throw new RouterError("Couldn't read the router's menu.", "parse");
    type Ev = { i: number; name?: string; path?: string };
    const ev: Ev[] = [];
    for (const m of res.body.matchAll(/name\s*:\s*["']([^"']+)["']/g)) ev.push({ i: m.index!, name: m[1].trim() });
    for (const m of res.body.matchAll(/([\w\/-]+\.(?:asp|htm|html))/g)) ev.push({ i: m.index!, path: m[1] });
    ev.sort((a, b) => a.i - b.i);
    const groups: AdvancedGroup[] = [];
    let group: AdvancedGroup | null = null;
    for (let k = 0; k < ev.length; k++) {
      const e = ev[k];
      if (!e.name) continue;
      const next = ev[k + 1];
      if (next?.path) {
        const path = next.path.startsWith("/") ? next.path : "/" + next.path;
        if (/logout|upgrade|saveconf/i.test(path)) continue; // handled elsewhere / needs file upload
        const wlan = group?.title.match(/wlan(\d)/i)?.[1];
        if (!group) groups.push((group = { title: "General", items: [] }));
        group.items.push({ id: wlan !== undefined ? `${path}#wlan=${wlan}` : path, title: e.name });
      } else {
        group = { title: e.name, items: [] };
        groups.push(group);
      }
    }
    return groups
      .filter((g) => g.items.length)
      .map((g) => ({ ...g, title: g.title.replace(/^wlan0\s*\((.+)\)/i, "Wi-Fi $1").replace(/^wlan1\s*\((.+)\)/i, "Wi-Fi $1") }));
  }

  async openAdvanced(id: string): Promise<LivePage> {
    const [path, frag] = id.split("#");
    const wlan = frag?.match(/wlan=(\d)/)?.[1];
    if (!/^\/[\w\/-]+\.(asp|htm|html)$/.test(path)) throw new RouterError("Unknown settings page.", "validation");
    const load = () =>
      this.lock.run(async () => {
        if (wlan !== undefined) await this.selectRadio(Number(wlan));
        const page = await this.open(path);
        return { page, snap: await page.snapshot() };
      });
    let { page, snap } = await load();
    const live: LivePage = {
      title: snap.title,
      snapshot: snap,
      fill: async (form, values) => {
        live.snapshot = await page.fill(form, values);
        return live.snapshot;
      },
      press: async (form, button) => {
        const res = await this.lock.run(async () => {
          const cap = await page.capture({ form, button });
          if (!cap.submitted) {
            const msg = cap.alerts.filter(Boolean).join(" ");
            throw new RouterError(msg || "This button opens a classic router window that RouterDeck can't show. Use \"Open classic page\" instead.", "validation");
          }
          if (wlan !== undefined) await this.selectRadio(Number(wlan));
          return this.send(page.url, cap);
        });
        let message: string | undefined;
        if (res && !looksLikeLogin(res.body, res.url)) {
          const pre = res.body.match(/<pre[^>]*>([\s\S]*?)<\/pre>/i)?.[1];
          const text = htmlToLines(pre ?? res.body);
          if (pre || (text.length > 0 && text.length < 2500)) message = text.slice(0, 6000);
        }
        page.dispose();
        ({ page, snap } = await load());
        live.snapshot = snap;
        return { message, snapshot: snap };
      },
      dispose: () => page.dispose(),
    };
    return live;
  }

  // ---------------------------------------------------------------- admin

  changeAdminPassword(current: string, next: string) {
    return this.lock.run(async () => {
      await this.submit(PAGES.password, { form: "password", button: "save", values: { oldpass: current, newpass: next, confpass: next } });
    });
  }

  reboot() {
    return this.lock.run(async () => {
      await this.submit(PAGES.reboot, { form: "cmboot", button: "Commit and Reboot" }, { tolerateDrop: true });
    });
  }
}

export const realtekBoa: DriverFactory = {
  id: "realtek-boa",
  name: "Realtek GPON (Boa web server)",
  knownModels: ["SLT-Mobitel HG7 (fiber)", "Other Realtek RTL960x ONTs"],
  async probe(_ctx, home) {
    const b = home.body;
    const server = home.headers["server"] ?? "";
    let score = 0;
    if (/boa/i.test(server)) score += 0.4;
    if (/boaform/i.test(b)) score += 0.4;
    if (/BroadBand Device Webserver/i.test(b)) score += 0.3;
    if (/cmlogin/i.test(b)) score += 0.3;
    if (score === 0) return null;
    return { confidence: Math.min(score, 1), model: /HG7/.test(b) ? "HG7" : undefined, defaultUsername: "admin" };
  },
  create: (ctx) => new RealtekBoaDriver(ctx),
};
