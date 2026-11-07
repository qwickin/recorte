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
import { Storage } from "../src/storage";
import { makeApp, login } from "./helpers";

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
    const thumb = await get(t, sa.thumb, cookie);
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

  it("tags AND filter, normalised on upload", async () => {
    const { t, cookie } = await setup();
    const a = (await (await upload(t, cookie, { tags: [" Lisboa ", "lisboa", "Modo  Escuro"] })).json()) as ItemSummary;
    expect(a.tags).toEqual(["lisboa", "modo escuro"]);
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
    expect((await counts()).map((c) => c.tag).sort()).toEqual(["lisboa", "mapa", "modo escuro"]);
    expect((await counts()).find((c) => c.tag === "mapa")!.origin).toBe("ai");
    await send(t, "PATCH", `/api/items/${a.id}`, cookie, { hiddenAiTags: ["Mapa"] });
    expect((await counts()).map((c) => c.tag).sort()).toEqual(["lisboa", "modo escuro"]);
    const s = (await (await get(t, "/api/items", cookie)).json()) as { items: ItemSummary[] };
    expect(s.items[0]!.tags).toEqual(["lisboa", "modo escuro"]);
  });

  it("delete then restore", async () => {
    const calls: string[] = [];
    const search = {
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
    const down = { index: async () => { throw new Error("down"); }, remove: async () => { throw new Error("down"); }, search: async () => [] };
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

  it("files route: 401 without auth, 404 for unknown names, traversal and other users", async () => {
    const { t, cookie } = await setup();
    const a = (await (await upload(t, cookie)).json()) as ItemSummary;
    expect((await t.app.request(a.thumb)).status).toBe(401);
    expect((await get(t, `/api/items/${a.id}/files/meta.json`, cookie)).status).toBe(404);
    expect((await get(t, `/api/items/${a.id}/files/..%2F..%2Frecorte.db`, cookie)).status).toBe(404);
    expect((await get(t, `/api/items/${a.id}/files/original.webp`, cookie)).status).toBe(200);
    // second user
    await createUser(t.db, "two@example.com", "another long password");
    const c2 = (await t.json("/api/login", { email: "two@example.com", password: "another long password" })).headers.get("set-cookie")!.split(";")[0]!;
    expect((await get(t, a.thumb, c2)).status).toBe(404);
    expect((await get(t, `/api/items/${a.id}`, c2)).status).toBe(404);
    expect((await send(t, "DELETE", `/api/items/${a.id}`, c2)).status).toBe(404);
    expect(((await (await get(t, "/api/items", c2)).json()) as { total: number }).total).toBe(0);
  });

  it("uploads succeed when search is unavailable", async () => {
    const down = { index: async () => { throw new Error("meili down"); }, remove: async () => { throw new Error("down"); }, search: async () => { throw new Error("down"); } };
    const { t, cookie } = await setup({ deps: { search: down } });
    const res = await upload(t, cookie);
    expect(res.status).toBe(201);
    const a = (await res.json()) as ItemSummary;
    expect((await get(t, a.thumb, cookie)).status).toBe(200);
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
});
