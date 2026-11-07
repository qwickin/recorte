import type { Db } from "./db";

export interface Job {
  id: number;
  type: string;
  payload: unknown;
  attempts: number;
}

/** Task 5's worker consumes the `jobs` table; this is the producer side. */
export interface Queue {
  enqueue(type: string, payload: unknown): void;
}

export class SqliteQueue implements Queue {
  constructor(private db: Db) {}
  enqueue(type: string, payload: unknown): void {
    const now = new Date();
    this.db
      .prepare("INSERT INTO jobs (type, payload, status, attempts, run_at, created_at) VALUES (?, ?, 'pending', 0, ?, ?)")
      .run(type, JSON.stringify(payload), now.getTime(), now.toISOString());
  }

  /** Jobs left `running` by a crash go back to pending. */
  recoverRunning(): void {
    this.db.prepare("UPDATE jobs SET status = 'pending' WHERE status = 'running'").run();
  }

  /** Takes the oldest due job (single consumer) and marks it running; attempts counts this try. */
  claim(nowMs: number): Job | null {
    const r = this.db
      .prepare("SELECT id, type, payload, attempts FROM jobs WHERE status = 'pending' AND run_at <= ? ORDER BY run_at, id LIMIT 1")
      .get(nowMs) as { id: number; type: string; payload: string; attempts: number } | undefined;
    if (!r) return null;
    this.db.prepare("UPDATE jobs SET status = 'running', attempts = attempts + 1 WHERE id = ?").run(r.id);
    let payload: unknown = null;
    try {
      payload = JSON.parse(r.payload);
    } catch {}
    return { id: r.id, type: r.type, payload, attempts: r.attempts + 1 };
  }

  complete(id: number): void {
    this.db.prepare("DELETE FROM jobs WHERE id = ?").run(id);
  }

  /** Back to pending at `retryAtMs`, or `failed` for good when null. */
  fail(id: number, error: string, retryAtMs: number | null): void {
    if (retryAtMs === null) this.db.prepare("UPDATE jobs SET status = 'failed', last_error = ? WHERE id = ?").run(error, id);
    else this.db.prepare("UPDATE jobs SET status = 'pending', last_error = ?, run_at = ? WHERE id = ?").run(error, retryAtMs, id);
  }
}
