import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { SITE_URL } from "@/lib/site";
import "./globals.css";

const geist = Geist({ subsets: ["latin"], variable: "--font-geist", display: "swap" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  alternates: { canonical: "/" },
  keywords: ["router", "SLT router", "SLT fiber", "Dialog 4G router", "Mobitel", "Hutch", "Starlink", "Wi-Fi password", "block device", "speed test", "Sri Lanka"],
  authors: [{ name: "Pramitha Jayasooriya", url: "https://pramitha.lk" }],
  creator: "Pramitha Jayasooriya",
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "RouterDeck",
    title: "RouterDeck: your router, without the old admin page",
    description: "See who's on your Wi-Fi, block a device, change the Wi-Fi password and test your speed. For SLT-Mobitel, Dialog, Mobitel, Hutch and Starlink homes.",
    images: [{ url: "/icon-512.png", width: 512, height: 512, alt: "RouterDeck" }],
  },
  twitter: { card: "summary", title: "RouterDeck", description: "Your router, without the old admin page.", images: ["/icon-512.png"] },
  title: { default: "RouterDeck: manage your home router without the old admin page", template: "%s · RouterDeck" },
  description:
    "Manage your home router (SLT-Mobitel, Dialog and more) from a clean, modern dashboard. Block devices, change Wi-Fi passwords, see who's online. Your password never leaves your network.",
  applicationName: "RouterDeck",
  manifest: "/manifest.webmanifest",
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192" }], apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "RouterDeck", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f6f2" },
    { media: "(prefers-color-scheme: dark)", color: "#151412" },
  ],
};

// Applies the saved/system theme before first paint (no flash).
const themeScript = `(function(){try{var t=localStorage.getItem('routerdeck.theme')||'system';var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geist.variable} ${geistMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-dvh font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
