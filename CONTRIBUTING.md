# Contributing to RouterDeck

Thanks for helping make home networks less painful! 🎉

## Ways to help

- **Add or test a router.** Most valuable: open a *Router support* issue with your model and ISP,
  or follow [docs/ADDING_A_ROUTER.md](docs/ADDING_A_ROUTER.md) to write a driver.
- **Test beta drivers** (Huawei 4G HiLink, Starlink) and report what works.
- **Fix bugs / improve UX.** Small, focused pull requests are easiest to review.

## Development

```bash
cd web
npm install
npm run dev        # http://localhost:3000 – use "Try the demo" without a router
npm test           # unit tests
npm run typecheck
npm run build      # static export to web/out
```

Load `extension/` as an unpacked extension (chrome://extensions → Developer mode) or run
`node connector/routerdeck-connector.mjs` to talk to a real router.

## Guidelines

- TypeScript, no `any` without a reason. Keep router knowledge inside `web/src/lib/drivers`.
- Never send changes to a router while investigating it; capture first, send only when you
  understand the request.
- **Never commit personal data**: real MAC addresses, IPs, SSIDs, passwords or screenshots
  that show them. Use made-up values in tests and the demo.
- User-facing text is plain English, short and friendly.
- Run `npm run typecheck && npm test && npm run build` before opening a PR.

By contributing you agree your work is licensed under the [MIT License](LICENSE) and that you
follow the [Code of Conduct](CODE_OF_CONDUCT.md).
