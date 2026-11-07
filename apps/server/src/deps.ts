import type { Config } from "./config";
import type { Db } from "./db";
import { EventBus } from "./events";
import { type Queue, SqliteQueue } from "./queue";
import { NoopSearch, type Search } from "./search";
import { Storage } from "./storage";

/** Everything routes may need. */
export interface Deps {
  db: Db;
  config: Config;
  storage: Storage;
  search: Search;
  queue: Queue;
  events: EventBus;
  /** Epoch ms until which `/setup` accepts the owner's password (15 min after start). */
  setupOpenUntil: number;
}

export const SETUP_WINDOW_MS = 15 * 60_000;

export type DepsInput = Pick<Deps, "db" | "config"> & Partial<Deps>;

export function resolveDeps(d: DepsInput): Deps {
  return {
    db: d.db,
    config: d.config,
    storage: d.storage ?? new Storage(d.config.dataDir),
    search: d.search ?? new NoopSearch(),
    queue: d.queue ?? new SqliteQueue(d.db),
    events: d.events ?? new EventBus(),
    setupOpenUntil: d.setupOpenUntil ?? Date.now() + SETUP_WINDOW_MS,
  };
}
