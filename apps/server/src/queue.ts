import type { Db } from "./db";

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
}
