import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { bootstrap } from "./bootstrap";
import { loadConfig } from "./config";
import { openDb } from "./db";

const base = loadConfig();
const db = openDb(base.dataDir);
const config = await bootstrap(db, base);
const app = createApp({ db, config });
serve({ fetch: app.fetch, port: config.port }, (i) => console.log(`Recorte listening on :${i.port}`));
