// Packages the browser extension (Chrome/Edge + Firefox builds) and copies the
// connector into public/downloads so the static site can offer them.
// Also used by the release workflow. Zero dependencies (stored zip, CRC32).
//   node scripts/prepare-downloads.mjs [outDir]
import { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..", "..");
const out = process.argv[2] ? join(process.cwd(), process.argv[2]) : join(here, "..", "public", "downloads");
mkdirSync(out, { recursive: true });

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (f.startsWith(".")) return [];
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

/** entries: [{ name, data }] → zip buffer (store method). */
function zip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const { name: n, data } of entries) {
    const name = Buffer.from(n);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10); lh.writeUInt16LE(0x21, 12); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(data.length, 22); lh.writeUInt16LE(name.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, name, data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8); ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12); ch.writeUInt16LE(0x21, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

const extDir = join(root, "extension");
const files = walk(extDir).filter((f) => !f.endsWith(".md"));
const base = JSON.parse(readFileSync(join(extDir, "manifest.json"), "utf8"));

/** Store builds only run on the public site (localhost is for development). */
function storeManifest(browser) {
  const m = structuredClone(base);
  m.content_scripts = m.content_scripts.map((cs) => ({ ...cs, matches: cs.matches.filter((u) => !/localhost|127\.0\.0\.1/.test(u)) }));
  if (browser === "firefox") {
    m.background = { scripts: ["background.js"] };
    m.browser_specific_settings = {
      gecko: { id: "routerdeck@pramitha.lk", strict_min_version: "128.0", data_collection_permissions: { required: ["none"] } },
    };
    delete m.minimum_chrome_version;
  }
  return Buffer.from(JSON.stringify(m, null, 2) + "\n");
}

function build(browser, { folder }) {
  return files.map((f) => {
    const rel = relative(extDir, f).split("\\").join("/");
    const data = rel === "manifest.json" ? storeManifest(browser) : readFileSync(f);
    return { name: folder ? `routerdeck-extension/${rel}` : rel, data };
  });
}

// Manual "Load unpacked" download: files inside a folder.
writeFileSync(join(out, "routerdeck-extension.zip"), zip(build("chrome", { folder: true })));
// Store uploads: manifest.json must be at the zip root.
writeFileSync(join(out, `routerdeck-chrome-edge-v${base.version}.zip`), zip(build("chrome", { folder: false })));
writeFileSync(join(out, `routerdeck-firefox-v${base.version}.zip`), zip(build("firefox", { folder: false })));
copyFileSync(join(root, "connector", "routerdeck-connector.mjs"), join(out, "routerdeck-connector.mjs"));
console.log(`downloads: extension v${base.version} (manual + Chrome/Edge store + Firefox) and connector → ${relative(process.cwd(), out) || "."}`);
