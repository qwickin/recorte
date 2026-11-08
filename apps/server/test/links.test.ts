import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it } from "vitest";
import { X_CRAWLER_UAS, fetchImage, fetchLink, isXUrl, tweetId, xEmbedUrl } from "../src/links/fetch-link";
import { decodeHtml, parsePage } from "../src/links/parse";
import { BlockedUrlError, isBlockedAddress, type LookupFn } from "../src/links/safe-fetch";

const fixture = (name: string) => readFileSync(new URL(`./fixtures/links/${name}`, import.meta.url), "utf8");

describe("parsePage (OG / Twitter / canonical / favicon / readable text)", () => {
  it("article fixture", () => {
    const p = parsePage(fixture("article.html"), "https://receitas.example/r/123?utm=x");
    expect(p.title).toBe("Bacalhau com natas"); // og:title wins over twitter:title and <title>
    expect(p.description).toBe("O clássico de domingo, gratinado no forno.");
    expect(p.siteName).toBe("Receitas da Avó");
    expect(p.ogType).toBe("article");
    expect(p.image).toBe("https://receitas.example/img/bacalhau.jpg"); // made absolute
    expect(p.canonicalUrl).toBe("https://receitas.example/bacalhau-com-natas");
    expect(p.favicon).toBe("https://receitas.example/favicon-32.png");
    expect(p.video).toBe(false);
    expect(p.og["twitter:card"]).toBe("summary_large_image");
    expect(p.og["og:site_name"]).toBe("Receitas da Avó");
    expect(p.keywords).toEqual(["bacalhau", "natas", "receita portuguesa"]);
    expect(p.headings).toEqual(["Bacalhau com natas", "Ingredientes", "Preparação"]);
    expect(p.text).toMatch(/pratos mais populares da cozinha portuguesa/);
    expect(p.text).toMatch(/\n/); // paragraph breaks kept
    expect(p.text).not.toMatch(/tracking|Política de cookies/); // no scripts, no footer chrome
  });

  it("falls back to <title>, meta description, /favicon.ico; drops non-http og:image", () => {
    const p = parsePage(
      `<html><head><title> Só título </title><meta name="description" content="Desc."><meta property="og:image" content="javascript:alert(1)"></head><body><p>Olá</p></body></html>`,
      "https://a.example/x",
    );
    expect(p.title).toBe("Só título");
    expect(p.description).toBe("Desc.");
    expect(p.image).toBeUndefined();
    expect(p.favicon).toBe("https://a.example/favicon.ico");
    expect(p.text).toBe("Olá");
  });

  it("x.com video post fixture: og + twitter:player → video", () => {
    const p = parsePage(fixture("x-video.html"), "https://x.com/devrel/status/1854321987654321098");
    expect(p.video).toBe(true);
    expect(p.title).toMatch(/combobox component/);
    expect(p.image).toBe("https://pbs.twimg.com/ext_tw_video_thumb/1854321/pu/img/thumb.jpg");
    expect(p.canonicalUrl).toBe("https://x.com/devrel/status/1854321987654321098");
  });

  it("decodes the charset from the header or <meta charset>", () => {
    const latin1 = Buffer.from(`<meta charset="iso-8859-1"><title>Ação</title>`, "latin1");
    expect(decodeHtml(latin1, "text/html")).toContain("Ação");
    expect(decodeHtml(Buffer.from("<title>Ação</title>", "utf8"), "text/html; charset=utf-8")).toContain("Ação");
  });
});

describe("x.com helpers", () => {
  it("detects hosts and status ids; embed URL", () => {
    expect(isXUrl("https://x.com/a/status/1")).toBe(true);
    expect(isXUrl("https://mobile.twitter.com/a/status/1")).toBe(true);
    expect(isXUrl("https://notx.com/a")).toBe(false);
    expect(tweetId("https://x.com/devrel/status/1854321987654321098?s=20")).toBe("1854321987654321098");
    expect(tweetId("https://x.com/devrel")).toBeNull();
    expect(xEmbedUrl("123456")).toBe("https://platform.twitter.com/embed/Tweet.html?id=123456&theme=dark&dnt=true");
  });
});

// --- fetchLink through a local server (the SSRF policy is relaxed for 127.0.0.1 only, via injected options)

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});
async function serve(routes: Record<string, (ua: string) => { status?: number; type: string; body: string | Buffer }>) {
  const uas: string[] = [];
  const s = createServer((req, res) => {
    const ua = String(req.headers["user-agent"] ?? "");
    uas.push(`${req.url} ${ua}`);
    const r = routes[(req.url ?? "").split("?")[0]!];
    if (!r) return res.writeHead(404).end();
    const out = r(ua);
    res.writeHead(out.status ?? 200, { "content-type": out.type }).end(out.body);
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return { port: (s.address() as AddressInfo).port, uas };
}
const local = (hosts: string[]): { lookup: LookupFn; isBlocked: (ip: string) => boolean } => ({
  lookup: (h, cb) => (hosts.includes(h) ? cb(null, [{ address: "127.0.0.1", family: 4 }]) : cb(new Error("ENOTFOUND"), [])),
  isBlocked: (ip) => ip !== "127.0.0.1" && isBlockedAddress(ip),
});

describe("fetchLink", () => {
  it("fetches and parses a page; follows to the final URL", async () => {
    const { port } = await serve({ "/r": () => ({ type: "text/html; charset=utf-8", body: fixture("article.html") }) });
    const l = await fetchLink(`http://receitas.test:${port}/r`, local(["receitas.test"]));
    expect(l.finalUrl).toBe(`http://receitas.test:${port}/r`);
    expect(l.title).toBe("Bacalhau com natas");
    expect(l.embedUrl).toBeUndefined();
  });

  it("a direct image link is its own image; other non-HTML types fail", async () => {
    const { port } = await serve({ "/a.png": () => ({ type: "image/png", body: Buffer.from([1, 2]) }), "/f.pdf": () => ({ type: "application/pdf", body: "%PDF" }) });
    const o = local(["files.test"]);
    expect((await fetchLink(`http://files.test:${port}/a.png`, o)).image).toBe(`http://files.test:${port}/a.png`);
    await expect(fetchLink(`http://files.test:${port}/f.pdf`, o)).rejects.toThrow(/not a web page/);
  });

  it("is SSRF-guarded by default", async () => {
    await expect(fetchLink("http://127.0.0.1:1/")).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(fetchImage("http://[::1]:1/x.png")).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("fetchImage refuses non-image responses", async () => {
    const { port } = await serve({ "/i": () => ({ type: "text/html", body: "<html>" }), "/ok": () => ({ type: "image/jpeg", body: Buffer.from([255, 216]) }) });
    const o = local(["img.test"]);
    await expect(fetchImage(`http://img.test:${port}/i`, o)).rejects.toThrow(/not an image/);
    expect((await fetchImage(`http://img.test:${port}/ok`, o)).length).toBe(2);
  });
});

describe("fetchLink for x.com (fixture through the crawler UA)", () => {
  it("asks with a crawler UA and gives a video post its embed URL", async () => {
    // Plays x.com: the OG tags only for link-preview crawlers. The real host is mapped to the local server.
    const { port, uas } = await serve({
      "/devrel/status/1854321987654321098": (ua) =>
        X_CRAWLER_UAS.includes(ua) ? { type: "text/html", body: fixture("x-video.html") } : { type: "text/html", body: "<html><body>JS required</body></html>" },
    });
    const opts = local(["x.com"]);
    const l = await fetchLink(`http://x.com:${port}/devrel/status/1854321987654321098`, opts);
    expect(uas[0]).toContain(X_CRAWLER_UAS[0]);
    expect(l.video).toBe(true);
    expect(l.embedUrl).toBe(xEmbedUrl("1854321987654321098"));
    expect(l.description).toMatch(/combobox component/);
    expect(l.text).toBe(l.description); // not the login-wall body
  });

  it("a text post has no embed", async () => {
    const { port } = await serve({ "/someone/status/1800000000000000001": () => ({ type: "text/html", body: fixture("x-text.html") }) });
    const l = await fetchLink(`http://x.com:${port}/someone/status/1800000000000000001`, local(["x.com"]));
    expect(l.video).toBe(false);
    expect(l.embedUrl).toBeUndefined();
    expect(l.title).toMatch(/Design systems are products/);
  });
});
