"use client";

import { Download, ExternalLink, Puzzle, RefreshCw, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { CHROME_STORE_URL, CONNECT_APPS, detectPlatform, type ConnectApp } from "@/lib/downloads";
import { CONNECTOR_DOWNLOAD } from "@/lib/site";
import { getConnectorToken, setConnectorToken, useSession } from "@/lib/session";
import { ConnectorTransport } from "@/lib/transport/connector";
import { Button, CopyButton, Dialog, Field, Input, Notice, Segmented } from "./ui";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-subtle font-mono text-[11.5px]">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5 text-[14px] leading-relaxed">{children}</div>
    </li>
  );
}

function Code({ children }: { children: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-lg bg-[#1b1a17] py-2 pl-3.5 pr-1.5 font-mono text-[12px] text-[#f2f0ea]">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap scrollbar-none">{children}</code>
      <CopyButton value={children} className="text-[#a8a49a] hover:bg-white/10 hover:text-white" />
    </div>
  );
}

function CheckAgain({ label, done }: { label: string; done?: string | null }) {
  const refresh = useSession((s) => s.refreshAvailability);
  const [checking, setChecking] = useState(false);
  if (done) return <p className="text-[13.5px] font-medium text-emerald-700 dark:text-emerald-400">{done}</p>;
  return (
    <Button
      variant="secondary"
      loading={checking}
      onClick={async () => {
        setChecking(true);
        await refresh();
        setChecking(false);
      }}
    >
      <RefreshCw className="size-4" /> {label}
    </Button>
  );
}

export function ExtensionSetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const version = useSession((s) => s.availability?.extension);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Puzzle className="size-5 text-muted" /> Add the RouterDeck extension
        </span>
      }
      description="For Chrome, Edge and Brave on a computer that's on your home Wi-Fi."
      footer={version ? <Button onClick={onClose}>Done</Button> : <CheckAgain label="I added it, check again" />}
    >
      {version ? (
        <Notice tone="green">Extension v{version} is installed. Close this and continue.</Notice>
      ) : CHROME_STORE_URL ? (
        <ol className="space-y-4">
          <Step n={1}>
            <a href={CHROME_STORE_URL} target="_blank" rel="noopener" className="bg-ink inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[14px] font-medium">
              Add to Chrome <ExternalLink className="size-4" />
            </a>
            <p className="mt-1.5 text-[12.5px] text-muted">
              Opens the Chrome Web Store. Click &quot;Add to Chrome&quot;, then come back. On Edge, click &quot;Allow extensions from other stores&quot; first.
            </p>
          </Step>
          <Step n={2}>Reload this page. The first time you connect, the extension asks you to allow this site to talk to your router.</Step>
          <li className="text-[12.5px] text-muted">
            Can&apos;t use the Chrome Web Store?{" "}
            <a href="/downloads/routerdeck-extension.zip" download className="text-[var(--text)] underline underline-offset-2">
              Download the extension
            </a>
            , unzip it, then in <span className="font-mono">chrome://extensions</span> turn on Developer mode and click Load unpacked.
          </li>
        </ol>
      ) : (
        <ol className="space-y-4">
          <Step n={1}>
            Download the extension and unzip it.
            <div className="mt-2">
              <a href="/downloads/routerdeck-extension.zip" download className="bg-ink inline-flex h-10 items-center gap-2 rounded-lg px-4 text-[14px] font-medium">
                <Download className="size-4" /> routerdeck-extension.zip
              </a>
            </div>
          </Step>
          <Step n={2}>
            Open <b className="font-mono text-[13px]">chrome://extensions</b> and turn on <b>Developer mode</b> (top-right).
          </Step>
          <Step n={3}>
            Click <b>Load unpacked</b> and choose the unzipped <span className="font-mono text-[13px]">routerdeck-extension</span> folder.
          </Step>
          <Step n={4}>Reload this page. The first time you connect, the extension asks you to allow this site to talk to your router.</Step>
        </ol>
      )}
      <p className="mt-5 text-[12.5px] text-muted">
        The extension only talks to home-network addresses, only for websites you approve, and collects nothing. Prefer not to install it? Use RouterDeck Connect instead.
      </p>
    </Dialog>
  );
}

export function ConnectorSetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const refresh = useSession((s) => s.refreshAvailability);
  const availability = useSession((s) => s.availability);
  const [platform, setPlatform] = useState<ConnectApp>("windows");
  const [mode, setMode] = useState<"app" | "terminal">("app");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    void detectPlatform().then(setPlatform);
    setCode(getConnectorToken() ?? "");
  }, [open]);

  // While the dialog is open, keep checking: the app opens this site already paired.
  useEffect(() => {
    if (!open || availability?.connectorPaired) return;
    const t = setInterval(() => void refresh(), 2500);
    return () => clearInterval(t);
  }, [open, availability?.connectorPaired, refresh]);

  useEffect(() => {
    if (open && availability?.connectorPaired) onClose();
  }, [open, availability?.connectorPaired, onClose]);

  async function pair() {
    setBusy(true);
    setError(null);
    try {
      const t = new ConnectorTransport(code.trim());
      await t.verify();
      setConnectorToken(code.trim());
      await refresh();
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const app = CONNECT_APPS[platform];
  const mac = platform === "macArm" || platform === "macIntel";

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title="Get RouterDeck Connect"
      description="A small app that lets RouterDeck reach your router, from this computer and from your phones. Works with every browser."
    >
      <Segmented
        value={mode}
        onChange={setMode}
        className="mb-5 grid w-full grid-cols-2"
        options={[
          { value: "app", label: "Download app" },
          { value: "terminal", label: <span className="flex items-center justify-center gap-1.5"><Terminal className="size-3.5" /> Terminal (no app)</span> },
        ]}
      />

      {mode === "app" ? (
        <ol className="space-y-5">
          <Step n={1}>
            <a href={app.file} className="bg-ink inline-flex h-11 items-center gap-2 rounded-lg px-5 text-[14.5px] font-medium">
              <Download className="size-4" /> Download for {app.label}
            </a>
            <p className="mt-2 text-[12.5px] text-muted">
              Other systems:{" "}
              {(Object.keys(CONNECT_APPS) as ConnectApp[])
                .filter((k) => k !== platform)
                .map((k, i) => (
                  <span key={k}>
                    {i > 0 && " · "}
                    <a href={CONNECT_APPS[k].file} className="underline underline-offset-2 hover:text-[var(--text)]">
                      {CONNECT_APPS[k].label}
                    </a>
                  </span>
                ))}
            </p>
          </Step>
          <Step n={2}>
            {mac ? (
              <>
                Open the downloaded zip, then <b>right-click → Open</b> on <span className="font-mono text-[13px]">RouterDeck-Connect</span> the first time (macOS asks because the app isn&apos;t from the App Store).
              </>
            ) : platform === "windows" ? (
              <>
                Double-click the file. If Windows shows &quot;Windows protected your PC&quot;, click <b>More info → Run anyway</b> (first time only).
              </>
            ) : (
              <>Unzip and run <span className="font-mono text-[13px]">./RouterDeck-Connect</span>.</>
            )}
          </Step>
          <Step n={3}>It opens RouterDeck already paired. Keep its window open while you use RouterDeck.</Step>
          <p className="pl-9 text-[12.5px] text-muted">
            Antivirus or your Mac blocking it? The app is open source and unsigned, so some security tools are cautious. Use the <b>Terminal</b> tab instead: same thing, no app.
          </p>
        </ol>
      ) : (
        <ol className="space-y-5">
          <Step n={1}>
            Install{" "}
            <a href="https://nodejs.org/en/download" target="_blank" rel="noopener" className="font-medium underline underline-offset-4">
              Node.js
            </a>{" "}
            (free, one time) if you don&apos;t have it.
          </Step>
          <Step n={2}>
            Open <b>Terminal</b> (Mac/Linux) and paste:
            <Code>{`curl -fsSLO ${CONNECTOR_DOWNLOAD} && node routerdeck-connector.mjs --lan --open`}</Code>
            <span className="mt-2 block">
              On <b>Windows</b>, open PowerShell and paste:
            </span>
            <Code>{`iwr ${CONNECTOR_DOWNLOAD} -OutFile routerdeck-connector.mjs; node routerdeck-connector.mjs --lan --open`}</Code>
          </Step>
          <Step n={3}>
            It opens RouterDeck already paired. If it doesn&apos;t, copy the <b>pairing code</b> it prints and paste it here:
            <div className="mt-3">
              <Field label="Pairing code" htmlFor="pair" error={error}>
                <div className="flex gap-2">
                  <Input id="pair" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 7KQ2-M9XD-P4TA" autoComplete="off" spellCheck={false} className="font-mono" />
                  <Button onClick={pair} loading={busy} disabled={!code.trim()} size="lg" className="h-11 shrink-0">
                    Pair
                  </Button>
                </div>
              </Field>
            </div>
          </Step>
          <p className="pl-9 text-[12.5px] text-muted">Next time, just run <span className="font-mono">node routerdeck-connector.mjs --lan --open</span> again. Keep the Terminal window open while you use RouterDeck.</p>
        </ol>
      )}

      <div className="mt-6 flex items-center gap-3 rounded-lg border border-subtle px-4 py-3 text-[13.5px]" aria-live="polite">
        {availability?.connectorPaired ? (
          <span className="font-medium text-emerald-700 dark:text-emerald-400">Connected and paired.</span>
        ) : availability?.connector ? (
          <span>RouterDeck Connect is running. Waiting for pairing…</span>
        ) : (
          <>
            <span className="relative inline-flex size-2.5">
              <span className="absolute inset-0 animate-ping rounded-full bg-brand-500/60" />
              <span className="relative size-2.5 rounded-full bg-brand-500" />
            </span>
            Waiting for RouterDeck Connect to start…
          </>
        )}
      </div>
    </Dialog>
  );
}
