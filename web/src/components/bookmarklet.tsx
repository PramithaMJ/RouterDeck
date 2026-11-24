"use client";

import { Bookmark, ExternalLink, MousePointerClick } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { bookmarkletHref } from "@/lib/bridge";
import { isMobileDevice } from "@/lib/site";
import { Button, CopyButton, Dialog, Segmented } from "./ui";

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border border-subtle font-mono text-[11.5px]">{n}</span>
      <div className="min-w-0 flex-1 pt-0.5 text-[14px] leading-relaxed">{children}</div>
    </li>
  );
}

/** The draggable "RouterDeck" bookmark. React blocks javascript: hrefs, so it's set directly. */
function DragButton({ href }: { href: string }) {
  const ref = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    ref.current?.setAttribute("href", href);
  }, [href]);
  return (
    <a
      ref={ref}
      onClick={(e) => {
        e.preventDefault();
        alert("Drag this button to your bookmarks bar, then click it while your router's page is open.");
      }}
      draggable
      className="bg-ink inline-flex h-11 cursor-grab items-center gap-2 rounded-lg px-5 text-[14.5px] font-semibold active:cursor-grabbing"
      title="Drag me to your bookmarks bar"
    >
      <Bookmark className="size-4" /> RouterDeck
    </a>
  );
}

export function BookmarkletDialog({ open, onClose, routerHost = "192.168.1.1" }: { open: boolean; onClose: () => void; routerHost?: string }) {
  const [href, setHref] = useState("");
  const [tab, setTab] = useState<"computer" | "iphone" | "android">("computer");
  useEffect(() => {
    if (!open) return;
    setHref(bookmarkletHref(window.location.origin));
    if (isMobileDevice()) setTab(/iPhone|iPad/i.test(navigator.userAgent) ? "iphone" : "android");
  }, [open]);
  const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      title={
        <span className="flex items-center gap-2">
          <MousePointerClick className="size-5 text-muted" /> Connect without installing anything
        </span>
      }
      description="Add a RouterDeck bookmark once. Then open your router's page and click it: RouterDeck opens connected through that tab."
    >
      <Segmented
        value={tab}
        onChange={setTab}
        className="mb-5 grid w-full grid-cols-3"
        options={[
          { value: "computer", label: "Computer" },
          { value: "iphone", label: "iPhone" },
          { value: "android", label: "Android" },
        ]}
      />

      {tab === "computer" ? (
        <ol className="space-y-5">
          <Step n={1}>
            Show your bookmarks bar ({mac ? "⌘ Shift B" : "Ctrl Shift B"}), then <b>drag this button onto it</b>:
            <div className="mt-3">{href && <DragButton href={href} />}</div>
          </Step>
          <Step n={2}>
            Open your router&apos;s page in a new tab:{" "}
            <a href={`http://${routerHost}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-[13px] font-medium underline underline-offset-4">
              {routerHost} <ExternalLink className="size-3.5" />
            </a>{" "}
            (signing in there is optional).
          </Step>
          <Step n={3}>
            On that tab, click the <b>RouterDeck</b> bookmark. RouterDeck opens connected. Keep the router tab open while you use it. If nothing opens, allow pop-ups for that page and click again.
          </Step>
        </ol>
      ) : (
        <ol className="space-y-5">
          <Step n={1}>
            Copy the RouterDeck bookmark code:
            <div className="mt-2.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded-lg bg-[var(--surface-2)] px-3 py-2 font-mono text-[12px]">{href.slice(0, 60)}…</code>
              <CopyButton value={href} label="Copy bookmark code" className="border border-subtle" />
            </div>
          </Step>
          {tab === "iphone" ? (
            <>
              <Step n={2}>In Safari, tap Share → <b>Add Bookmark</b> on any page, name it <b>RouterDeck</b>, and save.</Step>
              <Step n={3}>Open Bookmarks, tap <b>Edit</b>, choose RouterDeck, replace its address with the copied code, and tap Done.</Step>
            </>
          ) : (
            <>
              <Step n={2}>In Chrome, tap ⋮ → ☆ to bookmark any page, then tap <b>Edit</b>.</Step>
              <Step n={3}>Name it <b>RouterDeck</b>, replace the URL with the copied code, and save.</Step>
            </>
          )}
          <Step n={4}>
            Open <span className="font-mono text-[13px]">http://{routerHost}</span>, then{" "}
            {tab === "iphone" ? "open Bookmarks and tap RouterDeck" : "type “RouterDeck” in the address bar and tap the bookmark (star icon)"}. Keep the router tab open.
          </Step>
        </ol>
      )}

      <p className="mt-6 text-[12.5px] leading-relaxed text-muted">
        The bookmark only talks to the router page it&apos;s clicked on and only answers RouterDeck. Nothing is installed. Closing the router tab disconnects RouterDeck.
      </p>
      <div className="mt-5 flex justify-end">
        <Button variant="secondary" onClick={onClose}>
          Done
        </Button>
      </div>
    </Dialog>
  );
}
