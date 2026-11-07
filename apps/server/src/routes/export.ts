import { createReadStream, existsSync } from "node:fs";
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
    // Entries are appended one at a time: the next file is opened only after archiver finished the
    // previous one (and the consumer drained enough output), so at most one fd is open at once.
    const added = (): Promise<void> =>
      new Promise((resolve, reject) => {
        const done = () => (zip.off("entry", done), zip.off("error", fail), zip.off("close", done), resolve());
        const fail = (e: Error) => (zip.off("entry", done), zip.off("close", done), reject(e));
        zip.once("entry", done);
        zip.once("error", fail);
        zip.once("close", done);
      });
    const add = async (source: string | NodeJS.ReadableStream, name: string): Promise<void> => {
      const p = added();
      zip.append(source as string, { name });
      await p;
    };
    (async () => {
      for (const id of repo.liveIds(userId)) {
        if (zip.destroyed) return;
        const meta = deps.storage.readMeta(userId, id);
        if (!meta) continue;
        await add(JSON.stringify({ ...meta, schemaVersion: 1 }, null, 2), `${id}/meta.json`);
        for (const file of new Set(meta.media.flatMap((m) => [m.file, m.thumb]))) {
          const path = deps.storage.filePath(userId, id, file);
          if (path && existsSync(path)) await add(createReadStream(path), `${id}/${file}`);
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
