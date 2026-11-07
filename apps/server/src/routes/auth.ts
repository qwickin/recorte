import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { z } from "zod";
import { API, type Device, type SetupStatus } from "@recorte/shared";
import { newId, randomToken, sha256, verifyPassword } from "../auth/crypto";
import { type AppEnv, isHttps, requireUser, SESSION_COOKIE } from "../auth/middleware";
import { consumeTicket, createSession, createTicket, destroySession, SESSION_TTL_MS } from "../auth/sessions";
import { countUsers, createOwner, findOwner, findUserById, MIN_PASSWORD, setPassword } from "../auth/users";
import type { Deps } from "../deps";
import { effectiveSettings } from "../settings";

const Password = z.string().min(MIN_PASSWORD).max(256);
const SetupBody = z.object({ password: Password });
const LoginBody = z.object({ password: z.string().max(256) });
const DeviceBody = z.object({ password: z.string().max(256), name: z.string().trim().min(1).max(80) });
const PasswordBody = z.object({ currentPassword: z.string().max(256), newPassword: Password });

export const SETUP_CLOSED_MESSAGE =
  "A configuração inicial só está aberta nos primeiros 15 minutos depois de o servidor arrancar. Reinicia o container (docker restart …) e abre /setup outra vez.";

async function body<T extends z.ZodType>(c: { req: { json(): Promise<unknown> } }, schema: T): Promise<z.infer<T> | null> {
  try {
    const r = schema.safeParse(await c.req.json());
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export function authRoutes(app: Hono<AppEnv>, { db, config, setupOpenUntil }: Deps): void {
  const auth = requireUser(db);
  const limit = bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: "payload_too_large" }, 413) });

  const startSession = (c: Parameters<typeof setCookie>[0], userId: string) => {
    setCookie(c, SESSION_COOKIE, createSession(db, userId), {
      httpOnly: true,
      sameSite: "Lax",
      secure: isHttps(c),
      path: "/",
      maxAge: Math.floor(SESSION_TTL_MS / 1000),
    });
  };

  app.get(API.health, (c) => c.json({ ok: true, version: config.appVersion }));

  const setupOpen = () => Date.now() < setupOpenUntil;

  app.get(API.setup, (c) => {
    const needsSetup = countUsers(db) === 0;
    const s: SetupStatus = { needsSetup, open: needsSetup && setupOpen() };
    return c.json(s);
  });

  // First run: the owner's access password, accepted only while there is no owner and within the window.
  app.post(API.setup, limit, async (c) => {
    if (countUsers(db) > 0) return c.json({ error: "already_set_up" }, 409);
    if (!setupOpen()) return c.json({ error: "setup_closed", message: SETUP_CLOSED_MESSAGE }, 403);
    const b = await body(c, SetupBody);
    if (!b) return c.json({ error: "invalid_request" }, 400);
    const userId = await createOwner(db, b.password);
    if (!userId) return c.json({ error: "already_set_up" }, 409);
    startSession(c, userId);
    return c.json({ ok: true }, 201);
  });

  app.post(API.login, limit, async (c) => {
    const b = await body(c, LoginBody);
    if (!b) return c.json({ error: "invalid_request" }, 400);
    const user = findOwner(db);
    if (!(await verifyPassword(user?.password_hash ?? null, b.password)) || !user) {
      return c.json({ error: "invalid_credentials" }, 401);
    }
    startSession(c, user.id);
    return c.json({ ok: true });
  });

  app.post(API.logout, (c) => {
    const t = getCookie(c, SESSION_COOKIE);
    if (t) destroySession(db, t);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // Extension login: credentials -> long-lived device token (only its sha256 is stored).
  app.post(API.devices, limit, async (c) => {
    const b = await body(c, DeviceBody);
    if (!b) return c.json({ error: "invalid_request" }, 400);
    const user = findOwner(db);
    if (!(await verifyPassword(user?.password_hash ?? null, b.password)) || !user) {
      return c.json({ error: "invalid_credentials" }, 401);
    }
    const token = randomToken();
    const id = newId();
    db.prepare("INSERT INTO devices (id, user_id, name, token_hash, created_at) VALUES (?, ?, ?, ?, ?)").run(
      id,
      user.id,
      b.name,
      sha256(token),
      new Date().toISOString(),
    );
    return c.json({ token, id }, 201);
  });

  app.get(API.devices, auth, (c) => {
    const rows = db
      .prepare("SELECT id, name, created_at, last_seen_at, extension_version FROM devices WHERE user_id = ? ORDER BY created_at DESC, id")
      .all(c.var.userId) as { id: string; name: string; created_at: string; last_seen_at: string | null; extension_version: string | null }[];
    const devices: Device[] = rows.map((r) => ({
      id: r.id,
      name: r.name,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      extensionVersion: r.extension_version,
    }));
    return c.json(devices);
  });

  app.delete(API.device(":id"), auth, (c) => {
    const r = db.prepare("DELETE FROM devices WHERE id = ? AND user_id = ?").run(c.req.param("id") ?? "", c.var.userId);
    return r.changes ? c.json({ ok: true }) : c.json({ error: "not_found" }, 404);
  });

  // One-time, 60 s hand-off from the extension (Bearer) to a browser session.
  app.post(API.authTicket, auth, (c) => {
    const ticket = createTicket(db, c.var.userId);
    const base = effectiveSettings(db, config).publicUrl ?? new URL(c.req.url).origin;
    return c.json({ ticket, url: `${base}${API.authTicketRedirect}?t=${ticket}` });
  });

  app.get(API.authTicketRedirect, (c) => {
    const t = c.req.query("t");
    const userId = t ? consumeTicket(db, t) : null;
    if (!userId) return c.redirect("/login", 302);
    startSession(c, userId);
    return c.redirect("/", 302);
  });

  app.get(API.me, auth, (c) => {
    const u = findUserById(db, c.var.userId);
    return u ? c.json({ id: u.id }) : c.json({ error: "unauthorized" }, 401);
  });

  app.post(API.mePassword, limit, auth, async (c) => {
    const b = await body(c, PasswordBody);
    if (!b) return c.json({ error: "invalid_request" }, 400);
    const u = findUserById(db, c.var.userId);
    if (!u || !(await verifyPassword(u.password_hash, b.currentPassword))) {
      return c.json({ error: "invalid_credentials" }, 403);
    }
    await setPassword(db, u.id, b.newPassword, getCookie(c, SESSION_COOKIE));
    return c.json({ ok: true });
  });
}
