import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import type { Context, Hono } from "hono";
import { LEGACY_PAGES } from "@recorte/shared";
import type { AppEnv } from "./auth/middleware";

/** Spec §8. Fonts are bundled with the gallery (no third-party host); frame-src is for phase 2 (X embeds). */
export const GALLERY_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "frame-src https://platform.twitter.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".map": "application/json",
};

/** Paths owned by the server: never answered with the SPA. */
const SERVER_PREFIXES = ["/api", "/downloads", "/auth"];
const isServerPath = (p: string) => SERVER_PREFIXES.some((x) => p === x || p.startsWith(`${x}/`));

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves the gallery build from `dir`: real files as they are, any other GET outside /api, /downloads
 * and /auth gets index.html (client-side routing). Register after every API route.
 */
export function galleryRoutes(app: Hono<AppEnv>, dir: string): void {
  const root = resolve(dir);
  const send = async (c: Context<AppEnv>, file: string, cache: string) => {
    const body = await readFile(file);
    c.header("content-type", TYPES[extname(file).toLowerCase()] ?? "application/octet-stream");
    c.header("cache-control", cache);
    c.header("content-security-policy", GALLERY_CSP);
    c.header("x-content-type-options", "nosniff");
    c.header("referrer-policy", "same-origin");
    return c.req.method === "HEAD" ? c.body(null, 200) : c.body(new Uint8Array(body), 200);
  };

  app.on(["GET", "HEAD"], "*", async (c) => {
    let path: string;
    try {
      path = decodeURIComponent(c.req.path);
    } catch {
      return c.json({ error: "not_found" }, 404);
    }
    if (isServerPath(path)) return c.json({ error: "not_found" }, 404);
    if (path.includes("\0")) return c.json({ error: "not_found" }, 404);
    // Old pt-PT page slugs (/extensao, /definicoes, /lixo) → the English ones, query string kept.
    const moved = LEGACY_PAGES[path.length > 1 ? path.replace(/\/+$/, "") : path];
    if (moved) {
      const q = new URL(c.req.url).search;
      c.header("cache-control", "no-cache");
      return c.redirect(`${moved}${q}`, 301);
    }

    const target = resolve(root, `.${path}`);
    const inside = target === root || target.startsWith(root + sep);
    if (!inside) return c.json({ error: "not_found" }, 404);
    if (target !== root && (await isFile(target))) {
      // Vite fingerprints everything under /assets.
      return send(c, target, path.startsWith("/assets/") ? "public, max-age=31536000, immutable" : "no-cache");
    }
    // A missing asset must stay a 404 (HTML here would hide the error behind a MIME mismatch).
    if (path.startsWith("/assets/") || /\.[a-z0-9]{1,8}$/i.test(path)) return c.json({ error: "not_found" }, 404);

    const index = resolve(root, "index.html");
    if (!(await isFile(index))) return c.json({ error: "gallery_not_built" }, 404);
    return send(c, index, "no-cache");
  });
}
