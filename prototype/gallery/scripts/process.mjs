// Turns raw captures into what the server would store: full WebP, thumbnail, dimensions, dominant colour.
// Usage: node scripts/process.mjs  -> public/shots/*.webp + src/data/manifest.json + scripts/.raw/<id>-ai.jpg
import sharp from "sharp";
import { readFile, writeFile } from "node:fs/promises";

const RAW = new URL("./.raw/", import.meta.url).pathname;
const SHOTS = new URL("../public/shots/", import.meta.url).pathname;
const index = JSON.parse(await readFile(`${RAW}index.json`, "utf8"));
const hex = ({ r, g, b }) => "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");

// Deterministic pseudo-random so dates are stable between runs.
let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
// Interleave sites so consecutive tiles don't come from the same page.
const bySite = Object.values(index.reduce((m, c) => ((m[c.site] ??= []).push(c), m), {}));
const order = [];
for (let i = 0; bySite.some((s) => s[i]); i++) for (const s of bySite) if (s[i]) order.push(s[i]);

let t = Date.parse("2026-11-07T15:20:00Z");
const out = [];
for (const c of order) {
  const src = `${RAW}${c.id}.png`;
  const full = await sharp(src).resize({ width: 1600, withoutEnlargement: true }).webp({ quality: 78 }).toFile(`${SHOTS}${c.id}.webp`);
  await sharp(src).resize({ width: 640, withoutEnlargement: true }).webp({ quality: 70 }).toFile(`${SHOTS}${c.id}-t.webp`);
  await sharp(src).resize({ width: 1024, height: 2048, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toFile(`${RAW}${c.id}-ai.jpg`);
  const { dominant } = await sharp(src).stats();
  out.push({ ...c, width: full.width, height: full.height, color: hex(dominant), createdAt: new Date(t).toISOString() });
  t -= Math.round((0.5 + rand() * 40) * 3600_000); // 30 min to ~40 h between captures
}
await writeFile(new URL("../src/data/manifest.json", import.meta.url), JSON.stringify(out, null, 2));
console.log("processed", out.length);
