/**
 * Download links for the one-click helpers.
 * Connect apps are built by .github/workflows/release.yml.
 */
const RELEASES = "https://github.com/PramithaMJ/RouterDeck/releases/latest/download";

export const CONNECT_APPS = {
  windows: { label: "Windows", file: `${RELEASES}/RouterDeck-Connect-Windows.exe` },
  macArm: { label: "Mac (Apple Silicon)", file: `${RELEASES}/RouterDeck-Connect-macOS-AppleSilicon.zip` },
  macIntel: { label: "Mac (Intel)", file: `${RELEASES}/RouterDeck-Connect-macOS-Intel.zip` },
  linux: { label: "Linux", file: `${RELEASES}/RouterDeck-Connect-Linux.zip` },
} as const;

export type ConnectApp = keyof typeof CONNECT_APPS;

/** The full RouterDeck desktop app (Electron), built by the same workflow. */
export const DESKTOP_APPS: Record<ConnectApp, { label: string; file: string; kind: string; alt?: { label: string; file: string } }> = {
  windows: { label: "Windows", kind: "Installer · Windows 10 and 11", file: `${RELEASES}/RouterDeck-Windows-x64-Setup.exe` },
  macArm: { label: "Mac (Apple Silicon)", kind: "Disk image · M1 and newer", file: `${RELEASES}/RouterDeck-macOS-arm64.dmg` },
  macIntel: { label: "Mac (Intel)", kind: "Disk image · Intel Macs", file: `${RELEASES}/RouterDeck-macOS-x64.dmg` },
  linux: {
    label: "Linux",
    kind: "AppImage · any distro",
    file: `${RELEASES}/RouterDeck-Linux-x64.AppImage`,
    alt: { label: ".deb for Ubuntu / Debian", file: `${RELEASES}/RouterDeck-Linux-x64.deb` },
  },
};

export const RELEASES_PAGE = "https://github.com/PramithaMJ/RouterDeck/releases/latest";

/** Chrome Web Store listing (NEXT_PUBLIC_CHROME_STORE_URL overrides it, e.g. for a fork). */
export const CHROME_STORE_URL = process.env.NEXT_PUBLIC_CHROME_STORE_URL || "https://chromewebstore.google.com/detail/routerdeck/egfnlpdojhpdhakgcifhiadchbanddjj";

export async function detectPlatform(): Promise<ConnectApp> {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent;
  if (/Windows/i.test(ua)) return "windows";
  if (/Linux/i.test(ua) && !/Android/i.test(ua)) return "linux";
  if (/Mac OS X|Macintosh/i.test(ua)) {
    try {
      const uad = (navigator as Navigator & { userAgentData?: { getHighEntropyValues(h: string[]): Promise<{ architecture?: string }> } }).userAgentData;
      const v = await uad?.getHighEntropyValues(["architecture"]);
      if (v?.architecture) return v.architecture.startsWith("arm") ? "macArm" : "macIntel";
    } catch {}
    // Safari/Firefox don't say; almost all Macs sold since 2021 are Apple Silicon.
    try {
      const gl = document.createElement("canvas").getContext("webgl");
      const r = gl?.getParameter(gl.getExtension("WEBGL_debug_renderer_info")?.UNMASKED_RENDERER_WEBGL ?? 0x1f01);
      if (typeof r === "string" && /Intel|AMD|Radeon/i.test(r)) return "macIntel";
    } catch {}
    return "macArm";
  }
  return "windows";
}
