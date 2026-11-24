# Publishing the RouterDeck extension to the Chrome Web Store

Publishing gives users a one-click **Add to Chrome** button instead of the manual "Load unpacked" steps.

## One-time setup (owner)

1. Go to <https://chrome.google.com/webstore/devconsole> and sign in with your Google account.
2. Pay the one-time **US$5** developer registration fee and verify your email.

## Upload

1. Download `routerdeck-extension.zip` from <https://router.pramitha.lk/downloads/routerdeck-extension.zip>
   (or build it: `cd web && node scripts/prepare-downloads.mjs`, file is in `web/public/downloads/`).
2. Developer console → **New item** → upload the zip.
3. Fill in the listing with the text below, add 1–5 screenshots (1280×800) of RouterDeck, and the 128×128 icon from `extension/icons/icon-128.png`.
4. **Privacy practices** tab: use the answers below. Privacy policy URL: `https://router.pramitha.lk/privacy/`
5. Submit for review (usually 1–3 days).

## After approval

Copy the store URL (looks like `https://chromewebstore.google.com/detail/routerdeck-connect/<id>`) and set it in
Cloudflare Pages → Settings → Environment variables:

```
NEXT_PUBLIC_CHROME_STORE_URL = https://chromewebstore.google.com/detail/routerdeck-connect/<id>
```

Redeploy. The site then shows **Add to Chrome** everywhere. The same zip can also be published to the
Microsoft Edge Add-ons store (free): <https://partner.microsoft.com/dashboard/microsoftedge>.

---

## Listing text

**Name:** RouterDeck Connect

**Summary (≤132 chars):** Lets the RouterDeck website manage the router in your home: devices, Wi-Fi, speed and settings. Private network only.

**Category:** Productivity → Tools (or "Developer Tools" is not appropriate; use Tools)

**Description:**

> RouterDeck replaces your internet router's confusing admin page with a clean dashboard at router.pramitha.lk.
> See who's on your Wi-Fi, block a device, change the Wi-Fi password, share it with a QR code, block websites and see your connection health, for SLT-Mobitel fiber, Dialog / Mobitel / Hutch 4G routers, Starlink and more.
>
> Your router only answers inside your home, and browsers stop websites from talking to it. This extension is the small, safe bridge:
> • it only works on the RouterDeck website,
> • it only talks to private home-network addresses (like 192.168.1.1), never the internet,
> • it asks you to approve each website and router once,
> • it has no servers and collects nothing. Your router password goes straight to your router.
>
> Open source: github.com/PramithaMJ/RouterDeck

## Privacy practices answers

- **Single purpose:** "Forward requests from the RouterDeck website to the user's own router on their private home network, so the website can manage it."
- **Permission justifications:**
  - `storage`: remembers which websites/routers the user approved.
  - Optional host permissions (`http://*/*`, `https://*/*`): requested at runtime for one specific router address the user approves (e.g. http://192.168.1.1). Routers can be on any private address, so the address isn't known in advance. Public internet addresses are refused in code.
  - Content script on router.pramitha.lk: the bridge between the RouterDeck page and the extension.
- **Remote code:** No, the extension doesn't run remote code.
- **Data usage:** Does not collect or use any user data. Tick none of the data types; certify the three disclosures.
