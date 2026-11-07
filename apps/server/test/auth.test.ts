import { describe, expect, it, vi } from "vitest";
import { bootstrap } from "../src/bootstrap";
import { loadConfig } from "../src/config";
import { migrate, MIGRATIONS } from "../src/db";
import { runCli } from "../src/cli";
import { findUserByEmail } from "../src/auth/users";
import { DatabaseSync } from "node:sqlite";
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

describe("boot", () => {
  it("logs setup URL and generates a token when no users and no ADMIN_*", async () => {
    const t = await makeApp();
    const log = vi.fn();
    const cfg = await bootstrap(t.db, loadConfig({ PORT: "9000" }), log);
    expect(cfg.setupToken).toBeTruthy();
    expect(log).toHaveBeenCalledWith(`Setup: open http://localhost:9000/setup — token: ${cfg.setupToken}`);
  });
  it("creates the owner from ADMIN_EMAIL/ADMIN_PASSWORD", async () => {
    const t = await makeApp();
    await bootstrap(t.db, loadConfig({ ADMIN_EMAIL: "A@x.io", ADMIN_PASSWORD: "longpassword" }), () => {});
    expect(findUserByEmail(t.db, "a@x.io")).toBeTruthy();
    expect((await t.json("/api/login", { email: "a@x.io", password: "longpassword" })).status).toBe(200);
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
  it("rejects wrong token", async () => {
    const t = await makeApp();
    const r = await t.json("/api/setup", { token: "nope", email: EMAIL, password: PASSWORD });
    expect(r.status).toBe(403);
  });
  it("creates owner, logs in, then second setup is 409", async () => {
    const t = await makeApp();
    const r = await t.json("/api/setup", { token: "tok-123", email: EMAIL, password: PASSWORD });
    expect(r.status).toBe(201);
    const cookie = cookieOf(r);
    expect((await t.app.request("/api/me", { headers: { cookie } })).status).toBe(200);
    const again = await t.json("/api/setup", { token: "tok-123", email: "b@x.io", password: PASSWORD });
    expect(again.status).toBe(409);
  });
  it("concurrent setups create a single owner", async () => {
    const t = await makeApp();
    const rs = await Promise.all(
      ["a@x.io", "b@x.io"].map((email) => t.json("/api/setup", { token: "tok-123", email, password: PASSWORD })),
    );
    expect(rs.map((r) => r.status).sort()).toEqual([201, 409]);
  });
  it("fails closed when the server has no setup token", async () => {
    const t = await makeApp({ env: { SETUP_TOKEN: "" } });
    expect((await t.json("/api/setup", { token: "", email: EMAIL, password: PASSWORD })).status).toBe(403);
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
    expect((await t.json("/api/login", { email: "no@x.io", password: "wrong-password" })).status).toBe(401);
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
    expect((await t.app.request("/api/me", { headers: { cookie } })).status).toBe(401);
    expect((await t.app.request("/api/me", { headers: { authorization: `Bearer ${dev}` } })).status).toBe(401);
    expect((await t.json("/api/login", { email: EMAIL, password: "fresh-password-1" })).status).toBe(200);
    expect(await runCli(["reset-password", "nobody@x.io"], (m) => out.push(m))).toBe(1);
    expect(await runCli(["reset-password", EMAIL], (m) => out.push(m))).toBe(0);
    const generated = out.find((m) => m.startsWith("New password"))!.split("\n")[0]!.split(": ")[1]!;
    expect((await t.json("/api/login", { email: EMAIL, password: generated })).status).toBe(200);
    delete process.env.DATA_DIR;
  });
});
