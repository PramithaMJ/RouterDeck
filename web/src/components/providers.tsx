"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RouterError } from "@/lib/router/types";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { Toaster } from "./toaster";
import { detectTabBridge, isFramed } from "@/lib/transport/tab";

let reauthing: Promise<boolean> | null = null;

function onAnyError(e: unknown) {
  if (e instanceof RouterError && e.code === "session-expired") {
    // Desktop app with a remembered password signs back in by itself.
    reauthing ??= useSession.getState().reauth().finally(() => setTimeout(() => (reauthing = null), 5000));
    void reauthing.then((ok) => {
      if (ok) return;
      toast.info("Your router signed you out. Please sign in again.");
      useSession.getState().expire();
    });
  }
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        queryCache: new QueryCache({ onError: onAnyError }),
        mutationCache: new MutationCache({ onError: onAnyError }),
        defaultOptions: {
          queries: { retry: 1, refetchOnWindowFocus: true, staleTime: 10_000 },
        },
      }),
  );
  const [frame, setFrame] = useState<"none" | "checking" | "ok" | "blocked">("none");
  useEffect(() => {
    if (!isFramed()) return;
    setFrame("checking");
    // Only a router page running the RouterDeck bookmark may embed this app.
    void detectTabBridge(2000).then((r) => setFrame(r ? "ok" : "blocked"));
  }, []);
  const boot = useSession((s) => s.boot);
  const phase = useSession((s) => s.phase);

  useEffect(() => {
    if (phase === "booting" && (frame === "none" || frame === "ok")) void boot();
  }, [boot, phase, frame]);

  // Drop all cached router data when the session ends.
  useEffect(() => {
    if (phase === "disconnected") client.clear();
  }, [phase, client]);

  if (frame === "checking") return null;
  if (frame === "blocked") {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center">
        <p className="max-w-sm text-[15px]">
          RouterDeck can&apos;t run inside another website.{" "}
          <a href="https://router.pramitha.lk" target="_top" className="font-semibold underline">
            Open RouterDeck
          </a>
        </p>
      </div>
    );
  }

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
