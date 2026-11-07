import { createReadStream, statSync } from "node:fs";
import { join } from "node:path";
import { Readable } from "node:stream";
import { API, type ExtensionInfo } from "@recorte/shared";
import type { Hono } from "hono";
import { type AppEnv, requireUser } from "../auth/middleware";
import type { Deps } from "../deps";

const FILES = new Set(["recorte-chrome.zip", "recorte-firefox.zip"]);

export function extensionRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const auth = requireUser(deps.db);
  app.get(API.extension, auth, (c) => {
    const info: ExtensionInfo = {
      version: deps.config.extensionVersion,
      chromeZip: API.downloadChrome,
      firefoxZip: API.downloadFirefox,
    };
    return c.json(info);
  });

  app.get("/downloads/:file", auth, (c) => {
    const file = c.req.param("file");
    if (!FILES.has(file)) return c.json({ error: "not_found" }, 404);
    const path = join(deps.config.downloadsDir, file);
    try {
      if (!statSync(path).isFile()) throw new Error();
    } catch {
      return c.json({ error: "not_found" }, 404);
    }
    return new Response(Readable.toWeb(createReadStream(path)) as ReadableStream, {
      headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="${file}"` },
    });
  });
}
