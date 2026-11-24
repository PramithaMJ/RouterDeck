// RouterDeck desktop app (Windows, macOS, Linux).
//
// Loads the same RouterDeck web app from inside the app (app://routerdeck/),
// and gives it a native, narrow bridge to the home router (see preload.js).
// Optional: runs in the background (tray), starts at login, shares the app
// with phones on the Wi-Fi, remembers the router password in the OS keychain.
"use strict";

const { app, BrowserWindow, Menu, Tray, dialog, ipcMain, nativeImage, nativeTheme, protocol, safeStorage, shell } = require("electron");
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
const DEFAULTS = { runInBackground: true, startAtLogin: false, shareWithPhones: false, autoUpdate: true };
let settings = { ...DEFAULTS };
function loadSettings() {
  try {
    settings = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(SETTINGS_FILE(), "utf8")) };
  } catch {
    settings = { ...DEFAULTS };
  }
}
// Appearance (light / dark / follow the system). The web app owns the choice and
// reports it here; the tray and View menu can change it too. Window frame,
// menus and dialogs follow it through nativeTheme.
const THEMES = ["system", "light", "dark"];
const BG = { light: "#f7f6f2", dark: "#121110" };
function currentTheme() {
  return THEMES.includes(settings.theme) ? settings.theme : "system";
}
function windowBackground() {
  return nativeTheme.shouldUseDarkColors ? BG.dark : BG.light;
}
function setTheme(theme, { fromApp } = {}) {
  if (!THEMES.includes(theme)) return currentTheme();
  const changed = theme !== currentTheme();
  settings.theme = theme;
  nativeTheme.themeSource = theme;
  if (changed) {
    saveSettings();
    buildTrayMenu();
    setAppMenu();
  }
  win?.setBackgroundColor(windowBackground());
  if (!fromApp) win?.webContents.send("rd:theme", theme);
  return theme;
}
function appearanceMenu() {
  return [
    { label: "Match system", value: "system" },
    { label: "Light", value: "light" },
    { label: "Dark", value: "dark" },
  ].map((o) => ({ label: o.label, type: "radio", checked: currentTheme() === o.value, click: () => setTheme(o.value) }));
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
    backgroundColor: windowBackground(),
    show: false,
    autoHideMenuBar: !IS_MAC,
    icon: IS_MAC ? undefined : path.join(TRAY_DIR, "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false },
  });
  watchInstallerDownloads(win);
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
      { label: "Appearance", submenu: appearanceMenu() },
      { type: "separator" },
      update.status === "ready"
        ? { label: `Restart to update to ${update.version ?? "the new version"}`, click: () => installUpdate() }
        : update.status === "available"
          ? { label: `Download update ${update.version ?? ""}`.trim(), click: () => void downloadUpdate() }
          : update.status === "downloading"
            ? { label: `Downloading update… ${update.percent ?? 0}%`, enabled: false }
            : { label: "Check for updates", click: () => void checkForUpdates(true) },
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
    { label: "View", submenu: [{ label: "Appearance", submenu: appearanceMenu() }, { type: "separator" }, { role: "reload" }, { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }, ...(app.isPackaged ? [] : [{ role: "toggleDevTools" }])] },
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
  if ("autoUpdate" in patch) {
    setUpdate({});
    if (settings.autoUpdate && selfUpdates && update.status === "available") void downloadUpdate();
  }
  buildTrayMenu();
  return settings;
}

// ---------------------------------------------------------------- updates
// The app checks GitHub releases and shows an "Update" banner inside the app.
//  - Windows (NSIS) and Linux AppImage update in place: download (automatic if
//    "Install updates automatically" is on), then "Restart to update".
//  - macOS needs Developer ID signing to update in place (Squirrel.Mac checks
//    the signature) and a .deb belongs to the package manager, so there one
//    click downloads the new installer and opens it.
const RELEASES_URL = "https://github.com/PramithaMJ/RouterDeck/releases/latest";
const ASSET_BASE = "https://github.com/PramithaMJ/RouterDeck/releases/latest/download";
let pkgMeta = {};
try {
  pkgMeta = require("../package.json");
} catch {}
const selfUpdates = process.platform === "win32" || (process.platform === "linux" && !!process.env.APPIMAGE) || (process.platform === "darwin" && pkgMeta.routerdeckSignedMac === true);

/** status: idle | checking | latest | available | downloading | ready | error */
let update = { status: "idle", current: app.getVersion(), inPlace: selfUpdates };
function setUpdate(patch) {
  update = { ...update, ...patch, current: app.getVersion(), inPlace: selfUpdates, auto: !!settings.autoUpdate };
  win?.webContents.send("rd:update", update);
  buildTrayMenu();
  return update;
}

function installerUrl() {
  if (process.platform === "darwin") return `${ASSET_BASE}/RouterDeck-macOS-${process.arch === "arm64" ? "arm64" : "x64"}.dmg`;
  if (process.platform === "linux") return `${ASSET_BASE}/RouterDeck-Linux-x64.deb`;
  return `${ASSET_BASE}/RouterDeck-Windows-x64-Setup.exe`;
}

async function checkForUpdates(interactive) {
  if (!autoUpdater || !app.isPackaged) {
    if (interactive) await dialog.showMessageBox({ message: "Updates are checked in the installed app.", buttons: ["OK"] });
    return setUpdate({ status: "idle" });
  }
  if (update.status === "downloading" || update.status === "ready") return update;
  setUpdate({ status: "checking" });
  try {
    const r = await autoUpdater.checkForUpdates();
    const latest = r?.updateInfo?.version;
    const newer = !!latest && r?.isUpdateAvailable !== false && latest !== app.getVersion();
    setUpdate(newer ? { status: update.status === "downloading" ? "downloading" : "available", version: latest } : { status: "latest", version: undefined });
    if (newer && selfUpdates && settings.autoUpdate) void downloadUpdate();
  } catch {
    setUpdate({ status: "error" });
  }
  if (interactive) {
    if (update.status === "available" || update.status === "downloading") showWindow();
    else await dialog.showMessageBox({ message: update.status === "latest" ? "You're on the latest version." : "Couldn't check for updates right now. Check your internet connection.", buttons: ["OK"] });
  }
  return update;
}

async function downloadUpdate() {
  if (!autoUpdater || update.status === "downloading" || update.status === "ready") return update;
  if (selfUpdates) {
    setUpdate({ status: "downloading", percent: 0 });
    autoUpdater.downloadUpdate().catch(() => setUpdate({ status: "error" }));
    return update;
  }
  // Mac (unsigned) / .deb: fetch the installer into Downloads and open it.
  if (!win) createWindow({ show: false });
  setUpdate({ status: "downloading", percent: 0 });
  win.webContents.downloadURL(installerUrl());
  return update;
}

function installUpdate() {
  if (update.status !== "ready") return update;
  if (selfUpdates) {
    quitting = true;
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
  } else if (update.file) {
    void shell.openPath(update.file);
  }
  return update;
}

function initUpdates() {
  if (!autoUpdater || !app.isPackaged) return;
  autoUpdater.autoDownload = false; // we start downloads ourselves (auto or on click)
  autoUpdater.autoInstallOnAppQuit = selfUpdates;
  autoUpdater.on("download-progress", (p) => setUpdate({ status: "downloading", percent: Math.round(p.percent || 0) }));
  autoUpdater.on("update-downloaded", (info) => setUpdate({ status: "ready", version: info?.version ?? update.version, percent: 100 }));
  autoUpdater.on("error", () => {
    if (update.status === "downloading" || update.status === "checking") setUpdate({ status: "error" });
  });
  setTimeout(() => void checkForUpdates(false), 15_000);
  setInterval(() => void checkForUpdates(false), 4 * 3600_000);
}

function watchInstallerDownloads(w) {
  w.webContents.session.on("will-download", (_e, item) => {
    if (!item.getURL().startsWith(ASSET_BASE) && !/github(usercontent)?\.com/.test(item.getURL())) return;
    const file = path.join(app.getPath("downloads"), item.getFilename());
    item.setSavePath(file);
    item.on("updated", () => {
      const total = item.getTotalBytes();
      if (total) setUpdate({ status: "downloading", percent: Math.round((item.getReceivedBytes() / total) * 100) });
    });
    item.once("done", (_ev, state) => {
      if (state !== "completed") return setUpdate({ status: "error" });
      setUpdate({ status: "ready", percent: 100, file });
      void shell.openPath(file); // opens the .dmg / Software installer
    });
  });
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
  handle("rd:theme:set", (theme) => setTheme(String(theme), { fromApp: true }));
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
  handle("rd:update:state", () => update);
  handle("rd:update:download", () => downloadUpdate());
  handle("rd:update:install", () => installUpdate());
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
  nativeTheme.themeSource = currentTheme();
  nativeTheme.on("updated", () => win?.setBackgroundColor(windowBackground()));
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
