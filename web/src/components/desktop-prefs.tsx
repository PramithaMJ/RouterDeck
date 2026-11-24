"use client";

import QRCode from "qrcode";
import { Laptop, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { desktopBridge, type DesktopSettings, type ShareStatus } from "@/lib/transport/desktop";
import { Button, Card, CardHeader, Switch } from "./ui";
import { useUpdateState } from "./update-banner";

function Row({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="min-w-0">
        <p className="text-[14px] font-medium">{title}</p>
        <p className="text-[12.5px] text-muted">{hint}</p>
      </div>
      {children}
    </div>
  );
}

/** Preferences of the RouterDeck desktop app (only rendered inside it). */
export function DesktopPrefsCard() {
  const bridge = desktopBridge();
  const host = useSession((s) => s.connection?.host) ?? "";
  const [prefs, setPrefs] = useState<DesktopSettings | null>(null);
  const [share, setShare] = useState<ShareStatus | null>(null);
  const [qr, setQr] = useState("");
  const [hasCreds, setHasCreds] = useState(false);
  const [checking, setChecking] = useState(false);
  const update = useUpdateState();

  useEffect(() => {
    if (!bridge) return;
    void bridge.settings.get().then(setPrefs);
    void bridge.share.status().then(setShare);
    if (host) void bridge.credentials.get(host).then((c) => setHasCreds(!!c));
  }, [bridge, host]);

  useEffect(() => {
    if (!share?.url) return setQr("");
    void QRCode.toString(share.url, { type: "svg", margin: 1, color: { dark: "#1b1a17", light: "#ffffff" } }).then(setQr);
  }, [share?.url]);

  if (!bridge) return null;

  async function update_(patch: Partial<DesktopSettings>) {
    const next = await bridge!.settings.set(patch);
    setPrefs(next);
    if ("shareWithPhones" in patch) setShare(await bridge!.share.status());
  }

  return (
    <Card className="mt-5">
      <CardHeader title="RouterDeck app" description={bridge.platform} icon={<Laptop className="size-5 text-muted" />} />
      <div className="divide-y divide-[var(--border)] px-5 pb-3 sm:px-6">
        <Row title="Keep running in the background" hint="Stays in the menu bar / system tray when you close the window, so guest passes end on time.">
          <Switch checked={!!prefs?.runInBackground} onChange={(v) => update_({ runInBackground: v })} label="Run in background" />
        </Row>
        <Row title="Start when the computer starts" hint="Opens quietly in the background after you log in.">
          <Switch checked={!!prefs?.startAtLogin} onChange={(v) => update_({ startAtLogin: v })} label="Start at login" />
        </Row>
        <Row title="Share with phones on this Wi-Fi" hint="Phones open RouterDeck from this computer, no install needed on the phone.">
          <Switch checked={!!prefs?.shareWithPhones} onChange={(v) => update_({ shareWithPhones: v })} label="Share with phones" />
        </Row>
        {prefs?.shareWithPhones && (
          <div className="flex flex-col items-center gap-4 py-4 sm:flex-row sm:items-start">
            {share?.url ? (
              <>
                <div className="w-40 shrink-0 rounded-xl border border-subtle bg-white p-2 [&_svg]:h-auto [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: qr }} />
                <div className="text-[13.5px]">
                  <p className="font-medium">Scan with your phone&apos;s camera</p>
                  <p className="mt-1 text-muted">Same Wi-Fi needed. Then Share → &quot;Add to Home Screen&quot; to keep it like an app.</p>
                  <p className="mt-2 break-all font-mono text-[12px] text-muted">{share.url.replace(/#pair=.*/, "")}</p>
                </div>
              </>
            ) : (
              <p className="text-[13px] text-muted">{share?.error ?? "Starting…"}</p>
            )}
          </div>
        )}
        <Row title="Saved router password" hint={hasCreds ? "Stored encrypted in this computer's keychain." : "Not saved. Tick “Remember password” when signing in."}>
          <Button
            size="sm"
            variant="secondary"
            disabled={!hasCreds}
            onClick={async () => {
              await bridge.credentials.clear(host);
              setHasCreds(false);
              toast.success("Saved password removed from this computer.");
            }}
          >
            Forget
          </Button>
        </Row>
        <Row
          title="Install updates automatically"
          hint={update?.inPlace === false ? "On this computer RouterDeck downloads the new installer for you; you finish with one click." : "Downloads new versions in the background. Restart RouterDeck to finish."}
        >
          <Switch checked={!!prefs?.autoUpdate} onChange={(v) => update_({ autoUpdate: v })} label="Install updates automatically" />
        </Row>
        <Row
          title={`Version ${bridge.version}`}
          hint={
            update?.status === "available"
              ? `RouterDeck ${update.version} is available.`
              : update?.status === "downloading"
                ? `Downloading ${update.version ?? "update"}… ${update.percent ?? 0}%`
                : update?.status === "ready"
                  ? `${update.version} is ready to install.`
                  : update?.status === "latest"
                    ? "You're on the latest version."
                    : "New versions come from RouterDeck’s GitHub releases."
          }
        >
          {update?.status === "available" ? (
            <Button size="sm" onClick={() => void bridge.updates?.download()}>
              Update now
            </Button>
          ) : update?.status === "ready" ? (
            <Button size="sm" onClick={() => void bridge.updates?.install()}>
              {update.inPlace ? "Restart to update" : "Open installer"}
            </Button>
          ) : (
            <Button
              size="sm"
              variant="secondary"
              loading={checking || update?.status === "checking" || update?.status === "downloading"}
              onClick={async () => {
                setChecking(true);
                const r = await bridge.checkForUpdates().catch(() => ({ status: "error" }));
                setChecking(false);
                if (r.status === "latest") toast.success("You're on the latest version.");
                else if (r.status === "error") toast.info("Couldn't check for updates right now.");
              }}
            >
              <RefreshCw className="size-3.5" /> Check
            </Button>
          )}
        </Row>
      </div>
    </Card>
  );
}
