"use client";

import { ShieldAlert } from "lucide-react";
import { useState } from "react";
import { qk, useIpv6, useRouterAction } from "@/lib/queries";
import { Button, ConfirmDialog, Notice } from "./ui";

/**
 * The HG7 (and many ISP routers) only filter IPv4. With IPv6 on, blocked
 * websites/devices can still get through over IPv6. One tap fixes it.
 */
export function Ipv6Notice({ what }: { what: "websites" | "devices" }) {
  const { data } = useIpv6();
  const [ask, setAsk] = useState(false);
  const fix = useRouterAction<void>((d) => d.setIpv6!(false), {
    invalidate: [qk.ipv6, qk.overview],
    pending: "Turning off IPv6 on your router…",
    success: "Done. Blocking now covers all traffic. Devices may reconnect for a moment.",
  });
  if (!data?.enabled) return null;
  return (
    <>
      <Notice tone="amber" icon={<ShieldAlert />} className="mb-4">
        <p className="font-semibold">Blocking can be bypassed right now</p>
        <p className="mt-1">
          Your router only blocks {what} on IPv4, but IPv6 is also switched on, and many apps and sites (YouTube, for example) use IPv6, so they slip through. Turning IPv6 off makes blocking work for everything. Internet keeps working normally.
        </p>
        <Button size="sm" className="mt-3" onClick={() => setAsk(true)} loading={fix.isPending}>
          Make blocking work (turn off IPv6)
        </Button>
      </Notice>
      <ConfirmDialog
        open={ask}
        onClose={() => setAsk(false)}
        onConfirm={async () => {
          setAsk(false);
          try {
            await fix.mutateAsync();
          } catch {}
        }}
        loading={fix.isPending}
        title="Turn off IPv6?"
        description="Your home internet keeps working over IPv4, which your router can filter. Devices may disconnect for a few seconds; if a phone still gets around a block, turn its Wi-Fi off and on. You can turn IPv6 back on any time under All settings → IPv6."
        confirmLabel="Turn off IPv6"
      />
    </>
  );
}
