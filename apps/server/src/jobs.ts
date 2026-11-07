import type { SqliteQueue } from "./queue";

export type JobHandler = (payload: unknown) => Promise<void>;

export interface WorkerOptions {
  queue: SqliteQueue;
  handlers: Record<string, JobHandler>;
  /** Retries after the first attempt; a job is `failed` for good when attempts > retries. */
  retries?: number;
  pollMs?: number;
  now?: () => number;
}

export const backoffMs = (attempt: number): number => 2 ** attempt * 1000;

/** Single-consumer (concurrency 1) loop over the SQLite `jobs` table. */
export function createWorker(opts: WorkerOptions) {
  const { queue, handlers } = opts;
  const retries = opts.retries ?? 5;
  const pollMs = opts.pollMs ?? 1000;
  const now = opts.now ?? Date.now;
  let running = false;
  let wake: (() => void) | null = null;
  let current: Promise<unknown> = Promise.resolve();

  /** Runs one due job. Resolves true if a job was taken (whether it succeeded or not). */
  async function runOnce(): Promise<boolean> {
    const job = queue.claim(now());
    if (!job) return false;
    try {
      const handler = handlers[job.type];
      if (!handler) {
        queue.fail(job.id, `unknown job type: ${job.type}`, null);
        return true;
      }
      await handler(job.payload);
      queue.complete(job.id);
    } catch (e) {
      // Anything can be thrown (null, a string, an object whose message is not a string): never let the
      // bookkeeping itself throw, or the job would stay "running" until the next restart.
      let msg: string;
      try {
        const m = e instanceof Error ? e.message : (e as { message?: unknown } | null)?.message;
        msg = typeof m === "string" ? m : String(e);
      } catch {
        msg = "unknown error";
      }
      const retry = job.attempts <= retries ? now() + backoffMs(job.attempts) : null;
      console.warn(`job ${job.id} (${job.type}) attempt ${job.attempts} failed${retry === null ? " for good" : ""}:`, msg);
      try {
        queue.fail(job.id, msg.slice(0, 1000), retry);
      } catch (fe) {
        console.error(`job ${job.id}: could not record the failure:`, (fe as Error)?.message ?? fe);
      }
    }
    return true;
  }

  async function loop(): Promise<void> {
    while (running) {
      let took = false;
      try {
        took = await runOnce();
      } catch (e) {
        console.error("worker error:", (e as Error).message);
      }
      if (!running) break;
      if (!took) {
        await new Promise<void>((resolve) => {
          const t = setTimeout(resolve, pollMs);
          t.unref?.();
          wake = () => (clearTimeout(t), resolve());
        });
        wake = null;
      }
    }
  }

  return {
    runOnce,
    start(): void {
      if (running) return;
      running = true;
      queue.recoverRunning();
      current = loop();
    },
    async stop(): Promise<void> {
      running = false;
      wake?.();
      await current;
    },
  };
}
