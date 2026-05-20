#!/usr/bin/env node
// Downloads images referenced by the live Wix site into /public.
// One-off script. Run with: node scripts/scrape-assets.mjs

import { writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const PUBLIC = path.join(ROOT, "public");

const PAGES = [
  { url: "https://www.cubeconsulting.org", bucket: "home" },
  { url: "https://www.cubeconsulting.org/s-projects-basic", bucket: "projects" },
  { url: "https://www.cubeconsulting.org/services", bucket: "services" },
  { url: "https://www.cubeconsulting.org/about-1", bucket: "about" },
  { url: "https://www.cubeconsulting.org/join-us", bucket: "join-us" },
  { url: "https://www.cubeconsulting.org/contact", bucket: "contact" },
];

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

const IMG_EXT = /\.(?:png|jpg|jpeg|webp|svg|gif|avif)(?:$|\?)/i;

function urlsFromHtml(html) {
  const found = new Set();
  // <img src=...>
  for (const m of html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) found.add(m[1]);
  // srcset
  for (const m of html.matchAll(/srcset=["']([^"']+)["']/gi)) {
    for (const part of m[1].split(",")) {
      const u = part.trim().split(/\s+/)[0];
      if (u) found.add(u);
    }
  }
  // background-image url(...)
  for (const m of html.matchAll(/url\((["']?)(https?:[^)"']+)\1\)/gi)) found.add(m[2]);
  // data-href / data-src
  for (const m of html.matchAll(/data-src=["']([^"']+)["']/gi)) found.add(m[1]);
  return [...found];
}

function isWixMedia(u) {
  return /(?:static\.wixstatic\.com|wixmp|usrfiles\.com)/i.test(u);
}

function safeName(u) {
  const tail = u.split("/").pop().split("?")[0];
  const ext = (tail.match(IMG_EXT)?.[0] || ".bin").replace("?", "");
  const hash = createHash("sha1").update(u).digest("hex").slice(0, 10);
  return `${hash}${ext}`;
}

async function ensureDir(p) {
  await mkdir(p, { recursive: true });
}

async function fetchText(url) {
  const r = await fetch(url, { headers: { "user-agent": UA, "accept": "text/html" } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.text();
}

async function fetchBinary(url) {
  const r = await fetch(url, { headers: { "user-agent": UA } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return Buffer.from(await r.arrayBuffer());
}

async function main() {
  const manifest = {};
  for (const { url, bucket } of PAGES) {
    console.log(`\n→ ${url}`);
    let html;
    try {
      html = await fetchText(url);
    } catch (e) {
      console.warn(`  ! fetch failed: ${e.message}`);
      continue;
    }
    const imgs = urlsFromHtml(html).filter(isWixMedia).filter((u) => IMG_EXT.test(u) || /static\.wixstatic\.com\/media/i.test(u));
    console.log(`  found ${imgs.length} image refs`);
    const dir = path.join(PUBLIC, "scraped", bucket);
    await ensureDir(dir);
    manifest[bucket] = [];
    for (const u of imgs) {
      const name = safeName(u);
      const out = path.join(dir, name);
      try {
        const buf = await fetchBinary(u);
        await writeFile(out, buf);
        manifest[bucket].push({ url: u, file: `/scraped/${bucket}/${name}`, bytes: buf.length });
        process.stdout.write(".");
      } catch (e) {
        process.stdout.write("x");
      }
    }
    console.log("");
  }
  await writeFile(path.join(PUBLIC, "scraped", "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(`\n✓ Wrote ${path.join(PUBLIC, "scraped", "manifest.json")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
