"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, ExternalLink, Info, Search, SlidersHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/app-shell";
import { LiveForm } from "@/components/live-form";
import { Card, EmptyState, Input, Notice, Skeleton } from "@/components/ui";
import type { LivePage } from "@/lib/router/types";
import { describeError, useSession } from "@/lib/session";

function Menu() {
  const driver = useSession((s) => s.driver);
  const [q, setQ] = useState("");
  const { data, isLoading, error } = useQuery({
    queryKey: ["advanced-menu"],
    queryFn: () => driver!.getAdvancedMenu!(),
    enabled: !!driver?.getAdvancedMenu,
    staleTime: Infinity,
  });
  const groups = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!data) return [];
    return data.map((g) => ({ ...g, items: g.items.filter((i) => !s || i.title.toLowerCase().includes(s) || g.title.toLowerCase().includes(s)) })).filter((g) => g.items.length);
  }, [data, q]);

  if (!driver?.getAdvancedMenu) return <EmptyState icon={<SlidersHorizontal className="size-5" />} title="Not available for this router" description="Everything this router supports is in the other sections." />;

  return (
    <>
      <PageHeader title="All settings" description="Every option from your router's own admin page, in a cleaner layout." />
      <div className="relative mb-5 sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search settings (e.g. DHCP, port)" className="h-10 pl-10 text-sm" />
      </div>
      {error && <Notice tone="red">{describeError(error)}</Notice>}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {isLoading &&
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="space-y-3 p-5">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-3.5 w-full" />
              <Skeleton className="h-3.5 w-2/3" />
            </Card>
          ))}
        {groups.map((g) => (
          <Card key={g.title} className="p-2">
            <p className="px-3 pb-1 pt-2.5 label-caps">{g.title}</p>
            <ul>
              {g.items.map((i) => (
                <li key={i.id}>
                  <Link href={`/advanced/?page=${encodeURIComponent(i.id)}&title=${encodeURIComponent(`${g.title} · ${i.title}`)}`} className="flex items-center justify-between rounded-xl px-3 py-2.5 text-[14px] transition hover:bg-[var(--surface-2)]">
                    {i.title}
                    <ChevronRight className="size-4 text-muted" />
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>
      <p className="mt-5 flex items-start gap-2 px-1 text-[12.5px] text-muted">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        These pages run your router&apos;s own logic, so options and checks are exactly the router&apos;s. Changes apply immediately.
      </p>
    </>
  );
}

function PageView({ id, title }: { id: string; title: string }) {
  const driver = useSession((s) => s.driver);
  const router = useRouter();
  const [live, setLive] = useState<LivePage | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    let current: LivePage | null = null;
    setLive(null);
    setError(null);
    driver
      ?.openAdvanced?.(id)
      .then((l) => {
        if (disposed) return l.dispose();
        current = l;
        setLive(l);
      })
      .catch((e) => setError(describeError(e)));
    return () => {
      disposed = true;
      current?.dispose();
    };
  }, [driver, id]);

  const classic = driver?.baseUrl ? driver.baseUrl + id.split("#")[0] : undefined;

  return (
    <>
      <button onClick={() => router.push("/advanced/")} className="-ml-1 mb-3 inline-flex items-center gap-1 rounded-lg px-1 py-0.5 text-[13px] text-muted hover:text-[var(--text)]">
        <ArrowLeft className="size-4" /> All settings
      </button>
      <PageHeader
        title={title.split(" · ").pop() ?? "Settings"}
        description={title.includes(" · ") ? title.split(" · ")[0] : undefined}
        action={
          classic && (
            <a href={classic} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-xl border border-subtle surface px-3 py-1.5 text-[13px] font-medium shadow-card hover:bg-[var(--surface-2)]">
              Open classic page <ExternalLink className="size-3.5" />
            </a>
          )
        }
      />
      {error && <Notice tone="red">{error}</Notice>}
      {!live && !error && (
        <Card className="space-y-4 p-6">
          <Skeleton className="h-4 w-40" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-11 w-full" />
            ))}
          </div>
        </Card>
      )}
      {live && <LiveForm key={id} live={live} />}
    </>
  );
}

function Inner() {
  const params = useSearchParams();
  const page = params.get("page");
  return page ? <PageView id={page} title={params.get("title") ?? "Settings"} /> : <Menu />;
}

export default function AdvancedPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}
