// Installers for all three platforms. Signing/notarization switch on
// automatically when the certificates are provided as CI secrets:
//   macOS:   CSC_LINK + CSC_KEY_PASSWORD (+ APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, APPLE_TEAM_ID to notarize)
//   Windows: WIN_CSC_LINK + WIN_CSC_KEY_PASSWORD
// Without them, macOS builds are ad-hoc signed (users right-click → Open once)
// and Windows builds are unsigned (SmartScreen "More info → Run anyway").
const signedMac = !!process.env.CSC_LINK;
const notarize = signedMac && !!process.env.APPLE_ID;

/** @type {import('electron-builder').Configuration} */
module.exports = {
  appId: "lk.pramitha.routerdeck",
  productName: "RouterDeck",
  copyright: "Copyright © 2026 Pramitha Jayasooriya",
  directories: { output: "dist", buildResources: "build" },
  files: ["src/**", "package.json"],
  extraResources: [
    { from: "app-web", to: "app-web" },
    { from: "resources/connector", to: "connector" },
    { from: "build/tray", to: "tray" },
  ],
  asar: true,
  // Lets the app know whether macOS can update itself (needs Developer ID signing).
  extraMetadata: { routerdeckSignedMac: signedMac },
  publish: [{ provider: "github", owner: "PramithaMJ", repo: "RouterDeck", releaseType: "release" }],
  mac: {
    category: "public.app-category.utilities",
    icon: "build/icon.png",
    target: [
      { target: "dmg", arch: ["arm64", "x64"] },
      { target: "zip", arch: ["arm64", "x64"] },
    ],
    artifactName: "RouterDeck-macOS-${arch}.${ext}",
    identity: signedMac ? undefined : "-",
    hardenedRuntime: signedMac,
    notarize,
    extendInfo: { LSUIElement: false, NSLocalNetworkUsageDescription: "RouterDeck connects to your home router to manage it." },
  },
  dmg: { title: "RouterDeck", artifactName: "RouterDeck-macOS-${arch}.${ext}" },
  win: {
    icon: "build/icon.png",
    // x64 only: Windows on Arm runs it through built-in emulation.
    target: [{ target: "nsis", arch: ["x64"] }],
    artifactName: "RouterDeck-Windows-${arch}-Setup.${ext}",
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "RouterDeck",
    runAfterFinish: true,
  },
  // Fixed names (x64 only) so the website can link straight to them.
  appImage: { artifactName: "RouterDeck-Linux-x64.AppImage" },
  deb: { artifactName: "RouterDeck-Linux-x64.deb" },
  linux: {
    icon: "build/icon.png",
    category: "Network",
    synopsis: "Manage your home router",
    maintainer: "Pramitha Jayasooriya",
    target: [
      { target: "AppImage", arch: ["x64"] },
      { target: "deb", arch: ["x64"] },
    ],
    desktop: { entry: { Name: "RouterDeck", Comment: "Manage your home router", StartupWMClass: "RouterDeck" } },
  },
};
