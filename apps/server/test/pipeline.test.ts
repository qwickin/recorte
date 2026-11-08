import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { ItemSummary, SearchHit, UploadMeta } from "@recorte/shared";
import { createCloudAi, cloudEndpoint, parseAnswer } from "../src/cloud";
import { createWorker, backoffMs } from "../src/jobs";
import { createPipeline } from "../src/pipeline";
import { SqliteQueue } from "../src/queue";
import { resolveDeps } from "../src/deps";
import { ensureIndexWithRetry, lazyClassifier, retagOutdated } from "../src/runtime";
import { buildFilter, filterValue, safeHighlight, toMeiliDoc } from "../src/search/meili";
import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createApp } from "../src/app";
import { createUser } from "../src/auth/users";
import { openDb } from "../src/db";
import { PASSWORD, cookieOf, makeApp, login } from "./helpers";
import { InMemorySearch, fakeClassifier, stubSearch } from "./fakes";

const png = (color = "#3366cc") => sharp({ create: { width: 800, height: 600, channels: 3, background: color } }).png().toBuffer();
const meta = (over: Partial<UploadMeta> = {}): UploadMeta => ({
  type: "screenshot", kind: "area", url: "https://www.example.com/a", pageTitle: "Mapa de Lisboa", tags: [], categoryId: null,
  text: { selection: "mapa da cidade de Lisboa com ruas", meta: {}, headings: [], alts: [] }, capturedAt: "2026-01-01T00:00:00.000Z", ...over,
});

async function setup(deps: Parameters<typeof makeApp>[0] = {}) {
  const search = (deps.deps?.search as InMemorySearch | undefined) ?? new InMemorySearch();
  const t = await makeApp({ user: true, ...deps, deps: { ...deps.deps, search } });
  const cookie = await login(t);
  const upload = async (over: Partial<UploadMeta> = {}) => {
    const fd = new FormData();
    fd.set("image", new Blob([new Uint8Array(await png())], { type: "image/png" }), "x.png");
    fd.set("meta", JSON.stringify(meta(over)));
    const res = await t.app.request("/api/items", { method: "POST", headers: { cookie }, body: fd });
    expect(res.status).toBe(201);
    return (await res.json()) as ItemSummary;
  };
  const deps2 = () => resolveDeps({ db: t.db, config: t.config, search });
  return { t, cookie, search, upload, deps: deps2 };
}
const userIdOf = (t: Awaited<ReturnType<typeof makeApp>>) => (t.db.prepare("SELECT id FROM users").get() as { id: string }).id;

describe("pipeline", () => {
  it("writes the ai block, never touches user, even when a PATCH lands mid-classification", async () => {
    const { t, cookie, search, upload, deps } = await setup();
    const a = await upload({ tags: ["viagem"] });
    const d = deps();
    const userId = userIdOf(t);
    const classifier = {
      async classify() {
        // concurrent edit while the model is "running"
        await t.app.request(`/api/items/${a.id}`, {
          method: "PATCH", headers: { cookie, "content-type": "application/json" },
          body: JSON.stringify({ title: "O meu título", note: "nota", tags: ["viagem", "novo"] }),
        });
        return { tipo: ["mapa"], visual: ["modo escuro"], scores: {} };
      },
    };
    const events: string[] = [];
    d.events.subscribe(userId, (e) => events.push(e.type));
    await createPipeline({ deps: d, classifier: async () => classifier }).process(userId, a.id);
    const m = d.storage.readMeta(userId, a.id)!;
    expect(m.user).toMatchObject({ title: "O meu título", note: "nota", tags: ["viagem", "novo"] });
    // raw screenshot output is kept; the shown AI tags are the text tagger's + the visual tags
    expect(m.ai.tipo).toEqual(["mapa"]);
    expect(m.ai.visual).toEqual(["modo escuro"]);
    expect(m.ai.topics).toEqual(expect.arrayContaining(["lisbon", "map", "dark mode"]));
    expect(m.ai.model).toContain("topics-v2");
    expect(m.ai.keys.length).toBeGreaterThan(0);
    expect(m.ai.keys.some((k) => k.includes("lisboa"))).toBe(true);
    expect(m.ai.processedAt).not.toBeNull();
    expect(m.ai.model).not.toBe("");
    expect(m.ai.colors.length).toBeGreaterThan(0);
    // SQLite mirror + tags reflect the merged state
    const row = t.db.prepare("SELECT title FROM items WHERE id = ?").get(a.id) as { title: string };
    expect(row.title).toBe("O meu título");
    const tags = (t.db.prepare("SELECT tag FROM item_tags WHERE item_id = ? ORDER BY pos").all(a.id) as { tag: string }[]).map((r) => r.tag);
    expect(tags).toEqual(["viagem", "novo", ...m.ai.topics!]);
    expect(search.docs.get(a.id)?.tags).toContain("map");
    expect(events).toContain("item.updated");
  });

  it("stores the whole-page context in meta.json and ranks the selection above the page text", async () => {
    const { t, upload, deps } = await setup();
    const a = await upload({
      pageTitle: "Surfaces",
      text: {
        selection: "Combobox dropdown with roles Combobox dropdown",
        meta: {},
        headings: ["Surfaces"],
        alts: [],
        page: { text: "repository github issues ".repeat(80), keywords: ["design system"], nearHeadings: ["Dialog"] },
      },
    });
    const d = deps();
    const userId = userIdOf(t);
    await createPipeline({ deps: d, classifier: async () => fakeClassifier() }).process(userId, a.id);
    const m = JSON.parse(readFileSync(join(d.storage.itemDir(userId, a.id), "meta.json"), "utf8"));
    expect(m.text.page.nearHeadings).toEqual(["Dialog"]);
    expect(m.text.page.text).toContain("repository");
    const keys: string[] = m.ai.keys;
    expect(keys.slice(0, 3).join(" ")).toMatch(/combobox/);
    expect(keys.indexOf("dialog")).toBeGreaterThanOrEqual(0);
    const gh = keys.indexOf("github");
    expect(gh === -1 || gh > keys.indexOf("dialog")).toBe(true);
  });

  it("is a no-op for a purged item and fails (retryable) when original.webp is missing", async () => {
    const { t, upload, deps } = await setup();
    const a = await upload();
    const d = deps();
    const userId = userIdOf(t);
    const p = createPipeline({ deps: d, classifier: async () => fakeClassifier() });
    await expect(p.process(userId, "01ARZ3NDEKTSV4RRFFQ69G5FAV")).resolves.toBeUndefined();
    const { rmSync } = await import("node:fs");
    rmSync(d.storage.filePath(userId, a.id, "original.webp")!);
    await expect(p.process(userId, a.id)).rejects.toThrow(/original\.webp/);
  });

  it("a trashed item gets its ai block (for a later restore) but no item.updated and no search index", async () => {
    const { t, cookie, search, upload, deps } = await setup();
    const a = await upload();
    await t.app.request(`/api/items/${a.id}`, { method: "DELETE", headers: { cookie } });
    expect(search.docs.has(a.id)).toBe(false);
    const d = deps();
    const userId = userIdOf(t);
    const events: string[] = [];
    d.events.subscribe(userId, (e) => events.push(e.type));
    await createPipeline({ deps: d, classifier: async () => fakeClassifier() }).process(userId, a.id);
    expect(events).toEqual([]);
    expect(search.docs.has(a.id)).toBe(false);
    const m = d.storage.readMeta(userId, a.id)!;
    expect(m.deletedAt).not.toBeNull();
    expect(m.ai.tipo).toEqual(["mapa"]);
    // Restore brings it back with the AI tags.
    await t.app.request(`/api/items/${a.id}/restore`, { method: "POST", headers: { cookie } });
    const list = (await (await t.app.request("/api/items", { headers: { cookie } })).json()) as { items: ItemSummary[] };
    expect(list.items.find((i) => i.id === a.id)?.tags).toContain("map");
  });

  it("cloud step adds title/description/keys; a cloud failure does not fail the job", async () => {
    const { t, upload, deps } = await setup();
    const a = await upload();
    const d = deps();
    const userId = userIdOf(t);
    const seen: { url: string; init: RequestInit }[] = [];
    const ok: typeof fetch = async (url, init) => {
      seen.push({ url: String(url), init: init! });
      return new Response(JSON.stringify({ choices: [{ message: { content: '```json\n{"title":"Mapa da cidade","description":"Um mapa.","keys":["Cartografia","lisboa"]}\n```' } }] }), { status: 200 });
    };
    const cloud = createCloudAi({ url: "https://llm.test/v1/", key: "k", model: "m" }, ok);
    await createPipeline({ deps: d, classifier: async () => fakeClassifier(), cloud }).process(userId, a.id);
    const m = d.storage.readMeta(userId, a.id)!;
    expect(m.ai.title).toBe("Mapa da cidade");
    expect(m.ai.description).toBe("Um mapa.");
    expect(m.ai.keys).toContain("cartografia");
    expect(m.ai.keys.filter((k) => k === "lisboa")).toHaveLength(1);
    expect(m.ai.tipo).toEqual(["mapa"]); // cloud never creates tags
    expect(seen[0]!.url).toBe("https://llm.test/v1/chat/completions");
    expect((seen[0]!.init.headers as Record<string, string>).authorization).toBe("Bearer k");
    const body = JSON.parse(String(seen[0]!.init.body));
    const img = body.messages[1].content.find((c: { type: string }) => c.type === "image_url");
    expect(img.image_url.url).toMatch(/^data:image\/jpeg;base64,/);
    const sent = Buffer.from(img.image_url.url.split(",")[1], "base64");
    expect((await sharp(sent).metadata()).width).toBeLessThanOrEqual(1024);

    // failure: keeps the previous title, job still succeeds
    const bad = createCloudAi({ url: "https://llm.test/v1", key: "k", model: "m" }, async () => new Response("boom", { status: 500 }));
    await createPipeline({ deps: d, classifier: async () => fakeClassifier(["captura de ecrã"]), cloud: bad }).process(userId, a.id);
    const m2 = d.storage.readMeta(userId, a.id)!;
    expect(m2.ai.tipo).toEqual(["captura de ecrã"]);
    expect(m2.ai.title).toBe("Mapa da cidade");
  });

  it("cloud helpers: endpoint, tolerant JSON parsing, no JSON -> throws", () => {
    expect(cloudEndpoint("https://x/v1/chat/completions")).toBe("https://x/v1/chat/completions");
    expect(cloudEndpoint("https://x/v1///")).toBe("https://x/v1/chat/completions");
    expect(parseAnswer('blah {"title":"  T  ","keys":["A","a","b"]} tail')).toEqual({ title: "T", keys: ["a", "b"] });
    expect(() => parseAnswer("no json")).toThrow();
  });
});

describe("worker", () => {
  it("retries with 2^n s backoff and fails for good after 5 retries", async () => {
    const { t } = await setup();
    const q = new SqliteQueue(t.db);
    let clock = 1_000_000;
    let calls = 0;
    const w = createWorker({ queue: q, now: () => clock, handlers: { x: async () => { calls++; throw new Error("nope"); } } });
    q.enqueue("x", { a: 1 });
    t.db.prepare("UPDATE jobs SET run_at = ?").run(clock);
    const row = () => t.db.prepare("SELECT status, attempts, run_at, last_error FROM jobs").get() as { status: string; attempts: number; run_at: number; last_error: string };
    expect(await w.runOnce()).toBe(true);
    expect(row()).toMatchObject({ status: "pending", attempts: 1, run_at: clock + 2000, last_error: "nope" });
    expect(await w.runOnce()).toBe(false); // not due yet
    for (let n = 2; n <= 5; n++) {
      clock = row().run_at;
      await w.runOnce();
      expect(row()).toMatchObject({ status: "pending", attempts: n, run_at: clock + backoffMs(n) });
    }
    clock = row().run_at;
    await w.runOnce();
    expect(row()).toMatchObject({ status: "failed", attempts: 6 });
    expect(calls).toBe(6);
    expect(await w.runOnce()).toBe(false);
  });

  it("a job never stays running: odd throwables are recorded, and a throwing queue.fail is contained", async () => {
    const { t } = await setup();
    const q = new SqliteQueue(t.db);
    const status = () => (t.db.prepare("SELECT status, last_error FROM jobs").get() as { status: string; last_error: string });
    const w = createWorker({ queue: q, handlers: { nul: async () => { throw null; }, obj: async () => { throw { message: 5 }; } } });
    q.enqueue("nul", {});
    await expect(w.runOnce()).resolves.toBe(true);
    expect(status()).toMatchObject({ status: "pending", last_error: "null" });
    t.db.prepare("DELETE FROM jobs").run();
    q.enqueue("obj", {});
    await expect(w.runOnce()).resolves.toBe(true);
    expect(status()).toMatchObject({ status: "pending", last_error: "[object Object]" });
    // The failure bookkeeping itself throws: runOnce still resolves (the loop keeps going).
    t.db.prepare("DELETE FROM jobs").run();
    const broken = Object.assign(Object.create(Object.getPrototypeOf(q)), q, { fail: () => { throw new Error("db busy"); } }) as SqliteQueue;
    q.enqueue("nul", {});
    await expect(createWorker({ queue: broken, handlers: { nul: async () => { throw null; } } }).runOnce()).resolves.toBe(true);
  });

  it("completed jobs are removed; unknown types fail; running jobs are recovered on start", async () => {
    const { t } = await setup();
    const q = new SqliteQueue(t.db);
    const seen: unknown[] = [];
    const w = createWorker({ queue: q, pollMs: 10, handlers: { ok: async (p) => void seen.push(p) } });
    q.enqueue("ok", { n: 1 });
    q.enqueue("weird", {});
    await w.runOnce();
    await w.runOnce();
    expect(seen).toEqual([{ n: 1 }]);
    expect((t.db.prepare("SELECT type, status FROM jobs").all() as { type: string; status: string }[])).toEqual([{ type: "weird", status: "failed" }]);
    q.enqueue("ok", { n: 2 });
    t.db.prepare("UPDATE jobs SET status = 'running' WHERE type = 'ok'").run();
    w.start();
    await new Promise((r) => setTimeout(r, 100));
    await w.stop();
    expect(seen).toEqual([{ n: 1 }, { n: 2 }]);
  });

  it("a failed index at upload time is retried by the worker via the index job", async () => {
    const search = new InMemorySearch();
    search.failIndex = 1; // the upload's own index call
    const { t, upload, deps } = await setup({ deps: { search } });
    const a = await upload();
    expect(search.docs.size).toBe(0);
    const idx = t.db.prepare("SELECT payload FROM jobs WHERE type = 'index'").get() as { payload: string };
    expect(JSON.parse(idx.payload)).toMatchObject({ id: a.id, op: "index" });
    const d = deps();
    const userId = userIdOf(t);
    const pipeline = createPipeline({ deps: d, classifier: async () => fakeClassifier() });
    const w = createWorker({
      queue: new SqliteQueue(t.db),
      handlers: {
        process: async (p) => pipeline.process((p as { userId: string }).userId, (p as { id: string }).id),
        index: async (p) => pipeline.reindexOne((p as { userId: string }).userId, (p as { id: string }).id),
      },
    });
    // process job (oldest) then the index job
    while (await w.runOnce());
    expect(search.docs.has(a.id)).toBe(true);
    expect((t.db.prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n).toBe(0);
    expect(userId).toBeTruthy();
  });

  it("a persistently failing index job is retried, then succeeds when search comes back", async () => {
    const search = new InMemorySearch();
    const { t, upload, deps } = await setup({ deps: { search } });
    const a = await upload();
    search.docs.clear();
    t.db.prepare("DELETE FROM jobs").run();
    const q = new SqliteQueue(t.db);
    q.enqueue("index", { id: a.id, userId: userIdOf(t), op: "index" });
    search.failIndex = 1;
    let clock = Date.now();
    const pipeline = createPipeline({ deps: deps(), classifier: async () => fakeClassifier() });
    const w = createWorker({ queue: q, now: () => clock, handlers: { index: async (p) => pipeline.reindexOne((p as { userId: string }).userId, (p as { id: string }).id) } });
    await w.runOnce();
    expect(search.docs.size).toBe(0);
    expect((t.db.prepare("SELECT status, attempts FROM jobs").get() as { status: string })).toMatchObject({ status: "pending", attempts: 1 });
    clock += 2001;
    await w.runOnce();
    expect(search.docs.has(a.id)).toBe(true);
  });
});

describe("admin", () => {
  it("reprocess enqueues a process job per live item only", async () => {
    const { t, cookie, upload } = await setup();
    const a = await upload();
    await upload();
    const c = await upload();
    await t.app.request(`/api/items/${c.id}`, { method: "DELETE", headers: { cookie } });
    t.db.prepare("DELETE FROM jobs").run();
    const res = await t.app.request("/api/admin/reprocess", { method: "POST", headers: { cookie } });
    expect(await res.json()).toEqual({ queued: 2 });
    const ids = (t.db.prepare("SELECT payload FROM jobs WHERE type = 'process'").all() as { payload: string }[]).map((r) => JSON.parse(r.payload).id);
    expect(ids).toContain(a.id);
    expect(ids).not.toContain(c.id);
    expect((await t.app.request("/api/admin/reprocess", { method: "POST" })).status).toBe(401);
  });

  it("reindex restores SQLite rows (items, tags, colors) from files after the DB rows are gone, and rebuilds search", async () => {
    const { t, cookie, search, upload, deps } = await setup();
    const a = await upload({ tags: ["viagem"] });
    const b = await upload({ pageTitle: "Apagado" });
    await t.app.request(`/api/items/${b.id}`, { method: "DELETE", headers: { cookie } });
    const d = deps();
    const userId = userIdOf(t);
    await createPipeline({ deps: d, classifier: async () => fakeClassifier() }).process(userId, a.id);
    const snapshot = (await (await t.app.request("/api/items", { headers: { cookie } })).json()) as { items: ItemSummary[] };

    t.db.exec("DELETE FROM items"); // cascades to item_tags / item_colors
    t.db.exec("INSERT INTO items (id, user_id, type, site, url, title, created_at, thumb, width, height, color, has_note) VALUES ('GHOSTGHOSTGHOSTGHOSTGHOST00','" + userId + "','screenshot','x','https://x','ghost','2020-01-01T00:00:00.000Z','thumb.webp',1,1,'#000',0)");
    search.docs.clear();
    expect(((await (await t.app.request("/api/items", { headers: { cookie } })).json()) as { total: number }).total).toBe(1); // only the ghost
    const res = await t.app.request("/api/admin/reindex", { method: "POST", headers: { cookie } });
    expect(await res.json()).toEqual({ items: 2, removed: 1, indexed: true, adopted: 0, unreadable: 0 });
    const after = (await (await t.app.request("/api/items", { headers: { cookie } })).json()) as { items: ItemSummary[] };
    expect(after.items).toEqual(snapshot.items);
    expect(after.items[0]!.tags).toEqual(["viagem", "lisbon", "map", "city"]);
    expect((t.db.prepare("SELECT COUNT(*) AS n FROM item_colors WHERE item_id = ?").get(a.id) as { n: number }).n).toBeGreaterThan(0);
    const trash = (await (await t.app.request("/api/items?trash=1", { headers: { cookie } })).json()) as { total: number };
    expect(trash.total).toBe(1);
    expect([...search.docs.keys()]).toEqual([a.id]); // trashed item not indexed
  });

  it("reindex still restores SQLite when search is down", async () => {
    const { t, cookie, upload } = await setup({ deps: { search: { ...stubSearch, index: async () => {}, remove: async () => {}, search: async () => [], replaceAll: async () => { throw new Error("down"); } } } });
    await upload();
    t.db.exec("DELETE FROM items");
    const res = await t.app.request("/api/admin/reindex", { method: "POST", headers: { cookie } });
    expect(await res.json()).toEqual({ items: 1, removed: 0, indexed: false, adopted: 0, unreadable: 0 });
  });
});

describe("reindex after losing the database", () => {
  it("adopts the old owner's folders after the DB file is deleted and /setup gives the owner a new id", async () => {
    const { t, cookie, upload } = await setup();
    const oldUser = userIdOf(t);
    const cat = (await (await t.app.request("/api/categories", { method: "POST", headers: { cookie, "content-type": "application/json" }, body: JSON.stringify({ name: "Viagens" }) })).json()) as { id: string };
    const a = await upload({ tags: ["viagem"], note: "nota minha", title: "Título", categoryId: cat.id });
    const b = await upload({ pageTitle: "No lixo" });
    await t.app.request(`/api/items/${b.id}`, { method: "DELETE", headers: { cookie } });
    const before = (await (await t.app.request(`/api/items/${a.id}`, { headers: { cookie } })).json()) as { user: unknown };

    // The whole database is gone (file + WAL + SHM); the data folder with the items stays.
    t.db.close();
    for (const f of ["recorte.db", "recorte.db-wal", "recorte.db-shm"]) rmSync(join(t.dir, f), { force: true });
    const db = openDb(t.dir);
    const newUser = await createUser(db, "outro@recorte.test", PASSWORD);
    expect(newUser).not.toBe(oldUser);
    const search = new InMemorySearch();
    const app = createApp({ db, config: t.config, search });
    const c2 = cookieOf(await app.request("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: "outro@recorte.test", password: PASSWORD }) }));
    const list = async (qs = "") => (await (await app.request(`/api/items${qs}`, { headers: { cookie: c2 } })).json()) as { items: ItemSummary[]; total: number };
    expect((await list()).total).toBe(0);

    const res = await app.request("/api/admin/reindex", { method: "POST", headers: { cookie: c2 } });
    expect(await res.json()).toEqual({ items: 2, removed: 0, indexed: true, adopted: 2, unreadable: 0 });
    expect((await list()).items.map((i) => i.id)).toEqual([a.id]);
    expect((await list("?trash=1")).items.map((i) => i.id)).toEqual([b.id]);
    expect((await app.request(`/api/items/${a.id}/files/thumb.webp`, { headers: { cookie: c2 } })).status).toBe(200);
    const after = (await (await app.request(`/api/items/${a.id}`, { headers: { cookie: c2 } })).json()) as { userId: string; user: unknown };
    expect(after.user).toEqual(before.user); // user fields intact
    expect(after.userId).toBe(newUser);
    expect(existsSync(join(t.dir, "items", oldUser))).toBe(false);
    expect(JSON.parse(readFileSync(join(t.dir, "items", newUser, "2026", "01", a.id, "meta.json"), "utf8")).userId).toBe(newUser);
    expect([...search.docs.keys()]).toEqual([a.id]);
    // Idempotent.
    expect(await (await app.request("/api/admin/reindex", { method: "POST", headers: { cookie: c2 } })).json()).toEqual({
      items: 2, removed: 0, indexed: true, adopted: 0, unreadable: 0,
    });
  });

  it("does not adopt folders when there is more than one account", async () => {
    const { t, cookie, upload } = await setup();
    await upload();
    const ghost = join(t.dir, "items", "ghostuser");
    const { cpSync } = await import("node:fs");
    cpSync(join(t.dir, "items", userIdOf(t)), ghost, { recursive: true });
    rmSync(join(t.dir, "items", userIdOf(t)), { recursive: true });
    await createUser(t.db, `outro-${Math.random()}@recorte.test`, "another long password");
    const r = await (await t.app.request("/api/admin/reindex", { method: "POST", headers: { cookie } })).json();
    expect(r).toMatchObject({ adopted: 0, items: 0, removed: 1 });
    expect(existsSync(ghost)).toBe(true);
  });

  it("keeps the row of an item whose meta.json is unreadable", async () => {
    const { t, cookie, upload, deps } = await setup();
    const a = await upload();
    const b = await upload();
    const userId = userIdOf(t);
    writeFileSync(join(deps().storage.itemDir(userId, a.id), "meta.json"), "{ broken");
    const r = await (await t.app.request("/api/admin/reindex", { method: "POST", headers: { cookie } })).json();
    expect(r).toEqual({ items: 1, removed: 0, indexed: true, adopted: 0, unreadable: 1 });
    const ids = ((await (await t.app.request("/api/items", { headers: { cookie } })).json()) as { items: ItemSummary[] }).items.map((i) => i.id);
    expect(ids.sort()).toEqual([a.id, b.id].sort());
  });
});

describe("GET /api/search", () => {
  it("always filters by the session user, ignoring a userId parameter, and maps hits from SQLite", async () => {
    const { t, cookie, search, upload } = await setup();
    const a = await upload({ pageTitle: "Mapa de Lisboa" });
    const gone = await upload({ pageTitle: "Mapa apagado" });
    await t.app.request(`/api/items/${gone.id}`, { method: "DELETE", headers: { cookie } });
    search.docs.set(gone.id, { ...search.docs.get(a.id)!, id: gone.id, title: "Mapa apagado" }); // stale index entry
    search.docs.set("01ARZ3NDEKTSV4RRFFQ69G5FAV", { ...search.docs.get(a.id)!, id: "01ARZ3NDEKTSV4RRFFQ69G5FAV" }); // not in SQLite
    search.docs.set("OTHERUSERDOC", { ...search.docs.get(a.id)!, id: "OTHERUSERDOC", userId: "someone-else" });
    const res = await t.app.request("/api/search?q=mapa&userId=someone-else&tags=a,b&limit=5", { headers: { cookie } });
    expect(res.status).toBe(200);
    const hits = (await res.json()) as SearchHit[];
    expect(hits.map((h) => h.item.id)).toEqual([a.id]);
    expect(hits[0]!.score).toBe(1);
    expect(hits[0]!.item.thumb).toBe(`/api/items/${a.id}/files/thumb.webp`);
    expect(search.queries[0]).toMatchObject({ userId: userIdOf(t), q: "mapa", tags: ["a", "b"], limit: 5 });
  });

  it("validates, requires auth and degrades to 503 when search is down", async () => {
    const { t, cookie } = await setup({ deps: { search: { ...stubSearch, index: async () => {}, remove: async () => {}, search: async () => { throw new Error("down"); } } } });
    expect((await t.app.request("/api/search?q=x")).status).toBe(401);
    expect((await t.app.request("/api/search", { headers: { cookie } })).status).toBe(400);
    expect((await t.app.request("/api/search?q=x", { headers: { cookie } })).status).toBe(503);
  });
});

describe("meili helpers", () => {
  it("escapes filter values and always leads with the userId clause", () => {
    expect(filterValue('a"b\\c')).toBe('"a\\"b\\\\c"');
    const f = buildFilter({ userId: 'u" OR userId != "x', q: "q", tags: ["a", 'b"'], type: "post", site: "X.com", category: "c1", color: "AZUL" });
    expect(f[0]).toBe('userId = "u\\" OR userId != \\"x"');
    expect(f).toContain('tags = "b\\""');
    expect(f).toContain('site = "x.com"');
    expect(f).toContain('colors = "azul"');
    expect(f.filter((x) => x.startsWith("userId"))).toHaveLength(1);
  });

  it("index docs: createdAt as epoch ms; tag IDs to filter on, labels in all five languages to search", () => {
    const doc = toMeiliDoc({ id: "i", userId: "u", type: "screenshot", site: "s", title: "t", note: "", description: "", tags: ["recipe", "dark mode", "meu"], keys: [], text: "", colors: [], categoryId: null, createdAt: "2026-01-01T00:00:00.000Z" });
    expect(doc.createdAt).toBe(Date.parse("2026-01-01T00:00:00.000Z"));
    expect(doc.tags).toEqual(["recipe", "dark mode", "meu"]);
    expect(doc.tagLabels).toEqual(["recipe", "receita", "receta", "recette", "ricetta", "dark mode", "modo escuro", "modo oscuro", "mode sombre", "modalità scura", "meu"]);
    // The embedder's template gets the compact English labels only.
    expect(doc.tagWords).toEqual(["recipe", "dark mode", "meu"]);
  });

  it("highlights are HTML-escaped except our <mark> tags", () => {
    expect(safeHighlight("a <script>\u0001hit\u0002 & b")).toBe("a &lt;script&gt;<mark>hit</mark> &amp; b");
  });
});

describe("runtime helpers", () => {
  it("lazyClassifier loads once and retries after a failed load", async () => {
    let n = 0;
    const get = lazyClassifier(async () => {
      n++;
      if (n === 1) throw new Error("no model");
      return fakeClassifier();
    });
    await expect(get()).rejects.toThrow("no model");
    const a = await get();
    expect(await get()).toBe(a);
    expect(n).toBe(2);
  });

  it("ensureIndexWithRetry keeps trying until Meilisearch is up", async () => {
    let n = 0;
    const ok = await ensureIndexWithRetry({ ...stubSearch, index: async () => {}, remove: async () => {}, search: async () => [], ensureIndex: async () => { if (++n < 3) throw new Error("down"); } }, { baseMs: 1, maxMs: 2 });
    expect(ok).toBe(true);
    expect(n).toBe(3);
  });
});

describe("saved links (type link)", () => {
  async function linkServer(html: string) {
    const { createServer } = await import("node:http");
    const jpg = await sharp({ create: { width: 1200, height: 630, channels: 3, background: "#cc3322" } }).jpeg().toBuffer();
    const hits: string[] = [];
    const s = createServer((req, res) => {
      hits.push(req.url ?? "");
      if (req.url === "/page") res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
      else if (req.url === "/img/bacalhau.jpg") res.writeHead(200, { "content-type": "image/jpeg" }).end(jpg);
      else res.writeHead(404).end();
    });
    await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
    const port = (s.address() as { port: number }).port;
    const { isBlockedAddress } = await import("../src/links/safe-fetch");
    const linkFetch = {
      lookup: (h: string, cb: (e: Error | null, a: { address: string; family: number }[]) => void) =>
        h === "receitas.test" ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(new Error("ENOTFOUND"), []),
      isBlocked: (ip: string) => ip !== "127.0.0.1" && isBlockedAddress(ip),
    };
    return { url: `http://receitas.test:${port}/page`, linkFetch, hits, close: () => new Promise((r) => s.close(r)) };
  }
  const uploadLink = async (t: Awaited<ReturnType<typeof makeApp>>, cookie: string, over: Partial<UploadMeta>) => {
    const fd = new FormData();
    fd.set("meta", JSON.stringify(meta({ type: "link", kind: "link", pageTitle: "", text: { selection: "", meta: {}, headings: [], alts: [] }, ...over })));
    return t.app.request("/api/items", { method: "POST", headers: { cookie }, body: fd });
  };

  it("is saved without an image, then the job fetches it, downloads the og:image and classifies", async () => {
    const html = readFileSync(new URL("./fixtures/links/article.html", import.meta.url), "utf8");
    const srv = await linkServer(html);
    try {
      const { t, cookie, upload: _u, deps } = await setup();
      const res = await uploadLink(t, cookie, { url: srv.url, tags: ["jantar"], pageTitle: "ler mais" }); // the anchor text
      expect(res.status).toBe(201);
      const s0 = (await res.json()) as ItemSummary;
      expect(s0.type).toBe("link");
      expect(s0.thumb).toBeNull();
      const userId = userIdOf(t);
      const d = deps();
      const cls = fakeClassifier(["receita"]);
      await createPipeline({ deps: d, classifier: async () => cls, linkFetch: srv.linkFetch }).process(userId, s0.id);
      const m = d.storage.readMeta(userId, s0.id)!;
      expect(m.link).toMatchObject({ title: "Bacalhau com natas", siteName: "Receitas da Avó", canonicalUrl: "https://receitas.example/bacalhau-com-natas" });
      expect(m.link?.fetchedAt).toBeTruthy();
      expect(m.link?.fetchError).toBeUndefined();
      expect(m.source.pageTitle).toBe("Bacalhau com natas");
      expect(m.media[0]).toMatchObject({ file: "original.webp", width: 1200, height: 630 });
      expect(m.text.page?.text).toMatch(/cozinha portuguesa/);
      expect(m.text.meta.og?.["og:site_name"]).toBe("Receitas da Avó");
      expect(m.ai.tipo).toEqual(["receita"]);
      expect(cls.calls).toBe(1);
      expect(m.ai.keys).toContain("bacalhau");
      expect(m.user.tags).toEqual(["jantar"]);
      const list = (await (await t.app.request("/api/items?type=link", { headers: { cookie } })).json()) as { items: ItemSummary[] };
      expect(list.items[0]!.thumb).toBe(`/api/items/${s0.id}/files/thumb.webp`);
      expect((await t.app.request(list.items[0]!.thumb!, { headers: { cookie } })).status).toBe(200);
    } finally {
      await srv.close();
    }
  });

  it("keeps the extension's data when the server cannot fetch (login wall / SSRF block) and has no image", async () => {
    const { t, cookie, deps } = await setup();
    const res = await uploadLink(t, cookie, {
      url: "http://127.0.0.1:9/privado",
      kind: "page",
      pageTitle: "Painel interno",
      text: { selection: "", meta: { description: "Só com sessão", og: { "og:title": "Painel" } }, headings: ["Relatórios"], alts: [], page: { text: "relatórios trimestrais vendas" } },
    });
    expect(res.status).toBe(201);
    const s0 = (await res.json()) as ItemSummary;
    const userId = userIdOf(t);
    const d = deps();
    const cls = fakeClassifier();
    await createPipeline({ deps: d, classifier: async () => cls }).process(userId, s0.id);
    const m = d.storage.readMeta(userId, s0.id)!;
    expect(m.link?.fetchError).toBe("blocked");
    expect(readFileSync(join(d.storage.itemDir(userId, s0.id), "meta.json"), "utf8")).not.toContain("127.0.0.1:9 ->"); // no resolved details
    expect(m.link).toMatchObject({ title: "Painel", description: "Só com sessão" });
    expect(m.media).toEqual([]);
    expect(cls.calls).toBe(0); // nothing to look at
    expect(m.ai.processedAt).not.toBeNull();
    expect(m.ai.keys).toContain("relatórios");
    expect(m.text.page?.text).toBe("relatórios trimestrais vendas");
  });

  it("fetches once: a retry (classifier error) only redoes the AI step; Reprocessar (refetch) fetches again", async () => {
    const srv = await linkServer(readFileSync(new URL("./fixtures/links/article.html", import.meta.url), "utf8"));
    try {
      const { t, cookie, deps } = await setup();
      const s0 = (await (await uploadLink(t, cookie, { url: srv.url })).json()) as ItemSummary;
      const userId = userIdOf(t);
      let fail = true;
      const cls = { async classify() { if (fail) throw new Error("onnx exploded"); return { tipo: ["receita"], visual: [], scores: {} }; } };
      const pipe = createPipeline({ deps: deps(), classifier: async () => cls, linkFetch: srv.linkFetch });
      await expect(pipe.process(userId, s0.id)).rejects.toThrow(/onnx/);
      const afterFirst = deps().storage.readMeta(userId, s0.id)!;
      expect(afterFirst.link?.fetchedAt).toBeTruthy(); // persisted before the AI step
      expect(afterFirst.media).toHaveLength(1);
      expect(srv.hits.filter((h) => h === "/page")).toHaveLength(1);
      fail = false;
      await pipe.process(userId, s0.id);
      expect(srv.hits.filter((h) => h === "/page")).toHaveLength(1); // the retry did not fetch again
      expect(deps().storage.readMeta(userId, s0.id)!.ai.tipo).toEqual(["receita"]);
      await pipe.process(userId, s0.id, { refetch: true });
      expect(srv.hits.filter((h) => h === "/page")).toHaveLength(2);
    } finally {
      await srv.close();
    }
  });

  it("a retag job redoes only the local tags: no cloud call, cloud output and earlier screenshot tags kept", async () => {
    const { t, upload, deps } = await setup();
    const a = await upload();
    const d = deps();
    const userId = userIdOf(t);
    let calls = 0;
    const ok: typeof fetch = async () => {
      calls++;
      return new Response(JSON.stringify({ choices: [{ message: { content: '{"title":"Mapa da cidade","description":"Um mapa.","keys":["cartografia"]}' } }] }), { status: 200 });
    };
    const cloud = createCloudAi({ url: "https://llm.test/v1/", key: "k", model: "m" }, ok);
    await createPipeline({ deps: d, classifier: async () => fakeClassifier(), cloud }).process(userId, a.id);
    expect(calls).toBe(1);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // tagger upgrade while the visual model is missing
      const pipe = createPipeline({ deps: d, classifier: async () => { throw new Error("no model"); }, cloud });
      await pipe.process(userId, a.id, { retag: true });
    } finally {
      warn.mockRestore();
    }
    expect(calls).toBe(1);
    const m = d.storage.readMeta(userId, a.id)!;
    expect(m.ai.title).toBe("Mapa da cidade");
    expect(m.ai.keys).toContain("cartografia");
    expect(m.ai.model).toMatch(/\+cloud$/);
    expect(m.ai.tipo).toEqual(["mapa"]);
    expect(m.ai.topics).toEqual(expect.arrayContaining(["lisbon", "map"]));
  });

  it("retags every live item once per tagger version, at startup", async () => {
    const { t, cookie, upload } = await setup();
    const a = await upload();
    const b = await upload();
    await t.app.request(`/api/items/${b.id}`, { method: "DELETE", headers: { cookie } });
    const queue = new SqliteQueue(t.db);
    const before = (t.db.prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n;
    expect(retagOutdated({ db: t.db, queue })).toBe(1);
    const jobs = t.db.prepare("SELECT payload FROM jobs ORDER BY id DESC LIMIT 1").all() as { payload: string }[];
    expect(JSON.parse(jobs[0]!.payload)).toMatchObject({ id: a.id, retag: true });
    expect((t.db.prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n).toBe(before + 1);
    expect(retagOutdated({ db: t.db, queue })).toBe(0); // same version: nothing
  });

  it("a missing classifier model does not fail the job: ai.skipped, logged once", async () => {
    const { t, upload, deps } = await setup();
    const a = await upload();
    const b = await upload();
    const userId = userIdOf(t);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const pipe = createPipeline({ deps: deps(), classifier: async () => { throw new Error("Unable to get model file path or buffer."); } });
      await pipe.process(userId, a.id);
      await pipe.process(userId, b.id);
      for (const id of [a.id, b.id]) {
        const m = deps().storage.readMeta(userId, id)!;
        expect(m.ai.skipped).toBe("classifier_unavailable");
        expect(m.ai.processedAt).not.toBeNull();
        expect(m.ai.tipo).toEqual([]);
        expect(m.ai.keys.length).toBeGreaterThan(0); // keywords still run
        expect(m.ai.topics).toEqual(expect.arrayContaining(["lisbon", "map"])); // and so do the text tags
      }
      expect(warn.mock.calls.filter((c) => String(c[0]).includes("classifier unavailable"))).toHaveLength(1);
    } finally {
      warn.mockRestore();
    }
  });

  it.each(["trashed", "purged"] as const)("an item %s during the fetch is not written back; downloaded files are removed", async (what) => {
    const srv = await linkServer(readFileSync(new URL("./fixtures/links/article.html", import.meta.url), "utf8"));
    try {
      const { t, cookie, deps } = await setup();
      const s0 = (await (await uploadLink(t, cookie, { url: srv.url })).json()) as ItemSummary;
      const userId = userIdOf(t);
      const d = deps();
      let lookups = 0;
      // The image download (2nd lookup) happens after the item went away.
      const linkFetch = {
        ...srv.linkFetch,
        lookup: (h: string, cb: (e: Error | null, a: { address: string; family: number }[]) => void) => {
          if (++lookups === 2) {
            if (what === "trashed") void t.app.request(`/api/items/${s0.id}`, { method: "DELETE", headers: { cookie } });
            else d.storage.removeItem(userId, s0.id);
          }
          setTimeout(() => srv.linkFetch.lookup(h, cb), 20);
        },
      };
      const cls = fakeClassifier();
      await createPipeline({ deps: d, classifier: async () => cls, linkFetch }).process(userId, s0.id);
      expect(lookups).toBeGreaterThanOrEqual(2);
      expect(cls.calls).toBe(0);
      const dir = d.storage.itemDir(userId, s0.id);
      expect(existsSync(join(dir, "original.webp"))).toBe(false);
      expect(existsSync(join(dir, "thumb.webp"))).toBe(false);
      if (what === "purged") expect(existsSync(dir)).toBe(false);
      else {
        const m = d.storage.readMeta(userId, s0.id)!;
        expect(m.deletedAt).not.toBeNull();
        expect(m.link?.fetchedAt).toBeUndefined();
        expect(m.media).toEqual([]);
      }
    } finally {
      await srv.close();
    }
  });

  it("a screenshot still needs its image", async () => {
    const { t, cookie } = await setup();
    const fd = new FormData();
    fd.set("meta", JSON.stringify(meta()));
    expect((await t.app.request("/api/items", { method: "POST", headers: { cookie }, body: fd })).status).toBe(400);
  });
});
