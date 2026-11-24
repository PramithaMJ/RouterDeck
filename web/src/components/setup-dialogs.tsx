"use client";

import { Download, Puzzle, RefreshCw, Terminal } from "lucide-react";
import { useEffect, useState } from "react";
import { getConnectorToken, setConnectorToken, useSession } from "@/lib/session";
import { ConnectorTransport } from "@/lib/transport/connector";
import { Button, CopyButton, Dialog, Field, Input, Notice } from "./ui";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[12px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200">{n}</span>
      <div className="min-w-0 pt-0.5 text-sm leading-relaxed">{children}</div>
    </li>
  );
}

function Code({ children }: { children: string }) {
  return (
    <div className="mt-2 flex items-center gap-2 rounded-xl bg-zinc-950 py-2 pl-3.5 pr-1.5 font-mono text-[12.5px] text-zinc-100 dark:bg-black/40">
      <code className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap scrollbar-none">{children}</code>
      <CopyButton value={children} className="text-zinc-400 hover:bg-white/10 hover:text-white" />
    </div>
  );
}

function useOrigin() {
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  return origin;
}

export function ExtensionSetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const refresh = useSession((s) => s.refreshAvailability);
  const version = useSession((s) => s.availability?.extension);
  const [checking, setChecking] = useState(false);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Puzzle className="size-5 text-brand-500" /> Install the RouterDeck extension
        </span>
      }
      description="Works in Chrome, Edge, Brave and other Chromium browsers on a computer connected to your home Wi-Fi."
      footer={
        version ? (
          <Button onClick={onClose}>Done: extension v{version} found</Button>
        ) : (
          <Button
            loading={checking}
            onClick={async () => {
              setChecking(true);
              await refresh();
              setChecking(false);
            }}
          >
            <RefreshCw className="size-4" /> I installed it, check again
          </Button>
        )
      }
    >
      <ol className="space-y-4">
        <Step n={1}>
          Download the extension and unzip it.
          <div className="mt-2">
            <a href="/downloads/routerdeck-extension.zip" download className="inline-flex h-9 items-center gap-2 rounded-xl bg-brand-600 px-3.5 text-[13px] font-medium text-white hover:bg-brand-700">
              <Download className="size-4" /> routerdeck-extension.zip
            </a>
          </div>
        </Step>
        <Step n={2}>
          Open <b className="font-semibold">chrome://extensions</b> in a new tab and turn on <b className="font-semibold">Developer mode</b> (top-right).
        </Step>
        <Step n={3}>
          Click <b className="font-semibold">Load unpacked</b> and choose the unzipped <span className="font-mono text-[13px]">routerdeck-extension</span> folder.
        </Step>
        <Step n={4}>Come back here and reload this page. The first time you connect, the extension asks you to allow this site to talk to your router.</Step>
      </ol>
      <Notice className="mt-5" tone="brand">
        The extension only talks to private network addresses (like 192.168.1.1), and only for websites you approve. It has no servers and collects nothing.
      </Notice>
    </Dialog>
  );
}

export function ConnectorSetupDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const origin = useOrigin();
  const refresh = useSession((s) => s.refreshAvailability);
  const running = useSession((s) => s.availability?.connector);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) setCode(getConnectorToken() ?? "");
  }, [open]);

  async function pair() {
    setBusy(true);
    setError(null);
    try {
      await refresh();
      const t = new ConnectorTransport(code.trim());
      await t.verify();
      setConnectorToken(code.trim());
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <Terminal className="size-5 text-brand-500" /> Run the local connector
        </span>
      }
      description="For Firefox, Safari or anyone who prefers not to install an extension. Needs Node.js 18+ on a computer in your home network."
      footer={
        <Button onClick={pair} loading={busy} disabled={!code.trim()}>
          Pair connector
        </Button>
      }
    >
      <ol className="space-y-4">
        <Step n={1}>
          Download and start the connector (one small file, no installs):
          <Code>{`curl -fsSLO ${origin || "https://your-site"}/downloads/routerdeck-connector.mjs && node routerdeck-connector.mjs --origin ${origin || "https://your-site"}`}</Code>
        </Step>
        <Step n={2}>It prints a pairing code. Paste it here (or open the link it prints).</Step>
      </ol>
      <div className="mt-5">
        <Field label="Pairing code" htmlFor="pair" error={error} hint={running ? `Connector v${running.version} is running.` : "Waiting for the connector on this computer…"}>
          <Input id="pair" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. 7KQ2-M9XD-P4TA" autoComplete="off" spellCheck={false} className="font-mono" />
        </Field>
      </div>
    </Dialog>
  );
}
