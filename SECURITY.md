# Security Policy

RouterDeck talks to the router that runs your home network, so we take security seriously.

## Supported versions

| Component | Supported |
| --- | --- |
| Website (`router.pramitha.lk`, `main` branch) | ✅ latest |
| RouterDeck Connect extension | ✅ latest release |
| Local connector | ✅ latest release |

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub: **Security → Report a vulnerability** on this repository
(<https://github.com/PramithaMJ/RouterDeck/security/advisories/new>).

Include what you found, how to reproduce it, and the impact you expect. You can expect:

- an acknowledgement within **3 days**,
- an assessment and plan within **10 days**,
- credit in the release notes if you'd like it.

## Security model (what we promise)

- **No backend, no accounts.** The website is static files. Router passwords go from the
  browser straight to the router and are never stored or sent anywhere else.
- **Private network only.** The extension and connector refuse any address that is not a
  private/LAN address (`10/8`, `172.16/12`, `192.168/16`, `169.254/16`, loopback, `.local`).
- **Per-site approval.** The extension only works on listed RouterDeck origins, asks the user
  to approve each website/router pair, and requests host permission for that single router.
- **Pairing code.** The connector listens on `127.0.0.1` only, answers allow-listed origins
  only, and requires a pairing code (sent as a header, which also forces a CORS preflight).
- **Sandboxed router pages.** Router admin pages are rendered in an `allow-scripts` sandbox
  with an opaque origin and a CSP that blocks all network access; they cannot touch the app,
  its storage or the network.

## Out of scope

- Vulnerabilities in routers themselves (please report those to the vendor/ISP).
- Attacks that require malware already running on the user's computer.
