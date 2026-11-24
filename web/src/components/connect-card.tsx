"use client";

import { ArrowLeft, ArrowRight, CheckCircle2, ChevronRight, ExternalLink, Lock, PlayCircle, Puzzle, Radar, RefreshCw, Router, Terminal } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ispById } from "@/lib/isp";
import { describeError, useSession, type Identified } from "@/lib/session";
import { CHROME_STORE_URL } from "@/lib/downloads";
import type { TransportKind } from "@/lib/transport/types";
import { IspBadge, IspLogo } from "./isp-badge";
import { ConnectorSetupDialog, ExtensionSetupDialog } from "./setup-dialogs";
import { BookmarkletDialog } from "./bookmarklet";
import { Bookmark } from "lucide-react";
import { PhoneSetup } from "./phone-setup";
import { isMobileDevice } from "@/lib/site";
import { servedByConnector } from "@/lib/transport/connector";
import { Dialog } from "./ui";
import { Badge, Button, Card, cn, Field, Input, Notice, PasswordInput, Spinner } from "./ui";

const PRESETS = ["192.168.1.1", "192.168.8.1", "192.168.0.1", "192.168.100.1", "10.0.0.1"];

type Method = Exclude<TransportKind, "same-origin">;

function MethodRow({
  icon,
  title,
  subtitle,
  status,
  selected,
  onSelect,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  status?: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div
      role="radio"
      aria-checked={selected}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect()}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 transition",
        selected ? "border-[var(--text)] bg-[var(--surface)] ring-1 ring-[var(--text)]" : "border-subtle hover:bg-[var(--surface-2)]",
      )}
    >
      <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", selected ? "bg-ink" : "bg-[var(--surface-2)] text-muted")}>{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14.5px] font-medium">{title}</span>
          {status}
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

function FoundRouter({ r, method }: { r: Identified; method: Method }) {
  const isp = ispById(r.isp);
  return (
    <div className="flex items-center gap-3 rounded-xl border border-subtle bg-[var(--surface-2)] p-3.5">
      {isp ? (
        <IspLogo isp={isp} size="lg" />
      ) : (
        <div className="flex size-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-300">
          <Router className="size-6" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5 text-[15px] font-semibold">
          {r.model ?? r.factory.name} <CheckCircle2 className="size-4 text-emerald-500" />
          {r.factory.beta && <Badge tone="amber">Beta</Badge>}
        </div>
        <p className="truncate font-mono text-[12px] text-muted">{method === "demo" ? "Simulated router · nothing changes for real" : r.host.replace(/^https?:\/\//, "")}</p>
        {isp && <IspBadge id={isp.id} size="sm" className="mt-1.5" />}
      </div>
    </div>
  );
}

export function ConnectCard() {
  const router = useRouter();
  const { phase, availability, saved, identify, discover, signIn, resume, refreshAvailability } = useSession();
  const [method, setMethod] = useState<Method | null>(null);
  const [host, setHost] = useState("192.168.1.1");
  const [manual, setManual] = useState(false);
  const [stage, setStage] = useState<"choose" | "login">("choose");
  const [found, setFound] = useState<Identified | null>(null);
  const [scanStep, setScanStep] = useState<string | null>(null);
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "detect" | "login">(null);
  const [dialog, setDialog] = useState<null | "extension" | "connector" | "phone" | "bookmark">(null);
  const [mobile, setMobile] = useState(false);
  const [phoneMode, setPhoneMode] = useState(false);
  useEffect(() => {
    setMobile(isMobileDevice() && !servedByConnector());
    setPhoneMode(servedByConnector());
  }, [availability]);
  const scannedFor = useRef<string | null>(null);

  const extOk = !!availability?.extension;
  const conOk = !!availability?.connector;
  const conPaired = !!availability?.connectorPaired;
  const checking = phase === "booting" || !availability;

  const tabOk = !!availability?.tab;
  const ready = useCallback((m: Method | null) => m === "demo" || (m === "tab" && tabOk) || (m === "extension" && extOk) || (m === "connector" && conPaired), [extOk, conPaired, tabOk]);

  useEffect(() => {
    if (!availability || method) return;
    if (availability.tab) {
      setMethod("tab");
      return;
    }
    if (saved && saved.transport !== "same-origin" && saved.transport !== "tab") {
      setMethod(saved.transport as Method);
      if (saved.transport !== "demo") setHost(new URL(saved.host).host);
    } else setMethod(availability.extension ? "extension" : availability.connector ? "connector" : null);
  }, [availability, saved, method]);

  useEffect(() => {
    if (phase === "connected") router.replace("/dashboard/");
  }, [phase, router]);

  const scan = useCallback(async () => {
    if (!method || method === "demo" || !ready(method)) return;
    setError(null);
    setFound(null);
    setScanStep("Looking for your router…");
    try {
      const r = await discover(method, setScanStep);
      if (r) setFound(r);
      else {
        setManual(true);
        setError("Couldn't find your router automatically. Type its address (printed on the router's label) below.");
      }
    } catch (e) {
      setManual(true);
      setError(describeError(e));
    } finally {
      setScanStep(null);
    }
  }, [method, ready, discover]);

  // Auto-scan as soon as a working bridge is selected.
  useEffect(() => {
    if (!method || method === "demo" || !ready(method)) return;
    if (scannedFor.current === method) return;
    scannedFor.current = method;
    void scan();
  }, [method, ready, scan]);

  async function detectManual() {
    if (!method) return;
    if (!ready(method)) {
      setDialog(method === "connector" ? "connector" : "extension");
      return;
    }
    setBusy("detect");
    setError(null);
    try {
      const r = await identify(method, host);
      setFound(r);
      setManual(false);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  }

  async function proceed() {
    if (!method) return;
    let r = found;
    if (method === "demo") r = await identify("demo", "");
    if (!r) return detectManual();
    setFound(r);
    setUsername(r.defaultUsername ?? "admin");
    if (method === "demo") setPassword("admin");
    if (method !== "demo" && r.requiresLogin) {
      setBusy("login");
      const reused = await resume(method, r).catch(() => false);
      setBusy(null);
      if (reused) return;
    }
    if (!r.requiresLogin) {
      setBusy("login");
      try {
        await signIn(method, r, "", "");
      } catch (e) {
        setError(describeError(e));
      } finally {
        setBusy(null);
      }
      return;
    }
    setStage("login");
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (!method || !found) return;
    setBusy("login");
    setError(null);
    try {
      await signIn(method, found, username, password);
      setPassword("");
    } catch (err) {
      setError(describeError(err));
    } finally {
      setBusy(null);
    }
  }

  const showAddress = method && method !== "demo" && ready(method) && (manual || (!found && !scanStep));

  return (
    <Card className="overflow-hidden shadow-pop">
      {stage === "choose" ? (
        <div className="p-5 sm:p-7">
          <p className="label-caps">Step 1 of 2</p>
          <h2 className="mt-1.5 text-[19px] font-semibold tracking-[-0.02em]">Connect to your router</h2>
          <p className="mt-1 text-[13.5px] text-muted">Pick how this page reaches the router in your home. You only set this up once.</p>

          <div className="mt-5 space-y-2.5" role="radiogroup" aria-label="Connection method">
            {mobile && !conOk && (
              <button
                onClick={() => setDialog("phone")}
                className="bg-ink flex w-full items-center gap-3 rounded-xl p-3.5 text-left"
              >
                <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-white/10">
                  <Router className="size-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14.5px] font-medium">Manage your router from this phone</span>
                  <span className="mt-0.5 block text-[12.5px] opacity-70">Easiest: the Router page button below. Or use a computer at home. See how →</span>
                </span>
              </button>
            )}
            {!phoneMode && (
              <MethodRow
                icon={<Bookmark className="size-5" />}
                title="Router page button"
                subtitle="No download. Click a RouterDeck bookmark on your router's own page (192.168.1.1)."
                selected={method === "tab"}
                onSelect={() => (tabOk ? setMethod("tab") : setDialog("bookmark"))}
                status={tabOk ? <Badge tone="green">Connected</Badge> : <Badge>No install</Badge>}
                action={
                  !tabOk ? (
                    <Button size="sm" variant="secondary" onClick={(e) => (e.stopPropagation(), setDialog("bookmark"))}>
                      Set up
                    </Button>
                  ) : undefined
                }
              />
            )}
            {!mobile && !phoneMode && <MethodRow
              icon={<Puzzle className="size-5" />}
              title="Browser extension"
              subtitle={CHROME_STORE_URL ? "Recommended. One click from the Chrome Web Store." : "For Chrome, Edge and Brave (manual install for now)."}
              selected={method === "extension"}
              onSelect={() => setMethod("extension")}
              status={checking ? <Spinner className="size-3.5" /> : extOk ? <Badge tone="green">Installed</Badge> : <Badge>Not installed</Badge>}
              action={
                !extOk && !checking ? (
                  <Button size="sm" variant="secondary" onClick={(e) => (e.stopPropagation(), setDialog("extension"))}>
                    Set up
                  </Button>
                ) : undefined
              }
            />}
            <MethodRow
              icon={<Terminal className="size-5" />}
              title="RouterDeck Connect"
              subtitle={`${CHROME_STORE_URL ? "" : "Recommended. "}Small app for Windows, Mac and Linux. Works in every browser and lets your phones join.`}
              selected={method === "connector"}
              onSelect={() => setMethod("connector")}
              status={checking ? <Spinner className="size-3.5" /> : conPaired ? <Badge tone="green">Connected</Badge> : conOk ? <Badge tone="amber">Needs pairing</Badge> : <Badge>Not running</Badge>}
              action={
                !conPaired && !checking ? (
                  <Button size="sm" variant="secondary" onClick={(e) => (e.stopPropagation(), setDialog(mobile ? "phone" : "connector"))}>
                    Set up
                  </Button>
                ) : undefined
              }
            />
            <MethodRow icon={<PlayCircle className="size-5" />} title="Try the demo" subtitle="Explore everything with a simulated router." selected={method === "demo"} onSelect={() => setMethod("demo")} />
          </div>

          {method && method !== "demo" && ready(method) && (
            <div className="mt-5 animate-fade-in space-y-3">
              {scanStep && (
                <div className="flex items-center gap-3 rounded-2xl bg-[var(--surface-2)] p-4" aria-live="polite">
                  <span className="relative flex size-10 items-center justify-center">
                    <span className="absolute inset-0 animate-ping rounded-full bg-brand-400/30" />
                    <span className="relative flex size-10 items-center justify-center rounded-full bg-ink">
                      <Radar className="size-5" />
                    </span>
                  </span>
                  <div>
                    <p className="text-[14px] font-medium">Finding your router</p>
                    <p className="text-[12.5px] text-muted">{scanStep}</p>
                  </div>
                </div>
              )}
              {found && !scanStep && <FoundRouter r={found} method={method} />}
              {found && !scanStep && !manual && (
                <div className="flex justify-between text-[12.5px]">
                  <button className="text-muted underline-offset-2 hover:text-[var(--text)] hover:underline" onClick={() => setManual(true)}>
                    Use a different address
                  </button>
                  <button className="inline-flex items-center gap-1 text-muted hover:text-[var(--text)]" onClick={() => void scan()}>
                    <RefreshCw className="size-3.5" /> Search again
                  </button>
                </div>
              )}
              {showAddress && (
                <div className="animate-fade-in">
                  <Field label="Router address" htmlFor="host" hint="Usually printed on a sticker on the router.">
                    <div className="flex gap-2">
                      <Input
                        id="host"
                        value={host}
                        onChange={(e) => setHost(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && detectManual()}
                        inputMode="url"
                        autoComplete="off"
                        spellCheck={false}
                        className="font-mono text-[14px]"
                      />
                      <Button variant="secondary" size="lg" className="h-11 shrink-0 px-3.5" onClick={() => void scan()} title="Find my router automatically">
                        <Radar className="size-[18px]" />
                        <span className="hidden sm:inline">Auto</span>
                      </Button>
                    </div>
                  </Field>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {PRESETS.map((p) => (
                      <button
                        key={p}
                        onClick={() => setHost(p)}
                        className={cn("rounded-md border px-2 py-1 font-mono text-[11.5px] transition", host === p ? "border-[var(--text)] text-[var(--text)]" : "border-subtle text-muted hover:text-[var(--text)]")}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {error && (
            <Notice tone={/isn't supported/.test(error) ? "amber" : "red"} className="mt-4">
              {error}
              {/isn't supported/.test(error) && (
                <a href={`http://${host.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer" className="mt-1.5 flex items-center gap-1 font-medium underline">
                  Open the router&apos;s own page <ExternalLink className="size-3.5" />
                </a>
              )}
            </Notice>
          )}

          <Button
            size="lg"
            className="mt-6 w-full"
            disabled={!method || checking || !!scanStep}
            loading={busy === "detect" || busy === "login"}
            onClick={() => (method && method !== "demo" && (manual || !found) ? detectManual() : proceed())}
          >
            {method === "demo" ? "Open demo" : found && !manual ? (found.requiresLogin ? "Sign in" : "Open dashboard") : "Continue"} <ArrowRight className="size-4" />
          </Button>
        </div>
      ) : (
        <form onSubmit={login} className="p-5 sm:p-7">
          <button type="button" onClick={() => (setStage("choose"), setError(null))} className="-ml-1 mb-4 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-[13px] text-muted hover:text-[var(--text)]">
            <ArrowLeft className="size-4" /> Back
          </button>
          {found && method && <FoundRouter r={found} method={method} />}

          <p className="label-caps mt-6">Step 2 of 2</p>
          <h2 className="mt-1.5 text-[19px] font-semibold tracking-[-0.02em]">Sign in to your router</h2>
          <p className="mt-1 text-sm text-muted">
            {method === "demo" ? <>Demo login is pre-filled (admin / admin).</> : <>Use the same username and password as the router&apos;s own page. Often printed on the router label.</>}
          </p>

          <div className="mt-5 space-y-4">
            <Field label="Username" htmlFor="user">
              <Input id="user" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field label="Password" htmlFor="pass">
              <PasswordInput id="pass" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" autoFocus />
            </Field>
          </div>

          {error && (
            <Notice tone="red" className="mt-4">
              {error}
            </Notice>
          )}

          <Button type="submit" size="lg" className="mt-6 w-full" loading={busy === "login"} disabled={!password}>
            <Lock className="size-4" /> Sign in
          </Button>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] text-muted">
            <Lock className="size-3" /> Your password goes straight to your router and is never stored.
          </p>
        </form>
      )}

      {stage === "choose" && (
        <button
          onClick={() => {
            scannedFor.current = null;
            void refreshAvailability();
          }}
          className="flex w-full items-center justify-between border-t border-subtle px-5 py-3 text-left text-[12.5px] text-muted transition hover:bg-[var(--surface-2)] sm:px-7"
        >
          Installed something? Re-check connection options
          <ChevronRight className="size-4" />
        </button>
      )}

      <ExtensionSetupDialog open={dialog === "extension"} onClose={() => setDialog(null)} />
      <BookmarkletDialog open={dialog === "bookmark"} onClose={() => setDialog(null)} routerHost={host.replace(/^https?:\/\//, "") || "192.168.1.1"} />
      <Dialog open={dialog === "phone"} onClose={() => setDialog(null)} size="lg" title="Use RouterDeck on your phone" description="Phones can't install browser extensions, so a small helper runs once on a device at home.">
        <PhoneSetup compact />
      </Dialog>
      <ConnectorSetupDialog open={dialog === "connector"} onClose={() => (setDialog(null), refreshAvailability())} />
    </Card>
  );
}
