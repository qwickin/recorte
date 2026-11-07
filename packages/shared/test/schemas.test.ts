import { describe, expect, it } from "vitest";
import { API, ItemPatch, ItemPage, ListQuery, UploadMeta } from "../src/index";

const validMeta = {
  type: "screenshot", kind: "area", url: "https://example.com/a", pageTitle: "Ex",
  tags: [], categoryId: null,
  text: { selection: "", meta: {}, headings: [], alts: [] },
  capturedAt: "2026-11-07T10:00:00.000Z",
};

describe("schemas", () => {
  it("UploadMeta accepts valid", () => {
    expect(UploadMeta.parse(validMeta).tags).toEqual([]);
  });
  it("UploadMeta rejects missing url", () => {
    const { url: _u, ...rest } = validMeta;
    expect(UploadMeta.safeParse(rest).success).toBe(false);
  });
  it("ListQuery defaults and bounds limit", () => {
    expect(ListQuery.parse({}).limit).toBe(24);
    expect(ListQuery.safeParse({ limit: 101 }).success).toBe(false);
    expect(ListQuery.parse({ limit: "50" }).limit).toBe(50);
  });
  it("ListQuery tags accepts comma string or array", () => {
    expect(ListQuery.parse({ tags: "a,b" }).tags).toEqual(["a", "b"]);
    expect(ListQuery.parse({ tags: ["a"] }).tags).toEqual(["a"]);
  });
  it("ItemPatch is partial and allows hiddenAiTags", () => {
    expect(ItemPatch.parse({ hiddenAiTags: ["x"] })).toEqual({ hiddenAiTags: ["x"] });
  });
  it("ItemPage shape", () => {
    expect(ItemPage.parse({ items: [], nextCursor: null, total: 0 }).total).toBe(0);
  });
  it("API paths", () => {
    expect(API.items).toBe("/api/items");
    expect(API.itemFile("a", "thumb.webp")).toBe("/api/items/a/files/thumb.webp");
  });
});
