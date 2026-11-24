// Copies the built web app (web/out) and the connector into the desktop app.
// Run `npm run build` in ../web first.
import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const webOut = join(root, "..", "web", "out");
if (!existsSync(join(webOut, "index.html"))) {
  console.error("web/out not found. Build the web app first: cd ../web && npm ci && npm run build");
  process.exit(1);
}
rmSync(join(root, "app-web"), { recursive: true, force: true });
cpSync(webOut, join(root, "app-web"), { recursive: true });
rmSync(join(root, "app-web", "downloads"), { recursive: true, force: true }); // not needed inside the app
mkdirSync(join(root, "resources", "connector"), { recursive: true });
cpSync(join(root, "..", "connector", "routerdeck-connector.mjs"), join(root, "resources", "connector", "routerdeck-connector.mjs"));
console.log("desktop: bundled web app + connector");
