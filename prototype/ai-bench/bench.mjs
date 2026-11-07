// Usage: node bench.mjs <clip|siglip|siglip2|siglip2-fp32> [threads]
import { AutoProcessor, AutoTokenizer, CLIPVisionModelWithProjection, CLIPTextModelWithProjection, SiglipVisionModel, SiglipTextModel, RawImage, env } from "@huggingface/transformers";
import sharp from "sharp";
import { readFileSync, writeFileSync } from "node:fs";
import { VOCAB, prompt } from "./vocab.mjs";

env.cacheDir = process.env.MODELS ?? new URL("./models/", import.meta.url).pathname;
const SHOTS = process.env.SHOTS ?? "/Users/kali/.t3/projects/screenshotextension/prototype/gallery/public/shots/";
const MANIFEST = process.env.MANIFEST ?? "/Users/kali/.t3/projects/screenshotextension/prototype/gallery/src/data/manifest.json";
const which = process.argv[2] ?? "siglip2";
const threads = Number(process.argv[3] ?? 2);
const M = {
  clip: { id: "Xenova/clip-vit-base-patch32", V: CLIPVisionModelWithProjection, T: CLIPTextModelWithProjection, dtype: "q8", siglip: false },
  siglip: { id: "Xenova/siglip-base-patch16-224", V: SiglipVisionModel, T: SiglipTextModel, dtype: "q8", siglip: true },
  siglip2: { id: "onnx-community/siglip2-base-patch16-224-ONNX", V: SiglipVisionModel, T: SiglipTextModel, dtype: "q8", siglip: true },
  "siglip2-fp32": { id: "onnx-community/siglip2-base-patch16-224-ONNX", V: SiglipVisionModel, T: SiglipTextModel, dtype: "fp32", siglip: true },
  "siglip2-int8": { id: "onnx-community/siglip2-base-patch16-224-ONNX", V: SiglipVisionModel, T: SiglipTextModel, dtype: "int8", siglip: true, labels: "siglip2-fp32" },
  "siglip2-fp16": { id: "onnx-community/siglip2-base-patch16-224-ONNX", V: SiglipVisionModel, T: SiglipTextModel, dtype: "fp16", siglip: true, labels: "siglip2-fp32" },
}[which];
const session_options = { intraOpNumThreads: threads, interOpNumThreads: 1 };
let peak = 0;
const sample = () => (peak = Math.max(peak, process.memoryUsage().rss));

// VISION_ONLY=1: label embeddings come from a file computed once (at image build time), so the text encoder never loads.
import { existsSync } from "node:fs";
const LABELS = new URL(`./labels-${M.labels ?? which}.json`, import.meta.url);
const visionOnly = process.env.VISION_ONLY === "1" && existsSync(LABELS);
const t0 = performance.now();
const [tok, proc, vision, text] = await Promise.all([
  visionOnly ? null : AutoTokenizer.from_pretrained(M.id), AutoProcessor.from_pretrained(M.id),
  M.V.from_pretrained(M.id, { dtype: M.dtype, session_options }), visionOnly ? null : M.T.from_pretrained(M.id, { dtype: M.dtype, session_options }),
]);
const loadMs = performance.now() - t0;
sample();

const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
// Label embeddings: computed once (in production: once at boot, cached).
const tl = performance.now();
let labels = visionOnly ? JSON.parse(readFileSync(LABELS, "utf8")) : {};
if (!visionOnly) for (const [g, items] of Object.entries(VOCAB)) {
  const enc = tok(items.map((i) => prompt(g, i.en)), M.siglip ? { padding: "max_length", max_length: 64, truncation: true } : { padding: true, truncation: true });
  const out = await text(enc);
  const e = (out.text_embeds ?? out.pooler_output);
  const [n, d] = e.dims;
  labels[g] = items.map((it, i) => ({ ...it, v: norm(Array.from(e.data.slice(i * d, (i + 1) * d))) }));
}
const labelMs = performance.now() - tl;
if (!visionOnly) writeFileSync(LABELS, JSON.stringify(labels));
sample();

// Letterbox to a square (no centre-crop); very tall captures keep their top part (ratio <= 1.5).
async function load(id, color) {
  const img = sharp(`${SHOTS}${id}-t.webp`);
  const { width, height } = await img.metadata();
  const h = Math.min(height, Math.round(width * 1.5));
  const side = Math.max(width, h);
  const { data, info } = await sharp(`${SHOTS}${id}-t.webp`).extract({ left: 0, top: 0, width, height: h })
    .resize({ width: 448, height: 448, fit: "contain", background: color }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
}

const manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
const times = [], results = [];
for (const c of manifest) {
  const s = performance.now();
  const image = await load(c.id, c.color);
  const inputs = await proc(image);
  const out = await vision(inputs);
  const iv = norm(Array.from((out.image_embeds ?? out.pooler_output).data));
  const ms = performance.now() - s;
  times.push(ms); sample();
  const groups = {};
  for (const [g, items] of Object.entries(labels)) {
    const sims = items.map((l) => l.v.reduce((a, x, i) => a + x * iv[i], 0));
    const ex = sims.map((s) => Math.exp(100 * s)); const Z = ex.reduce((a, b) => a + b, 0);
    groups[g] = items.map((l, i) => ({ t: l.pt, p: ex[i] / Z })).sort((a, b) => b.p - a.p).slice(0, 3);
  }
  results.push({ id: c.id, ms: Math.round(ms), ...groups });
}
times.sort((a, b) => a - b);
const summary = { visionOnly, model: which, id: M.id, dtype: M.dtype, threads, loadMs: Math.round(loadMs), labelMs: Math.round(labelMs), medianMs: Math.round(times[times.length >> 1]), p90Ms: Math.round(times[Math.floor(times.length * 0.9)]), peakRssMB: Math.round(peak / 1048576) };
writeFileSync(new URL(`./out-${which}.json`, import.meta.url), JSON.stringify({ summary, results }, null, 1));
console.log(JSON.stringify(summary));
