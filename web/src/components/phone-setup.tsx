"use client";

import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import { Apple, Laptop, RefreshCw, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { CONNECTOR_DOWNLOAD } from "@/lib/site";
import { CONNECT_APPS, detectPlatform, type ConnectApp } from "@/lib/downloads";
import { Download } from "lucide-react";
import type { NetworkInfo } from "@/lib/transport/types";
import { getConnectorToken, useSession } from "@/lib/session";
import { ConnectorTransport, DEFAULT_CONNECTOR_URL, servedByConnector } from "@/lib/transport/connector";
import { Button, CopyButton, Notice, Segmented, Spinner } from "./ui";

function Code({ children }: { children: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#1b1a17] py-2 pl-3.5 pr-1.5 font-mono text-[12px] text-[#f2f0ea]">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap scrollbar-none">{children}</code>
      <CopyButton value={children} className="text-[#a8a49a] hover:bg-white/10 hover:text-white" />
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-subtle font-mono text-[11.5px]">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5 text-[14px] leading-relaxed">{children}</div>
    </li>
  );
}

/** QR for a phone on the same Wi-Fi, shown on the computer running the connector. */
function PairQr() {
  const availability = useSession((s) => s.availability);
  const refresh = useSession((s) => s.refreshAvailability);
  const token = typeof window !== "undefined" ? getConnectorToken() : null;
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["phone-pair", availability?.connector?.version, token],
    queryFn: async (): Promise<NetworkInfo> => (token ? new ConnectorTransport(token, DEFAULT_CONNECTOR_URL).network() : {}),
    enabled: !!availability?.connector && !!token,
  });
  const [svg, setSvg] = useState("");
  const url = data?.lan && data.localIp && token ? `http://${data.localIp}:${data.port ?? 47800}/#pair=${encodeURIComponent(token)}` : null;
  useEffect(() => {
    if (!url) return setSvg("");
    QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#1b1a17", light: "#ffffff" } }).then(setSvg);
  }, [url]);

  if (!availability?.connector || !token) {
    return (
      <Notice tone="brand">
        Start the connector on this computer first (step 1), pair it on the Connect screen, then come back here for the QR code.
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => refresh()}>
          <RefreshCw className="size-3.5" /> Check again
        </Button>
      </Notice>
    );
  }
  if (!url) {
    return (
      <Notice tone="amber">
        The connector is running for this computer only. Stop it (Ctrl+C) and start it again with <b className="font-mono">--lan</b> so your phone can reach it.
        <Button size="sm" variant="secondary" className="mt-3" onClick={() => refetch()} loading={isFetching}>
          <RefreshCw className="size-3.5" /> Check again
        </Button>
      </Notice>
    );
  }
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div className="w-44 shrink-0 rounded-xl border border-subtle bg-white p-2.5 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
      <div className="min-w-0 text-[14px] leading-relaxed">
        <p className="font-medium">Scan with your phone&apos;s camera</p>
        <p className="mt-1 text-muted">Your phone must be on the same Wi-Fi. It opens RouterDeck already paired. Then tap Share → &quot;Add to Home Screen&quot; to keep it like an app.</p>
        <p className="mt-2 break-all font-mono text-[12px] text-muted">{url.replace(/#pair=.*/, "")}</p>
      </div>
    </div>
  );
}

/**
 * Explains (and enables) using RouterDeck from phones.
 * Phones can't run browser extensions, so a computer, Raspberry Pi or the
 * phone itself (Android/Termux) runs the connector, which also serves the app.
 */
export function PhoneSetup({ compact }: { compact?: boolean }) {
  const [tab, setTab] = useState<"computer" | "android" | "iphone">("computer");
  const [platform, setPlatform] = useState<ConnectApp>("windows");
  useEffect(() => {
    void detectPlatform().then((p) => setPlatform(/Android|iPhone|iPad/i.test(navigator.userAgent) ? "windows" : p));
  }, []);
  if (servedByConnector()) {
    return (
      <Notice tone="green" icon={<Smartphone />}>
        You&apos;re already using phone mode. Add this page to your home screen to open it like an app.
      </Notice>
    );
  }
  return (
    <div>
      {!compact && (
        <p className="mb-4 text-[14px] leading-relaxed text-muted">
          Phone browsers can&apos;t install extensions, so one device at home runs the small connector and your phone opens RouterDeck through it. Works on iPhone and Android.
        </p>
      )}
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-5 grid w-full grid-cols-3"
        options={[
          { value: "computer", label: <span className="flex items-center justify-center gap-1.5"><Laptop className="size-3.5" /> Computer</span> },
          { value: "android", label: <span className="flex items-center justify-center gap-1.5"><Smartphone className="size-3.5" /> Android</span> },
          { value: "iphone", label: <span className="flex items-center justify-center gap-1.5"><Apple className="size-3.5" /> iPhone</span> },
        ]}
      />

      {tab === "computer" && (
        <ol className="space-y-4">
          <Step n={1}>
            On a computer at home (Windows, Mac, Linux), get RouterDeck Connect and open it. It opens RouterDeck already paired.
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <a href={CONNECT_APPS[platform].file} className="bg-ink inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[14px] font-medium">
                <Download className="size-4" /> Download for {CONNECT_APPS[platform].label}
              </a>
            </div>
            <details className="mt-2 text-[12.5px] text-muted">
              <summary className="cursor-pointer">Raspberry Pi / terminal</summary>
              <Code>{`curl -fsSLO ${CONNECTOR_DOWNLOAD} && node routerdeck-connector.mjs --lan`}</Code>
            </details>
          </Step>
          <Step n={2}>On that computer, RouterDeck opens by itself. You&apos;ll see this QR in Settings → Use on your phone.</Step>
          <Step n={3}>
            Scan this with your iPhone or Android:
            <div className="mt-3">
              <PairQr />
            </div>
          </Step>
          <Step n={4}>Keep the computer awake while you use your phone. A Raspberry Pi or old laptop works great as an always-on helper.</Step>
        </ol>
      )}

      {tab === "android" && (
        <ol className="space-y-4">
          <Step n={1}>
            Install{" "}
            <a href="https://f-droid.org/packages/com.termux/" target="_blank" rel="noopener" className="font-medium underline underline-offset-4">
              Termux
            </a>{" "}
            (free, from F-Droid or GitHub. The Play Store version is outdated).
          </Step>
          <Step n={2}>
            Open Termux and paste:
            <Code>{`pkg install -y nodejs-lts curl && curl -fsSLO ${CONNECTOR_DOWNLOAD} && node routerdeck-connector.mjs`}</Code>
            Next time you only need <span className="font-mono text-[13px]">node routerdeck-connector.mjs</span>.
          </Step>
          <Step n={3}>
            Long-press the link it prints (<span className="font-mono text-[13px]">http://127.0.0.1:47800/#pair=…</span>) and open it in Chrome. RouterDeck opens paired, running entirely on your phone.
          </Step>
          <Step n={4}>In Chrome&apos;s menu tap &quot;Add to Home screen&quot;. Keep Termux running in the background while you use it.</Step>
        </ol>
      )}

      {tab === "iphone" && (
        <div className="space-y-4 text-[14px] leading-relaxed">
          <p>
            iPhones don&apos;t let web pages or extensions talk to your router, and can&apos;t run the connector themselves. So one other device at home runs it: a computer, a Raspberry Pi, or an Android phone (see the other tabs).
            Then your iPhone scans the QR and uses RouterDeck in Safari like a normal app. Tap Share → &quot;Add to Home Screen&quot; to give it its own icon.
          </p>
        </div>
      )}
    </div>
  );
}

export function PhoneSetupLoading() {
  return <Spinner />;
}
