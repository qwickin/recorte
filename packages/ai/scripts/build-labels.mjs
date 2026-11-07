// Computes the label embeddings with the fp32 SigLIP2 text encoder (needs ~1.6-3.8 GB RAM; dev machine only).
// Output (committed): packages/ai/labels.siglip2.json. Re-run when the vocabulary changes.
// Usage: [RECORTE_MODEL_DIR=...] node packages/ai/scripts/build-labels.mjs
import { AutoTokenizer, SiglipTextModel, env } from "@huggingface/transformers";
import { writeFileSync } from "node:fs";
import { VOCAB, prompt } from "../src/vocab.ts";

const MODEL_ID = "onnx-community/siglip2-base-patch16-224-ONNX";
env.cacheDir = process.env.RECORTE_MODEL_DIR ?? new URL("../models/", import.meta.url).pathname;

const norm = (v) => { const n = Math.hypot(...v); return v.map((x) => x / n); };
const [tok, text] = await Promise.all([
  AutoTokenizer.from_pretrained(MODEL_ID),
  SiglipTextModel.from_pretrained(MODEL_ID, { dtype: "fp32", session_options: { intraOpNumThreads: 2, interOpNumThreads: 1 } }),
]);
const labels = {};
for (const [g, items] of Object.entries(VOCAB)) {
  const prompts = items.map((i) => prompt(g, i.en));
  const out = await text(tok(prompts, { padding: "max_length", max_length: 64, truncation: true }));
  const e = out.text_embeds ?? out.pooler_output;
  const [, d] = e.dims;
  labels[g] = items.map((it, i) => ({ pt: it.pt, en: it.en, prompt: prompts[i], v: norm(Array.from(e.data.slice(i * d, (i + 1) * d))).map((x) => +x.toFixed(6)) }));
}
const outPath = new URL("../labels.siglip2.json", import.meta.url);
writeFileSync(outPath, JSON.stringify(labels));
console.log("wrote", outPath.pathname, Object.fromEntries(Object.entries(labels).map(([g, l]) => [g, l.length])));
