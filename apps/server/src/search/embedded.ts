import { type ChildProcess, spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Config } from "../config";
import { NoopSearch, type Search } from "./index";
import { MeiliSearch } from "./meili";

/**
 * Embedded Meilisearch: the app image ships the official binary and the server runs it as a child process,
 * bound to 127.0.0.1 only, with its data under `<dataDir>/meili` and a master key generated on first start.
 * MEILI_URL switches this off (external instance, e.g. the two-service compose file).
 */

/** `<dataDir>/secrets/meili.key`: 32 random bytes (base64url), created once with mode 0600. Never logged. */
export function ensureMeiliKey(dataDir: string): string {
  const dir = join(dataDir, "secrets");
  const file = join(dir, "meili.key");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  chmodSync(dir, 0o700);
  if (!existsSync(file)) {
    try {
      writeFileSync(file, randomBytes(32).toString("base64url") + "\n", { mode: 0o600, flag: "wx" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
    }
  }
  chmodSync(file, 0o600);
  const key = readFileSync(file, "utf8").trim();
  if (key.length < 16) throw new Error(`${file} is too short (Meilisearch needs at least 16 bytes)`);
  return key;
}

export interface MeiliPaths {
  root: string;
  db: string;
  dumps: string;
  snapshots: string;
  /** Meilisearch keeps the embedder model in $HOME/.cache/huggingface; HOME is `root`, so it lives on the volume. */
  cache: string;
}

export const meiliPaths = (dataDir: string): MeiliPaths => {
  const root = join(dataDir, "meili");
  return { root, db: join(root, "data.ms"), dumps: join(root, "dumps"), snapshots: join(root, "snapshots"), cache: join(root, ".cache") };
};

export function meiliArgs(dataDir: string, port: number): string[] {
  const p = meiliPaths(dataDir);
  return [
    "--http-addr", `127.0.0.1:${port}`,
    "--db-path", p.db,
    "--dump-dir", p.dumps,
    "--snapshot-dir", p.snapshots,
    "--env", "production",
    "--no-analytics",
    "--log-level", "WARN",
  ];
}

/**
 * The child's environment: only what it needs. The master key goes by environment, not argv (argv is visible
 * in `ps`/`docker top`); nothing else named MEILI_* leaks in from ours.
 */
export function meiliEnv(dataDir: string, key: string, parent: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const p = meiliPaths(dataDir);
  // HOME on the volume: the embedder model (~450 MB, $HOME/.cache/huggingface) is downloaded only once.
  const env: NodeJS.ProcessEnv = { MEILI_MASTER_KEY: key, HOME: p.root };
  for (const k of ["PATH", "TZ", "LANG", "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy"]) {
    if (parent[k]) env[k] = parent[k];
  }
  return env;
}

export interface SupervisorOptions {
  bin: string;
  dataDir: string;
  port: number;
  key: string;
  log?: (m: string) => void;
  /** First restart delay; doubles up to `maxMs`. A child that ran for `stableMs` resets the delay. */
  baseMs?: number;
  maxMs?: number;
  stableMs?: number;
  /** SIGKILL after this long if SIGTERM did not stop it (inside Docker's 10 s grace period). */
  killAfterMs?: number;
  /** Test hook. */
  spawnFn?: typeof spawn;
}

export interface Supervisor {
  url: string;
  /** Number of times the child has been started. */
  readonly starts: number;
  stop(): Promise<void>;
}

export function superviseMeili(o: SupervisorOptions): Supervisor {
  const log = o.log ?? ((m: string) => console.warn(m));
  const base = o.baseMs ?? 1_000;
  const max = o.maxMs ?? 30_000;
  const stableMs = o.stableMs ?? 60_000;
  const killAfter = o.killAfterMs ?? 8_000;
  const spawnFn = o.spawnFn ?? spawn;
  const p = meiliPaths(o.dataDir);
  mkdirSync(p.root, { recursive: true });

  let child: ChildProcess | null = null;
  let stopping = false;
  let attempt = 0;
  let starts = 0;
  let timer: NodeJS.Timeout | null = null;
  let exited: Promise<void> = Promise.resolve();

  const start = () => {
    timer = null;
    if (stopping) return;
    starts++;
    const startedAt = Date.now();
    const c = spawnFn(o.bin, meiliArgs(o.dataDir, o.port), { cwd: p.root, env: meiliEnv(o.dataDir, o.key), stdio: ["ignore", "inherit", "inherit"] });
    child = c;
    exited = new Promise<void>((resolve) => {
      let done = false;
      const onEnd = (why: string) => {
        if (done) return;
        done = true;
        child = null;
        resolve();
        if (stopping) return;
        if (Date.now() - startedAt >= stableMs) attempt = 0;
        const delay = Math.min(max, base * 2 ** attempt++);
        log(`meilisearch ${why}; restarting in ${delay} ms`);
        timer = setTimeout(start, delay);
        timer.unref?.();
      };
      c.once("error", (e) => onEnd(`failed to start (${e.message})`));
      c.once("exit", (code, sig) => onEnd(`exited (${sig ?? `code ${code}`})`));
    });
  };
  start();

  return {
    url: `http://127.0.0.1:${o.port}`,
    get starts() {
      return starts;
    },
    async stop() {
      stopping = true;
      if (timer) clearTimeout(timer);
      const c = child;
      if (!c) return;
      const kill = setTimeout(() => c.kill("SIGKILL"), killAfter);
      kill.unref?.();
      c.kill("SIGTERM");
      await exited;
      clearTimeout(kill);
    },
  };
}

export interface SearchSetup {
  search: Search;
  meili: Supervisor | null;
  describe: string;
}

/** MEILI_URL → that instance (nothing spawned); else MEILI_BIN → embedded child; else search is off. */
export function startSearch(
  config: Pick<Config, "meiliUrl" | "meiliMasterKey" | "meiliBin" | "meiliPort" | "dataDir">,
  hooks: { supervise?: typeof superviseMeili; ensureKey?: typeof ensureMeiliKey } = {},
): SearchSetup {
  if (config.meiliUrl) {
    return { search: new MeiliSearch({ url: config.meiliUrl, apiKey: config.meiliMasterKey }), meili: null, describe: `Search: external Meilisearch at ${config.meiliUrl}` };
  }
  if (config.meiliBin) {
    const key = (hooks.ensureKey ?? ensureMeiliKey)(config.dataDir);
    const meili = (hooks.supervise ?? superviseMeili)({ bin: config.meiliBin, dataDir: config.dataDir, port: config.meiliPort, key });
    return {
      search: new MeiliSearch({ url: meili.url, apiKey: key }),
      meili,
      describe: `Search: embedded Meilisearch on 127.0.0.1:${config.meiliPort} (data in ${meiliPaths(config.dataDir).root})`,
    };
  }
  return { search: new NoopSearch(), meili: null, describe: "Neither MEILI_URL nor MEILI_BIN is set: search is disabled" };
}
