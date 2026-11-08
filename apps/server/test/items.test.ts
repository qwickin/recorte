import { crc32, deflateSync } from "node:zlib";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import type { ItemSummary, UploadMeta } from "@recorte/shared";
import { createUser } from "../src/auth/users";
import { EventBus } from "../src/events";
import { purgeTrash } from "../src/items/purge";
import { itemsRepo } from "../src/items/repo";
import { InMemorySearch, stubSearch } from "./fakes";
import { ulidTime } from "../src/ids";
import { Storage } from "../src/storage";
import { makeApp, login, sessionCookie } from "./helpers";

type T = Awaited<ReturnType<typeof makeApp>>;

const png = (color: string, w = 800, h = 600) =>
  sharp({ create: { width: w, height: h, channels: 3, background: color } }).png().toBuffer();

const meta = (over: Partial<UploadMeta> = {}): UploadMeta => ({
  type: "screenshot",
  kind: "area",
  url: "https://www.example.com/a",
  pageTitle: "Example page",
  tags: [],
  categoryId: null,
  text: { selection: "", meta: {}, headings: [], alts: [] },
  capturedAt: "2026-01-01T00:00:00.000Z",
  ...over,
});

async function upload(t: T, cookie: string, over: Partial<UploadMeta> = {}, color = "#3366cc") {
  const fd = new FormData();
  fd.set("image", new Blob([new Uint8Array(await png(color))], { type: "image/png" }), "x.png");
  fd.set("meta", JSON.stringify(meta(over)));
  const res = await t.app.request("/api/items", { method: "POST", headers: { cookie }, body: fd });
  return res;
}
const get = (t: T, path: string, cookie: string) => t.app.request(path, { headers: { cookie } });
const send = (t: T, method: string, path: string, cookie: string, body?: unknown) =>
  t.app.request(path, { method, headers: { cookie, "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });

async function setup(deps: Parameters<typeof makeApp>[0] = {}) {
  const t = await makeApp({ user: true, ...deps });
  return { t, cookie: await login(t) };
}

describe("items", () => {
  it("upload then list returns the item first with thumb url", async () => {
    const { t, cookie } = await setup();
    const a = await upload(t, cookie, { pageTitle: "First" });
    expect(a.status).toBe(201);
    const sa = (await a.json()) as ItemSummary;
    expect(sa.thumb).toBe(`/api/items/${sa.id}/files/thumb.webp`);
    expect(sa.site).toBe("example.com");
    const b = (await (await upload(t, cookie, { pageTitle: "Second" })).json()) as ItemSummary;
    const page = (await (await get(t, "/api/items", cookie)).json()) as { items: ItemSummary[]; total: number };
    expect(page.items.map((i) => i.id)).toEqual([b.id, sa.id]);
    expect(page.total).toBe(2);
    const thumb = await get(t, sa.thumb!, cookie);
    expect(thumb.status).toBe(200);
    expect(thumb.headers.get("content-type")).toBe("image/webp");
    expect((await sharp(Buffer.from(await thumb.arrayBuffer())).metadata()).width).toBe(640);
    // process job enqueued
    expect((t.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE type = 'process'").get() as { n: number }).n).toBe(2);
  });

  it("keyset pagination is stable across 30 items with limit 12", async () => {
    const { t, cookie } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 30; i++) ids.push(((await (await upload(t, cookie)).json()) as ItemSummary).id);
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const q: string = `/api/items?limit=12${cursor ? `&cursor=${cursor}` : ""}`;
      const p = (await (await get(t, q, cookie)).json()) as { items: ItemSummary[]; nextCursor: string | null; total: number };
      expect(p.total).toBe(30);
      seen.push(...p.items.map((i) => i.id));
      cursor = p.nextCursor;
      pages++;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen).toEqual([...ids].reverse());
    expect((await get(t, "/api/items?cursor=!!!", cookie)).status).toBe(400);
  });

  it("tags AND filter, normalised on upload (labels of AI tags, in any language, become their ID)", async () => {
    const { t, cookie } = await setup();
    const a = (await (await upload(t, cookie, { tags: [" Lisboa ", "lisbon", "Modo  Escuro", "Viagem  2024"] })).json()) as ItemSummary;
    expect(a.tags).toEqual(["lisbon", "dark mode", "viagem 2024"]);
    await upload(t, cookie, { tags: ["lisboa"] });
    const both = (await (await get(t, "/api/items?tags=lisboa,modo%20escuro", cookie)).json()) as { items: ItemSummary[]; total: number };
    expect(both.items.map((i) => i.id)).toEqual([a.id]);
    expect(both.total).toBe(1);
    const one = (await (await get(t, "/api/items?tags=lisboa", cookie)).json()) as { items: ItemSummary[] };
    expect(one.items).toHaveLength(2);
  });

  it("filters by site, type, color, category and date", async () => {
    const { t, cookie } = await setup();
    const cat = (await (await send(t, "POST", "/api/categories", cookie, { name: "Viagens" })).json()) as { id: string };
    const a = (await (await upload(t, cookie, { url: "https://foo.org/x", categoryId: cat.id }, "#ff0000")).json()) as ItemSummary;
    await upload(t, cookie, { type: "article" });
    const ids = async (qs: string) => ((await (await get(t, `/api/items?${qs}`, cookie)).json()) as { items: ItemSummary[] }).items.map((i) => i.id);
    expect(await ids("site=foo.org")).toEqual([a.id]);
    expect(await ids(`category=${cat.id}`)).toEqual([a.id]);
    expect(await ids("type=article")).toHaveLength(1);
    expect(await ids("color=vermelho")).toEqual([a.id]);
    expect(await ids("from=2999-01-01")).toEqual([]);
    expect(await ids("to=2999-01-01")).toHaveLength(2);
  });

  it("PATCH only touches the user block (ai block unchanged in meta.json)", async () => {
    const { t, cookie } = await setup();
    const a = (await (await upload(t, cookie)).json()) as ItemSummary;
    const metaPath = () => {
      const row = t.db.prepare("SELECT user_id, created_at FROM items WHERE id = ?").get(a.id) as { user_id: string; created_at: string };
      const d = new Date(row.created_at);
      return join(t.dir, "items", row.user_id, String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, "0"), a.id, "meta.json");
    };
    const before = JSON.parse(readFileSync(metaPath(), "utf8"));
    const res = await send(t, "PATCH", `/api/items/${a.id}`, cookie, {
      title: "Novo",
      note: "nota",
      tags: ["  Viagem ", "viagem"],
      ai: { tipo: ["hacked"] },
      user: { tags: ["evil"] },
      id: "other",
      deletedAt: "2020-01-01",
    });
    expect(res.status).toBe(200);
    const after = JSON.parse(readFileSync(metaPath(), "utf8"));
    expect(after.ai).toEqual(before.ai);
    expect(after.id).toBe(a.id);
    expect(after.deletedAt).toBeNull();
    expect(after.schemaVersion).toBe(1);
    expect(after.user).toEqual({ title: "Novo", note: "nota", tags: ["viagem"], categoryId: null, hiddenAiTags: [] });
    const full = (await (await get(t, `/api/items/${a.id}`, cookie)).json()) as { user: { title: string } };
    expect(full.user.title).toBe("Novo");
    expect((await send(t, "PATCH", `/api/items/${a.id}`, cookie, { categoryId: "nope" })).status).toBe(400);
  });

  it("hiddenAiTags removes tag from counts", async () => {
    const { t, cookie } = await setup();
    const a = (await (await upload(t, cookie, { tags: ["lisboa"] })).json()) as ItemSummary;
    // simulate Task 5 having written the ai block
    const storage = new Storage(t.dir);
    const row = t.db.prepare("SELECT user_id FROM items WHERE id = ?").get(a.id) as { user_id: string };
    const m = storage.readMeta(row.user_id, a.id)!;
    m.ai.tipo = ["mapa"];
    m.ai.visual = ["modo escuro"];
    storage.writeMeta(m);
    itemsRepo(t.db).upsertFromMeta(m);
    const counts = async () => (await (await get(t, "/api/tags", cookie)).json()) as { tag: string; count: number; origin: string }[];
    // The screenshot fallback (raw tipo/visual keys) shows as tag IDs; the typed "lisboa" is the ID too.
    expect((await counts()).map((c) => c.tag).sort()).toEqual(["dark mode", "lisbon", "map"]);
    expect((await counts()).find((c) => c.tag === "map")!.origin).toBe("ai");
    expect((await counts()).find((c) => c.tag === "lisbon")!.origin).toBe("user");
    // Hiding by a label (here pt-BR "Mapa") stores the ID.
    await send(t, "PATCH", `/api/items/${a.id}`, cookie, { hiddenAiTags: ["Mapa"] });
    expect(storage.readMeta(row.user_id, a.id)!.user.hiddenAiTags).toEqual(["map"]);
    expect((await counts()).map((c) => c.tag).sort()).toEqual(["dark mode", "lisbon"]);
    const s = (await (await get(t, "/api/items", cookie)).json()) as { items: ItemSummary[] };
    expect(s.items[0]!.tags).toEqual(["lisbon", "dark mode"]);
  });

  it("delete then restore", async () => {
    const calls: string[] = [];
    const search = {
      ...stubSearch,
      index: async (d: { id: string }) => void calls.push(`index:${d.id}`),
      remove: async (id: string) => void calls.push(`remove:${id}`),
      search: async () => [],
    };
    const { t, cookie } = await setup({ deps: { search } });
    const a = (await (await upload(t, cookie, { tags: ["lisboa"] })).json()) as ItemSummary;
    const list = async () => ((await (await get(t, "/api/items", cookie)).json()) as { items: ItemSummary[] }).items.length;
    const tags = async () => ((await (await get(t, "/api/tags", cookie)).json()) as unknown[]).length;
    expect(await list()).toBe(1);
    expect(await tags()).toBe(1);
    expect((await send(t, "DELETE", `/api/items/${a.id}`, cookie)).status).toBe(204);
    expect(await list()).toBe(0);
    expect(await tags()).toBe(0);
    expect(calls).toContain(`remove:${a.id}`);
    const trash = (await (await get(t, "/api/items?trash=1", cookie)).json()) as { items: ItemSummary[] };
    expect(trash.items.map((i) => i.id)).toEqual([a.id]);
    expect((await get(t, `/api/items/${a.id}`, cookie)).status).toBe(200);
    calls.length = 0;
    const r = await send(t, "POST", `/api/items/${a.id}/restore`, cookie);
    expect(r.status).toBe(200);
    expect(await list()).toBe(1);
    expect(await tags()).toBe(1);
    expect(calls).toContain(`index:${a.id}`);
  });

  it("delete/restore succeed when search is down and enqueue an index retry", async () => {
    const down = { ...stubSearch, index: async () => { throw new Error("down"); }, remove: async () => { throw new Error("down"); }, search: async () => [] };
    const { t, cookie } = await setup({ deps: { search: down } });
    const a = (await (await upload(t, cookie)).json()) as ItemSummary;
    expect((await send(t, "DELETE", `/api/items/${a.id}`, cookie)).status).toBe(204);
    expect((await send(t, "POST", `/api/items/${a.id}/restore`, cookie)).status).toBe(200);
    expect((t.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE type = 'index'").get() as { n: number }).n).toBeGreaterThan(0);
  });

  it("bulk delete, restore and patch", async () => {
    const { t, cookie } = await setup();
    const a = (await (await upload(t, cookie)).json()) as ItemSummary;
    const b = (await (await upload(t, cookie)).json()) as ItemSummary;
    expect((await send(t, "POST", "/api/items/bulk", cookie, { ids: [a.id, b.id], action: "delete" })).status).toBe(200);
    expect(((await (await get(t, "/api/items", cookie)).json()) as { total: number }).total).toBe(0);
    await send(t, "POST", "/api/items/bulk", cookie, { ids: [a.id], action: "restore" });
    await send(t, "POST", "/api/items/bulk", cookie, { ids: [a.id], action: "patch", patch: { tags: ["x"] } });
    const p = (await (await get(t, "/api/items?tags=x", cookie)).json()) as { items: ItemSummary[] };
    expect(p.items.map((i) => i.id)).toEqual([a.id]);
  });

  it("typed tags become IDs at PATCH and bulk too (labels only, never the tagger's aliases); filters accept labels", async () => {
    const { t, cookie } = await setup();
    const a = (await (await upload(t, cookie)).json()) as ItemSummary;
    const b = (await (await upload(t, cookie)).json()) as ItemSummary;
    const r = await send(t, "PATCH", `/api/items/${a.id}`, cookie, { tags: ["Modo Escuro", "receta", "telemóvel", "dark mode"], hiddenAiTags: ["Lisbonne"] });
    const m = (await r.json()) as { user: { tags: string[]; hiddenAiTags: string[] } };
    expect(m.user.tags).toEqual(["dark mode", "recipe", "telemóvel"]);
    expect(m.user.hiddenAiTags).toEqual(["lisbon"]);
    await send(t, "POST", "/api/items/bulk", cookie, { ids: [b.id], action: "patch", patch: { tags: ["Mode sombre", "Ricetta"] } });
    const both = (await (await get(t, "/api/items?tags=modo%20oscuro,recette", cookie)).json()) as { items: ItemSummary[] };
    expect(both.items.map((i) => i.id).sort()).toEqual([a.id, b.id].sort());
    const counts = (await (await get(t, "/api/tags", cookie)).json()) as { tag: string; count: number }[];
    expect(counts.find((c) => c.tag === "dark mode")!.count).toBe(2);
    expect(counts.some((c) => c.tag === "modo escuro" || c.tag === "mode sombre")).toBe(false);
  });

  it("files route: 401 without auth, 404 for unknown names, traversal and other users", async () => {
    const { t, cookie } = await setup();
    const a = (await (await upload(t, cookie)).json()) as ItemSummary;
    expect((await t.app.request(a.thumb!)).status).toBe(401);
    expect((await get(t, `/api/items/${a.id}/files/meta.json`, cookie)).status).toBe(404);
    expect((await get(t, `/api/items/${a.id}/files/..%2F..%2Frecorte.db`, cookie)).status).toBe(404);
    expect((await get(t, `/api/items/${a.id}/files/original.webp`, cookie)).status).toBe(200);
    // second user
    const c2 = sessionCookie(t.db, await createUser(t.db, `outro-${Math.random()}@recorte.test`, "another long password"));
    expect((await get(t, a.thumb!, c2)).status).toBe(404);
    expect((await get(t, `/api/items/${a.id}`, c2)).status).toBe(404);
    expect((await send(t, "DELETE", `/api/items/${a.id}`, c2)).status).toBe(404);
    expect(((await (await get(t, "/api/items", c2)).json()) as { total: number }).total).toBe(0);
  });

  it("uploads succeed when search is unavailable", async () => {
    const down = { ...stubSearch, index: async () => { throw new Error("meili down"); }, remove: async () => { throw new Error("down"); }, search: async () => { throw new Error("down"); } };
    const { t, cookie } = await setup({ deps: { search: down } });
    const res = await upload(t, cookie);
    expect(res.status).toBe(201);
    const a = (await res.json()) as ItemSummary;
    expect((await get(t, a.thumb!, cookie)).status).toBe(200);
    expect(((await (await get(t, "/api/items", cookie)).json()) as { total: number }).total).toBe(1);
    expect((t.db.prepare("SELECT COUNT(*) AS n FROM jobs WHERE type = 'process'").get() as { n: number }).n).toBe(1);
  });

  it("rejects bad uploads", async () => {
    const { t, cookie } = await setup();
    const fd = new FormData();
    fd.set("image", new Blob([new Uint8Array([1, 2, 3])]), "x.png");
    fd.set("meta", JSON.stringify(meta()));
    expect((await t.app.request("/api/items", { method: "POST", headers: { cookie }, body: fd })).status).toBe(400);
    const fd2 = new FormData();
    fd2.set("image", new Blob([new Uint8Array(await png("#fff"))]), "x.png");
    fd2.set("meta", JSON.stringify({ ...meta(), url: undefined }));
    expect((await t.app.request("/api/items", { method: "POST", headers: { cookie }, body: fd2 })).status).toBe(400);
    expect((await t.app.request("/api/items", { method: "POST", body: fd2 })).status).toBe(401);
  });

  it("a stale or foreign categoryId on upload saves the capture without category (never 400)", async () => {
    const { t, cookie } = await setup();
    const c2 = sessionCookie(t.db, await createUser(t.db, `outro-${Math.random()}@recorte.test`, "another long password"));
    const foreign = (await (await send(t, "POST", "/api/categories", c2, { name: "Dela" })).json()) as { id: string };
    const mine = (await (await send(t, "POST", "/api/categories", cookie, { name: "Minha" })).json()) as { id: string };
    await send(t, "DELETE", `/api/categories/${mine.id}`, cookie); // deleted while the capture waited in the queue
    for (const categoryId of [mine.id, foreign.id, "01ARZ3NDEKTSV4RRFFQ69G5FAV"]) {
      const res = await upload(t, cookie, { categoryId, note: "fica" });
      expect(res.status).toBe(201);
      const id = ((await res.json()) as ItemSummary).id;
      const full = (await (await get(t, `/api/items/${id}`, cookie)).json()) as { user: { categoryId: string | null; note: string } };
      expect(full.user).toMatchObject({ categoryId: null, note: "fica" });
    }
  });

  it("orders uploads by capture time (validated), so offline-queued captures land where they were taken", async () => {
    const { t, cookie } = await setup();
    const ids = async (qs = "") => ((await (await get(t, `/api/items${qs}`, cookie)).json()) as { items: ItemSummary[] }).items;
    const fresh = (await (await upload(t, cookie, { capturedAt: new Date().toISOString() })).json()) as ItemSummary;
    // Taken in June 2025, sent much later (offset string normalised to UTC ISO).
    const old = (await (await upload(t, cookie, { capturedAt: "2025-06-01T12:00:00+01:00" })).json()) as ItemSummary;
    expect(old.createdAt).toBe("2025-06-01T11:00:00.000Z");
    expect(ulidTime(old.id)).toBe(Date.parse("2025-06-01T11:00:00.000Z"));
    expect(existsSync(join(t.dir, "items", (t.db.prepare("SELECT id FROM users").get() as { id: string }).id, "2025", "06", old.id))).toBe(true);
    // Future, before 2000 and garbage fall back to the upload time (and are still saved).
    const t0 = Date.now();
    const bad: ItemSummary[] = [];
    for (const capturedAt of ["2999-01-01T00:00:00.000Z", "1990-01-01T00:00:00.000Z", "não é data"]) {
      const r = await upload(t, cookie, { capturedAt });
      expect(r.status).toBe(201);
      bad.push((await r.json()) as ItemSummary);
    }
    for (const b of bad) expect(Math.abs(Date.parse(b.createdAt) - t0)).toBeLessThan(60_000);
    const list = await ids();
    expect(list.at(-1)!.id).toBe(old.id);
    expect(list.map((i) => i.id).indexOf(fresh.id)).toBeLessThan(list.length - 1);
    // Keyset stays consistent across the backdated item.
    const p1 = (await (await get(t, "/api/items?limit=2", cookie)).json()) as { items: ItemSummary[]; nextCursor: string };
    const p2 = (await (await get(t, `/api/items?limit=2&cursor=${p1.nextCursor}`, cookie)).json()) as { items: ItemSummary[]; nextCursor: string };
    const p3 = (await (await get(t, `/api/items?limit=2&cursor=${p2.nextCursor}`, cookie)).json()) as { items: ItemSummary[]; nextCursor: string | null };
    expect([...p1.items, ...p2.items, ...p3.items].map((i) => i.id)).toEqual(list.map((i) => i.id));
  });

  it("accepts an over-long meta (old queued capture) and clamps it instead of rejecting it", async () => {
    const { t, cookie } = await setup();
    const res = await upload(t, cookie, {
      title: "t".repeat(500),
      note: "n".repeat(8000),
      tags: Array.from({ length: 70 }, (_, i) => `tag${i}`),
      text: { selection: "s".repeat(19_000), meta: { description: "d".repeat(4000) }, headings: [], alts: Array.from({ length: 60 }, () => "a".repeat(500)) },
    });
    expect(res.status).toBe(201);
    const id = ((await res.json()) as ItemSummary).id;
    const full = (await (await get(t, `/api/items/${id}`, cookie)).json()) as {
      user: { title: string; note: string; tags: string[] };
      text: { alts: string[]; meta: { description: string } };
      truncated?: boolean;
    };
    expect(full.user.title).toHaveLength(300);
    expect(full.user.note).toHaveLength(5000);
    expect(full.user.tags).toHaveLength(50);
    expect(full.text.alts.every((a) => a.length <= 300)).toBe(true);
    expect(full.text.meta.description).toHaveLength(1000);
    expect(full.truncated).toBe(true);
  });

  it("deleting a category also updates the search index of its items", async () => {
    const search = new InMemorySearch();
    const { t, cookie } = await setup({ deps: { search } });
    const c = (await (await send(t, "POST", "/api/categories", cookie, { name: "Viagens" })).json()) as { id: string };
    const a = (await (await upload(t, cookie, { categoryId: c.id })).json()) as ItemSummary;
    expect(search.docs.get(a.id)?.categoryId).toBe(c.id);
    search.failIndex = 0;
    expect((await send(t, "DELETE", `/api/categories/${c.id}`, cookie)).status).toBe(204);
    expect(search.docs.get(a.id)?.categoryId).toBeNull();
    // Search down: the category is still deleted and an index retry is queued.
    const c2 = (await (await send(t, "POST", "/api/categories", cookie, { name: "Outra" })).json()) as { id: string };
    const b = (await (await upload(t, cookie, { categoryId: c2.id })).json()) as ItemSummary;
    t.db.prepare("DELETE FROM jobs WHERE type = 'index'").run();
    search.failIndex = 1;
    expect((await send(t, "DELETE", `/api/categories/${c2.id}`, cookie)).status).toBe(204);
    const job = t.db.prepare("SELECT payload FROM jobs WHERE type = 'index'").get() as { payload: string };
    expect(JSON.parse(job.payload)).toMatchObject({ id: b.id, op: "index" });
  });

  it("categories CRUD; deleting a category clears it on items", async () => {
    const { t, cookie } = await setup();
    const c = (await (await send(t, "POST", "/api/categories", cookie, { name: "Viagens", color: "#fff" })).json()) as { id: string; name: string };
    expect((await send(t, "POST", "/api/categories", cookie, { name: "Viagens" })).status).toBe(409);
    const a = (await (await upload(t, cookie, { categoryId: c.id })).json()) as ItemSummary;
    expect((await send(t, "PATCH", `/api/categories/${c.id}`, cookie, { name: "Trips" })).status).toBe(200);
    expect(((await (await get(t, "/api/categories", cookie)).json()) as { name: string }[])[0]!.name).toBe("Trips");
    expect((await send(t, "DELETE", `/api/categories/${c.id}`, cookie)).status).toBe(204);
    const full = (await (await get(t, `/api/items/${a.id}`, cookie)).json()) as { user: { categoryId: string | null } };
    expect(full.user.categoryId).toBeNull();
    expect(((await (await get(t, "/api/categories", cookie)).json()) as unknown[]).length).toBe(0);
  });

  it("export returns a zip with meta.json (non-deleted only)", async () => {
    const { t, cookie } = await setup();
    const a = (await (await upload(t, cookie)).json()) as ItemSummary;
    const b = (await (await upload(t, cookie)).json()) as ItemSummary;
    await send(t, "DELETE", `/api/items/${b.id}`, cookie);
    const res = await get(t, "/api/export", cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/zip");
    const buf = Buffer.from(await res.arrayBuffer());
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const text = buf.toString("latin1");
    expect(text).toContain(`${a.id}/meta.json`);
    expect(text).toContain(`${a.id}/original.webp`);
    expect(text).not.toContain(b.id);
    expect((await t.app.request("/api/export")).status).toBe(401);
  });

  it("SSE streams item events for the owner", async () => {
    const { t, cookie } = await setup();
    const res = await get(t, "/api/events", cookie);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    await reader.read(); // initial comment
    const a = (await (await upload(t, cookie)).json()) as ItemSummary;
    let buf = "";
    while (!buf.includes(a.id)) buf += dec.decode((await reader.read()).value);
    expect(buf).toContain("event: item.created");
    await send(t, "DELETE", `/api/items/${a.id}`, cookie);
    while (!buf.includes("item.deleted")) buf += dec.decode((await reader.read()).value);
    await reader.cancel();
    expect((await t.app.request("/api/events")).status).toBe(401);
  });

  it("SSE sends heartbeat comments", async () => {
    const { t, cookie } = await setup({ deps: { events: new EventBus(20) } });
    const reader = (await get(t, "/api/events", cookie)).body!.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (!buf.includes("heartbeat")) buf += dec.decode((await reader.read()).value);
    await reader.cancel();
  });

  it("extension info and downloads", async () => {
    const { t, cookie } = await setup({ env: { EXTENSION_VERSION: "0.1.7" } });
    expect((await t.app.request("/api/extension")).status).toBe(401);
    expect(await (await get(t, "/api/extension", cookie)).json()).toEqual({
      version: "0.1.7",
      chromeZip: "/downloads/recorte-chrome.zip",
      firefoxZip: "/downloads/recorte-firefox.zip",
    });
    expect((await get(t, "/downloads/recorte-chrome.zip", cookie)).status).toBe(404);
    expect((await t.app.request("/downloads/recorte-chrome.zip")).status).toBe(401);
    const dl = join(t.dir, "dl");
    mkdirSync(dl);
    writeFileSync(join(dl, "recorte-chrome.zip"), "PKzip");
    const t2 = await makeApp({ user: true, env: { DOWNLOADS_DIR: dl } });
    const c2 = await login(t2);
    const r = await get(t2, "/downloads/recorte-chrome.zip", c2);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("PKzip");
    expect((await get(t2, "/downloads/other.zip", c2)).status).toBe(404);
  });

  it("purgeTrash removes items deleted more than 30 days ago", async () => {
    const { t, cookie } = await setup();
    const a = (await (await upload(t, cookie)).json()) as ItemSummary;
    const b = (await (await upload(t, cookie)).json()) as ItemSummary;
    await send(t, "DELETE", `/api/items/${a.id}`, cookie);
    await send(t, "DELETE", `/api/items/${b.id}`, cookie);
    const storage = new Storage(t.dir);
    const uid = (t.db.prepare("SELECT user_id FROM items WHERE id = ?").get(a.id) as { user_id: string }).user_id;
    const dirA = storage.itemDir(uid, a.id);
    expect(existsSync(dirA)).toBe(true);
    t.db.prepare("UPDATE items SET deleted_at = ? WHERE id = ?").run(new Date(Date.now() - 31 * 864e5).toISOString(), a.id);
    expect(await purgeTrash({ db: t.db, storage }, new Date())).toBe(1);
    expect(existsSync(dirA)).toBe(false);
    expect(t.db.prepare("SELECT COUNT(*) AS n FROM items").get()).toEqual({ n: 1 });
    expect(existsSync(storage.itemDir(uid, b.id))).toBe(true);
  });

  it("rejects non-http(s) source urls", async () => {
    const { t, cookie } = await setup();
    for (const url of ["javascript:alert(1)", "data:text/html,x", "not a url", "ftp://x.org/a"]) {
      expect((await upload(t, cookie, { url })).status).toBe(400);
    }
    expect((await upload(t, cookie, { url: "http://ok.org/a" })).status).toBe(201);
  });

  it("rejects oversized images from the header, before decoding", async () => {
    const { t, cookie } = await setup();
    const chunk = (type: string, data: Buffer) => {
      const len = Buffer.alloc(4);
      len.writeUInt32BE(data.length);
      const body = Buffer.concat([Buffer.from(type), data]);
      const crc = Buffer.alloc(4);
      crc.writeUInt32BE(crc32(body));
      return Buffer.concat([len, body, crc]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(20000, 0);
    ihdr.writeUInt32BE(20000, 4);
    ihdr[8] = 8;
    ihdr[9] = 2;
    const fake = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.alloc(1))), chunk("IEND", Buffer.alloc(0))]);
    const fd = new FormData();
    fd.set("image", new Blob([new Uint8Array(fake)]), "x.png");
    fd.set("meta", JSON.stringify(meta()));
    expect((await t.app.request("/api/items", { method: "POST", headers: { cookie }, body: fd })).status).toBe(413);
  });

  it("export streams ~20 items with all entries", async () => {
    const { t, cookie } = await setup();
    const ids: string[] = [];
    for (let i = 0; i < 20; i++) ids.push(((await (await upload(t, cookie, {}, i % 2 ? "#ff0000" : "#00ff00")).json()) as ItemSummary).id);
    const res = await get(t, "/api/export", cookie);
    const text = Buffer.from(await res.arrayBuffer()).toString("latin1");
    for (const id of ids) for (const f of ["meta.json", "original.webp", "thumb.webp"]) expect(text).toContain(`${id}/${f}`);
  });

  it("export of 600 items completes without opening all files at once", async () => {
    const { t, cookie } = await setup();
    const uid = (t.db.prepare("SELECT id FROM users LIMIT 1").get() as { id: string }).id;
    const storage = new Storage(t.dir);
    const repo = itemsRepo(t.db);
    const { ulid } = await import("../src/ids");
    const ids: string[] = [];
    for (let i = 0; i < 600; i++) {
      const id = ulid();
      ids.push(id);
      const now = new Date().toISOString();
      const m = {
        id, userId: uid, type: "screenshot" as const, kind: "area" as const,
        source: { url: "https://a.org/", site: "a.org", pageTitle: "p" },
        createdAt: now, updatedAt: now, deletedAt: null,
        media: [{ file: "original.webp", thumb: "thumb.webp", width: 1, height: 1, color: "#000000", role: "main" as const }],
        user: { tags: [], categoryId: null, hiddenAiTags: [] },
        ai: { tipo: [], visual: [], keys: [], colors: [], model: "", processedAt: null },
        text: { selection: "", meta: {}, headings: [], alts: [] },
      };
      storage.writeFile(uid, id, "original.webp", Buffer.from("o"));
      storage.writeFile(uid, id, "thumb.webp", Buffer.from("t"));
      storage.writeMeta(m);
      repo.upsertFromMeta(m);
    }
    const res = await get(t, "/api/export", cookie);
    expect(res.status).toBe(200);
    const text = Buffer.from(await res.arrayBuffer()).toString("latin1");
    for (const id of ids) for (const f of ["meta.json", "original.webp", "thumb.webp"]) expect(text).toContain(`${id}/${f}`);
  }, 30_000);
});
