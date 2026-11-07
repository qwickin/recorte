import { API, SettingsPatch } from "@recorte/shared";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { type AppEnv, requireSession, requireUser } from "../auth/middleware";
import type { Deps } from "../deps";
import { settingsView, updateSettings } from "../settings";

/**
 * Server settings (public URL, cloud AI). Reading works with any credential; writing needs a browser session
 * (the Origin check applies): a device token must not be able to point the cloud AI somewhere else.
 */
export function settingsRoutes(app: Hono<AppEnv>, { db, config }: Deps): void {
  const auth = requireUser(db);
  const limit = bodyLimit({ maxSize: 16 * 1024, onError: (c) => c.json({ error: "payload_too_large" }, 413) });

  app.get(API.settings, auth, (c) => c.json(settingsView(db, config)));

  app.put(API.settings, limit, auth, requireSession, async (c) => {
    let parsed: ReturnType<typeof SettingsPatch.safeParse>;
    try {
      parsed = SettingsPatch.safeParse(await c.req.json());
    } catch {
      return c.json({ error: "invalid_request" }, 400);
    }
    if (!parsed.success) return c.json({ error: "invalid_request" }, 400);
    const r = updateSettings(db, config, parsed.data);
    if (!r.ok) return c.json({ error: r.error, keys: r.keys }, r.error === "overridden_by_env" ? 409 : 400);
    return c.json(settingsView(db, config));
  });
}
