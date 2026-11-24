// RouterDeck desktop app (Windows, macOS, Linux).
//
// Loads the same RouterDeck web app from inside the app (app://routerdeck/),
// and gives it a native, narrow bridge to the home router (see preload.js).
// Optional: runs in the background (tray), starts at login, shares the app
// with phones on the Wi-Fi, remembers the router password in the OS keychain.
"use strict";

const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, protocol, safeStorage, shell } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const rc = require("./router-client");

let autoUpdater = null;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch {}

const APP_URL = "app://routerdeck/";
const IS_MAC = process.platform === "darwin";
const RES = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..");
const WEB_ROOT = path.join(RES, "app-web");
const CONNECTOR = app.isPackaged ? path.join(RES, "connector", "routerdeck-connector.mjs") : path.join(__dirname, "..", "resources", "connector", "routerdeck-connector.mjs");
const TRAY_DIR = app.isPackaged ? path.join(RES, "tray") : path.join(__dirname, "..", "build", "tray");
const SHARE_PORT = 47800;

protocol.registerSchemesAsPrivileged([{ scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

// ---------------------------------------------------------------- settings
const SETTINGS_FILE = () => path.join(app.getPath("userData"), "settings.json");
const DEFAULTS = { runInBackground: true, startAtLogin: false, shareWithPhones: false };
let settings = { ...DEFAULTS };
function loadSettings() {
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE(), "utf8")) };
  } catch {
    settings = { ...DEFAULTS };
  }
}
function saveSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_FILE()), { recursive: true });
    fs.writeFileSync(SETTINGS_FILE(), JSON.stringify(settings, null, 2));
  } catch {}
}

// ---------------------------------------------------------------- credentials (OS keychain-backed)
const CREDS_FILE = () => path.join(app.getPath("userData"), "credentials.json");
function readCreds() {
  try {
    return JSON.parse(fs.readFileSync(CREDS_FILE(), "utf8"));
  } catch {
    return {};
  }
}
function writeCreds(all) {
  fs.writeFileSync(CREDS_FILE(), JSON.stringify(all), { mode: 0o600 });
}
async function credsAvailable() {
  try {
    return await safeStorage.isAsyncEncryptionAvailable();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------- app:// protocol (bundled web app)
const MIME = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json", ".xml": "application/xml" };
const CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://icons.duckduckgo.com https://www.google.com https://*.gstatic.com; font-src 'self' data:; connect-src 'self' https://speed.cloudflare.com; frame-src 'self' about:; base-uri 'none'; object-src 'none'";

function resolveFile(pathname) {
  let rel = decodeURIComponent(pathname);
  let file = path.normalize(path.join(WEB_ROOT, rel));
  if (file !== WEB_ROOT && !file.startsWith(WEB_ROOT + path.sep)) return null;
  try {
    if (fs.statSync(file).isDirectory()) file = path.join(file, "index.html");
  } catch {
    if (!path.extname(file) && fs.existsSync(file + ".html")) file += ".html";
    else if (!path.extname(file) && fs.existsSync(path.join(file, "index.html"))) file = path.join(file, "index.html");
  }
  return fs.existsSync(file) ? file : null;
}

function registerAppProtocol() {
  protocol.handle("app", (req) => {
    const u = new URL(req.url);
    if (u.host !== "routerdeck") return new Response("Not found", { status: 404 });
    const file = resolveFile(u.pathname);
    const target = file ?? path.join(WEB_ROOT, "404.html");
    const body = fs.readFileSync(target);
    return new Response(body, {
      status: file ? 200 : 404,
      headers: { "content-type": MIME[path.extname(target)] || "application/octet-stream", "content-security-policy": CSP, "x-content-type-options": "nosniff" },
    });
  });
}

// ---------------------------------------------------------------- window & tray
let win = null;
let tray = null;
let quitting = false;

function createWindow({ show }) {
  win = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    title: "RouterDeck",
    backgroundColor: "#f7f6f2",
    show: false,
    autoHideMenuBar: !IS_MAC,
    icon: IS_MAC ? undefined : path.join(TRAY_DIR, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  win.loadURL(APP_URL);
  win.once("ready-to-show", () => show && win.show());
  // Links to the web open in the default browser; the app never navigates away.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith(APP_URL)) return;
    e.preventDefault();
    if (/^https?:\/\//.test(url)) void shell.openExternal(url);
  });
  win.on("close", (e) => {
    if (!quitting && settings.runInBackground) {
      e.preventDefault();
      win.hide();
      if (IS_MAC) app.dock?.hide();
    }
  });
  win.on("closed", () => (win = null));
}

function showWindow() {
  if (IS_MAC) app.dock?.show();
  if (!win) createWindow({ show: true });
  else {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  }
}

function trayImage() {
  const file = IS_MAC ? "trayTemplate.png" : "tray.png";
  const img = nativeImage.createFromPath(path.join(TRAY_DIR, file));
  if (IS_MAC) img.setTemplateImage(true);
  return img;
}

function buildTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open RouterDeck", click: showWindow },
      { type: "separator" },
      { label: "Share with phones on Wi-Fi", type: "checkbox", checked: settings.shareWithPhones, click: (i) => applySettings({ shareWithPhones: i.checked }) },
      { label: "Keep running in background", type: "checkbox", checked: settings.runInBackground, click: (i) => applySettings({ runInBackground: i.checked }) },
      { label: "Start at login", type: "checkbox", checked: settings.startAtLogin, click: (i) => applySettings({ startAtLogin: i.checked }) },
      { type: "separator" },
      { label: "Check for updates", click: () => void checkForUpdates(true) },
      { label: `Version ${app.getVersion()}`, enabled: false },
      { type: "separator" },
      {
        label: "Quit RouterDeck",
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ]),
  );
}

function ensureTray() {
  if (tray) return;
  try {
    tray = new Tray(trayImage());
    tray.setToolTip("RouterDeck");
    tray.on("click", () => (IS_MAC ? tray.popUpContextMenu() : showWindow()));
    buildTrayMenu();
  } catch {
    tray = null; // Some Linux desktops have no tray; the app still works.
  }
}

function setAppMenu() {
  const template = [
    ...(IS_MAC ? [{ role: "appMenu" }] : [{ label: "File", submenu: [{ label: "Quit", accelerator: "Ctrl+Q", click: () => ((quitting = true), app.quit()) }] }]),
    { role: "editMenu" },
    { label: "View", submenu: [{ role: "reload" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }, ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }])] },
    { role: "windowMenu" },
    { role: "help", submenu: [{ label: "RouterDeck website", click: () => shell.openExternal("https://router.pramitha.lk") }, { label: "Report a problem", click: () => shell.openExternal("https://github.com/PramithaMJ/RouterDeck/issues") }] },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------- share with phones (bundled connector)
let shareProc = null;
let shareState = { running: false };

function connectorToken() {
  try {
    return JSON.parse(fs.readFileSync(path.join(os.homedir(), ".routerdeck", "connector.json"), "utf8")).token;
  } catch {
    return null;
  }
}

function startShare() {
  if (shareProc) return;
  shareState = { running: false };
  shareProc = spawn(process.execPath, [CONNECTOR, "--lan", "--no-open", "--app", WEB_ROOT, "--port", String(SHARE_PORT)], {
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let out = "";
  const onData = (d) => {
    out += String(d);
    if (/running/i.test(out) && !shareState.running) {
      const ip = rc.localIp();
      const token = connectorToken();
      shareState = ip && token ? { running: true, url: `http://${ip}:${SHARE_PORT}/#pair=${encodeURIComponent(token)}` } : { running: true, error: "Connect this computer to your Wi-Fi to share with phones." };
    }
  };
  shareProc.stdout.on("data", onData);
  shareProc.stderr.on("data", (d) => {
    if (/already in use/i.test(String(d))) shareState = { running: false, error: `Port ${SHARE_PORT} is busy. Is the RouterDeck connector already running?` };
  });
  shareProc.on("exit", () => {
    shareProc = null;
    if (shareState.running) shareState = { running: false };
  });
}

function stopShare() {
  if (shareProc) shareProc.kill();
  shareProc = null;
  shareState = { running: false };
}

// ---------------------------------------------------------------- settings application
function applySettings(patch) {
  settings = { ...settings, ...patch };
  saveSettings();
  if ("startAtLogin" in patch) {
    try {
      app.setLoginItemSettings({ openAtLogin: settings.startAtLogin, openAsHidden: true, args: ["--hidden"] });
    } catch {}
  }
  if ("shareWithPhones" in patch) settings.shareWithPhones ? startShare() : stopShare();
  buildTrayMenu();
  return settings;
}

// ---------------------------------------------------------------- updates
// Windows (NSIS) and Linux AppImage update themselves in place. macOS can only
// do that when the app is Developer ID signed (Squirrel.Mac checks the
// signature), and a .deb is owned by the package manager, so those builds just
// tell the user and open the download page instead.
const RELEASES_URL = "https://github.com/PramithaMJ/RouterDeck/releases/latest";
let pkgMeta = {};
try {
  pkgMeta = require("../package.json");
} catch {}
const selfUpdates = process.platform === "win32" || (process.platform === "linux" && !!process.env.APPIMAGE) || (process.platform === "darwin" && pkgMeta.routerdeckSignedMac === true);

let updateInfo = { status: "idle" };
let notifiedVersion = null;
async function checkForUpdates(interactive) {
  if (!autoUpdater || !app.isPackaged) {
    if (interactive) await dialog.showMessageBox({ message: "Updates are checked in the installed app.", buttons: ["OK"] });
    return { status: "unavailable" };
  }
  try {
    const r = await autoUpdater.checkForUpdates();
    const latest = r?.updateInfo?.version;
    const newer = latest && r?.isUpdateAvailable !== false && latest !== app.getVersion();
    updateInfo = newer ? { status: selfUpdates ? "available" : "manual", version: latest, url: RELEASES_URL } : { status: "latest" };
  } catch {
    updateInfo = { status: "error" };
  }
  const announce = interactive || (updateInfo.status === "manual" && notifiedVersion !== updateInfo.version);
  if (announce) {
    if (updateInfo.status === "manual") {
      notifiedVersion = updateInfo.version;
      const { response } = await dialog.showMessageBox({
        message: `RouterDeck ${updateInfo.version} is available`,
        detail: `You have ${app.getVersion()}. Download the new version and install it over this one. Your settings are kept.`,
        buttons: ["Download", "Later"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) void shell.openExternal(RELEASES_URL);
    } else if (interactive) {
      const msg = updateInfo.status === "available" ? `RouterDeck ${updateInfo.version} is downloading. It installs when you quit.` : updateInfo.status === "latest" ? "You're on the latest version." : "Couldn't check for updates right now.";
      await dialog.showMessageBox({ message: msg, buttons: ["OK"] });
    }
  }
  return updateInfo;
}

function initUpdates() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = selfUpdates;
  autoUpdater.autoInstallOnAppQuit = selfUpdates;
  autoUpdater.on("error", () => undefined);
  setTimeout(() => void checkForUpdates(false), 15_000);
  setInterval(() => void checkForUpdates(false), 6 * 3600_000);
}

// ---------------------------------------------------------------- IPC (only from our own page)
function fromApp(event) {
  return event.senderFrame && typeof event.senderFrame.url === "string" && event.senderFrame.url.startsWith(APP_URL);
}
function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!fromApp(event)) throw new Error("Not allowed");
    return fn(...args);
  });
}

function registerIpc() {
  ipcMain.on("rd:info", (event) => {
    event.returnValue = fromApp(event) ? { version: app.getVersion(), platform: `${process.platform === "darwin" ? "macOS" : process.platform === "win32" ? "Windows" : "Linux"} ${os.release()}` } : null;
  });
  handle("rd:request", async (req) => {
    try {
      return { ok: true, result: await rc.routerFetch(req || {}) };
    } catch (e) {
      return { ok: false, error: String(e?.message || e), code: e?.code || "unknown" };
    }
  });
  handle("rd:probe", (origins, timeoutMs) => rc.probe(origins, timeoutMs));
  handle("rd:network", () => rc.network());
  handle("rd:reset", (origin) => rc.reset(origin));
  handle("rd:settings:get", () => settings);
  handle("rd:settings:set", (patch) => applySettings(Object.fromEntries(Object.entries(patch || {}).filter(([k]) => k in DEFAULTS).map(([k, v]) => [k, !!v]))));
  handle("rd:creds:available", () => credsAvailable());
  handle("rd:creds:get", async (origin) => {
    const enc = readCreds()[String(origin)];
    if (!enc || !(await credsAvailable())) return null;
    try {
      const r = await safeStorage.decryptStringAsync(Buffer.from(enc, "base64"));
      return JSON.parse(typeof r === "string" ? r : r.result);
    } catch {
      return null;
    }
  });
  handle("rd:creds:set", async (origin, username, password) => {
    if (!(await credsAvailable()) || !rc.isPrivateHost(new URL(String(origin)).hostname)) return false;
    const all = readCreds();
    all[String(origin)] = (await safeStorage.encryptStringAsync(JSON.stringify({ username: String(username), password: String(password) }))).toString("base64");
    writeCreds(all);
    return true;
  });
  handle("rd:creds:clear", (origin) => {
    const all = readCreds();
    delete all[String(origin)];
    writeCreds(all);
  });
  handle("rd:share:status", () => shareState);
  handle("rd:share:set", async (on) => {
    applySettings({ shareWithPhones: !!on });
    for (let i = 0; i < 20 && on && !shareState.running && !shareState.error; i++) await new Promise((r) => setTimeout(r, 150));
    return shareState;
  });
  handle("rd:update:check", () => checkForUpdates(false));
  handle("rd:update:open", () => shell.openExternal(RELEASES_URL));
}

// ---------------------------------------------------------------- lifecycle
app.on("second-instance", showWindow);
app.on("activate", showWindow);
app.on("before-quit", () => {
  quitting = true;
  stopShare();
});
app.on("window-all-closed", () => {
  if (!settings.runInBackground && !IS_MAC) app.quit();
});

app.whenReady().then(() => {
  loadSettings();
  registerAppProtocol();
  registerIpc();
  setAppMenu();
  const hidden = process.argv.includes("--hidden") || (IS_MAC && app.getLoginItemSettings().wasOpenedAsHidden);
  if (hidden && IS_MAC) app.dock?.hide();
  createWindow({ show: !hidden });
  ensureTray();
  if (settings.shareWithPhones) startShare();
  initUpdates();
});
