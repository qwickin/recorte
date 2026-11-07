// End-to-end test against the real docker compose stack (docker/compose.yml: app + Meilisearch).
//
//   pnpm --filter @recorte/e2e e2e
//
// - Builds the image from this checkout and starts it under a separate compose project (`recorte-e2e`),
//   with its data/meili volumes in a temp dir and the app on a free 127.0.0.1 port (nothing in the repo is touched).
// - Owner via ADMIN_EMAIL/ADMIN_PASSWORD, two captures uploaded through the API with a device token,
//   AI tags awaited, then the gallery is driven in Chromium: login, tiles, ⌘K/Ctrl+K "doce português", ZIP download.
// - Always ends with `docker compose down -v` (set E2E_KEEP=1 to leave the stack running).
// - Chromium: $CHROMIUM_PATH, else the newest Chromium in the Playwright cache, else playwright-core's default.
// The first run needs internet: Meilisearch downloads its embedding model on first start.
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { type Browser, chromium } from "playwright-core";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SHOTS = join(ROOT, "prototype/gallery/public/shots");
const PROJECT = "recorte-e2e";
const EMAIL = "dono@recorte.test";
const PASSWORD = "e2e-palavra-passe-longa";
const MEILI_KEY = `e2e-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}-master-key`;
const START = Date.now();
const timings: Record<string, number> = {};
const mark = (k: string, since: number) => (timings[k] = Math.round((Date.now() - since) / 100) / 10);

let tmp = "";
let base = "";
let composeArgs: string[] = [];
let token = "";
let browser: Browser | null = null;
const ids: Record<"map" | "nata", string> = { map: "", nata: "" };

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const s = createServer();
    s.once("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const { port } = s.address() as { port: number };
      s.close(() => resolve(port));
    });
  });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function until<T>(what: string, timeoutMs: number, fn: () => Promise<T | null | undefined | false>, everyMs = 1000): Promise<T> {
  const end = Date.now() + timeoutMs;
  let last: unknown;
  while (Date.now() < end) {
    try {
      const v = await fn();
      if (v) return v;
    } catch (e) {
      last = e;
    }
    await sleep(everyMs);
  }
  throw new Error(`timed out waiting for ${what}${last ? ` (last error: ${(last as Error).message})` : ""}`);
}

function compose(args: string[], opts: { input?: string; quiet?: boolean } = {}): string {
  const r = spawnSync("docker", ["compose", ...composeArgs, ...args], {
    cwd: ROOT,
    encoding: "utf8",
    input: opts.input,
    env: { ...process.env, MEILI_MASTER_KEY: MEILI_KEY, ...versions() },
    stdio: ["pipe", "pipe", opts.quiet ? "pipe" : "inherit"],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(`docker compose ${args.join(" ")} failed (${r.status}): ${r.stderr ?? ""}`);
  return r.stdout;
}

let cachedVersions: { APP_VERSION: string; EXTENSION_VERSION: string } | null = null;
function versions() {
  if (!cachedVersions) {
    const v = JSON.parse(execFileSync(process.execPath, [join(ROOT, "scripts/version.mjs"), ROOT], { encoding: "utf8" }));
    cachedVersions = { APP_VERSION: v.app, EXTENSION_VERSION: v.extension };
  }
  return cachedVersions;
}

function chromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const cache = process.env.PLAYWRIGHT_BROWSERS_PATH ?? (process.platform === "darwin" ? join(homedir(), "Library/Caches/ms-playwright") : join(homedir(), ".cache/ms-playwright"));
  if (!existsSync(cache)) return undefined;
  const dirs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
  const rel = [
    "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
    "chrome-linux64/chrome",
    "chrome-linux/chrome",
    "chrome-win64/chrome.exe",
  ];
  for (const d of dirs) for (const r of rel) if (existsSync(join(cache, d, r))) return join(cache, d, r);
  return undefined;
}

const api = (path: string, init: RequestInit = {}) =>
  fetch(base + path, { ...init, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.headers ?? {}) } });

function meta(over: Record<string, unknown>) {
  return {
    type: "screenshot",
    kind: "visible",
    tags: [],
    categoryId: null,
    capturedAt: new Date().toISOString(),
    ...over,
  };
}

const CAPTURES = {
  map: {
    file: "osm-lisboa-1-t.webp",
    title: "Mapa de Lisboa no OpenStreetMap",
    meta: meta({
      url: "https://www.openstreetmap.org/#map=15/38.7139/-9.1394",
      pageTitle: "OpenStreetMap",
      text: {
        selection:
          "OpenStreetMap is a map of the world, created by people like you and free to use under an open license. Lisbon, Baixa, Chiado, Alfama, Praça do Comércio, Rossio, Tagus river. Zoom in to see streets, tram lines and points of interest.",
        meta: { description: "OpenStreetMap is a map of the world, created by people like you and free to use under an open license.", og: { "og:title": "OpenStreetMap", "og:site_name": "OpenStreetMap" } },
        headings: ["OpenStreetMap", "Welcome to OpenStreetMap!"],
        alts: [],
      },
    }),
  },
  nata: {
    file: "pastel-nata-1-t.webp",
    title: "Pastel de nata — receita tradicional",
    meta: meta({
      kind: "area",
      url: "https://www.tasteatlas.com/pastel-de-nata",
      pageTitle: "Pastel de Nata | Traditional Custard Tart From Lisbon, Portugal",
      text: {
        selection:
          "Pastel de nata is a Portuguese egg custard tart pastry, optionally dusted with cinnamon. The tarts were created before the 18th century by Catholic monks at the Jerónimos Monastery in Belém, Lisbon. Crispy puff pastry filled with a creamy egg custard, best eaten warm with a cup of coffee.",
        meta: { description: "Portuguese custard tart with flaky puff pastry and caramelised egg custard.", og: { "og:title": "Pastel de Nata", "og:type": "article" } },
        headings: ["Pastel de Nata", "What is pastel de nata?", "Best places to eat it in Lisbon"],
        alts: ["Pastéis de nata on a plate"],
      },
    }),
  },
} as const;

before(async () => {
  tmp = mkdtempSync(join(tmpdir(), "recorte-e2e-"));
  mkdirSync(join(tmp, "data"));
  mkdirSync(join(tmp, "meili"));
  // The app runs as uid 1000; on Linux hosts the invoking user may differ (GitHub runners are 1001).
  chmodSync(join(tmp, "data"), 0o777);
  const port = Number(process.env.E2E_PORT) || (await freePort());
  base = `http://127.0.0.1:${port}`;
  const override = join(tmp, "compose.e2e.yml");
  writeFileSync(
    override,
    [
      "services:",
      "  app:",
      "    image: recorte:e2e",
      `    ports: !override ["127.0.0.1:${port}:8080"]`,
      "    environment:",
      `      PUBLIC_URL: ${base}`,
      `      ADMIN_EMAIL: ${EMAIL}`,
      `      ADMIN_PASSWORD: ${PASSWORD}`,
      `    volumes: !override ["${join(tmp, "data")}:/data"]`,
      "  search:",
      `    volumes: !override ["${join(tmp, "meili")}:/meili_data"]`,
      "",
    ].join("\n"),
  );
  composeArgs = ["-p", PROJECT, "-f", join(ROOT, "docker/compose.yml"), "-f", override];
});

after(async () => {
  await browser?.close().catch(() => {});
  if (!composeArgs.length) return;
  if (process.env.E2E_KEEP) {
    console.log(`E2E_KEEP set: stack left running at ${base} (docker compose ${composeArgs.join(" ")} down -v)`);
    return;
  }
  try {
    compose(["down", "-v", "--remove-orphans"], { quiet: true });
  } finally {
    rmSync(tmp, { recursive: true, force: true });
    console.log(`timings (s): ${JSON.stringify({ ...timings, total: Math.round((Date.now() - START) / 1000) })}`);
  }
});

test("compose up --build: app healthy, Meilisearch reachable only internally", { timeout: 30 * 60_000 }, async () => {
  const merged = compose(["config"], { quiet: true });
  assert.match(merged, /meili_data/);
  assert.ok(!/published: "7700"/.test(merged), "Meilisearch must not publish a port");

  let t = Date.now();
  compose(["build", "app"]);
  mark("build", t);
  t = Date.now();
  compose(["up", "-d"]);
  const health = await until("GET /api/health", 180_000, async () => {
    const r = await fetch(`${base}/api/health`);
    return r.ok ? ((await r.json()) as { ok: boolean; version: string }) : null;
  });
  mark("startToHealthy", t);
  assert.equal(health.ok, true);
  assert.equal(health.version, versions().APP_VERSION);
  // Healthcheck defined in the image turns healthy.
  await until("container healthy", 120_000, async () => compose(["ps", "--format", "{{.Service}} {{.Health}}"], { quiet: true }).includes("app healthy"), 2000);
});

test("device token for the owner created by ADMIN_* env", async () => {
  const r = await fetch(`${base}/api/devices`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD, name: "E2E" }),
  });
  assert.equal(r.status, 201, await r.clone().text());
  token = ((await r.json()) as { token: string }).token;
  assert.ok(token);
});

test("upload two captures through the API", async () => {
  for (const key of ["map", "nata"] as const) {
    const c = CAPTURES[key];
    const form = new FormData();
    form.set("image", new Blob([readFileSync(join(SHOTS, c.file))], { type: "image/webp" }), "capture.webp");
    form.set("meta", JSON.stringify({ ...c.meta, title: c.title }));
    const r = await api("/api/items", { method: "POST", body: form });
    assert.equal(r.status, 201, await r.clone().text());
    ids[key] = ((await r.json()) as { id: string }).id;
  }
});

test("AI processing: tipo 'mapa' on the OpenStreetMap capture", { timeout: 10 * 60_000 }, async () => {
  const t = Date.now();
  const item = await until("AI tags", 8 * 60_000, async () => {
    const r = await api(`/api/items/${ids.map}`);
    const m = (await r.json()) as { ai: { processedAt: string | null; tipo: string[]; colors: string[] } };
    return m.ai.processedAt ? m : null;
  });
  mark("processing", t);
  assert.deepEqual(item.ai.tipo, ["mapa"]);
  assert.ok(item.ai.colors.length > 0);
});

test("search 'doce português' finds the pastel de nata (API, waits for the embedder)", { timeout: 20 * 60_000 }, async () => {
  const t = Date.now();
  const rank = await until(
    "nata in search results",
    18 * 60_000,
    async () => {
      const r = await api(`/api/search?q=${encodeURIComponent("doce português")}`);
      if (!r.ok) return null;
      const hits = (await r.json()) as { item: { id: string } }[];
      const i = hits.findIndex((h) => h.item.id === ids.nata);
      return i >= 0 ? i + 1 : null;
    },
    3000,
  );
  mark("searchable", t);
  timings.nataRank = rank;
});

test("gallery in Chromium: login, tiles, ⌘K / Ctrl+K search, ZIP download", { timeout: 5 * 60_000 }, async () => {
  const executablePath = chromiumPath();
  browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto(base + "/");
  await page.waitForURL(/\/login/);
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Palavra-passe").fill(PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();

  for (const key of ["map", "nata"] as const) {
    await page.locator(`[aria-label^="${CAPTURES[key].title},"]`).first().waitFor({ state: "visible", timeout: 30_000 });
  }

  await page.keyboard.press("ControlOrMeta+k");
  const input = page.getByPlaceholder("Descreve a captura que procuras");
  await input.waitFor({ state: "visible" });
  await input.fill("doce português");
  const option = page.getByRole("option").filter({ hasText: "Pastel de nata" }).first();
  await option.waitFor({ state: "visible", timeout: 30_000 });
  await page.screenshot({ path: join(tmp, "palette.png") });
  if (process.env.E2E_SCREENSHOT) writeFileSync(process.env.E2E_SCREENSHOT, readFileSync(join(tmp, "palette.png")));
  await page.keyboard.press("Escape");

  const zip = await page.request.get(base + "/downloads/recorte-chrome.zip");
  assert.equal(zip.status(), 200);
  assert.equal(zip.headers()["content-type"], "application/zip");
  const body = await zip.body();
  assert.equal(body.subarray(0, 2).toString(), "PK");
  const anon = await fetch(base + "/downloads/recorte-chrome.zip");
  assert.equal(anon.status, 401, "ZIPs need a session");
  assert.deepEqual(errors, []);
});

test("resources: image size and container memory", async () => {
  const size = Number(execFileSync("docker", ["image", "inspect", "recorte:e2e", "--format", "{{.Size}}"], { encoding: "utf8" }).trim());
  const stats = execFileSync("docker", ["stats", "--no-stream", "--format", "{{.Name}} {{.MemUsage}} {{.CPUPerc}}", `${PROJECT}-app-1`, `${PROJECT}-search-1`], { encoding: "utf8" }).trim();
  console.log(`image recorte:e2e ${(size / 1e6).toFixed(0)} MB\n${stats}`);
  assert.ok(size > 0);
});

test("recorte reset-password inside the container", async () => {
  const NEW = "outra-palavra-passe-longa";
  const out = compose(["exec", "-T", "app", "recorte", "reset-password", EMAIL, "--password", NEW], { quiet: true });
  assert.match(out, /Password updated/);
  // Devices are revoked; the new password works.
  assert.equal((await api("/api/items")).status, 401);
  const r = await fetch(`${base}/api/login`, { method: "POST", headers: { "content-type": "application/json", origin: base }, body: JSON.stringify({ email: EMAIL, password: NEW }) });
  assert.equal(r.status, 200);
});
