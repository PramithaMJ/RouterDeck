"use client";

import { Globe, Info, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { Ipv6Notice } from "@/components/ipv6-notice";
import { Button, Card, CardHeader, cn, EmptyState, Input, Notice, Skeleton, Switch } from "@/components/ui";
import { qk, useRouterAction, useSiteBlocking } from "@/lib/queries";
import { groupOf, sitesFor } from "@/lib/site-groups";

const SUGGESTIONS = ["tiktok.com", "youtube.com", "facebook.com", "instagram.com", "netflix.com", "roblox.com"];

export default function ProtectionPage() {
  const { data, isLoading, error } = useSiteBlocking();
  const [site, setSite] = useState("");

  const toggle = useRouterAction<boolean>((d, on) => d.setSiteBlockingEnabled(on), {
    invalidate: [qk.sites],
    pending: (on) => (on ? "Turning on website blocking…" : "Turning off website blocking…"),
    success: (on) => (on ? "Website blocking is on." : "Website blocking is off."),
  });
  const add = useRouterAction<string>(async (d, s) => {
    // Block the whole family (e.g. YouTube's video and image domains), one by one.
    for (const domain of sitesFor(s)) await d.addBlockedSite(domain);
  }, {
    invalidate: [qk.sites],
    pending: (s) => `Blocking ${s}…`,
    success: (s) => `${s} is now blocked on your network.`,
  });
  const remove = useRouterAction<string>(async (d, s) => {
    const present = new Set((data?.sites ?? []).map((x) => x.pattern));
    for (const domain of sitesFor(s)) if (present.has(domain)) await d.removeBlockedSite(domain);
    if (!sitesFor(s).includes(s)) await d.removeBlockedSite(s);
  }, {
    invalidate: [qk.sites],
    pending: (s) => `Unblocking ${s}…`,
    success: (s) => `${s} is allowed again.`,
  });

  const clean = (s: string) => s.trim().replace(/^https?:\/\//i, "").replace(/\/.*$/, "").toLowerCase();
  const valid = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(clean(site));

  async function submit(e?: React.FormEvent, value?: string) {
    e?.preventDefault();
    const s = clean(value ?? site);
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(s)) return;
    try {
      await add.mutateAsync(s);
      setSite("");
    } catch {}
  }

  const allSites = data?.sites ?? [];
  // Show related domains under their main site instead of as separate rows.
  const sites = allSites.filter((x) => {
    const main = groupOf(x.pattern);
    return !main || !allSites.some((y) => y.pattern === main);
  });
  const relatedCount = (main: string) => allSites.filter((x) => groupOf(x.pattern) === main).length;

  return (
    <>
      <PageHeader title="Protection" description="Block websites for everyone on your network." />
      <Ipv6Notice what="websites" />
      {error && (
        <Notice tone="red" className="mb-4">
          {(error as Error).message}
        </Notice>
      )}

      <Card>
        <CardHeader
          icon={
            <div className="flex size-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-300">
              <ShieldCheck className="size-5" />
            </div>
          }
          title="Website blocking"
          description={isLoading ? "Checking…" : data?.enabled ? `On · ${sites.length} site${sites.length === 1 ? "" : "s"} blocked` : "Off"}
          action={isLoading ? <Skeleton className="h-7 w-12 rounded-full" /> : <Switch size="lg" checked={!!data?.enabled} disabled={toggle.isPending} onChange={(v) => toggle.mutate(v)} label="Website blocking" />}
        />

        <form onSubmit={submit} className="mt-5 flex gap-2 px-5 sm:px-6">
          <div className="relative flex-1">
            <Globe className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <Input value={site} onChange={(e) => setSite(e.target.value)} placeholder="Add a website, e.g. tiktok.com" className="pl-10" inputMode="url" autoCapitalize="none" spellCheck={false} />
          </div>
          <Button type="submit" size="lg" className="h-11" disabled={!valid} loading={add.isPending}>
            {!add.isPending && <Plus className="size-4" />}
            <span className="hidden sm:inline">Block</span>
          </Button>
        </form>
        <div className="mt-3 flex flex-wrap gap-1.5 px-5 sm:px-6">
          {SUGGESTIONS.filter((s) => !allSites.some((x) => x.pattern === s)).map((s) => (
            <button
              key={s}
              disabled={add.isPending}
              onClick={() => submit(undefined, s)}
              className="inline-flex items-center gap-1 rounded-full border border-subtle px-2.5 py-1 text-[12.5px] text-muted transition hover:border-brand-300 hover:text-[var(--text)] disabled:opacity-50"
            >
              <Plus className="size-3" /> {s}
            </button>
          ))}
        </div>

        <div className="mt-5 border-t border-subtle">
          {isLoading ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-5 w-1/3" />
              <Skeleton className="h-5 w-1/4" />
            </div>
          ) : sites.length === 0 ? (
            <EmptyState icon={<Globe className="size-5" />} title="No blocked websites" description="Add a site above. Everyone on your Wi-Fi will be unable to open it." />
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {sites.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-5 py-3 sm:px-6">
                  <img src={`https://icons.duckduckgo.com/ip3/${s.pattern}.ico`} alt="" className="size-5 rounded" loading="lazy" referrerPolicy="no-referrer" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
                  <span className={cn("min-w-0 flex-1 truncate text-[14px] font-medium", !data?.enabled && "text-muted line-through")}>
                    {s.pattern}
                    {relatedCount(s.pattern) > 0 && <span className="ml-2 font-mono text-[11.5px] font-normal text-muted">+{relatedCount(s.pattern)} related</span>}
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => remove.mutate(s.id)} loading={remove.isPending && remove.variables === s.id} aria-label={`Unblock ${s.pattern}`}>
                    {!(remove.isPending && remove.variables === s.id) && <Trash2 className="size-4" />}
                    <span className="hidden sm:inline">Remove</span>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <p className="mt-4 flex items-start gap-2 px-1 text-[12.5px] leading-relaxed text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        Blocking is done by your router and applies to every device. Some apps use other addresses or encrypted DNS, so this may not stop everything inside apps. Blocking the device itself is the most reliable option.
      </p>
    </>
  );
}
