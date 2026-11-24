import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Internet speed test",
  description: "Free speed test: download, upload, ping, jitter and latency under load, with a live gauge. Works on any phone or computer.",
  alternates: { canonical: "/speed-test/" },
  robots: { index: true, follow: true },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
