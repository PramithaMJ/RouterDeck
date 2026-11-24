// Bridges the RouterDeck web page <-> the extension service worker.
// Runs only on the RouterDeck origins listed in manifest.json.
(() => {
  const VERSION = chrome.runtime.getManifest().version;
  document.documentElement.dataset.routerdeckExtension = VERSION;

  window.addEventListener("message", async (ev) => {
    if (ev.source !== window || ev.origin !== location.origin) return;
    const m = ev.data;
    if (!m || m.source !== "routerdeck-app" || typeof m.id !== "string") return;
    const reply = (data) => window.postMessage({ source: "routerdeck-ext", type: "response", id: m.id, ...data }, location.origin);

    if (m.type === "hello") return reply({ ok: true, result: { version: VERSION } });
    try {
      const res = await chrome.runtime.sendMessage({ type: m.type, payload: m.payload });
      if (!res) return reply({ ok: false, error: "The extension did not respond.", code: "unavailable" });
      reply(res);
    } catch (e) {
      reply({ ok: false, error: "The RouterDeck extension was updated or restarted. Please reload this page.", code: "unavailable" });
    }
  });
})();
