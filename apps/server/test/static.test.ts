import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { GALLERY_CSP } from "../src/static";
import { login, makeApp } from "./helpers";

const base = mkdtempSync(join(tmpdir(), "recorte-gallery-"));
const gallery = join(base, "dist");
mkdirSync(join(gallery, "assets"), { recursive: true });
writeFileSync(join(gallery, "index.html"), "<!doctype html><title>Recorte</title><div id=root></div>");
writeFileSync(join(gallery, "assets", "index-abc.js"), "console.log(1)");
writeFileSync(join(gallery, "assets", "index-abc.css"), "body{}");
mkdirSync(join(gallery, "fonts"), { recursive: true });
writeFileSync(join(gallery, "fonts", "albert-sans-latin-300-normal.woff2"), "wOF2");
writeFileSync(join(gallery, "manifest.webmanifest"), '{"name":"Recorte"}');
writeFileSync(join(gallery, "sw.js"), "self.addEventListener('fetch', () => {})");
writeFileSync(join(base, "secret.txt"), "nope"); // outside the gallery dir
afterAll(() => rmSync(base, { recursive: true, force: true }));

describe("gallery static serving", () => {
  const make = (user = false) => makeApp({ user, env: { GALLERY_DIR: gallery } });

  it("old pt-PT page slugs redirect (301) to the English ones, query kept; installed extensions link to /extensao", async () => {
    const t = await make();
    for (const [from, to] of [["/extensao", "/extension"], ["/definicoes", "/settings"], ["/lixo", "/trash"], ["/extensao/", "/extension"]]) {
      const r = await t.app.request(from!);
      expect(r.status, from).toBe(301);
      expect(r.headers.get("location")).toBe(to);
    }
    const q = await t.app.request("/definicoes?tab=server");
    expect(q.headers.get("location")).toBe("/settings?tab=server");
    // Not a prefix match: other paths are the SPA as before.
    expect((await t.app.request("/lixo-x")).status).toBe(200);
  });

  it("serves index.html with the CSP for the app routes (SPA fallback)", async () => {
    const t = await make();
    for (const path of ["/", "/trash", "/extension", "/settings", "/login", "/setup", "/some/deep/link"]) {
      const r = await t.app.request(path);
      expect(r.status, path).toBe(200);
      expect(r.headers.get("content-type")).toContain("text/html");
      expect(await r.text()).toContain('<div id=root>');
      const csp = r.headers.get("content-security-policy");
      expect(csp).toBe(GALLERY_CSP);
      expect(csp).toContain("img-src 'self' data: blob:");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("frame-src https://platform.twitter.com");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("font-src 'self'");
      expect(csp).not.toMatch(/googleapis|gstatic/);
      expect(r.headers.get("cache-control")).toBe("no-cache");
    }
  });

  it("serves built assets with their type and long cache", async () => {
    const t = await make();
    const js = await t.app.request("/assets/index-abc.js");
    expect(js.status).toBe(200);
    expect(js.headers.get("content-type")).toContain("text/javascript");
    expect(js.headers.get("cache-control")).toContain("immutable");
    expect(await js.text()).toBe("console.log(1)");
    const css = await t.app.request("/assets/index-abc.css");
    expect(css.headers.get("content-type")).toContain("text/css");
  });

  it("serves the bundled fonts as font/woff2", async () => {
    const t = await make();
    const r = await t.app.request("/fonts/albert-sans-latin-300-normal.woff2");
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("font/woff2");
  });

  it("PWA: the manifest has its type, the service worker is JS and always revalidated, the CSP allows both", async () => {
    const t = await make();
    const m = await t.app.request("/manifest.webmanifest");
    expect(m.status).toBe(200);
    expect(m.headers.get("content-type")).toBe("application/manifest+json");
    const sw = await t.app.request("/sw.js");
    expect(sw.status).toBe(200);
    expect(sw.headers.get("content-type")).toContain("text/javascript");
    expect(sw.headers.get("cache-control")).toBe("no-cache"); // a new deploy reaches clients at once
    // worker-src and manifest-src fall back to default-src 'self'.
    expect(GALLERY_CSP).toContain("default-src 'self'");
    expect(GALLERY_CSP).not.toMatch(/worker-src|manifest-src/);
  });

  it("does not answer missing assets with HTML", async () => {
    const t = await make();
    const r = await t.app.request("/assets/missing.js");
    expect(r.status).toBe(404);
    expect(r.headers.get("content-type")).not.toContain("text/html");
  });

  it("never falls back to HTML for /api, /downloads or /auth", async () => {
    const t = await make();
    for (const path of ["/api/nope", "/api", "/downloads/other.zip", "/auth/unknown"]) {
      const r = await t.app.request(path);
      expect(r.status, path).toBeGreaterThanOrEqual(400);
      expect(r.headers.get("content-type") ?? "", path).not.toContain("text/html");
    }
  });

  it("keeps API routes working (and 401 stays JSON)", async () => {
    const t = await make(true);
    const anon = await t.app.request("/api/items");
    expect(anon.status).toBe(401);
    expect(anon.headers.get("content-type")).toContain("application/json");
    const cookie = await login(t);
    const r = await t.app.request("/api/tags", { headers: { cookie } });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual([]);
  });

  it("blocks path traversal", async () => {
    const t = await make();
    for (const path of ["/..%2fsecret.txt", "/%2e%2e/secret.txt", "/assets/..%2f..%2fsecret.txt"]) {
      const r = await t.app.request(path);
      expect(await r.text(), path).not.toContain("nope");
    }
  });

  it("reports a missing build instead of crashing", async () => {
    const t = await makeApp({ env: { GALLERY_DIR: join(gallery, "does-not-exist") } });
    const r = await t.app.request("/");
    expect(r.status).toBe(404);
    expect(await r.json()).toEqual({ error: "gallery_not_built" });
  });
});
