// Exposes a narrow, typed bridge to the RouterDeck web app (see
// web/src/lib/transport/desktop.ts). Nothing else from Node/Electron leaks in.
"use strict";

const { contextBridge, ipcRenderer } = require("electron");

const info = ipcRenderer.sendSync("rd:info") || { version: "?", platform: "?" };
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args);

contextBridge.exposeInMainWorld("routerdeckDesktop", {
  version: info.version,
  platform: info.platform,
  request: (req) => call("rd:request", req),
  probe: (origins, timeoutMs) => call("rd:probe", origins, timeoutMs),
  network: () => call("rd:network"),
  reset: (origin) => call("rd:reset", origin),
  settings: {
    get: () => call("rd:settings:get"),
    set: (patch) => call("rd:settings:set", patch),
  },
  credentials: {
    available: () => call("rd:creds:available"),
    get: (origin) => call("rd:creds:get", origin),
    set: (origin, username, password) => call("rd:creds:set", origin, username, password),
    clear: (origin) => call("rd:creds:clear", origin),
  },
  share: {
    status: () => call("rd:share:status"),
    set: (on) => call("rd:share:set", on),
  },
  checkForUpdates: () => call("rd:update:check"),
  openDownloads: () => call("rd:update:open"),
});
