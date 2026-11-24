<div align="center">

<img src="web/public/icon.svg" width="72" alt="RouterDeck logo" />

# RouterDeck

**Your home Wi-Fi, finally simple.**

A modern, mobile-friendly dashboard for home routers. Block a device, change the Wi-Fi password,
run a speed test or check your connection in seconds, on SLT-Mobitel fiber, Dialog / Mobitel / Hutch 4G routers,
Starlink and more.

[**Open RouterDeck →**](https://router.pramitha.lk) &nbsp;·&nbsp; [Try the demo](https://router.pramitha.lk) &nbsp;·&nbsp; [Report a bug](https://github.com/PramithaMJ/RouterDeck/issues/new/choose)

[![CI](https://github.com/PramithaMJ/RouterDeck/actions/workflows/ci.yml/badge.svg)](https://github.com/PramithaMJ/RouterDeck/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-indigo.svg)](LICENSE)

</div>

---

## Features

| | |
| --- | --- |
| 📡 **Auto-detect** | Finds your router and recognises your provider (SLT-Mobitel, Dialog, Mobitel, Hutch, Airtel, Starlink) with its logo |
| 📱 **Devices** | See who's online, rename devices, **block / unblock** in one tap, or switch to an **allow list** (only approved devices get internet) |
| 📶 **Wi-Fi** | Rename networks, change or **generate** passwords, turn 2.4/5 GHz on/off, **share with a QR code** |
| ⚡ **Speed test** | Download, upload, ping, jitter and loaded latency with a live animated gauge, history and plain-language verdicts |
| 🛡️ **Protection** | Block websites for the whole network |
| 🎛️ **All settings** | *Every* page of the router's own admin UI (DHCP, port forwarding, DMZ, UPnP, IPv6, diagnostics…) re-rendered as clean, modern forms |
| 🔭 **Line health** | Fiber Rx/Tx power, 4G signal (RSRP/SINR/bars), Starlink latency and obstructions |
| 🔐 **Admin** | Change the router password, restart safely |
| 🌗 | Light & dark mode, works great on phones |

## Supported routers

| Router | ISPs | Status |
| --- | --- | --- |
| Realtek GPON ONTs (e.g. **HG7**) | SLT-Mobitel fiber | ✅ Verified on hardware |
| Huawei HiLink 4G/5G (B310, B311, B315, B525, B535, E5576…) | Dialog, Mobitel, Hutch, Airtel | 🧪 Beta |
| Starlink dish (status) | Starlink | 🧪 Beta, read-only |
| Huawei EchoLife, ZTE ZXHN, ZTE 4G, TP-Link | Dialog Fiber, SLT, others | 🗺️ Planned, [help add yours](docs/ADDING_A_ROUTER.md) |

## How it works (and why there's no backend)

A router's admin page only answers **inside your home network**. No cloud server (Cloudflare included) can reach
`192.168.1.1`, and browsers block public websites from reading LAN devices directly. So RouterDeck is a
**static website + a tiny bridge on your own computer**:

```
 RouterDeck website (static, Cloudflare Pages)
        │  postMessage                      │  http://127.0.0.1 + pairing code
        ▼                                   ▼
 RouterDeck Connect extension      or    Local connector (Node.js)
        └──────────────► Your router (192.168.x.x) ◄──────────────┘
```

- **Zero servers.** Hosting is free and nothing sensitive passes through anyone's infrastructure.
- **Passwords never stored.** They go from your browser straight to your router.
- **Drivers live in the web app.** The bridges are dumb, permission-checked pipes, so new routers never need a bridge update.
- **Router pages run sandboxed.** For form-based routers, the router's own page runs in a locked-down iframe
  (opaque origin, network blocked) so its own validation, password hashing and form signing are reused exactly.
  RouterDeck fills the form and captures the request the router UI would have sent. That's what powers *All settings*.

See [SECURITY.md](SECURITY.md) for the full security model.

## Use it

1. Open **<https://router.pramitha.lk>** on a computer connected to your home Wi-Fi.
2. Install a bridge (one time):
   - **Extension** (Chrome, Edge, Brave): download from the site → `chrome://extensions` → Developer mode → *Load unpacked*.
   - **Connector** (any browser, Node 18+): `node routerdeck-connector.mjs`. It prints a pairing link.
3. RouterDeck finds your router. Sign in with the router's own username and password.

Or click **Try the demo** to explore with a simulated router. The speed test works without any setup.

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
extension/   RouterDeck Connect, Manifest V3 browser extension
connector/   Zero-dependency Node.js connector
docs/        Guides (adding a router)
```

## Deploy (free, Cloudflare Pages)

Connected to this repository with Git integration:

| Setting | Value |
| --- | --- |
| Root directory | `web` |
| Build command | `npm run build` |
| Output directory | `out` |
| Node version | `22` (from `web/.node-version`) |
| Custom domain | `router.pramitha.lk` |

Every push to `main` deploys automatically. Using your own domain? Add it to
`extension/manifest.json` (`content_scripts.matches`) and start the connector with `--origin https://your-domain`.

## Contributing

Router support requests, beta testing and pull requests are very welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md)
and [docs/ADDING_A_ROUTER.md](docs/ADDING_A_ROUTER.md).

## License

[MIT](LICENSE) © [Pramitha Jayasooriya](https://pramitha.lk)

<sub>RouterDeck is an independent project and is not affiliated with SLT-Mobitel, Dialog, Hutch, Airtel, SpaceX/Starlink, Huawei or any router maker. Provider names and logos belong to their owners.</sub>
