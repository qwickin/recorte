// Downloads the SigLIP2 vision model (int8) + the processor/config files the classifier needs, at a pinned
// Hugging Face revision, into the transformers.js cache layout: <dir>/<repo>/<file>. Every file is checked by sha256.
// Usage: node fetch-model.mjs /app/models
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const REPO = "onnx-community/siglip2-base-patch16-224-ONNX";
const REVISION = "ba1f3b0843f24bc5417d38e19c37b287d719b2f4";
const FILES = {
  "config.json": "e43a9f7692d3819886a82cb2097048258d444f123c67d37ec825f9345b019cf2",
  "preprocessor_config.json": "9b36b57ebaf20f09bf4c22100ccc21877ea6bfe5aead0c00c59f8af8ccefacfc",
  "onnx/vision_model_int8.onnx": "0dd31785a2713f1113ef2272472165c69d580473dae38d7b47568ac587795e70",
};

const out = process.argv[2] ?? "/app/models";
for (const [file, sha256] of Object.entries(FILES)) {
  const url = `https://huggingface.co/${REPO}/resolve/${REVISION}/${file}`;
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
  if (got !== sha256) throw new Error(`${file}: sha256 ${got} != ${sha256}`);
  const dest = join(out, REPO, file);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, buf);
  console.log(`${file} ${(buf.length / 1e6).toFixed(1)} MB ok`);
}
