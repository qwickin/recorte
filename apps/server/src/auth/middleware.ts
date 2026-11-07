import { getCookie } from "hono/cookie";
import { createMiddleware } from "hono/factory";
import type { Context } from "hono";
import type { Db } from "../db";
import { sha256 } from "./crypto";
import { userForSession } from "./sessions";

export const SESSION_COOKIE = "recorte_session";

export type AppEnv = { Variables: { userId: string; deviceId?: string } };

const SAFE = new Set(["GET", "HEAD", "OPTIONS"]);

export function requestHost(c: Context): string {
  return c.req.header("x-forwarded-host") ?? c.req.header("host") ?? new URL(c.req.url).host;
}

export function isHttps(c: Context): boolean {
  return c.req.url.startsWith("https:") || c.req.header("x-forwarded-proto")?.split(",")[0]?.trim() === "https";
}

/** Mutating requests carrying an Origin (i.e. from browsers) must come from our own host. Bearer requests are exempt. */
export function originCheck(publicUrl: string | null) {
  const publicHost = publicUrl ? new URL(publicUrl).host : null;
  return createMiddleware(async (c, next) => {
    if (SAFE.has(c.req.method) || c.req.header("authorization")?.startsWith("Bearer ")) return next();
    const origin = c.req.header("origin");
    if (origin !== undefined) {
      let host: string | null = null;
      try {
        host = new URL(origin).host;
      } catch {}
      if (!host || (host !== requestHost(c) && host !== publicHost)) {
        return c.json({ error: "forbidden_origin" }, 403);
      }
    }
    return next();
  });
}

export function requireUser(db: Db) {
  return createMiddleware<AppEnv>(async (c, next) => {
    const auth = c.req.header("authorization");
    if (auth !== undefined) {
      const m = /^Bearer\s+(\S+)$/i.exec(auth);
      const row = m
        ? (db.prepare("SELECT id, user_id FROM devices WHERE token_hash = ?").get(sha256(m[1]!)) as
            | { id: string; user_id: string }
            | undefined)
        : undefined;
      if (!row) return c.json({ error: "unauthorized" }, 401);
      db.prepare("UPDATE devices SET last_seen_at = ?, extension_version = COALESCE(?, extension_version) WHERE id = ?").run(
        new Date().toISOString(),
        c.req.header("x-extension-version")?.slice(0, 40) ?? null,
        row.id,
      );
      c.set("userId", row.user_id);
      c.set("deviceId", row.id);
      return next();
    }
    const cookie = getCookie(c, SESSION_COOKIE);
    const userId = cookie ? userForSession(db, cookie) : null;
    if (!userId) return c.json({ error: "unauthorized" }, 401);
    c.set("userId", userId);
    return next();
  });
}
