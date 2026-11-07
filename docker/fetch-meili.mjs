// Downloads the official Meilisearch binary for the target architecture, checked against the sha256 digests
// GitHub publishes for the release assets (api.github.com/repos/meilisearch/meilisearch/releases/tags/<v>).
// Usage: node fetch-meili.mjs <amd64|arm64> /out/meilisearch
import { createHash } from "node:crypto";
import { chmodSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const VERSION = "v1.56.1";
const ASSETS = {
  amd64: ["meilisearch-linux-amd64", "b2c7a647d4cdfdd7a901466bfd6797077b849e90f5eb2c0f5b1d05869592e27e"],
  arm64: ["meilisearch-linux-aarch64", "f73987f92b094fd15b79956f9bfc9e8fc7294ad6ad610ebf8a4403c170890726"],
};

const [arch, dest = "/out/meilisearch"] = process.argv.slice(2);
const asset = ASSETS[arch];
if (!asset) throw new Error(`unsupported architecture "${arch}" (expected ${Object.keys(ASSETS).join(" or ")})`);
const [name, sha256] = asset;
const url = `https://github.com/meilisearch/meilisearch/releases/download/${VERSION}/${name}`;
let buf;
for (let attempt = 1; ; attempt++) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    break;
  } catch (e) {
    if (attempt >= 4) throw new Error(`${url}: ${e.message}`);
    await new Promise((r) => setTimeout(r, 2000 * attempt));
  }
}
const got = createHash("sha256").update(buf).digest("hex");
if (got !== sha256) throw new Error(`${name}: sha256 ${got} != ${sha256}`);
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, buf);
chmodSync(dest, 0o755);
console.log(`${name} ${VERSION} ${(buf.length / 1e6).toFixed(1)} MB ok`);
