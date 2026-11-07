import { chmodSync, existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config";
import { NoopSearch } from "../src/search";
import { ensureMeiliKey, meiliArgs, meiliEnv, startSearch, superviseMeili, type Supervisor } from "../src/search/embedded";
import { MeiliSearch } from "../src/search/meili";

const dirs: string[] = [];
const sups: Supervisor[] = [];
afterEach(async () => {
  for (const s of sups.splice(0)) await s.stop();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "recorte-meili-"));
  dirs.push(d);
  return d;
};
const until = async (fn: () => boolean, ms = 5_000) => {
  const end = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > end) throw new Error("timeout");
    await new Promise((r) => setTimeout(r, 20));
  }
};

/** A fake `meilisearch`: records argv, env and pid, then exits (`mode=exit`) or waits for SIGTERM. */
function fakeBin(dir: string, mode: "exit" | "wait" | "stubborn"): string {
  const bin = join(dir, `fake-meili-${mode}`);
  writeFileSync(
    bin,
    `#!/usr/bin/env node
const fs = require("node:fs");
fs.appendFileSync(${JSON.stringify(join(dir, "runs.log"))}, JSON.stringify({ argv: process.argv.slice(2), cwd: process.cwd(), env: process.env, pid: process.pid }) + "\\n");
${mode === "exit" ? "process.exit(3);" : mode === "stubborn" ? 'process.on("SIGTERM", () => {}); setInterval(() => {}, 1000);' : 'process.on("SIGTERM", () => { fs.appendFileSync(' + JSON.stringify(join(dir, "term.log")) + ', "term\\n"); process.exit(0); }); setInterval(() => {}, 1000);'}
`,
  );
  chmodSync(bin, 0o755);
  return bin;
}
const runs = (dir: string) =>
  existsSync(join(dir, "runs.log"))
    ? readFileSync(join(dir, "runs.log"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as { argv: string[]; cwd: string; env: Record<string, string> })
    : [];

describe("embedded Meilisearch", () => {
  it("creates the master key once, 32 random bytes, file 0600 in a 0700 folder", () => {
    const d = tmp();
    const k1 = ensureMeiliKey(d);
    expect(k1).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(ensureMeiliKey(d)).toBe(k1);
    expect(statSync(join(d, "secrets", "meili.key")).mode & 0o777).toBe(0o600);
    expect(statSync(join(d, "secrets")).mode & 0o777).toBe(0o700);
    chmodSync(join(d, "secrets", "meili.key"), 0o644);
    ensureMeiliKey(d);
    expect(statSync(join(d, "secrets", "meili.key")).mode & 0o777).toBe(0o600);
    expect(ensureMeiliKey(tmp())).not.toBe(k1);
  });

  it("binds to 127.0.0.1, production, no analytics, data under <data>/meili; key only in the environment", () => {
    const args = meiliArgs("/data", 7700);
    expect(args.join(" ")).toBe(
      "--http-addr 127.0.0.1:7700 --db-path /data/meili/data.ms --dump-dir /data/meili/dumps --snapshot-dir /data/meili/snapshots --env production --no-analytics --log-level WARN",
    );
    const env = meiliEnv("/data", "the-key", { PATH: "/bin", MEILI_HTTP_ADDR: "0.0.0.0:7700", ADMIN_PASSWORD: "x", AI_CLOUD_KEY: "y" });
    expect(env).toEqual({ MEILI_MASTER_KEY: "the-key", HF_HOME: "/data/meili/cache", HOME: "/data/meili", PATH: "/bin" });
  });

  it("restarts the child with backoff when it exits", async () => {
    const d = tmp();
    const s = superviseMeili({ bin: fakeBin(d, "exit"), dataDir: d, port: 7799, key: "k".repeat(43), log: () => {}, baseMs: 20, maxMs: 80 });
    sups.push(s);
    await until(() => s.starts >= 4);
    const r = runs(d);
    expect(r[0]!.argv).toContain("127.0.0.1:7799");
    expect(realpathSync(r[0]!.cwd)).toBe(realpathSync(join(d, "meili")));
    expect(r[0]!.env.MEILI_MASTER_KEY).toBe("k".repeat(43));
    expect(r[0]!.argv.join(" ")).not.toContain("k".repeat(43));
    expect(s.url).toBe("http://127.0.0.1:7799");
  });

  it("logs a missing binary and keeps retrying", async () => {
    const d = tmp();
    const logs: string[] = [];
    const s = superviseMeili({ bin: join(d, "nope"), dataDir: d, port: 7799, key: "k", log: (m) => logs.push(m), baseMs: 10, maxMs: 20 });
    sups.push(s);
    await until(() => s.starts >= 2);
    expect(logs[0]).toMatch(/failed to start/);
    expect(logs.join("\n")).not.toContain("MEILI_MASTER_KEY");
  });

  it("stop() sends SIGTERM and does not restart", async () => {
    const d = tmp();
    const s = superviseMeili({ bin: fakeBin(d, "wait"), dataDir: d, port: 7799, key: "k", log: () => {}, baseMs: 10 });
    await until(() => runs(d).length === 1);
    await s.stop();
    expect(readFileSync(join(d, "term.log"), "utf8")).toBe("term\n");
    await new Promise((r) => setTimeout(r, 100));
    expect(s.starts).toBe(1);
  });

  it("stop() falls back to SIGKILL", async () => {
    const d = tmp();
    const s = superviseMeili({ bin: fakeBin(d, "stubborn"), dataDir: d, port: 7799, key: "k", log: () => {}, killAfterMs: 200 });
    await until(() => runs(d).length === 1);
    const t = Date.now();
    await s.stop();
    expect(Date.now() - t).toBeGreaterThanOrEqual(150);
    expect(s.starts).toBe(1);
  });

  it("config: MEILI_URL means external (no binary); MEILI_BIN/MEILI_PORT for the embedded one", () => {
    expect(loadConfig({ MEILI_URL: "http://search:7700" })).toMatchObject({ meiliUrl: "http://search:7700", meiliBin: null });
    expect(loadConfig({ MEILI_BIN: "/usr/local/bin/meilisearch" })).toMatchObject({ meiliUrl: null, meiliBin: "/usr/local/bin/meilisearch", meiliPort: 7700 });
    expect(loadConfig({ MEILI_PORT: "7701" }).meiliPort).toBe(7701);
  });

  it("startSearch: MEILI_URL wins and spawns nothing; MEILI_BIN spawns; neither = search off", () => {
    const supervise = vi.fn(() => ({ url: "http://127.0.0.1:7700", starts: 1, stop: async () => {} }));
    const ensureKey = vi.fn(() => "key-key-key-key-key");
    const ext = startSearch(loadConfig({ MEILI_URL: "http://search:7700", MEILI_BIN: "/bin/meili" }), { supervise, ensureKey });
    expect(ext.meili).toBeNull();
    expect(ext.search).toBeInstanceOf(MeiliSearch);
    expect(supervise).not.toHaveBeenCalled();
    expect(ensureKey).not.toHaveBeenCalled();
    const emb = startSearch(loadConfig({ MEILI_BIN: "/bin/meili", DATA_DIR: "/tmp/x" }), { supervise, ensureKey });
    expect(supervise).toHaveBeenCalledWith(expect.objectContaining({ bin: "/bin/meili", port: 7700, key: "key-key-key-key-key" }));
    expect(emb.search).toBeInstanceOf(MeiliSearch);
    expect(emb.describe).not.toContain("key-key");
    expect(startSearch(loadConfig({})).search).toBeInstanceOf(NoopSearch);
  });
});
