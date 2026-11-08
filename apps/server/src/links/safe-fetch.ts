import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import type { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/**
 * Server-side fetch of user-given URLs ("Guardar link") with an SSRF guard:
 * - http/https only, at most `maxRedirects` hops, each one checked again;
 * - every address a host resolves to must be public (no loopback, private, link-local, CGNAT, multicast,
 *   reserved, nor IPv4 embedded in IPv6). The check runs inside the socket's `lookup`, i.e. on the very address
 *   the connection uses, so DNS rebinding between a check and the connect is not possible. IP literals (which
 *   skip `lookup`) are checked before connecting;
 * - one deadline for the whole chain (default 10 s) and a byte cap on the decoded body (default 5 MB).
 */

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

export class FetchFailedError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "FetchFailedError";
  }
}

/**
 * What a saved link may record about a failed fetch (`link.fetchError`, visible in the gallery and meta.json):
 * a generic code, never resolved addresses or host names. The details only go to the server log.
 */
export type FetchErrorCode = "blocked" | "unreachable" | "timeout" | "too_large" | "unsupported" | `http_${number}`;

export function fetchErrorCode(e: unknown): FetchErrorCode {
  if (e instanceof BlockedUrlError) return "blocked";
  if (e instanceof FetchFailedError) {
    if (e.status) return `http_${e.status}`;
    if (e.message === "timeout") return "timeout";
    if (e.message === "too large") return "too_large";
    if (e.message.startsWith("not a web page") || e.message.startsWith("not an image")) return "unsupported";
  }
  return "unreachable";
}

const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8],
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // link-local, cloud metadata
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];
const V6_BLOCKED: [string, number][] = [
  ["::", 128],
  ["::1", 128],
  ["100::", 64], // discard
  ["2001:db8::", 32], // documentation
  ["fc00::", 7], // unique local
  ["fe80::", 10], // link-local
  ["fec0::", 10], // site-local (deprecated)
  ["ff00::", 8], // multicast
];
const blockList = new BlockList();
for (const [a, p] of V4_BLOCKED) blockList.addSubnet(a, p, "ipv4");
for (const [a, p] of V6_BLOCKED) blockList.addSubnet(a, p, "ipv6");

/** The 8 hextets of an IPv6 address (with an optional dotted IPv4 tail), or null. */
function hextets(ip: string): number[] | null {
  let s = ip.toLowerCase().replace(/%.*$/, "");
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (v4) {
    const b = v4[1]!.split(".").map(Number);
    if (b.some((x) => x > 255)) return null;
    s = s.slice(0, -v4[1]!.length) + `${((b[0]! << 8) | b[1]!).toString(16)}:${((b[2]! << 8) | b[3]!).toString(16)}`;
  }
  const [head, tail, extra] = s.split("::");
  if (extra !== undefined) return null;
  const h = head ? head.split(":") : [];
  const t = tail !== undefined && tail ? tail.split(":") : [];
  const fill = tail === undefined ? 0 : 8 - h.length - t.length;
  if (fill < 0) return null;
  const all = [...h, ...Array(fill).fill("0"), ...t].map((x) => parseInt(x, 16));
  return all.length === 8 && all.every((x) => Number.isInteger(x) && x >= 0 && x <= 0xffff) ? all : null;
}

const v4FromWords = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/** True for any address a server-side fetch must not reach. Unparseable input is blocked. */
export function isBlockedAddress(ip: string): boolean {
  const family = isIP(ip.replace(/%.*$/, ""));
  if (family === 4) return blockList.check(ip, "ipv4");
  if (family !== 6) return true;
  const w = hextets(ip);
  if (!w) return true;
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d), NAT64 (64:ff9b::/96), 6to4 (2002:AABB:CCDD::).
  const zeros5 = w.slice(0, 5).every((x) => x === 0);
  if (zeros5 && (w[5] === 0xffff || w[5] === 0)) {
    if (w[5] === 0 && w[6] === 0 && (w[7] === 0 || w[7] === 1)) return true; // :: and ::1
    return isBlockedAddress(v4FromWords(w[6]!, w[7]!));
  }
  if (w[0] === 0x64 && w[1] === 0xff9b && w.slice(2, 6).every((x) => x === 0)) return isBlockedAddress(v4FromWords(w[6]!, w[7]!));
  if (w[0] === 0x2002) return isBlockedAddress(v4FromWords(w[1]!, w[2]!));
  return blockList.check(w.map((x) => x.toString(16)).join(":"), "ipv6");
}

export type LookupFn = (hostname: string, cb: (err: Error | null, addresses: LookupAddress[]) => void) => void;

const systemLookup: LookupFn = (hostname, cb) => dnsLookup(hostname, { all: true, verbatim: true }, (err, addrs) => cb(err, addrs ?? []));

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** Over `maxBytes`: keep the first `maxBytes` (HTML: the head is what matters) instead of failing. */
  truncate?: boolean;
  headers?: Record<string, string>;
  /** Tests: a fake resolver and/or a different address policy. */
  lookup?: LookupFn;
  isBlocked?: (ip: string) => boolean;
}

export interface SafeResponse {
  url: string;
  status: number;
  contentType: string;
  body: Buffer;
  truncated: boolean;
}

export const LINK_FETCH_TIMEOUT_MS = 10_000;
export const LINK_MAX_BYTES = 5 * 1024 * 1024;

const DEFAULT_HEADERS = {
  "user-agent": "Mozilla/5.0 (compatible; RecorteBot/1.0; +https://github.com/qwickin/recorte)",
  accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
  // No preferred language of our own: English, then whatever the site serves by default.
  "accept-language": "en-US,en;q=0.9,*;q=0.5",
  "accept-encoding": "gzip, deflate, br",
};

/** Checks scheme and (for IP literals) the address. Returns the parsed URL. */
export function checkUrl(raw: string, isBlocked: (ip: string) => boolean = isBlockedAddress): URL {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BlockedUrlError("invalid URL");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new BlockedUrlError(`scheme not allowed: ${u.protocol}`);
  if (u.username || u.password) throw new BlockedUrlError("credentials in URL");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host) throw new BlockedUrlError("no host");
  if (isIP(host) && isBlocked(host)) throw new BlockedUrlError(`address not allowed: ${host}`);
  return u;
}

export async function safeFetch(rawUrl: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const timeoutMs = opts.timeoutMs ?? LINK_FETCH_TIMEOUT_MS;
  const maxBytes = opts.maxBytes ?? LINK_MAX_BYTES;
  const maxRedirects = opts.maxRedirects ?? 5;
  const isBlocked = opts.isBlocked ?? isBlockedAddress;
  const resolve = opts.lookup ?? systemLookup;
  const deadline = Date.now() + timeoutMs;

  // Node's socket lookup: (hostname, options, cb) with cb(err, address, family) or, with options.all, cb(err, list).
  const guardedLookup = (hostname: string, options: { all?: boolean }, cb: (...a: unknown[]) => void) => {
    resolve(hostname, (err, addrs) => {
      if (err) return cb(err);
      if (!addrs.length) return cb(new FetchFailedError(`no address for ${hostname}`));
      const bad = addrs.find((a) => isBlocked(a.address));
      if (bad) return cb(new BlockedUrlError(`address not allowed: ${hostname} -> ${bad.address}`));
      if (options?.all) return cb(null, addrs);
      cb(null, addrs[0]!.address, addrs[0]!.family);
    });
  };

  let url = checkUrl(rawUrl, isBlocked);
  for (let hop = 0; ; hop++) {
    const left = deadline - Date.now();
    if (left <= 0) throw new FetchFailedError("timeout");
    const res = await requestOnce(url, { ...DEFAULT_HEADERS, ...opts.headers }, guardedLookup, left);
    const loc = res.headers.location;
    if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && loc) {
      res.resume();
      if (hop >= maxRedirects) throw new FetchFailedError("too many redirects");
      url = checkUrl(new URL(loc, url).href, isBlocked);
      continue;
    }
    const status = res.statusCode ?? 0;
    const contentType = String(res.headers["content-type"] ?? "");
    const { body, truncated } = await readBody(res, maxBytes, opts.truncate ?? false, deadline);
    return { url: url.href, status, contentType, body, truncated };
  }
}

function requestOnce(
  url: URL,
  headers: Record<string, string>,
  lookup: (hostname: string, options: { all?: boolean }, cb: (...a: unknown[]) => void) => void,
  timeoutMs: number,
): Promise<http.IncomingMessage> {
  const mod = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(url, { method: "GET", headers, agent: false, lookup: lookup as never });
    const timer = setTimeout(() => req.destroy(new FetchFailedError("timeout")), timeoutMs);
    req.on("response", (res) => {
      clearTimeout(timer);
      resolve(res);
    });
    req.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    req.end();
  });
}

function decoded(res: http.IncomingMessage): Readable {
  const enc = String(res.headers["content-encoding"] ?? "").trim().toLowerCase();
  if (enc === "gzip" || enc === "x-gzip") return res.pipe(createGunzip());
  if (enc === "deflate") return res.pipe(createInflate());
  if (enc === "br") return res.pipe(createBrotliDecompress());
  return res;
}

function readBody(res: http.IncomingMessage, maxBytes: number, truncate: boolean, deadline: number): Promise<{ body: Buffer; truncated: boolean }> {
  const declared = Number(res.headers["content-length"]);
  if (!truncate && Number.isFinite(declared) && declared > maxBytes) {
    res.destroy();
    return Promise.reject(new FetchFailedError("too large"));
  }
  return new Promise((resolve, reject) => {
    const stream = decoded(res);
    const chunks: Buffer[] = [];
    let size = 0;
    let done = false;
    const finish = (err: Error | null, truncated = false) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (err) return reject(err);
      resolve({ body: Buffer.concat(chunks), truncated });
    };
    const timer = setTimeout(() => {
      res.destroy();
      finish(new FetchFailedError("timeout"));
    }, Math.max(1, deadline - Date.now()));
    stream.on("data", (c: Buffer) => {
      if (done) return;
      size += c.length;
      if (size > maxBytes) {
        if (truncate) chunks.push(c.subarray(0, c.length - (size - maxBytes)));
        res.destroy();
        stream.destroy();
        return finish(truncate ? null : new FetchFailedError("too large"), truncate);
      }
      chunks.push(c);
    });
    stream.on("end", () => finish(null));
    stream.on("error", (e) => finish(e));
    res.on("error", (e) => finish(e));
  });
}
