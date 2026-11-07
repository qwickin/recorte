import type { ItemPage, ItemSummary } from "@recorte/shared";
import { describe, expect, it, vi } from "vitest";
import { ApiError, createClient, filtersToQuery } from "./client";
import { createPager, mergePage, upsertItem } from "./feed";

const summary = (id: string, createdAt: string): ItemSummary => ({
  id,
  type: "screenshot",
  kind: "area",
  site: "example.com",
  url: "https://example.com/",
  title: id,
  createdAt,
  thumb: `/api/items/${id}/files/thumb.webp`,
  width: 640,
  height: 400,
  color: "#123456",
  tags: [],
  hasNote: false,
});

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("filtersToQuery", () => {
  it("is empty without filters", () => {
    expect(filtersToQuery({ tags: [] })).toBe("");
  });

  it("joins tags with commas and keeps only set values", () => {
    const q = filtersToQuery(
      { tags: ["mapa", "modo escuro"], site: " example.com ", type: "screenshot", color: "azul", category: "", from: "2026-01-01", to: undefined },
      { cursor: null, limit: 24, trash: undefined },
    );
    const p = new URLSearchParams(q.slice(1));
    expect(q.startsWith("?")).toBe(true);
    expect(p.get("tags")).toBe("mapa,modo escuro");
    expect(p.get("site")).toBe("example.com");
    expect(p.get("type")).toBe("screenshot");
    expect(p.get("color")).toBe("azul");
    expect(p.get("from")).toBe("2026-01-01");
    expect(p.get("limit")).toBe("24");
    expect(p.has("category")).toBe(false);
    expect(p.has("to")).toBe(false);
    expect(p.has("cursor")).toBe(false);
    expect(p.has("trash")).toBe(false);
  });

  it("encodes special characters", () => {
    const q = filtersToQuery({ tags: ["café & bolos"] }, { q: "a/b?c" });
    const p = new URLSearchParams(q.slice(1));
    expect(p.get("tags")).toBe("café & bolos");
    expect(p.get("q")).toBe("a/b?c");
  });
});

describe("api client cursor handling", () => {
  it("sends no cursor first, then the server's nextCursor, and stops at null", async () => {
    const pages: ItemPage[] = [
      { items: [summary("B", "2026-11-07T10:00:00.000Z")], nextCursor: "cur-1", total: 3 },
      { items: [summary("A", "2026-11-06T10:00:00.000Z")], nextCursor: "cur-2", total: 3 },
      { items: [summary("0", "2026-11-05T10:00:00.000Z")], nextCursor: null, total: 3 },
    ];
    const urls: string[] = [];
    const fetch = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      return json(pages[urls.length - 1]);
    });
    const api = createClient({ fetch: fetch as typeof globalThis.fetch });
    const pager = createPager((cursor) => api.listItems({ filters: { tags: ["mapa"] }, cursor, limit: 1 }));

    let items: ItemSummary[] = [];
    for (let page = await pager.next(); page; page = await pager.next()) items = mergePage(items, page, items.length === 0);

    expect(items.map((i) => i.id)).toEqual(["B", "A", "0"]);
    expect(pager.done).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    const q = urls.map((u) => new URL(u, "http://x").searchParams);
    expect(q[0]!.has("cursor")).toBe(false);
    expect(q[1]!.get("cursor")).toBe("cur-1");
    expect(q[2]!.get("cursor")).toBe("cur-2");
    expect(q.every((p) => p.get("tags") === "mapa" && p.get("limit") === "1")).toBe(true);
    expect(await pager.next()).toBeNull();
  });

  it("keeps the cursor when a page fails, so retrying asks for the same page", async () => {
    let fail = true;
    const urls: string[] = [];
    const fetch = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      if (urls.length === 1) return json({ items: [summary("B", "2026-11-07T10:00:00.000Z")], nextCursor: "cur-1", total: 2 });
      if (fail) {
        fail = false;
        return json({ error: "internal_error" }, 500);
      }
      return json({ items: [summary("A", "2026-11-06T10:00:00.000Z")], nextCursor: null, total: 2 });
    });
    const api = createClient({ fetch: fetch as typeof globalThis.fetch });
    const pager = createPager((cursor) => api.listItems({ cursor }));
    await pager.next();
    await expect(pager.next()).rejects.toBeInstanceOf(ApiError);
    expect(pager.cursor).toBe("cur-1");
    const page = await pager.next();
    expect(page?.items[0]?.id).toBe("A");
    expect(new URL(urls[1]!, "http://x").searchParams.get("cursor")).toBe("cur-1");
    expect(new URL(urls[2]!, "http://x").searchParams.get("cursor")).toBe("cur-1");
  });

  it("lists the trash with trash=1", async () => {
    const fetch = vi.fn(async (_url: string) => json({ items: [], nextCursor: null, total: 0 }));
    const api = createClient({ fetch: fetch as typeof globalThis.fetch });
    await api.listItems({ trash: true });
    expect(new URL(String(fetch.mock.calls[0]![0]), "http://x").searchParams.get("trash")).toBe("1");
  });

  it("calls onUnauthorized on 401, except for the login call", async () => {
    const onUnauthorized = vi.fn();
    const fetch = vi.fn(async (_url: string) => json({ error: "unauthorized" }, 401));
    const api = createClient({ fetch: fetch as typeof globalThis.fetch, onUnauthorized });
    await expect(api.listTags()).rejects.toMatchObject({ status: 401, code: "unauthorized" });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
    await expect(api.login({ email: "a@b", password: "x" })).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });
});

describe("feed merging", () => {
  it("never duplicates ids across pages", () => {
    const a = [summary("C", "2026-11-07T10:00:00.000Z"), summary("B", "2026-11-06T10:00:00.000Z")];
    const merged = mergePage(a, { items: [summary("B", "2026-11-06T10:00:00.000Z"), summary("A", "2026-11-05T10:00:00.000Z")], nextCursor: null, total: 3 }, false);
    expect(merged.map((i) => i.id)).toEqual(["C", "B", "A"]);
  });

  it("inserts live items in keyset order and replaces known ones in place", () => {
    let items = [summary("C", "2026-11-07T10:00:00.000Z"), summary("A", "2026-11-05T10:00:00.000Z")];
    items = upsertItem(items, summary("D", "2026-11-08T10:00:00.000Z")); // new capture -> top
    items = upsertItem(items, summary("B", "2026-11-06T10:00:00.000Z")); // restored -> its own place
    items = upsertItem(items, { ...summary("C", "2026-11-07T10:00:00.000Z"), title: "editado" });
    expect(items.map((i) => i.id)).toEqual(["D", "C", "B", "A"]);
    expect(items[1]!.title).toBe("editado");
  });
});
