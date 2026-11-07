import { describe, expect, it, vi } from "vitest";
import { createApp } from "../src/app";
import { cloudFromSettings } from "../src/runtime";
import { effectiveSettings, maskKey, normalizePublicUrl } from "../src/settings";
import { deviceToken, login, makeApp } from "./helpers";

type T = Awaited<ReturnType<typeof makeApp>>;
const put = (t: T, cookie: string, body: unknown, headers: Record<string, string> = {}) => t.json("/api/settings", body, { cookie, ...headers }, "PUT");
const get = async (t: T, cookie: string) => (await (await t.app.request("/api/settings", { headers: { cookie } })).json()) as Record<string, { value: string | null; source: string; set?: boolean }>;

describe("settings", () => {
  it("empty by default, editable (source db); the cloud key is masked", async () => {
    const t = await makeApp({ user: true });
    const cookie = await login(t);
    expect(await get(t, cookie)).toEqual({
      publicUrl: { value: null, source: "db" },
      aiCloudUrl: { value: null, source: "db" },
      aiCloudModel: { value: null, source: "db" },
      aiCloudKey: { value: null, set: false, source: "db" },
    });
    const r = await put(t, cookie, { publicUrl: "http://192.168.1.20:8080/", aiCloudUrl: "https://llm.test/v1/", aiCloudKey: "sk-secret-123456789", aiCloudModel: "gpt-x" });
    expect(r.status).toBe(200);
    const s = await get(t, cookie);
    expect(s.publicUrl).toEqual({ value: "http://192.168.1.20:8080", source: "db" });
    expect(s.aiCloudUrl!.value).toBe("https://llm.test/v1");
    expect(s.aiCloudKey).toEqual({ value: "••••6789", set: true, source: "db" });
    expect(JSON.stringify(s)).not.toContain("sk-secret");
    expect(effectiveSettings(t.db, t.config).aiCloudKey).toBe("sk-secret-123456789");
  });

  it("omitted keys stay, null or empty clears, a masked key sent back is ignored", async () => {
    const t = await makeApp({ user: true });
    const cookie = await login(t);
    await put(t, cookie, { aiCloudKey: "sk-secret-123456789", aiCloudModel: "m" });
    await put(t, cookie, { aiCloudKey: "••••6789", aiCloudModel: "m2" });
    expect(effectiveSettings(t.db, t.config)).toMatchObject({ aiCloudKey: "sk-secret-123456789", aiCloudModel: "m2" });
    await put(t, cookie, { aiCloudKey: null, aiCloudModel: "" });
    expect(effectiveSettings(t.db, t.config)).toMatchObject({ aiCloudKey: null, aiCloudModel: null });
  });

  it("environment variables override the DB and cannot be changed in the gallery", async () => {
    const t = await makeApp({ user: true, env: { PUBLIC_URL: "https://r.example.pt", AI_CLOUD_KEY: "env-key-abcdefghijkl" } });
    const cookie = await login(t, { origin: "https://r.example.pt" });
    const s = await get(t, cookie);
    expect(s.publicUrl).toEqual({ value: "https://r.example.pt", source: "env" });
    expect(s.aiCloudKey).toEqual({ value: "••••ijkl", set: true, source: "env" });
    const r = await put(t, cookie, { publicUrl: "http://other.test" }, { origin: "https://r.example.pt" });
    expect(r.status).toBe(409);
    expect(await r.json()).toEqual({ error: "overridden_by_env", keys: ["publicUrl"] });
    expect((await put(t, cookie, { aiCloudModel: "m" }, { origin: "https://r.example.pt" })).status).toBe(200);
  });

  it("validates URLs and unknown keys", async () => {
    const t = await makeApp({ user: true });
    const cookie = await login(t);
    expect((await put(t, cookie, { publicUrl: "ftp://x" })).status).toBe(400);
    expect((await put(t, cookie, { publicUrl: "http://x.test/sub/path" })).status).toBe(400);
    expect((await put(t, cookie, { aiCloudUrl: "javascript:alert(1)" })).status).toBe(400);
    expect((await put(t, cookie, { other: "x" })).status).toBe(400);
    expect(normalizePublicUrl(" https://R.example.pt:8443/ ")).toBe("https://r.example.pt:8443");
    expect(maskKey("short")).toBe("••••");
  });

  it("needs a session: 401 anonymous; a device token can read but not write", async () => {
    const t = await makeApp({ user: true });
    expect((await t.app.request("/api/settings")).status).toBe(401);
    expect((await t.json("/api/settings", { aiCloudModel: "m" }, {}, "PUT")).status).toBe(401);
    const token = await deviceToken(t);
    expect((await t.app.request("/api/settings", { headers: { authorization: `Bearer ${token}` } })).status).toBe(200);
    const r = await t.json("/api/settings", { aiCloudUrl: "https://evil.test" }, { authorization: `Bearer ${token}` }, "PUT");
    expect(r.status).toBe(403);
    expect(effectiveSettings(t.db, t.config).aiCloudUrl).toBeNull();
  });

  it("the Origin check follows the saved public URL at once (and survives a bad stored value)", async () => {
    const t = await makeApp({ user: true });
    const cookie = await login(t);
    const pw = (origin: string) => t.json("/api/me/password", { currentPassword: "x", newPassword: "yyyyyyyyyy" }, { cookie, origin, host: "10.0.0.5:8080" });
    expect((await pw("https://recorte.example.pt")).status).toBe(403); // forbidden_origin
    expect((await put(t, cookie, { publicUrl: "https://recorte.example.pt" }, { origin: "http://10.0.0.5:8080", host: "10.0.0.5:8080" })).status).toBe(200);
    expect((await pw("https://recorte.example.pt")).status).toBe(403);
    expect(await (await pw("https://recorte.example.pt")).json()).toEqual({ error: "invalid_credentials" }); // passed the Origin check
    // A corrupt value never takes the API down.
    t.db.prepare("UPDATE settings SET value = 'not a url' WHERE key = 'publicUrl'").run();
    expect((await pw("http://10.0.0.5:8080")).status).toBe(403);
    expect(await (await pw("http://10.0.0.5:8080")).json()).toEqual({ error: "invalid_credentials" });
  });

  it("ticket URLs use the saved public URL", async () => {
    const t = await makeApp({ user: true });
    const cookie = await login(t);
    await put(t, cookie, { publicUrl: "https://recorte.example.pt" });
    const token = await deviceToken(t);
    const { url } = (await (await t.app.request("/api/auth/ticket", { method: "POST", headers: { authorization: `Bearer ${token}` } })).json()) as { url: string };
    expect(url.startsWith("https://recorte.example.pt/auth/ticket?t=")).toBe(true);
  });

  it("cloud AI is read from the settings per job and rebuilt only when they change", async () => {
    const t = await makeApp({ user: true });
    const cookie = await login(t);
    const make = vi.fn((c: { url: string; key: string; model: string }) => Object.assign(async () => ({ keys: [] }), { cfg: c }));
    const get = cloudFromSettings({ db: t.db, config: t.config }, make);
    expect(get()).toBeNull();
    await put(t, cookie, { aiCloudUrl: "https://llm.test/v1", aiCloudKey: "k-123456789012", aiCloudModel: "m" });
    const a = get();
    expect(a).not.toBeNull();
    expect(get()).toBe(a);
    expect(make).toHaveBeenCalledTimes(1);
    await put(t, cookie, { aiCloudModel: "m2" });
    expect(get()).not.toBe(a);
    expect(make).toHaveBeenLastCalledWith({ url: "https://llm.test/v1", key: "k-123456789012", model: "m2" });
    await put(t, cookie, { aiCloudKey: null });
    expect(get()).toBeNull();
  });

  it("createApp works with a DB that already has settings (no boot-time snapshot)", async () => {
    const t = await makeApp({ user: true });
    const cookie = await login(t);
    await put(t, cookie, { publicUrl: "https://a.test" });
    const app2 = createApp({ db: t.db, config: t.config });
    const r = await app2.request("/api/logout", { method: "POST", headers: { cookie, origin: "https://a.test", host: "b.test" } });
    expect(r.status).toBe(200);
  });
});
