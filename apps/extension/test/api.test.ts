import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, absoluteUrl, buildUploadMeta, capItemText, fetchMe, normalizeServerUrl, registerDevice } from "../lib/api";

const text = { selection: "olá", meta: {}, headings: [], alts: [] };

describe("buildUploadMeta", () => {
  it("applies the shared field caps (title 300, note 5000, 50 tags)", () => {
    const m = buildUploadMeta({
      kind: "visible",
      url: "https://example.com/",
      pageTitle: "p".repeat(800),
      title: "t".repeat(600),
      note: "n".repeat(9000),
      tags: Array.from({ length: 70 }, (_, i) => `t${i}`),
      text: { selection: "", meta: {}, headings: [], alts: [] },
    });
    expect(m.title).toHaveLength(300);
    expect(m.note).toHaveLength(5000);
    expect(m.pageTitle).toHaveLength(500);
    expect(m.tags).toHaveLength(50);
  });

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
  it("bare IPs and localhost default to http:// (the plain docker run install), names to https://", () => {
    expect(normalizeServerUrl("192.168.1.20:8080")).toBe("http://192.168.1.20:8080");
    expect(normalizeServerUrl("10.0.0.5")).toBe("http://10.0.0.5");
    expect(normalizeServerUrl("localhost:8080/")).toBe("http://localhost:8080");
    expect(normalizeServerUrl("[::1]:8080")).toBe("http://[::1]:8080");
    expect(normalizeServerUrl("nas.local:8080")).toBe("https://nas.local:8080");
    expect(normalizeServerUrl("https://192.168.1.20")).toBe("https://192.168.1.20");
  });
  it("resolves relative ticket URLs", () => {
    expect(absoluteUrl("https://r.pt", "/auth/ticket?t=1")).toBe("https://r.pt/auth/ticket?t=1");
    expect(absoluteUrl("https://r.pt", "https://other/auth/ticket?t=1")).toBe("https://other/auth/ticket?t=1");
  });
});

describe("device registration (password only)", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("POSTs {email, password, name} without credentials and returns the token", async () => {
    const fetch = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify({ token: "t", id: "d" }), { status: 201 }));
    vi.stubGlobal("fetch", fetch);
    expect(await registerDevice("http://10.0.0.5:8080", " Dono@X.io ", "palavra-passe", "Chrome em macOS")).toEqual({ token: "t", id: "d" });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe("http://10.0.0.5:8080/api/devices");
    expect(init?.method).toBe("POST");
    expect(init?.credentials).toBe("omit");
    expect(JSON.parse(String(init?.body))).toEqual({ email: "Dono@X.io", password: "palavra-passe", name: "Chrome em macOS" });
  });
  it("throws ApiError(401) on a wrong password", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "invalid_credentials" }), { status: 401 })));
    await expect(registerDevice("http://x", "a@x.io", "nope", "n")).rejects.toEqual(new ApiError(401, "invalid_credentials"));
  });
  it("/api/me gives the account id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "u1" }), { status: 200 })));
    expect(await fetchMe({ server: "http://x", token: "t" }, "1.0.0")).toEqual({ id: "u1" });
  });
});
