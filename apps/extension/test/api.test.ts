import { describe, expect, it } from "vitest";
import { absoluteUrl, buildUploadMeta, capItemText, normalizeServerUrl } from "../lib/api";

const text = { selection: "olá", meta: {}, headings: [], alts: [] };

describe("buildUploadMeta", () => {
  it("rejects non-http pages", () => {
    for (const url of ["chrome://extensions", "file:///tmp/a.html", "about:blank", "data:text/html,x", "moz-extension://x/y"]) {
      expect(() => buildUploadMeta({ kind: "visible", url, pageTitle: "x", text })).toThrow();
    }
  });
  it("builds a valid screenshot meta with normalized tags", () => {
    const m = buildUploadMeta({
      kind: "area",
      url: "https://example.com/a",
      pageTitle: " Exemplo ",
      title: "  ",
      note: " nota ",
      tags: ["Lisboa ", "lisboa", "  Design"],
      categoryId: null,
      text,
      truncated: true,
      capturedAt: "2026-11-07T10:00:00.000Z",
    });
    expect(m).toMatchObject({ type: "screenshot", kind: "area", pageTitle: "Exemplo", note: "nota", tags: ["lisboa", "design"], truncated: true });
    expect(m.title).toBeUndefined();
  });
});

describe("capItemText", () => {
  it("caps all text fields together at 20 000 chars", () => {
    const t = capItemText({
      selection: "x".repeat(30000),
      meta: { description: "d".repeat(100), og: { "og:title": "t".repeat(50) } },
      headings: ["h".repeat(200)],
      alts: ["a".repeat(50)],
    });
    const total = t.selection.length + (t.meta.description?.length ?? 0) + Object.values(t.meta.og ?? {}).join("").length + t.headings.join("").length + t.alts.join("").length;
    expect(total).toBe(20000);
    expect(t.meta.description).toHaveLength(100);
  });
});

describe("server URLs", () => {
  it("normalizes the server URL", () => {
    expect(normalizeServerUrl("recorte.example.com/")).toBe("https://recorte.example.com");
    expect(normalizeServerUrl("http://localhost:8788/")).toBe("http://localhost:8788");
    expect(normalizeServerUrl("ftp://x")).toBeNull();
  });
  it("resolves relative ticket URLs", () => {
    expect(absoluteUrl("https://r.pt", "/auth/ticket?t=1")).toBe("https://r.pt/auth/ticket?t=1");
    expect(absoluteUrl("https://r.pt", "https://other/auth/ticket?t=1")).toBe("https://other/auth/ticket?t=1");
  });
});
