import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach } from "vitest";
import { createApp, type Deps } from "../src/app";
import { loadConfig } from "../src/config";
import { openDb } from "../src/db";
import { createUser } from "../src/auth/users";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

export const EMAIL = "owner@example.com";
export const PASSWORD = "correct horse battery";

export async function makeApp(opts: { user?: boolean; env?: Record<string, string>; deps?: Partial<Deps> } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "recorte-test-"));
  dirs.push(dir);
  const config = loadConfig({ DATA_DIR: dir, SETUP_TOKEN: "tok-123", ...opts.env });
  const db = openDb(dir);
  if (opts.user) await createUser(db, EMAIL, PASSWORD);
  const app = createApp({ db, config, ...opts.deps });
  const json = (path: string, body: unknown, headers: Record<string, string> = {}, method = "POST") =>
    app.request(path, { method, headers: { "content-type": "application/json", ...headers }, body: JSON.stringify(body) });
  return { app, db, config, dir, json };
}

export const cookieOf = (res: Response): string => {
  const sc = res.headers.get("set-cookie") ?? "";
  return sc.split(";")[0] ?? "";
};

export async function login(t: Awaited<ReturnType<typeof makeApp>>): Promise<string> {
  return cookieOf(await t.json("/api/login", { email: EMAIL, password: PASSWORD }));
}

export async function deviceToken(t: Awaited<ReturnType<typeof makeApp>>, name = "Chrome"): Promise<string> {
  const r = await t.json("/api/devices", { email: EMAIL, password: PASSWORD, name });
  return ((await r.json()) as { token: string }).token;
}
