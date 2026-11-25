import type { Metadata } from "next";
import { Logo } from "@/components/brand";
import { BuiltByFooter } from "@/components/built-by";
import { ThemeToggle } from "@/components/theme-toggle";

export const metadata: Metadata = { alternates: { canonical: "/privacy/" }, title: "Privacy", description: "What RouterDeck, RouterDeck Connect and the RouterDeck extension do with your data: nothing leaves your home network." };

const SECTIONS: [string, string[]][] = [
  [
    "The short version",
    [
      "RouterDeck has no servers, no accounts, no analytics and no ads. It never sees your router password, your Wi-Fi password or your devices.",
      "Everything RouterDeck shows comes from your own router and goes straight to your own browser, inside your home network.",
    ],
  ],
  [
    "The website",
    [
      "router.pramitha.lk is a set of static files. It sets no tracking cookies and runs no analytics.",
      "Settings you choose (theme, device nicknames, speed-test history, which router you used) are stored only in your browser's local storage and can be cleared at any time.",
      "Your router password is sent only to your router, through the extension or RouterDeck Connect, and is never stored.",
      "The speed test downloads and uploads test data to Cloudflare's public speed-test service (speed.cloudflare.com), which also tells the page your public IP address, provider and nearest server. That information is shown to you and not sent anywhere else.",
      "Provider logos are loaded from DuckDuckGo's public icon service.",
    ],
  ],
  [
    "The browser extension (RouterDeck Connect for Chrome)",
    [
      "It is published on the Chrome Web Store as RouterDeck (chromewebstore.google.com/detail/routerdeck/egfnlpdojhpdhakgcifhiadchbanddjj). The extension only runs on RouterDeck's own website. It forwards requests from that website to devices on your private home network (addresses like 192.168.x.x) after you approve each website and router once.",
      "It refuses any address on the public internet. It stores only the list of websites and routers you approved, in the browser's extension storage. It collects, sells or transmits no data.",
    ],
  ],
  [
    "RouterDeck Connect (desktop app / connector)",
    [
      "Runs on your computer, listens only on your home network, and only answers RouterDeck pages that present its pairing code.",
      "It keeps your router's session cookie in memory while running and stores only its pairing code on your computer. When it serves the app to your phone it loads the public RouterDeck website files.",
    ],
  ],
  ["Contact", ["Questions or concerns: open an issue on GitHub (github.com/PramithaMJ/RouterDeck) or reach the author via pramitha.lk. Security issues: see SECURITY.md in the repository."]],
];

export default function PrivacyPage() {
  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-3xl items-center justify-between px-4 py-5 sm:px-6">
        <Logo />
        <ThemeToggle />
      </header>
      <main className="mx-auto max-w-3xl px-4 pb-20 pt-6 sm:px-6">
        <p className="label-caps">Privacy policy · updated November 2026</p>
        <h1 className="mt-3 text-[2.2rem] font-semibold leading-tight tracking-[-0.03em]">Your network stays yours.</h1>
        <div className="mt-10 space-y-10">
          {SECTIONS.map(([title, paras]) => (
            <section key={title}>
              <h2 className="text-[17px] font-semibold tracking-[-0.01em]">{title}</h2>
              <div className="mt-3 space-y-3 text-[15px] leading-relaxed text-muted">
                {paras.map((p) => (
                  <p key={p}>{p}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </main>
      <BuiltByFooter />
    </div>
  );
}
