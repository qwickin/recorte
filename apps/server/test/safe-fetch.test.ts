import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import { BlockedUrlError, FetchFailedError, fetchErrorCode, isBlockedAddress, safeFetch, type LookupFn } from "../src/links/safe-fetch";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => new Promise((r) => s.close(r))));
});

/** A local server: requests are counted so a test can prove a hop never happened. */
async function serve(handler: Parameters<typeof createServer>[1]): Promise<{ port: number; hits: string[] }> {
  const hits: string[] = [];
  const s = createServer((req, res) => {
    hits.push(req.url ?? "");
    handler!(req, res);
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(0, "127.0.0.1", r));
  return { port: (s.address() as AddressInfo).port, hits };
}

/** Policy for tests that need the local server: 127.0.0.1 is allowed, everything else follows the real rules. */
const allowLocal = (ip: string) => ip !== "127.0.0.1" && isBlockedAddress(ip);
const fakeDns =
  (map: Record<string, string>): LookupFn =>
  (host, cb) =>
    map[host] ? cb(null, [{ address: map[host]!, family: map[host]!.includes(":") ? 6 : 4 }]) : cb(new Error(`ENOTFOUND ${host}`), []);

describe("isBlockedAddress", () => {
  it.each([
    "127.0.0.1", "127.1.2.3", "10.0.0.1", "172.16.5.4", "172.31.255.255", "192.168.1.20", "169.254.169.254", "100.64.0.1",
    "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fd00::1", "fc12:3456::1", "fe80::1", "ff02::1",
    "::ffff:127.0.0.1", "::ffff:7f00:1", "::ffff:10.0.0.1", "::ffff:169.254.169.254", "64:ff9b::a00:1", "2002:a00:1::", "::127.0.0.1",
    "not-an-ip", "",
  ])("blocks %s", (ip) => expect(isBlockedAddress(ip)).toBe(true));
  it.each(["8.8.8.8", "1.1.1.1", "172.32.0.1", "100.128.0.1", "2606:4700:4700::1111", "::ffff:8.8.8.8", "2a00:1450:4003:80f::200e"])(
    "allows %s",
    (ip) => expect(isBlockedAddress(ip)).toBe(false),
  );
});

describe("safeFetch", () => {
  it("refuses private IP literals and non-http schemes before connecting", async () => {
    const { port, hits } = await serve((_q, r) => r.end("x"));
    for (const u of [`http://127.0.0.1:${port}/`, `http://[::1]:${port}/`, `http://[::ffff:127.0.0.1]:${port}/`, "http://169.254.169.254/latest/meta-data/", "http://10.0.0.1/"]) {
      await expect(safeFetch(u)).rejects.toBeInstanceOf(BlockedUrlError);
    }
    for (const u of ["file:///etc/passwd", "ftp://example.com/", "gopher://x/", "javascript:alert(1)", "http://user:pw@example.com/"]) {
      await expect(safeFetch(u)).rejects.toBeInstanceOf(BlockedUrlError);
    }
    expect(hits).toEqual([]);
  });

  it("refuses a hostname that resolves to a private address (checked at connect time)", async () => {
    const { port, hits } = await serve((_q, r) => r.end("x"));
    await expect(safeFetch(`http://intranet.test:${port}/`, { lookup: fakeDns({ "intranet.test": "127.0.0.1" }) })).rejects.toBeInstanceOf(BlockedUrlError);
    await expect(safeFetch(`http://localhost:${port}/`)).rejects.toBeInstanceOf(BlockedUrlError); // real DNS
    expect(hits).toEqual([]);
  });

  it("refuses when any of the resolved addresses is private (no picking the public one)", async () => {
    const lookup: LookupFn = (_h, cb) => cb(null, [{ address: "93.184.216.34", family: 4 }, { address: "10.0.0.7", family: 4 }]);
    await expect(safeFetch("http://mixed.test/", { lookup })).rejects.toBeInstanceOf(BlockedUrlError);
  });

  it("follows redirects but checks every hop: a redirect to a private address is refused", async () => {
    const target = await serve((_q, r) => r.end("secret"));
    const { port, hits } = await serve((req, res) => {
      if (req.url === "/to-literal") res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
      else if (req.url === "/to-name") res.writeHead(301, { location: `http://metadata.test:${target.port}/` }).end();
      else res.writeHead(302, { location: "/to-literal" }).end();
    });
    const lookup = fakeDns({ "public.test": "127.0.0.1", "metadata.test": "127.0.0.2" });
    const opts = { lookup, isBlocked: allowLocal };
    await expect(safeFetch(`http://public.test:${port}/start`, opts)).rejects.toBeInstanceOf(BlockedUrlError);
    // DNS of the next hop says private: refused in the socket lookup; the target server never sees a request.
    await expect(safeFetch(`http://public.test:${port}/to-name`, opts)).rejects.toBeInstanceOf(BlockedUrlError);
    expect(hits).toEqual(["/start", "/to-literal", "/to-name"]);
    expect(target.hits).toEqual([]);
  });

  it("returns the final URL, decodes gzip, caps redirects", async () => {
    const { port } = await serve((req, res) => {
      if (req.url === "/a") res.writeHead(302, { location: "/b" }).end();
      else if (req.url === "/b") res.writeHead(200, { "content-type": "text/html; charset=utf-8", "content-encoding": "gzip" }).end(gzipSync("<title>olá</title>"));
      else res.writeHead(302, { location: req.url + "x" }).end();
    });
    const opts = { lookup: fakeDns({ "site.test": "127.0.0.1" }), isBlocked: allowLocal };
    const r = await safeFetch(`http://site.test:${port}/a`, opts);
    expect(r.url).toBe(`http://site.test:${port}/b`);
    expect(r.status).toBe(200);
    expect(r.contentType).toMatch(/text\/html/);
    expect(r.body.toString("utf8")).toBe("<title>olá</title>");
    await expect(safeFetch(`http://site.test:${port}/loop`, { ...opts, maxRedirects: 3 })).rejects.toThrow(/too many redirects/);
  });

  it("caps the body: fails (images) or keeps the head (HTML) past maxBytes", async () => {
    const big = "x".repeat(50_000);
    const { port } = await serve((req, res) => {
      if (req.url === "/declared") res.writeHead(200, { "content-length": String(big.length) }).end(big);
      else res.writeHead(200).end(big); // chunked, no content-length
    });
    const opts = { lookup: fakeDns({ "site.test": "127.0.0.1" }), isBlocked: allowLocal, maxBytes: 10_000 };
    await expect(safeFetch(`http://site.test:${port}/declared`, opts)).rejects.toBeInstanceOf(FetchFailedError);
    await expect(safeFetch(`http://site.test:${port}/stream`, opts)).rejects.toThrow(/too large/);
    const head = await safeFetch(`http://site.test:${port}/stream`, { ...opts, truncate: true });
    expect(head.body.length).toBe(10_000);
    expect(head.truncated).toBe(true);
  });

  it("times out", async () => {
    const { port } = await serve(() => {}); // never answers
    const opts = { lookup: fakeDns({ "slow.test": "127.0.0.1" }), isBlocked: allowLocal, timeoutMs: 200 };
    const t0 = Date.now();
    await expect(safeFetch(`http://slow.test:${port}/`, opts)).rejects.toThrow(/timeout/);
    expect(Date.now() - t0).toBeLessThan(2000);
  });
});

describe("fetchErrorCode (what link.fetchError may say)", () => {
  it("maps errors to generic codes, never addresses or host names", async () => {
    const blocked = await safeFetch("http://intranet.test/", { lookup: fakeDns({ "intranet.test": "10.1.2.3" }) }).catch((e) => e);
    expect(String(blocked.message)).toContain("10.1.2.3"); // the log may have it…
    expect(fetchErrorCode(blocked)).toBe("blocked"); // …the item never does
    expect(fetchErrorCode(new FetchFailedError("timeout"))).toBe("timeout");
    expect(fetchErrorCode(new FetchFailedError("too large"))).toBe("too_large");
    expect(fetchErrorCode(new FetchFailedError("HTTP 404", 404))).toBe("http_404");
    expect(fetchErrorCode(new FetchFailedError("not a web page (application/pdf)"))).toBe("unsupported");
    expect(fetchErrorCode(new Error("getaddrinfo ENOTFOUND secret.internal.corp"))).toBe("unreachable");
    expect(fetchErrorCode(new FetchFailedError("too many redirects"))).toBe("unreachable");
  });
});
