import { existsSync } from "node:fs";
import { join } from "node:path";
import { type FeatureExtractionPipeline, env, pipeline } from "@huggingface/transformers";
import { resolveModelDir } from "./classify";
import type { Embedder } from "./topics";

/** Sentence-embedding model of the text tagger (Apache-2.0; the same model Meilisearch uses for semantic search). */
export const TEXT_MODEL_ID = "Xenova/paraphrase-multilingual-MiniLM-L12-v2";
export const TEXT_MODEL_FILE = "onnx/model_quantized.onnx";

export interface EmbedderOptions {
  modelDir?: string;
  threads?: number;
  modelId?: string;
  /** e5 models expect "query: " in front of every text. */
  prefix?: string;
  batch?: number;
  /** onnxruntime's CPU memory arena keeps peak allocations around; off by default (lower resident memory). */
  memArena?: boolean;
}

/** A quantized (q8) sentence-embedding model: mean pooling, L2-normalised. */
export async function createEmbedder(opts: EmbedderOptions = {}): Promise<Embedder> {
  const id = opts.modelId ?? TEXT_MODEL_ID;
  const dir = resolveModelDir(opts.modelDir);
  env.cacheDir = dir;
  if (existsSync(join(dir, id, TEXT_MODEL_FILE))) env.allowRemoteModels = false;
  const ext: FeatureExtractionPipeline = await pipeline("feature-extraction", id, {
    dtype: "q8",
    session_options: { intraOpNumThreads: opts.threads ?? 2, interOpNumThreads: 1, enableCpuMemArena: opts.memArena ?? false },
  });
  const prefix = opts.prefix ?? "";
  const batch = opts.batch ?? 32;
  return async (texts) => {
    const out: number[][] = [];
    for (let i = 0; i < texts.length; i += batch) {
      const t = await ext(texts.slice(i, i + batch).map((s) => prefix + s), { pooling: "mean", normalize: true });
      out.push(...(t.tolist() as number[][]));
    }
    return out;
  };
}
