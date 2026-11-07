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
}

export type DepsInput = Pick<Deps, "db" | "config"> & Partial<Deps>;

export function resolveDeps(d: DepsInput): Deps {
  return {
    db: d.db,
    config: d.config,
    storage: d.storage ?? new Storage(d.config.dataDir),
    search: d.search ?? new NoopSearch(),
    queue: d.queue ?? new SqliteQueue(d.db),
    events: d.events ?? new EventBus(),
  };
}
