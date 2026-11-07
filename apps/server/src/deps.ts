import type { Config } from "./config";
import type { Db } from "./db";

/**
 * Everything routes may need. Tasks 4-5 add their members here (all optional so the
 * auth foundation and its tests run without them) and read them in their own route modules.
 */
export interface Deps {
  db: Db;
  config: Config;
  storage?: unknown;
  search?: unknown;
  queue?: unknown;
  events?: unknown;
}
