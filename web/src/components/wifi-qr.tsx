"use client";

import QRCode from "qrcode";
import { Download, Wifi } from "lucide-react";
import { useEffect, useState } from "react";
import type { WifiNetwork } from "@/lib/router/types";
import { Button, CopyButton, Dialog } from "./ui";

/** WIFI: URI understood by iOS & Android camera apps. */
function wifiUri(n: Pick<WifiNetwork, "ssid" | "password" | "hidden">) {
  const esc = (s: string) => s.replace(/([\\;,:"])/g, "\\$1");
  const type = n.password ? "WPA" : "nopass";
  return `WIFI:T:${type};S:${esc(n.ssid)};${n.password ? `P:${esc(n.password)};` : ""}${n.hidden ? "H:true;" : ""};`;
}

export function WifiQrDialog({ network, open, onClose }: { network: WifiNetwork | null; open: boolean; onClose: () => void }) {
  const [svg, setSvg] = useState<string>("");
  useEffect(() => {
    if (!network || !open) return;
    QRCode.toString(wifiUri(network), { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#111322", light: "#ffffff" } }).then(setSvg);
  }, [network, open]);

  function download() {
    if (!network) return;
    QRCode.toDataURL(wifiUri(network), { width: 1024, margin: 2 }).then((url) => {
      const a = document.createElement("a");
      a.href = url;
      a.download = `wifi-${network.ssid.replace(/[^a-z0-9-_]+/gi, "_")}.png`;
      a.click();
    });
  }

  return (
    <Dialog open={open} onClose={onClose} size="sm" title="Share Wi-Fi" description="Point a phone camera at this code to join instantly.">
      {network && (
        <div className="flex flex-col items-center">
          <div className="w-full max-w-[260px] rounded-3xl border border-subtle bg-white p-4 shadow-card [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          <div className="mt-5 w-full space-y-2 rounded-2xl bg-[var(--surface-2)] p-4 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted">Network</span>
              <span className="flex min-w-0 items-center gap-1 font-medium">
                <Wifi className="size-4 shrink-0 text-brand-500" />
                <span className="truncate">{network.ssid}</span>
              </span>
            </div>
            {network.password && (
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted">Password</span>
                <span className="flex min-w-0 items-center gap-1">
                  <span className="truncate font-mono text-[13px]">{network.password}</span>
                  <CopyButton value={network.password} label="Copy password" />
                </span>
              </div>
            )}
          </div>
          <Button variant="secondary" className="mt-4 w-full" onClick={download}>
            <Download className="size-4" /> Save as image
          </Button>
        </div>
      )}
    </Dialog>
  );
}
