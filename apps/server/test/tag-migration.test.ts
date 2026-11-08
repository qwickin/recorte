import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it, vi } from "vitest";
import type { Item, ItemSummary, UploadMeta } from "@recorte/shared";
import { resolveDeps } from "../src/deps";
import { itemsRepo } from "../src/items/repo";
import { createPipeline } from "../src/pipeline";
import { SqliteQueue } from "../src/queue";
import { startRuntime } from "../src/runtime";
import { TAG_IDS_VERSION, legacyTagId, migrateItemTags, migrateTagIds } from "../src/tag-migration";
import { InMemorySearch, fakeClassifier } from "./fakes";
import { login, makeApp } from "./helpers";

const png = () => sharp({ create: { width: 400, height: 300, channels: 3, background: "#3366cc" } }).png().toBuffer();
const meta = (over: Partial<UploadMeta> = {}): UploadMeta => ({
  type: "screenshot", kind: "area", url: "https://www.example.com/a", pageTitle: "Mapa de Lisboa", tags: [], categoryId: null,
  text: { selection: "mapa da cidade de Lisboa com ruas", meta: {}, headings: [], alts: [] }, capturedAt: "2026-01-01T00:00:00.000Z", ...over,
});

async function setup() {
  const search = new InMemorySearch();
  const t = await makeApp({ user: true, deps: { search } });
  const cookie = await login(t);
  const upload = async (over: Partial<UploadMeta> = {}) => {
    const fd = new FormData();
    fd.set("image", new Blob([new Uint8Array(await png())], { type: "image/png" }), "x.png");
    fd.set("meta", JSON.stringify(meta(over)));
    const res = await t.app.request("/api/items", { method: "POST", headers: { cookie }, body: fd });
    expect(res.status).toBe(201);
    return (await res.json()) as ItemSummary;
  };
  const queue = new SqliteQueue(t.db);
  const deps = resolveDeps({ db: t.db, config: t.config, search, queue });
  const userId = (t.db.prepare("SELECT id FROM users").get() as { id: string }).id;
  /** Writes an item as the pre-ID server left it: pt-PT names in meta.json and in SQLite item_tags. */
  const legacy = (id: string, edit: (m: Item) => void) => {
    const m = deps.storage.readMeta(userId, id)!;
    edit(m);
    deps.storage.writeMeta(m);
    itemsRepo(t.db).upsertFromMeta(m);
    // The old mirror: raw names as they were shown (the current code would already write IDs for the fallback).
    t.db.prepare("DELETE FROM item_tags WHERE item_id = ?").run(id);
    const ins = t.db.prepare("INSERT OR IGNORE INTO item_tags (item_id, tag, origin, pos) VALUES (?, ?, ?, ?)");
    const hidden = new Set(m.user.hiddenAiTags);
    let i = 0;
    for (const tag of m.user.tags) ins.run(id, tag, "user", i++);
    for (const tag of m.ai.topics?.length ? m.ai.topics : [...m.ai.tipo, ...m.ai.visual]) if (!hidden.has(tag)) ins.run(id, tag, "ai", i++);
  };
  const tagRows = (id: string) => (t.db.prepare("SELECT tag FROM item_tags WHERE item_id = ? ORDER BY pos").all(id) as { tag: string }[]).map((r) => r.tag);
  const jobs = () => (t.db.prepare("SELECT type, payload FROM jobs ORDER BY id").all() as { type: string; payload: string }[]).map((j) => ({ type: j.type, ...JSON.parse(j.payload) }));
  return { t, cookie, upload, queue, deps, userId, legacy, tagRows, jobs, search };
}

describe("legacyTagId", () => {
  it("maps old pt-PT topic names and raw screenshot labels to IDs; IDs and anything else stay", () => {
    expect(legacyTagId("modo escuro")).toBe("dark mode");
    expect(legacyTagId("folha de cálculo")).toBe("spreadsheet");
    expect(legacyTagId("wiki")).toBe("encyclopedia");
    expect(legacyTagId("dark mode")).toBe("dark mode");
    expect(legacyTagId("viagem")).toBe("viagem");
  });
});

describe("tag ID migration", () => {
  it("rewrites topics, hidden AI tags and labelled user tags as IDs, for live and trashed items; ai.tipo stays raw", async () => {
    const { t, cookie, upload, deps, userId, legacy, tagRows, jobs } = await setup();
    const a = await upload();
    const b = await upload();
    const c = await upload();
    t.db.prepare("DELETE FROM jobs").run();
    legacy(a.id, (m) => {
      m.ai = { ...m.ai, tipo: ["mapa"], visual: ["modo escuro"], topics: ["mapa", "lisboa", "modo escuro", "cidade"] };
      m.user.tags = ["receita", "viagem", "modo escuro"];
      m.user.hiddenAiTags = ["modo escuro", "cidade"];
    });
    // Fallback item: no topics, only the screenshot labels; the person had hidden "imagens" (has no tag).
    legacy(b.id, (m) => {
      m.ai = { ...m.ai, tipo: ["wiki"], visual: ["modo escuro", "imagens"] };
      delete m.ai.topics;
      m.user.hiddenAiTags = ["imagens"];
    });
    legacy(c.id, (m) => {
      m.ai = { ...m.ai, topics: ["receita", "culinária"] };
      m.deletedAt = new Date().toISOString();
    });

    expect(migrateTagIds(deps)).toEqual({ items: 3, changed: 2 });

    const ma = deps.storage.readMeta(userId, a.id)!;
    expect(ma.ai.topics).toEqual(["map", "lisbon", "dark mode", "city"]);
    expect(ma.ai.tipo).toEqual(["mapa"]);
    expect(ma.ai.visual).toEqual(["modo escuro"]);
    expect(ma.user.tags).toEqual(["recipe", "viagem", "dark mode"]);
    expect(ma.user.hiddenAiTags).toEqual(["dark mode", "city"]);
    // SQLite follows: the user's own "modo escuro" is now the same tag as the AI's (shown once, as the user's).
    expect(tagRows(a.id)).toEqual(["recipe", "viagem", "dark mode", "map", "lisbon"]);

    const mb = deps.storage.readMeta(userId, b.id)!;
    expect(mb.ai.tipo).toEqual(["wiki"]);
    expect(mb.ai.topics).toBeUndefined();
    // Unchanged meta.json, but the mirror is rebuilt: the fallback shows as IDs, "imagens" is not shown.
    expect(tagRows(b.id)).toEqual(["encyclopedia", "dark mode"]);

    const mc = deps.storage.readMeta(userId, c.id)!;
    expect(mc.ai.topics).toEqual(["recipe", "cooking"]);
    expect(mc.deletedAt).not.toBeNull();

    const counts = (await (await t.app.request("/api/tags", { headers: { cookie } })).json()) as { tag: string }[];
    expect(counts.map((x) => x.tag).sort()).toEqual(["dark mode", "encyclopedia", "lisbon", "map", "recipe", "viagem"]);

    // The search index gets the new fields: one index job per live item (not the trashed one).
    expect(jobs().filter((j) => j.type === "index").map((j) => j.id).sort()).toEqual([a.id, b.id].sort());
    expect((t.db.prepare("SELECT value FROM settings WHERE key = 'tagIdsVersion'").get() as { value: string }).value).toBe(TAG_IDS_VERSION);
  });

  it("is idempotent: runs once per version, and the mapping of migrated data is a no-op", async () => {
    const { t, upload, deps, userId, legacy, jobs } = await setup();
    const a = await upload();
    legacy(a.id, (m) => {
      m.ai.topics = ["modo escuro", "tipo de letra"];
      m.user.hiddenAiTags = ["tipo de letra"];
    });
    t.db.prepare("DELETE FROM jobs").run();
    migrateTagIds(deps);
    const once = deps.storage.readMeta(userId, a.id)!;
    expect(migrateItemTags(once)).toBeNull();
    const n = jobs().length;
    expect(migrateTagIds(deps)).toEqual({ items: 0, changed: 0 });
    expect(jobs()).toHaveLength(n);
    // Even forced to run again (a crash before the version was written), nothing changes.
    t.db.prepare("DELETE FROM settings WHERE key = 'tagIdsVersion'").run();
    expect(migrateTagIds(deps).changed).toBe(0);
    expect(deps.storage.readMeta(userId, a.id)).toEqual(once);
  });

  it("an unreadable item does not stop the migration", async () => {
    const { upload, deps, userId, legacy } = await setup();
    const a = await upload();
    const b = await upload();
    legacy(b.id, (m) => (m.ai.topics = ["receita"]));
    const dir = (deps.storage as unknown as { itemDir(u: string, i: string): string }).itemDir(userId, a.id);
    writeFileSync(join(dir, "meta.json"), "{ not json");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      expect(migrateTagIds(deps)).toEqual({ items: 2, changed: 1 });
    } finally {
      warn.mockRestore();
    }
    expect(deps.storage.readMeta(userId, b.id)!.ai.topics).toEqual(["recipe"]);
  });

  it("the admin reindex converts files from before tag IDs (an old backup restored after the migration)", async () => {
    const { t, cookie, upload, deps, userId, legacy, tagRows } = await setup();
    const a = await upload();
    migrateTagIds(deps);
    // Restored afterwards: an old meta.json with pt-PT names.
    legacy(a.id, (m) => {
      m.ai.topics = ["receita", "modo escuro"];
      m.user.hiddenAiTags = ["modo escuro"];
    });
    const r = await t.app.request("/api/admin/reindex", { method: "POST", headers: { cookie, origin: "http://localhost" } });
    expect(r.status).toBe(200);
    const m = deps.storage.readMeta(userId, a.id)!;
    expect(m.ai.topics).toEqual(["recipe", "dark mode"]);
    expect(m.user.hiddenAiTags).toEqual(["dark mode"]);
    expect(tagRows(a.id)).toEqual(["recipe"]);
  });

  it("startup order: an AI tag the person removed stays removed after the topics-v2 retag", async () => {
    const { t, cookie, upload, queue, deps, userId, legacy } = await setup();
    const a = await upload();
    t.db.prepare("DELETE FROM jobs").run();
    // Saved under topics-v1: the person removed the AI tag "modo escuro".
    legacy(a.id, (m) => {
      m.ai = { ...m.ai, tipo: ["mapa"], visual: ["modo escuro"], topics: ["lisboa", "mapa", "modo escuro"], model: "x+topics-v1" };
      m.user.hiddenAiTags = ["modo escuro"];
    });
    t.db.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('taggerVersion', 'topics-v1', '')").run();

    const rt = startRuntime({ ...deps, queue }, { classifier: async () => fakeClassifier(["mapa"], ["modo escuro"]), cloud: null });
    // Synchronous part: already migrated when startRuntime returns, before any job ran.
    expect(deps.storage.readMeta(userId, a.id)!.user.hiddenAiTags).toEqual(["dark mode"]);
    try {
      for (let i = 0; i < 200 && (t.db.prepare("SELECT COUNT(*) AS n FROM jobs").get() as { n: number }).n > 0; i++) await new Promise((r) => setTimeout(r, 25));
    } finally {
      await rt.stop();
    }
    const m = deps.storage.readMeta(userId, a.id)!;
    expect(m.ai.model).toContain("topics-v2");
    expect(m.ai.topics).toContain("dark mode"); // the retag produced it again…
    const list = (await (await t.app.request("/api/items", { headers: { cookie } })).json()) as { items: ItemSummary[] };
    expect(list.items[0]!.tags).not.toContain("dark mode"); // …and it stays hidden
    expect(list.items[0]!.tags).toEqual(expect.arrayContaining(["lisbon", "map"]));
  });

  it("a retag after the migration keeps the person's tags and hidden tags (the pipeline never writes user)", async () => {
    const { t, upload, deps, userId, legacy } = await setup();
    const a = await upload();
    legacy(a.id, (m) => {
      m.user.tags = ["Receita"];
      m.user.hiddenAiTags = ["lisboa"];
    });
    migrateTagIds(deps);
    await createPipeline({ deps, classifier: async () => fakeClassifier() }).process(userId, a.id, { retag: true });
    const m = deps.storage.readMeta(userId, a.id)!;
    expect(m.user.tags).toEqual(["recipe"]);
    expect(m.user.hiddenAiTags).toEqual(["lisbon"]);
    expect(itemsRepo(t.db).list(userId, { limit: 10 } as never).items[0]!.tags).not.toContain("lisbon");
  });
});
