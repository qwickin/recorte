import { type Classifier, createClassifier } from "@recorte/ai";
import { type CloudAi, createCloudAi } from "./cloud";
import type { Deps } from "./deps";
import { createWorker } from "./jobs";
import { purgeTrash } from "./items/purge";
import { createPipeline } from "./pipeline";
import type { SqliteQueue } from "./queue";
import type { Search } from "./search";

/** Loads the model on first use, once; a failed load is retried on the next job. */
export function lazyClassifier(load: () => Promise<Classifier>): () => Promise<Classifier> {
  let p: Promise<Classifier> | null = null;
  return () => {
    p ??= load().catch((e) => {
      p = null;
      throw e;
    });
    return p;
  };
}

export function cloudFromConfig(c: Deps["config"]): CloudAi | null {
  return c.aiCloudUrl && c.aiCloudKey && c.aiCloudModel ? createCloudAi({ url: c.aiCloudUrl, key: c.aiCloudKey, model: c.aiCloudModel }) : null;
}

/** Retries `ensureIndex` in the background (Meilisearch may still be starting) until it succeeds or `signal` aborts. */
export async function ensureIndexWithRetry(search: Search, opts: { signal?: AbortSignal; baseMs?: number; maxMs?: number } = {}): Promise<boolean> {
  const base = opts.baseMs ?? 2_000;
  const max = opts.maxMs ?? 60_000;
  for (let attempt = 0; !opts.signal?.aborted; attempt++) {
    try {
      await search.ensureIndex();
      return true;
    } catch (e) {
      const delay = Math.min(max, base * 2 ** attempt);
      console.warn(`ensureIndex failed (retry in ${delay} ms):`, (e as Error).message);
      await new Promise<void>((r) => {
        const t = setTimeout(r, delay);
        t.unref?.();
        opts.signal?.addEventListener("abort", () => (clearTimeout(t), r()), { once: true });
      });
    }
  }
  return false;
}

export interface Runtime {
  stop(): Promise<void>;
}

export const PURGE_EVERY_MS = 24 * 3_600_000;

export function startRuntime(deps: Deps & { queue: SqliteQueue }, opts: { classifier?: () => Promise<Classifier>; cloud?: CloudAi | null } = {}): Runtime {
  const pipeline = createPipeline({
    deps,
    classifier: opts.classifier ?? lazyClassifier(() => createClassifier({ threads: Number(process.env.RECORTE_AI_THREADS) || 2 })),
    cloud: opts.cloud === undefined ? cloudFromConfig(deps.config) : opts.cloud,
  });
  const worker = createWorker({
    queue: deps.queue,
    handlers: {
      process: async (p) => {
        const { userId, id } = p as { userId: string; id: string };
        await pipeline.process(userId, id);
      },
      index: async (p) => {
        const { userId, id } = p as { userId: string; id: string };
        await pipeline.reindexOne(userId, id);
      },
    },
  });
  worker.start();

  const abort = new AbortController();
  void ensureIndexWithRetry(deps.search, { signal: abort.signal });

  const purge = () => purgeTrash(deps).then((n) => n && console.log(`purged ${n} trashed item(s)`)).catch((e) => console.warn("purge failed:", (e as Error).message));
  void purge();
  const timer = setInterval(purge, PURGE_EVERY_MS);
  timer.unref();

  return {
    async stop() {
      abort.abort();
      clearInterval(timer);
      await worker.stop();
    },
  };
}
