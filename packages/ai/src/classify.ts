import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { AutoProcessor, RawImage, SiglipVisionModel, env } from "@huggingface/transformers";
import sharp from "sharp";
import { extractColors } from "./colors";
import { INFORMATIVE_VISUAL, type Group } from "./vocab";

export const MODEL_ID = "onnx-community/siglip2-base-patch16-224-ONNX";
export const TIPO_THRESHOLD = 0.3;
export const VISUAL_THRESHOLD = 0.45;
const LOGIT_SCALE = 100;
const SIDE = 448;
const MAX_RATIO = 1.5;

const PKG_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
export const LABELS_PATH = join(PKG_DIR, "labels.siglip2.json");

interface LabelRow { pt: string; en: string; prompt: string; v: number[] }
type Labels = Record<Group, LabelRow[]>;

export interface ClassifyResult {
  tipo: string[];
  visual: string[];
  scores: Record<string, number>;
}
export interface Classifier {
  classify(img: Buffer): Promise<ClassifyResult>;
}

/** `modelDir` > $RECORTE_MODEL_DIR > <package>/models. */
export function resolveModelDir(modelDir?: string): string {
  return modelDir ?? process.env.RECORTE_MODEL_DIR ?? join(PKG_DIR, "models");
}

const norm = (v: ArrayLike<number>): number[] => {
  const a = Array.from(v);
  const n = Math.hypot(...a);
  return a.map((x) => x / n);
};

/** Letterbox to a square (no centre-crop); very tall captures keep their top part (ratio <= 1.5). Background = dominant colour. */
async function letterbox(img: Buffer): Promise<RawImage> {
  const { width, height } = await sharp(img).metadata();
  if (!width || !height) throw new Error("unreadable image");
  const h = Math.min(height, Math.round(width * MAX_RATIO));
  const top = await sharp(img).extract({ left: 0, top: 0, width, height: h }).png().toBuffer();
  const { dominant } = await extractColors(top);
  const { data, info } = await sharp(top)
    .resize({ width: SIDE, height: SIDE, fit: "contain", background: dominant })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return new RawImage(new Uint8ClampedArray(data), info.width, info.height, 3);
}

export async function createClassifier(opts: { modelDir?: string; threads?: number } = {}): Promise<Classifier> {
  const dir = resolveModelDir(opts.modelDir);
  env.cacheDir = dir;
  // When the model is already on disk (production image) never touch the network.
  if (existsSync(join(dir, MODEL_ID, "onnx", "vision_model_int8.onnx"))) env.allowRemoteModels = false;

  const labels = JSON.parse(readFileSync(LABELS_PATH, "utf8")) as Labels;
  const session_options = { intraOpNumThreads: opts.threads ?? 2, interOpNumThreads: 1 };
  const [proc, vision] = await Promise.all([
    AutoProcessor.from_pretrained(MODEL_ID),
    SiglipVisionModel.from_pretrained(MODEL_ID, { dtype: "int8", session_options }),
  ]);

  return {
    async classify(img) {
      const inputs = await proc(await letterbox(img));
      const out = await vision(inputs);
      const iv = norm((out.image_embeds ?? out.pooler_output).data as ArrayLike<number>);

      const scores: Record<string, number> = {};
      const probs = {} as Record<Group, { pt: string; p: number }[]>;
      for (const g of Object.keys(labels) as Group[]) {
        const ex = labels[g].map((l) => Math.exp(LOGIT_SCALE * l.v.reduce((a, x, i) => a + x * iv[i]!, 0)));
        const Z = ex.reduce((a, b) => a + b, 0);
        probs[g] = labels[g].map((l, i) => ({ pt: l.pt, p: ex[i]! / Z }));
        for (const x of probs[g]) scores[x.pt] = x.p;
      }
      const best = [...probs.tipo].sort((a, b) => b.p - a.p)[0];
      return {
        tipo: best && best.p >= TIPO_THRESHOLD ? [best.pt] : [],
        visual: probs.visual
          .filter((x) => x.p >= VISUAL_THRESHOLD && INFORMATIVE_VISUAL.has(x.pt))
          .sort((a, b) => b.p - a.p)
          .map((x) => x.pt),
        scores,
      };
    },
  };
}
