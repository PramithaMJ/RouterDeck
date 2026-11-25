# Publishing the RouterDeck browser extension

The extension gives desktop users a one-click "Add to Chrome" setup. Everything the stores need is in this repo:

| What | Where |
| --- | --- |
| Chrome / Edge package | `routerdeck-chrome-edge-v<version>.zip` (GitHub Release assets, or `web/public/downloads/` after `node web/scripts/prepare-downloads.mjs`) |
| Firefox package | `routerdeck-firefox-v<version>.zip` (same places) |
| Icon 128×128 | `docs/store/icon-128.png` |
| Screenshots 1280×800 | `docs/store/1-dashboard.png` … `5-landing.png` |
| Small promo tile 440×280 | `docs/store/promo-small-440x280.png` |
| Marquee 1400×560 (optional) | `docs/store/promo-marquee-1400x560.png` |
| Privacy policy | https://router.pramitha.lk/privacy/ |

> Store packages only run on `https://router.pramitha.lk`. The repo's `extension/manifest.json` also allows `localhost` for development; that's stripped from the store builds automatically.

---

## 1. Chrome Web Store (Chrome, Brave, Opera; Edge can install from it too)

### One-time account setup
1. Go to **https://chrome.google.com/webstore/devconsole** and sign in with your Google account.
2. Accept the developer agreement and pay the **one-time US$5** registration fee.
3. Account tab: set a **publisher name** (e.g. "Pramitha Jayasooriya"), verify your **contact email**.

### Upload
4. **New item** → upload `routerdeck-chrome-edge-v1.0.0.zip`.

### Store listing tab
5. **Description** (paste):
   > RouterDeck replaces your internet router's confusing admin page with a clean, modern dashboard at router.pramitha.lk. See who's on your Wi-Fi, block a device, change the Wi-Fi password, share it with a QR code, block websites, run a speed test and see your connection health. Works with SLT-Mobitel fiber, Dialog / Mobitel / Hutch 4G routers and more.
   >
   > Your router only answers inside your home, and browsers rightly stop websites from talking to it. This extension is the small, safe bridge:
   > • it only works on the RouterDeck website,
   > • it only talks to private home-network addresses (like 192.168.1.1), never the internet,
   > • it asks you to approve your router once,
   > • it has no servers and collects nothing. Your router password goes straight to your router.
   >
   > Free and open source: github.com/PramithaMJ/RouterDeck
6. **Category:** Tools · **Language:** English
7. **Store icon:** `docs/store/icon-128.png`
8. **Screenshots:** upload the five 1280×800 images from `docs/store/`.
9. **Small promo tile:** `docs/store/promo-small-440x280.png` · **Marquee (optional):** `docs/store/promo-marquee-1400x560.png`
10. **Official URL / Homepage:** `https://router.pramitha.lk` · **Support URL:** `https://github.com/PramithaMJ/RouterDeck/issues`

### Privacy practices tab
11. **Single purpose:**
    > Let the RouterDeck website (router.pramitha.lk) manage the user's own home router by forwarding its requests to the router's private network address.
12. **Permission justifications:**
    - `storage`: *Remembers which router the user approved, so they aren't asked every time.*
    - Host permissions (optional, requested at runtime): *Routers live on private addresses (192.168.x.x, 10.x.x.x) that differ per home, so the exact address can't be listed in advance. The extension asks for permission for the one router address the user approves and refuses all public internet addresses in code.*
    - Content script on router.pramitha.lk: *Connects the RouterDeck page to the extension.*
13. **Remote code:** *No, I am not using remote code.*
14. **Data usage:** tick **nothing** (no data collected). Tick the three certification boxes.
15. **Privacy policy URL:** `https://router.pramitha.lk/privacy/`

### Distribution tab
16. **Visibility:** Public · **Regions:** All regions (or choose).

### Submit
17. Click **Submit for review**. Reviews usually take **1–3 working days** (sometimes longer for extensions with host permissions). You'll get an email.

### After approval
**Published:** <https://chromewebstore.google.com/detail/routerdeck/egfnlpdojhpdhakgcifhiadchbanddjj> (extension ID `egfnlpdojhpdhakgcifhiadchbanddjj`).

This URL is the default for `CHROME_STORE_URL` in `web/src/lib/downloads.ts`, so the site shows **"Add to Chrome"** with no extra setup.
A fork that publishes its own listing can override it with the build variable `NEXT_PUBLIC_CHROME_STORE_URL`
(Cloudflare → **Workers & Pages → routerdeck → Settings → Build → Variables and secrets**), then redeploy.

---

## 2. Microsoft Edge Add-ons (free)
1. https://partner.microsoft.com/dashboard/microsoftedge → sign in → enroll (free).
2. **Create new extension** → upload the same `routerdeck-chrome-edge-v1.0.0.zip`.
3. Reuse the same description, screenshots, logo (300×300 is accepted, upload `docs/store/icon-128.png` upscaled if asked) and privacy answers.
4. Submit. Review takes up to ~7 days.

## 3. Firefox Add-ons (free)
1. https://addons.mozilla.org/developers/ → sign in with a Firefox account.
2. **Submit a New Add-on → On this site** → upload `routerdeck-firefox-v1.0.0.zip`.
3. Source code question: answer **No** (the code isn't minified).
4. Reuse listing text; privacy policy URL as above.
5. Submit. Automatic signing is usually immediate; listing review can take a few days.

---

## Releasing an update
1. Bump `"version"` in `extension/manifest.json` (e.g. `1.0.1`).
2. Commit, then tag and push: `git tag -a v1.0.1 -m "v1.0.1" && git push origin v1.0.1`.
3. GitHub Actions builds new store zips and attaches them to the release.
4. In each store dashboard → your item → **Package → Upload new package** → submit.

## Testing locally before publishing
1. `chrome://extensions` → turn on **Developer mode** → **Load unpacked** → select the repo's `extension/` folder.
2. Open https://router.pramitha.lk (or http://localhost:3000 with `npm run dev`). It should show **Browser extension · Installed**.
3. After editing extension files click the **↻ reload** icon on the extension card, then reload the page.
