// Turns the raw captures into the committed dataset: the text payload as the server stores it (clampUploadText), a
// 480 px webp of each screenshot (enough for the 448 px letterboxed SigLIP2 input), and for `link` items the
// server's own fetch + merge (fetchLink -> mergeLink), exactly as the pipeline does.
// Usage: tsx build-dataset.mts <rawDir>
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { type Item, clampUploadText } from "../../packages/shared/src/index.ts";
import { fetchLink } from "../../apps/server/src/links/fetch-link.ts";
import { mergeLink } from "../../apps/server/src/pipeline.ts";

const sharp = createRequire(new URL("../../packages/ai/package.json", import.meta.url))("sharp") as typeof import("sharp");
const HERE = fileURLToPath(new URL(".", import.meta.url));
const raw = process.argv[2]!;
const OUT = `${HERE}${process.argv[3] ?? "dataset"}/`;
mkdirSync(`${OUT}img`, { recursive: true });

interface Raw { id: string; url: string; kind: Item["kind"]; pageTitle?: string; text?: Item["text"] }
const rows = JSON.parse(readFileSync(`${raw}/raw.json`, "utf8")) as Raw[];
const { PAGES } = await import(process.env.PAGES ?? "./pages.mjs");
const order = new Map((PAGES as { id: string }[]).map((p, i) => [p.id, i]));
rows.sort((a, b) => order.get(a.id)! - order.get(b.id)!);

const items: (Item & { image: string | null })[] = [];
for (const r of rows) {
  const site = new URL(r.url).hostname.replace(/^www\./, "");
  const base: Item = {
    id: r.id, userId: "eval", type: r.kind === "link" ? "link" : "screenshot", kind: r.kind,
    source: { url: r.url, site, pageTitle: r.pageTitle ?? r.url },
    createdAt: "2026-11-08T00:00:00.000Z", updatedAt: "2026-11-08T00:00:00.000Z", deletedAt: null, media: [],
    user: { tags: [], categoryId: null, hiddenAiTags: [] },
    ai: { tipo: [], visual: [], keys: [], colors: [], model: "", processedAt: null },
    text: r.text ? clampUploadText(r.text).text : { selection: "", meta: {}, headings: [], alts: [], page: { text: "" } },
  };
  let image: string | null = null;
  let item = base;
  if (r.kind === "link") {
    const f = await fetchLink(r.url);
    item = mergeLink(base, f, null, base.createdAt);
    if (f.image) {
      const res = await fetch(f.image);
      const buf = Buffer.from(await res.arrayBuffer());
      image = `img/${r.id}.webp`;
      await sharp(buf).resize({ width: 480, withoutEnlargement: true }).webp({ quality: 72 }).toFile(`${OUT}${image}`);
    }
  } else {
    image = `img/${r.id}.webp`;
    // Keep at most a 1.5 ratio (the classifier only looks at the top of tall captures anyway).
    const meta = await sharp(`${raw}/${r.id}.png`).metadata();
    const h = Math.min(meta.height!, Math.round(meta.width! * 1.5));
    await sharp(`${raw}/${r.id}.png`).extract({ left: 0, top: 0, width: meta.width!, height: h })
      .resize({ width: 480 }).webp({ quality: 72 }).toFile(`${OUT}${image}`);
  }
  items.push({ ...item, image });
  console.log(r.id, item.source.pageTitle.slice(0, 60), image ?? "(no image)");
}
writeFileSync(`${OUT}dataset.json`, JSON.stringify(items, null, 1));
console.log("wrote", items.length);
