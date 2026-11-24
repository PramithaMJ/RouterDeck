# Adding support for a new router

RouterDeck drivers live in `web/src/lib/drivers/`. A driver is a `DriverFactory`:

```ts
export const myRouter: DriverFactory = {
  id: "my-router",
  name: "Vendor Family",
  knownModels: ["ISP Model X"],
  probe(ctx, home) { /* look at home.body / home.headers, return { confidence, model, defaultUsername } or null */ },
  create(ctx) { return new MyRouterDriver(ctx); }, // implements RouterDriver
};
```

Register it in `DRIVERS` in `web/src/lib/drivers/index.ts`. The connect screen picks the driver with the highest `probe` confidence.

## Two styles of driver

**1. JSON/API routers** (Huawei HiLink `/api/...`, TP-Link, most modern routers): call `ctx.transport.request({ url, method, headers, body })` directly and parse JSON/XML. No sandbox needed.

**2. Classic form-based admin pages** (Realtek Boa, many ZTE/Huawei ONTs): reuse the sandbox runtime so the router's own JavaScript does hashing, signing and validation:

```ts
const page = await RouterPage.open(ctx.transport, url);        // renders the real page in a sandbox
const snap = await page.snapshot();                              // forms, fields (+ current values), tables, alerts
const cap  = await page.capture({ form: "wlanSetup", button: "save", values: { ssid: "Home" } });
page.dispose();
// cap.pairs = exact body the router UI would POST; send it with ctx.transport.request(...)
```

`snapshot()` runs after the page's own scripts, so values filled in by JavaScript are present. Look at `realtek-boa/index.ts` for a complete example including session-expiry detection and error extraction.

## Investigating a router safely

1. Log in to the router in a normal browser tab.
2. In DevTools, run read-only probes: `fetch('/some.asp').then(r => r.text())`, list `document.forms`, field names, and button `onclick` handlers.
3. Use `RouterPage.capture()` without sending to see exactly what would be posted. **Do not** send changes until you know what they do.
4. Record test vectors for anything you reverse-engineer and add a test in `web/tests/`.

## Checklist

- [ ] `probe` is specific (doesn't claim other brands' routers)
- [ ] `isLoggedIn` / session-expired detection (throw `RouterError(..., "session-expired")`)
- [ ] All writes go through a `Mutex` (routers handle one admin action at a time)
- [ ] User-facing errors are plain language
- [ ] Capabilities flags match what's implemented
