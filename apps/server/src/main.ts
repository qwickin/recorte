import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { bootstrap } from "./bootstrap";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { resolveDeps } from "./deps";
import { SqliteQueue } from "./queue";
import { startRuntime } from "./runtime";
import { startSearch } from "./search/embedded";

const config = loadConfig();
const db = openDb(config.dataDir);
// The setup window counts from here (process start).
const deps0 = resolveDeps({ db, config });
await bootstrap(db, config);

const { search, meili, describe } = startSearch(config);
console.log(describe);

const queue = new SqliteQueue(db);
const deps = resolveDeps({ ...deps0, queue, search });
const app = createApp(deps);
serve({ fetch: app.fetch, port: config.port }, (i) => console.log(`Recorte listening on :${i.port}`));
const runtime = startRuntime({ ...deps, queue });
for (const sig of ["SIGINT", "SIGTERM"] as const) {
  process.once(sig, () => void Promise.allSettled([runtime.stop(), meili?.stop()]).finally(() => process.exit(0)));
}
