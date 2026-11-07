import { describe, expect, it } from "vitest";
import { API, ItemPatch, ItemPage, ListQuery, UPLOAD_LIMITS, UploadMeta, clampUploadText } from "../src/index";

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

describe("UploadMeta caps (clamped, never rejected)", () => {
  it("cuts title, note, pageTitle and tags", () => {
    const m = UploadMeta.parse({
      ...validMeta,
      title: "t".repeat(400),
      note: "n".repeat(6000),
      pageTitle: "p".repeat(900),
      tags: Array.from({ length: 80 }, (_, i) => `Tag ${i} ${"x".repeat(60)}`),
    });
    expect(m.title).toHaveLength(UPLOAD_LIMITS.title);
    expect(m.note).toHaveLength(UPLOAD_LIMITS.note);
    expect(m.pageTitle).toHaveLength(UPLOAD_LIMITS.pageTitle);
    expect(m.tags).toHaveLength(50);
    expect(m.tags.every((t) => t.length <= 40 && t === t.toLowerCase())).toBe(true);
    expect(m.truncated).toBeUndefined(); // the text was not cut
  });

  it("cuts text fields to their caps and the ~25 000 total, and flags truncated", () => {
    const m = UploadMeta.parse({
      ...validMeta,
      text: {
        selection: "s".repeat(30_000),
        meta: { description: "d".repeat(3000), og: Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`og:${i}`, "o".repeat(2000)])) },
        headings: Array.from({ length: 40 }, () => "h".repeat(500)),
        alts: Array.from({ length: 80 }, () => "a".repeat(500)),
      },
    });
    const t = m.text;
    expect(t.selection).toHaveLength(20_000);
    expect(t.headings.length).toBeGreaterThan(0);
    expect(t.headings.length).toBeLessThanOrEqual(UPLOAD_LIMITS.headings);
    expect(t.headings.every((h) => h.length <= 300)).toBe(true);
    expect(t.alts.length).toBeLessThanOrEqual(50);
    expect(t.alts.every((a) => a.length <= 300)).toBe(true);
    expect(t.meta.description!.length).toBeLessThanOrEqual(1000);
    expect(Object.keys(t.meta.og ?? {}).length).toBeLessThanOrEqual(20);
    const total =
      t.selection.length + t.headings.join("").length + t.alts.join("").length + (t.meta.description ?? "").length +
      Object.values(t.meta.og ?? {}).join("").length;
    expect(total).toBeLessThanOrEqual(UPLOAD_LIMITS.text);
    expect(m.truncated).toBe(true);
  });

  it("leaves a normal meta untouched", () => {
    const text = { selection: "abc", meta: { description: "d", og: { "og:title": "x" } }, headings: ["h"], alts: ["a"] };
    expect(clampUploadText(text)).toEqual({ text, truncated: false });
    expect(UploadMeta.parse({ ...validMeta, text }).text).toEqual(text);
  });
});

describe("whole-page context and links (additive)", () => {
  it("keeps text.page with its own budget, never flagging truncated", () => {
    const m = UploadMeta.parse({
      ...validMeta,
      text: {
        selection: "s".repeat(20_000),
        meta: {},
        headings: [],
        alts: [],
        page: { text: "p".repeat(30_000), keywords: [" a ", "", "b"], nearHeadings: ["Perto"] },
      },
    });
    expect(m.text.selection).toHaveLength(20_000); // the page text does not eat the selection's budget
    expect(m.text.page?.text).toHaveLength(UPLOAD_LIMITS.pageText);
    expect(m.text.page?.keywords).toEqual(["a", "b"]);
    expect(m.text.page?.nearHeadings).toEqual(["Perto"]);
    expect(m.truncated).toBeUndefined();
  });
  it("old payloads without text.page still parse", () => {
    expect(UploadMeta.parse(validMeta).text.page).toBeUndefined();
  });
  it("accepts type link with kind link/page", () => {
    expect(UploadMeta.parse({ ...validMeta, type: "link", kind: "link" }).type).toBe("link");
    expect(UploadMeta.parse({ ...validMeta, type: "link", kind: "page" }).kind).toBe("page");
  });
  it("allows up to 40 headings", () => {
    const t = clampUploadText({ selection: "", meta: {}, headings: Array.from({ length: 50 }, (_, i) => `h${i}`), alts: [] });
    expect(t.text.headings).toHaveLength(40);
  });
});
