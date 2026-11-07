import { describe, expect, it, vi } from "vitest";
import { bootstrap } from "../src/bootstrap";
import { loadConfig } from "../src/config";
import { migrate, MIGRATIONS } from "../src/db";
import { runCli } from "../src/cli";
import { countUsers, findOwner, PLACEHOLDER_PREFIX } from "../src/auth/users";
import { hashPassword } from "../src/auth/crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../src/app";
import { openDbAt } from "../src/db";
import { cookieOf, deviceToken, EMAIL, login, makeApp, PASSWORD } from "./helpers";

describe("config & migrations", () => {
  it("applies defaults for unknown env", () => {
    const c = loadConfig({ PORT: "abc" });
    expect(c.port).toBe(8080);
    expect(c.publicUrl).toBeNull();
    expect(c.dataDir.endsWith("data")).toBe(true);
  });
  it("migrations are idempotent and ordered", () => {
    const db = new DatabaseSync(":memory:");
    migrate(db);
    migrate(db, [...MIGRATIONS, "CREATE TABLE extra (x)"]);
    migrate(db, [...MIGRATIONS, "CREATE TABLE extra (x)"]);
    const v = db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as { v: number };
    expect(v.v).toBe(MIGRATIONS.length + 1);
  });
});

describe("migration from an email-account database (schema v2)", () => {
  it("keeps the owner, its email and its items; the owner signs in with email + password", async () => {
    const dir = mkdtempSync(join(tmpdir(), "recorte-v2-"));
    try {
      const path = join(dir, "recorte.db");
      const v2 = new DatabaseSync(path);
      v2.exec("PRAGMA foreign_keys = ON");
      migrate(v2, MIGRATIONS.slice(0, 2));
      v2.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', 'dono@x.io', ?, '2026-01-01T00:00:00.000Z')").run(await hashPassword(PASSWORD));
      v2.prepare(
        "INSERT INTO items (id, user_id, type, site, url, title, created_at, thumb, width, height, color) VALUES ('i1', 'u1', 'screenshot', 'x.io', 'https://x.io', 'T', '2026-01-01T00:00:00.000Z', 't', 1, 1, '#000')",
      ).run();
      v2.close();
      const db = openDbAt(path);
      expect((db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as { v: number }).v).toBe(MIGRATIONS.length);
      expect((db.prepare("SELECT COUNT(*) AS n FROM items").get() as { n: number }).n).toBe(1);
      expect(findOwner(db)?.id).toBe("u1");
      const app = createApp({ db, config: loadConfig({ DATA_DIR: dir }) });
      const login = (email: string) =>
        app.request("/api/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password: PASSWORD }) });
      expect((await login("outro@x.io")).status).toBe(401);
      const r = await login(" Dono@X.io ");
      expect(r.status).toBe(200);
      expect(await (await app.request("/api/me", { headers: { cookie: cookieOf(r) } })).json()).toEqual({ id: "u1", email: "dono@x.io" });
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("owner from the password-only build (placeholder email)", () => {
  async function placeholderOwner() {
    const t = await makeApp();
    t.db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES ('u1', ?, ?, '2026-01-01T00:00:00.000Z')").run(`${PLACEHOLDER_PREFIX}u1`, await hashPassword(PASSWORD));
    return t;
  }
  it("claims the email given on the first correct login; afterwards only that email works", async () => {
    const t = await placeholderOwner();
    expect((await t.json("/api/login", { email: "novo@x.io", password: "wrong-password" })).status).toBe(401);
    expect(findOwner(t.db)?.email).toBe(`${PLACEHOLDER_PREFIX}u1`);
    expect((await t.json("/api/login", { email: "not-an-email", password: PASSWORD })).status).toBe(401);
    const r = await t.json("/api/login", { email: "Novo@X.io", password: PASSWORD });
    expect(r.status).toBe(200);
    expect(findOwner(t.db)?.email).toBe("novo@x.io");
    expect((await t.json("/api/login", { email: "outro@x.io", password: PASSWORD })).status).toBe(401);
    expect((await t.json("/api/login", { email: "novo@x.io", password: PASSWORD })).status).toBe(200);
  });
  it("the extension login (devices) claims it too", async () => {
    const t = await placeholderOwner();
    expect((await t.json("/api/devices", { email: "novo@x.io", password: PASSWORD, name: "x" })).status).toBe(201);
    expect(findOwner(t.db)?.email).toBe("novo@x.io");
  });
  it("reset-password <email> assigns the email", async () => {
    const t = await placeholderOwner();
    process.env.DATA_DIR = t.dir;
    try {
      expect(await runCli(["reset-password", "novo@x.io", "--password", "fresh-password-1"], () => {})).toBe(0);
      expect(findOwner(t.db)?.email).toBe("novo@x.io");
      expect((await t.json("/api/login", { email: "novo@x.io", password: "fresh-password-1" })).status).toBe(200);
    } finally {
      delete process.env.DATA_DIR;
    }
  });
});

describe("boot", () => {
  it("announces the 15-minute /setup window when there is no owner", async () => {
    const t = await makeApp();
    const log = vi.fn();
    await bootstrap(t.db, loadConfig({ PORT: "9000" }), log);
    expect(log).toHaveBeenCalledWith("Abre http://<IP-deste-servidor>:9000/setup nos próximos 15 minutos para configurar.");
    await bootstrap(t.db, loadConfig({ PUBLIC_URL: "https://r.example.pt/" }), log);
    expect(log).toHaveBeenLastCalledWith("Abre https://r.example.pt/setup nos próximos 15 minutos para configurar.");
    expect(countUsers(t.db)).toBe(0);
  });
  it("creates the owner from ADMIN_EMAIL + ADMIN_PASSWORD, without logging the password", async () => {
    const t = await makeApp();
    const log = vi.fn();
    await bootstrap(t.db, loadConfig({ ADMIN_EMAIL: "Admin@X.io", ADMIN_PASSWORD: "longpassword" }), log);
    expect(countUsers(t.db)).toBe(1);
    expect(JSON.stringify(log.mock.calls)).not.toContain("longpassword");
    expect((await t.json("/api/login", { email: "admin@x.io", password: "longpassword" })).status).toBe(200);
    // Ignored once an owner exists.
    await bootstrap(t.db, loadConfig({ ADMIN_EMAIL: "b@x.io", ADMIN_PASSWORD: "otherpassword" }), log);
    expect(countUsers(t.db)).toBe(1);
  });
  it.each([
    [{ ADMIN_PASSWORD: "longpassword" }, /both be set/],
    [{ ADMIN_EMAIL: "a@x.io" }, /both be set/],
    [{ ADMIN_EMAIL: "nope", ADMIN_PASSWORD: "longpassword" }, /not a valid email/],
    [{ ADMIN_EMAIL: "a@x.io", ADMIN_PASSWORD: "short" }, /at least 8/],
  ])("ignores incomplete or invalid ADMIN_* (%o) and falls back to /setup", async (env, why) => {
    const t = await makeApp();
    const log = vi.fn();
    await bootstrap(t.db, loadConfig(env), log);
    expect(countUsers(t.db)).toBe(0);
    const out = log.mock.calls.flat().join("\n");
    expect(out).toMatch(why);
    expect(out).toMatch(/\/setup nos próximos 15 minutos/);
  });
});

describe("health", () => {
  it("is unauthenticated", async () => {
    const t = await makeApp({ env: { APP_VERSION: "1.2.3" } });
    const r = await t.app.request("/api/health");
    expect(await r.json()).toEqual({ ok: true, version: "1.2.3" });
  });
});

describe("setup", () => {
  it("is open while there is no owner and the window lasts", async () => {
    const t = await makeApp();
    expect(await (await t.app.request("/api/setup")).json()).toEqual({ needsSetup: true, open: true });
  });
  it("creates the owner with email + password, signs in, then a second setup is 409", async () => {
    const t = await makeApp();
    const r = await t.json("/api/setup", { email: EMAIL, password: PASSWORD });
    expect(r.status).toBe(201);
    const cookie = cookieOf(r);
    expect((await t.app.request("/api/me", { headers: { cookie } })).status).toBe(200);
    expect((await t.json("/api/setup", { email: "outro@x.io", password: "another-password" })).status).toBe(409);
    expect(await (await t.app.request("/api/setup")).json()).toEqual({ needsSetup: false, open: false });
    expect((await t.json("/api/login", { email: EMAIL, password: PASSWORD })).status).toBe(200);
  });
  it("needs a valid email and a password of at least 8 characters", async () => {
    const t = await makeApp();
    expect((await t.json("/api/setup", { email: EMAIL, password: "short" })).status).toBe(400);
    expect((await t.json("/api/setup", { password: PASSWORD })).status).toBe(400);
    expect((await t.json("/api/setup", { email: "no-at-sign", password: PASSWORD })).status).toBe(400);
    expect((await t.json("/api/setup", {})).status).toBe(400);
    expect(countUsers(t.db)).toBe(0);
  });
  it("concurrent setups create a single owner", async () => {
    const t = await makeApp();
    const rs = await Promise.all(["first-password", "second-password"].map((password, i) => t.json("/api/setup", { email: `o${i}@x.io`, password })));
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(countUsers(t.db)).toBe(1);
  });
  it("closes 15 minutes after start (injected monotonic clock): 403 setup_closed with a restart hint", async () => {
    let now = 1_000;
    const t = await makeApp({ deps: { clock: () => now } });
    now += 15 * 60_000 - 1;
    expect(await (await t.app.request("/api/setup")).json()).toEqual({ needsSetup: true, open: true });
    now += 1;
    expect(await (await t.app.request("/api/setup")).json()).toEqual({ needsSetup: true, open: false });
    const r = await t.json("/api/setup", { email: EMAIL, password: PASSWORD });
    expect(r.status).toBe(403);
    const b = (await r.json()) as { error: string; message: string };
    expect(b.error).toBe("setup_closed");
    expect(b.message).toMatch(/Reinicia o container/);
    expect(countUsers(t.db)).toBe(0);
  });
  it("wall-clock steps do not move the window", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      let now = 0;
      const t = await makeApp({ deps: { clock: () => now } });
      vi.setSystemTime(Date.now() + 24 * 3_600_000); // clock jumps forward a day: still open
      expect(((await (await t.app.request("/api/setup")).json()) as { open: boolean }).open).toBe(true);
      now = 15 * 60_000;
      vi.setSystemTime(Date.now() - 48 * 3_600_000); // jumps back: still closed after 15 monotonic minutes
      expect(((await (await t.app.request("/api/setup")).json()) as { open: boolean }).open).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
  it("honours an injected window (deps.setupOpenUntil)", async () => {
    const closed = await makeApp({ deps: { clock: () => 100, setupOpenUntil: 100 } });
    expect((await closed.json("/api/setup", { email: EMAIL, password: PASSWORD })).status).toBe(403);
    const open = await makeApp({ deps: { clock: () => 100, setupOpenUntil: 101 } });
    expect((await open.json("/api/setup", { email: EMAIL, password: PASSWORD })).status).toBe(201);
  });
  it("default clock is monotonic (performance.now)", async () => {
    const { monotonicMs, resolveDeps, SETUP_WINDOW_MS } = await import("../src/deps");
    const t = await makeApp();
    const d = resolveDeps({ db: t.db, config: t.config });
    expect(d.clock).toBe(monotonicMs);
    expect(d.setupOpenUntil - performance.now()).toBeGreaterThan(SETUP_WINDOW_MS - 5_000);
    expect(d.setupOpenUntil - performance.now()).toBeLessThanOrEqual(SETUP_WINDOW_MS);
  });
  it("Origin check applies to setup", async () => {
    const t = await makeApp();
    expect((await t.json("/api/setup", { email: EMAIL, password: PASSWORD }, { origin: "https://evil.test", host: "recorte.test" })).status).toBe(403);
    expect(countUsers(t.db)).toBe(0);
  });
});

describe("login & session", () => {
  it("login sets httpOnly Lax cookie; Secure only on https", async () => {
    const t = await makeApp({ user: true });
    const http = await t.json("/api/login", { email: EMAIL, password: PASSWORD });
    const sc = http.headers.get("set-cookie")!;
    expect(sc).toMatch(/^recorte_session=/);
    expect(sc).toMatch(/HttpOnly/i);
    expect(sc).toMatch(/SameSite=Lax/i);
    expect(sc).not.toMatch(/Secure/i);
    const viaProxy = await t.json("/api/login", { email: EMAIL, password: PASSWORD }, { "x-forwarded-proto": "https" });
    expect(viaProxy.headers.get("set-cookie")).toMatch(/Secure/i);
    const direct = await t.app.request("https://x.test/api/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
    });
    expect(direct.headers.get("set-cookie")).toMatch(/Secure/i);
  });
  it("rejects bad credentials and unauthenticated access", async () => {
    const t = await makeApp({ user: true });
    expect((await t.json("/api/login", { email: EMAIL, password: "wrong-password" })).status).toBe(401);
    expect((await t.json("/api/login", { email: "outro@recorte.test", password: PASSWORD })).status).toBe(401);
    expect((await t.json("/api/login", { password: PASSWORD })).status).toBe(400);
    expect((await t.json("/api/login", {})).status).toBe(400);
    const r = await t.app.request("/api/me");
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "unauthorized" });
  });
  it("logout destroys the session", async () => {
    const t = await makeApp({ user: true });
    const cookie = await login(t);
    expect((await t.app.request("/api/me", { headers: { cookie } })).status).toBe(200);
    await t.app.request("/api/logout", { method: "POST", headers: { cookie } });
    expect((await t.app.request("/api/me", { headers: { cookie } })).status).toBe(401);
  });
  it("mutating cookie requests with a foreign Origin are rejected; Bearer is exempt", async () => {
    const t = await makeApp({ user: true });
    const cookie = await login(t);
    const bad = await t.json("/api/me/password", { currentPassword: PASSWORD, newPassword: "another-pass-1" }, { cookie, origin: "https://evil.test", host: "recorte.test" });
    expect(bad.status).toBe(403);
    const good = await t.json("/api/me/password", { currentPassword: PASSWORD, newPassword: "another-pass-1" }, { cookie, origin: "https://recorte.test", host: "recorte.test" });
    expect(good.status).toBe(200);
  });
  it("Bearer requests ignore Origin", async () => {
    const t = await makeApp({ user: true });
    const token = await deviceToken(t);
    const r = await t.app.request("/api/auth/ticket", { method: "POST", headers: { authorization: `Bearer ${token}`, origin: "chrome-extension://abc", host: "recorte.test" } });
    expect(r.status).toBe(200);
  });
});

describe("devices", () => {
  it("POST /api/devices works from extension origins without Bearer", async () => {
    const t = await makeApp({ user: true });
    for (const origin of ["chrome-extension://abc", "moz-extension://abc"]) {
      const r = await t.json("/api/devices", { email: EMAIL, password: PASSWORD, name: "x" }, { origin });
      expect(r.status).toBe(201);
    }
  });
  it("rejects over-long credentials and oversized bodies", async () => {
    const t = await makeApp({ user: true });
    expect((await t.json("/api/login", { email: EMAIL, password: "a".repeat(300) })).status).toBe(400);
    expect((await t.json("/api/devices", { email: EMAIL, password: "a".repeat(300), name: "x" })).status).toBe(400);
    const big = await t.json("/api/login", { email: EMAIL, password: "a", pad: "x".repeat(20_000) });
    expect(big.status).toBe(413);
  });
  it("issues a token, stores only its hash, lists with lastSeen/version", async () => {
    const t = await makeApp({ user: true });
    const token = await deviceToken(t, "Chrome PC");
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const stored = t.db.prepare("SELECT token_hash FROM devices").get() as { token_hash: string };
    expect(stored.token_hash).not.toContain(token);
    const me = await t.app.request("/api/me", { headers: { authorization: `Bearer ${token}`, "x-extension-version": "0.1.7" } });
    expect(me.status).toBe(200);
    const list = (await (await t.app.request("/api/devices", { headers: { authorization: `Bearer ${token}` } })).json()) as any[];
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ name: "Chrome PC", extensionVersion: "0.1.7" });
    expect(list[0].lastSeenAt).toBeTruthy();
  });
  it("rejects bad credentials", async () => {
    const t = await makeApp({ user: true });
    expect((await t.json("/api/devices", { email: EMAIL, password: "nope-nope-nope", name: "x" })).status).toBe(401);
  });
  it("revoked device gets 401", async () => {
    const t = await makeApp({ user: true });
    const cookie = await login(t);
    const token = await deviceToken(t);
    const h = { authorization: `Bearer ${token}` };
    expect((await t.app.request("/api/me", { headers: h })).status).toBe(200);
    const id = ((await (await t.app.request("/api/devices", { headers: { cookie } })).json()) as { id: string }[])[0]!.id;
    expect((await t.app.request(`/api/devices/${id}`, { method: "DELETE", headers: { cookie } })).status).toBe(200);
    const r = await t.app.request("/api/me", { headers: h });
    expect(r.status).toBe(401);
    expect(await r.json()).toEqual({ error: "unauthorized" });
    expect((await t.app.request(`/api/devices/${id}`, { method: "DELETE", headers: { cookie } })).status).toBe(404);
  });
  it("invalid bearer is 401 even with a valid cookie", async () => {
    const t = await makeApp({ user: true });
    const cookie = await login(t);
    expect((await t.app.request("/api/me", { headers: { cookie, authorization: "Bearer junk" } })).status).toBe(401);
  });
});

describe("tickets", () => {
  it("works once then 401; sets cookie and redirects", async () => {
    const t = await makeApp({ user: true });
    const token = await deviceToken(t);
    const tr = await t.app.request("/api/auth/ticket", { method: "POST", headers: { authorization: `Bearer ${token}` } });
    const { ticket, url } = (await tr.json()) as { ticket: string; url: string };
    expect(url).toContain(`/auth/ticket?t=${ticket}`);
    const r1 = await t.app.request(`/auth/ticket?t=${ticket}`);
    expect(r1.status).toBe(302);
    expect(r1.headers.get("location")).toBe("/");
    const cookie = cookieOf(r1);
    expect((await t.app.request("/api/me", { headers: { cookie } })).status).toBe(200);
    const used = await t.app.request(`/auth/ticket?t=${ticket}`);
    expect(used.status).toBe(302);
    expect(used.headers.get("location")).toBe("/login");
  });
  it("redirects invalid ticket to /login", async () => {
    const t = await makeApp({ user: true });
    const r = await t.app.request("/auth/ticket?t=zzz");
    expect(r.status).toBe(302);
    expect(r.headers.get("location")).toBe("/login");
  });
  it("expires after 60 s", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const t = await makeApp({ user: true });
      const token = await deviceToken(t);
      const { ticket } = (await (await t.app.request("/api/auth/ticket", { method: "POST", headers: { authorization: `Bearer ${token}` } })).json()) as { ticket: string };
      vi.setSystemTime(Date.now() + 61_000);
      const r = await t.app.request(`/auth/ticket?t=${ticket}`);
      expect(r.status).toBe(302);
      expect(r.headers.get("location")).toBe("/login");
    } finally {
      vi.useRealTimers();
    }
  });
  it("missing ticket redirects to /login", async () => {
    const t = await makeApp({ user: true });
    expect((await t.app.request("/auth/ticket")).status).toBe(302);
  });
});

describe("password change", () => {
  it("requires the current password, then old fails and new works; other sessions closed, devices kept", async () => {
    const t = await makeApp({ user: true });
    const cookie = await login(t);
    const other = await login(t);
    const token = await deviceToken(t);
    const bad = await t.json("/api/me/password", { currentPassword: "wrong-wrong", newPassword: "brand-new-pass" }, { cookie });
    expect(bad.status).toBe(403);
    const short = await t.json("/api/me/password", { currentPassword: PASSWORD, newPassword: "short" }, { cookie });
    expect(short.status).toBe(400);
    const ok = await t.json("/api/me/password", { currentPassword: PASSWORD, newPassword: "brand-new-pass" }, { cookie });
    expect(ok.status).toBe(200);
    expect((await t.json("/api/login", { email: EMAIL, password: PASSWORD })).status).toBe(401);
    expect((await t.json("/api/login", { email: EMAIL, password: "brand-new-pass" })).status).toBe(200);
    expect((await t.app.request("/api/me", { headers: { cookie } })).status).toBe(200);
    expect((await t.app.request("/api/me", { headers: { cookie: other } })).status).toBe(401);
    expect((await t.app.request("/api/me", { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
  });
});

describe("cli reset-password", () => {
  it("resets the password, closes sessions", async () => {
    const t = await makeApp({ user: true });
    const cookie = await login(t);
    const dev = await deviceToken(t);
    process.env.DATA_DIR = t.dir;
    const out: string[] = [];
    expect(await runCli(["reset-password", EMAIL, "--password", "fresh-password-1"], (m) => out.push(m))).toBe(0);
    expect(out.join("\n")).not.toContain("fresh-password-1");
    expect((await t.app.request("/api/me", { headers: { cookie } })).status).toBe(401);
    expect((await t.app.request("/api/me", { headers: { authorization: `Bearer ${dev}` } })).status).toBe(401);
    expect((await t.json("/api/login", { email: EMAIL, password: "fresh-password-1" })).status).toBe(200);
    expect(await runCli(["reset-password", EMAIL, "--password", "short"], (m) => out.push(m))).toBe(2);
    expect(await runCli(["reset-password", "--password", "fresh-password-2"], (m) => out.push(m))).toBe(2); // the email is required
    expect(await runCli(["reset-password", "outro@x.io"], (m) => out.push(m))).toBe(1); // unknown account
    expect(await runCli(["reset-password", EMAIL], (m) => out.push(m))).toBe(0);
    const generated = out.find((m) => m.startsWith("New password"))!.split("\n")[0]!.split(": ")[1]!;
    expect((await t.json("/api/login", { email: EMAIL, password: generated })).status).toBe(200);
    delete process.env.DATA_DIR;
  });
  it("fails when there is no owner yet", async () => {
    const t = await makeApp();
    process.env.DATA_DIR = t.dir;
    const out: string[] = [];
    expect(await runCli(["reset-password", EMAIL], (m) => out.push(m))).toBe(1);
    expect(out[0]).toMatch(/\/setup/);
    delete process.env.DATA_DIR;
  });
});
