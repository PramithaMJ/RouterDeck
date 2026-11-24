<div align="center">

<img src="web/public/icon.svg" width="72" alt="RouterDeck logo" />

# RouterDeck

**Your router, without the old admin page.**

A modern, mobile-friendly dashboard for home routers. Block a device, change the Wi-Fi password,
run a speed test or check your connection in seconds, on SLT-Mobitel fiber, Dialog / Mobitel / Hutch 4G routers,
Starlink and more.

[**Open RouterDeck →**](https://router.pramitha.lk) &nbsp;·&nbsp; [Try the demo](https://router.pramitha.lk) &nbsp;·&nbsp; [Report a bug](https://github.com/PramithaMJ/RouterDeck/issues/new/choose)

[![CI](https://github.com/PramithaMJ/RouterDeck/actions/workflows/ci.yml/badge.svg)](https://github.com/PramithaMJ/RouterDeck/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-indigo.svg)](LICENSE)

</div>

---

## Features

| Feature | What it does |
| --- | --- |
| **Auto-detect** | Finds your router and recognises your provider (SLT-Mobitel, Dialog, Mobitel, Hutch, Airtel, Starlink) with its logo |
| **Devices** | See who's online, rename devices, **block / unblock** in one tap, or switch to an **allow list** (only approved devices get internet) |
| **Wi-Fi** | Rename networks, change or **generate** passwords, turn 2.4/5 GHz on/off, **share with a QR code** |
| **Guest passes** | A separate guest Wi-Fi with a **temporary password** (1 hour … 1 week, or until you revoke it). Pick 2.4 GHz, 5 GHz or both, share by QR or message, extend, rotate or **revoke** any time |
| **Desktop app** | Windows, macOS and Linux app: reaches the router directly, runs in the tray so guest passes end on time, remembers the login in the OS keychain, can share itself to phones, auto-updates |
| **Speed test** | Download, upload, ping, jitter and loaded latency with a live animated gauge, history and plain-language verdicts |
| **Protection** | Block websites for the whole network |
| **All settings** | *Every* page of the router's own admin UI (DHCP, port forwarding, DMZ, UPnP, IPv6, diagnostics…) re-rendered as clean, modern forms |
| **Line health** | Fiber Rx/Tx power, 4G signal (RSRP/SINR/bars), Starlink latency and obstructions |
| **Admin** | Change the router password, restart safely |
| **Phones** | Full app on iPhone & Android via RouterDeck Connect (QR pairing), installable to the home screen |
| **Design** | Light & dark mode, works on phones and desktops |

## Supported routers

| Router | ISPs | Status |
| --- | --- | --- |
| Realtek GPON ONTs (e.g. **HG7**) | SLT-Mobitel fiber | Verified on hardware |
| Huawei HiLink 4G/5G (B310, B311, B315, B525, B535, E5576…) | Dialog, Mobitel, Hutch, Airtel | Beta |
| Starlink dish (status) | Starlink | Beta, read-only |
| Huawei EchoLife, ZTE ZXHN, ZTE 4G, TP-Link | Dialog Fiber, SLT, others | Planned, [help add yours](docs/ADDING_A_ROUTER.md) |

## How it works (and why there's no backend)

A router's admin page only answers **inside your home network**. No cloud server (Cloudflare included) can reach
`192.168.1.1`, and browsers block public websites from reading LAN devices directly. So RouterDeck is a
**static website + a tiny bridge on your own computer**:

```
 RouterDeck website (static, Cloudflare Pages)
        │ postMessage            │ postMessage (window.opener)     │ http://127.0.0.1 + pairing code
        ▼                        ▼                                 ▼
 Browser extension      or   Router tab bookmark (no install) or   RouterDeck Connect app
        └────────────────────► Your router (192.168.x.x) ◄──────────────────┘
```

- **Zero servers.** Hosting is free and nothing sensitive passes through anyone's infrastructure.
- **Passwords never stored.** They go from your browser straight to your router.
- **Drivers live in the web app.** The bridges are dumb, permission-checked pipes, so new routers never need a bridge update.
- **Router pages run sandboxed.** For form-based routers, the router's own page runs in a locked-down iframe
  (opaque origin, network blocked) so its own validation, password hashing and form signing are reused exactly.
  RouterDeck fills the form and captures the request the router UI would have sent. That's what powers *All settings*.

See [SECURITY.md](SECURITY.md) for the full security model.

## Use it

**Desktop app (easiest on a computer)**

Download from **<https://router.pramitha.lk/download>** or [GitHub Releases](https://github.com/PramithaMJ/RouterDeck/releases/latest):

| System | File |
| --- | --- |
| Windows 10/11 | [RouterDeck-Windows-x64-Setup.exe](https://github.com/PramithaMJ/RouterDeck/releases/latest/download/RouterDeck-Windows-x64-Setup.exe) |
| macOS Apple Silicon | [RouterDeck-macOS-arm64.dmg](https://github.com/PramithaMJ/RouterDeck/releases/latest/download/RouterDeck-macOS-arm64.dmg) |
| macOS Intel | [RouterDeck-macOS-x64.dmg](https://github.com/PramithaMJ/RouterDeck/releases/latest/download/RouterDeck-macOS-x64.dmg) |
| Linux | [AppImage](https://github.com/PramithaMJ/RouterDeck/releases/latest/download/RouterDeck-Linux-x64.AppImage) · [.deb](https://github.com/PramithaMJ/RouterDeck/releases/latest/download/RouterDeck-Linux-x64.deb) |

Install, open, sign in. Nothing else to set up. The builds aren't signed with paid certificates yet, so the first launch asks once:
Windows → *More info → Run anyway*; macOS → *System Settings → Privacy & Security → Open Anyway*.

**In the browser**
1. Open **<https://router.pramitha.lk>** on a computer connected to your home Wi-Fi.
2. Pick one way to connect (one time):
   - **Router page button (no download):** drag the RouterDeck bookmark to your bookmarks bar, open `http://192.168.1.1`
     and click it. RouterDeck opens in a new tab, connected through your router's own page.
   - **RouterDeck Connect** app: [Windows](https://github.com/PramithaMJ/RouterDeck/releases/latest/download/RouterDeck-Connect-Windows.exe) ·
     [Mac (Apple Silicon)](https://github.com/PramithaMJ/RouterDeck/releases/latest/download/RouterDeck-Connect-macOS-AppleSilicon.zip) ·
     [Mac (Intel)](https://github.com/PramithaMJ/RouterDeck/releases/latest/download/RouterDeck-Connect-macOS-Intel.zip) ·
     [Linux](https://github.com/PramithaMJ/RouterDeck/releases/latest/download/RouterDeck-Connect-Linux.zip).
     Double-click it; it opens RouterDeck already paired.
   - or the **browser extension** for Chrome / Edge / Brave.
3. RouterDeck finds your router. Sign in with the router's own username and password.

**On a phone (iPhone or Android), nothing to install**
1. On router.pramitha.lk tap **Router page button → Set up → iPhone/Android**, copy the code and save it as a bookmark named *RouterDeck*.
2. Open `http://192.168.1.1` on the phone and tap the RouterDeck bookmark. RouterDeck opens inside that page, connected.

Alternatives: RouterDeck Connect on a computer at home (**Settings → Use on your phone** → scan the QR), or Termux on Android.

**Important: make blocking reliable.** Many ISP routers (including the SLT HG7) only filter IPv4. If IPv6 is on, blocked
devices and websites can slip through. RouterDeck detects this and offers a one-tap **Make blocking work (turn off IPv6)**.

Or click **Try the demo**. The speed test works anywhere without setup.

## Development

```bash
cd web
npm install
npm run dev          # http://localhost:3000
npm test             # unit tests (checksum vectors captured from a real HG7)
npm run typecheck
npm run build        # static export → web/out
```

```
web/         Next.js 16 static app (UI, drivers, sandbox runtime, speed test)
desktop/     Electron desktop app (Windows, macOS, Linux)
extension/   RouterDeck Connect, Manifest V3 browser extension
connector/   Zero-dependency Node.js connector
docs/        Guides (adding a router)
```

Desktop app:

```bash
cd web && npm run build      # the desktop app bundles web/out
cd ../desktop
npm install
npm start                    # run it
npm run dist                 # installers for this OS → desktop/dist
```

## Releasing

Push a tag (`git tag v1.1.0 && git push origin v1.1.0`). [release.yml](.github/workflows/release.yml) builds the desktop
installers on Windows, macOS and Linux, the RouterDeck Connect helpers and the extension packages, and attaches them,
with `SHA256SUMS.txt`, to a GitHub Release. Installed desktop apps pick the new version up from there.
Code signing is optional and switches on when these repository secrets exist:
`MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` (macOS, also enables
in-place updates on Mac) and `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` (Windows).

## Deploy (free, Cloudflare Workers)

[deploy.yml](.github/workflows/deploy.yml) builds `web/` and runs `wrangler deploy` (static assets from `web/out`,
config in [web/wrangler.jsonc](web/wrangler.jsonc)) on every push to `main`. It needs two repository secrets:

| Secret | Where to get it |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers** |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare → Workers & Pages → *Account ID* in the right sidebar |

The custom domain `router.pramitha.lk` is attached to the `routerdeck` Worker in Cloudflare.
Every push to `main` deploys automatically. Using your own domain? Add it to
`extension/manifest.json` (`content_scripts.matches`) and start the connector with `--origin https://your-domain`.

## Contributing

Router support requests, beta testing and pull requests are very welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
and [docs/ADDING_A_ROUTER.md](docs/ADDING_A_ROUTER.md).

## License

[MIT](LICENSE) © [Pramitha Jayasooriya](https://pramitha.lk)

<sub>RouterDeck is an independent project and is not affiliated with SLT-Mobitel, Dialog, Hutch, Airtel, SpaceX/Starlink, Huawei or any router maker. Provider names and logos belong to their owners.</sub>
