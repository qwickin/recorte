import { describe, expect, it } from "vitest";
import { MeiliSearch } from "../src/search/meili";
import type { SearchDoc } from "../src/search";

const URL_ = process.env.MEILI_TEST_URL;

const doc = (over: Partial<SearchDoc>): SearchDoc => ({
  id: "x", userId: "u1", type: "screenshot", site: "example.com", title: "", note: "", description: "", tags: [], keys: [], text: "",
  colors: [], categoryId: null, createdAt: "2026-01-01T00:00:00.000Z", ...over,
});

/** Runs only with MEILI_TEST_URL (and optionally MEILI_TEST_KEY) pointing at a real Meilisearch. */
describe.skipIf(!URL_)("MeiliSearch (real server)", () => {
  it("indexes 3 docs; a Portuguese query finds the English one; other users never see it", { timeout: 600_000 }, async () => {
    const s = new MeiliSearch({ url: URL_!, apiKey: process.env.MEILI_TEST_KEY ?? null, timeoutMs: 10_000 });
    await s.ensureIndex();
    await s.replaceAll("u1", []);
    await s.index(doc({ id: "a", title: "Traditional Portuguese pastry recipe: pastel de nata", text: "custard tart bakery dessert sweet", tags: ["receita"] }));
    await s.index(doc({ id: "b", title: "Mechanical watch movement explained", text: "gears escapement horology wristwatch" }));
    await s.index(doc({ id: "c", title: "Kubernetes networking guide", text: "pods services ingress cluster" }));
    await s.index(doc({ id: "z", userId: "u2", title: "Portuguese custard tart secret", text: "dessert" }));
    const deadline = Date.now() + 120_000;
    let ids: string[] = [];
    while (Date.now() < deadline) {
      ids = (await s.search({ userId: "u1", q: "doce português", limit: 5 })).map((r) => r.id);
      if (ids[0] === "a") break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    expect(ids[0]).toBe("a");
    expect(ids).not.toContain("z");
    const w = await s.search({ userId: "u1", q: "relógio mecânico", limit: 5 });
    expect(w[0]?.id).toBe("b");
    const tagged = await s.search({ userId: "u1", q: "doce", tags: ["receita"], limit: 5 });
    expect(tagged.map((r) => r.id)).toEqual(["a"]);
    await s.remove("a");
    await new Promise((r) => setTimeout(r, 1500));
    expect((await s.search({ userId: "u1", q: "doce português", limit: 5 })).map((r) => r.id)).not.toContain("a");
  });
});
