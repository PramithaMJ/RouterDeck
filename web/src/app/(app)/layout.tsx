import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";

/** Dashboard pages depend on a connected router: keep them out of search results. */
export const metadata: Metadata = { robots: { index: false, follow: false } };

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
