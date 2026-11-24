"use client";

import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { RouterError } from "@/lib/router/types";
import { useSession } from "@/lib/session";
import { toast } from "@/lib/toast";
import { Toaster } from "./toaster";

function onAnyError(e: unknown) {
  if (e instanceof RouterError && e.code === "session-expired") {
    toast.info("Your router signed you out. Please sign in again.");
    useSession.getState().expire();
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
  const boot = useSession((s) => s.boot);
  const phase = useSession((s) => s.phase);

  useEffect(() => {
    if (phase === "booting") void boot();
  }, [boot, phase]);

  // Drop all cached router data when the session ends.
  useEffect(() => {
    if (phase === "disconnected") client.clear();
  }, [phase, client]);

  return (
    <QueryClientProvider client={client}>
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
