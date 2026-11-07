import { Readable } from "node:stream";
import { ZipArchive } from "archiver";
import type { Hono } from "hono";
import { type AppEnv, requireUser } from "../auth/middleware";
import type { Deps } from "../deps";
import { itemsRepo } from "../items/repo";

export function exportRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const repo = itemsRepo(deps.db);
  app.get("/api/export", requireUser(deps.db), (c) => {
    const userId = c.var.userId;
    const zip = new ZipArchive({ store: true });
    zip.on("warning", (e: Error) => console.warn("export warning:", e.message));
    zip.on("error", (e: Error) => console.error("export error:", e));
    (async () => {
      for (const id of repo.liveIds(userId)) {
        const meta = deps.storage.readMeta(userId, id);
        if (!meta) continue;
        zip.append(JSON.stringify({ ...meta, schemaVersion: 1 }, null, 2), { name: `${id}/meta.json` });
        for (const file of new Set(meta.media.flatMap((m) => [m.file, m.thumb]))) {
          const data = deps.storage.readFile(userId, id, file);
          if (data) zip.append(data, { name: `${id}/${file}` });
        }
      }
      await zip.finalize();
    })().catch((e) => zip.destroy(e));
    const stamp = new Date().toISOString().slice(0, 10);
    return new Response(Readable.toWeb(zip) as ReadableStream, {
      headers: { "content-type": "application/zip", "content-disposition": `attachment; filename="recorte-export-${stamp}.zip"` },
    });
  });
}
