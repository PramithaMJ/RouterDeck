import { Ban, Check, Laptop, QrCode, Smartphone, Tv, Wifi } from "lucide-react";

/**
 * A static, hand-composed preview of the app for the landing page.
 * Real UI patterns with made-up data. No screenshots, no stock art.
 */
export function ProductPreview() {
  return (
    <div className="relative">
      <div className="surface overflow-hidden rounded-[18px] border border-subtle shadow-pop">
        {/* window bar */}
        <div className="flex items-center gap-2 border-b border-subtle px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-[var(--border)]" />
          <span className="size-2.5 rounded-full bg-[var(--border)]" />
          <span className="size-2.5 rounded-full bg-[var(--border)]" />
          <span className="ml-3 font-mono text-[11px] text-muted">router.pramitha.lk/devices</span>
        </div>

        <div className="grid gap-0 sm:grid-cols-[1.25fr_1fr]">
          {/* devices */}
          <div className="border-b border-subtle p-5 sm:border-b-0 sm:border-r">
            <div className="flex items-baseline justify-between">
              <p className="text-[15px] font-semibold tracking-[-0.01em]">On your Wi-Fi</p>
              <p className="font-mono text-[11px] text-muted">6 online</p>
            </div>
            <ul className="mt-3 divide-y divide-[var(--border)]">
              {[
                { icon: Smartphone, name: "Nimali's phone", sub: "Wi-Fi 5 GHz · .14", state: "on" },
                { icon: Laptop, name: "Work laptop", sub: "Wi-Fi 5 GHz · .8", state: "on" },
                { icon: Tv, name: "Living room TV", sub: "Cable · .11", state: "on" },
                { icon: Smartphone, name: "Unknown device", sub: "Wi-Fi 2.4 GHz · .23", state: "blocked" },
              ].map((d) => (
                <li key={d.name} className="flex items-center gap-3 py-2.5">
                  <span className="flex size-8 items-center justify-center rounded-lg bg-[var(--surface-2)] text-muted">
                    <d.icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-medium">{d.name}</span>
                    <span className="block font-mono text-[11px] text-muted">{d.sub}</span>
                  </span>
                  {d.state === "blocked" ? (
                    <span className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-1 text-[11.5px] font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
                      <Ban className="size-3" /> Blocked
                    </span>
                  ) : (
                    <span className="rounded-md border border-subtle px-2 py-1 text-[11.5px] font-medium text-muted">Block</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* status + wifi */}
          <div className="space-y-4 p-5">
            <div>
              <p className="label-caps">Internet</p>
              <p className="mt-1.5 flex items-center gap-2 text-[22px] font-semibold tracking-[-0.02em]">
                <span className="relative inline-flex size-2.5">
                  <span className="absolute inset-0 animate-ping rounded-full bg-emerald-500/60" />
                  <span className="relative size-2.5 rounded-full bg-emerald-500" />
                </span>
                Online
              </p>
              <p className="mt-0.5 font-mono text-[11.5px] text-muted">up 4d 6h · fiber −19.4 dBm</p>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-lg bg-[var(--surface-2)] p-2.5">
                <p className="label-caps">Down</p>
                <p className="mt-0.5 font-mono text-[18px] font-medium">
                  94.2<span className="ml-0.5 text-[11px] text-muted">Mbps</span>
                </p>
              </div>
              <div className="rounded-lg bg-[var(--surface-2)] p-2.5">
                <p className="label-caps">Ping</p>
                <p className="mt-0.5 font-mono text-[18px] font-medium">
                  8<span className="ml-0.5 text-[11px] text-muted">ms</span>
                </p>
              </div>
            </div>
            <div className="rounded-lg border border-subtle p-3">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[13px] font-medium">
                  <Wifi className="size-4" /> Perera-Home-5G
                </span>
                <QrCode className="size-4 text-muted" />
              </div>
              <p className="mt-2 flex items-center justify-between font-mono text-[12px]">
                <span className="text-muted">password</span>
                <span>mango-river-42</span>
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-emerald-700 dark:text-emerald-400">
                <Check className="size-3.5" /> Saved · devices reconnecting
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
