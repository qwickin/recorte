import type { Hono } from "hono";
import { type AppEnv, requireUser } from "../auth/middleware";
import type { Deps } from "../deps";
import { itemsRepo } from "../items/repo";
import { toSearchDoc } from "../items/service";

/** Rebuilds the SQLite mirror of the user's items from their meta.json files, then re-indexes search. */
export async function rebuildIndex(deps: Deps, userId: string): Promise<{ items: number; removed: number; indexed: boolean }> {
  const repo = itemsRepo(deps.db);
  const onDisk = new Set<string>();
  const live = [];
  for (const id of deps.storage.listItemIds(userId)) {
    const m = deps.storage.readMeta(userId, id);
    if (!m || m.userId !== userId) continue;
    onDisk.add(id);
    repo.upsertFromMeta(m);
    if (!m.deletedAt) live.push(toSearchDoc(m));
  }
  let removed = 0;
  for (const id of repo.allIds(userId)) {
    if (!onDisk.has(id)) (repo.deleteRow(id), removed++);
  }
  let indexed = true;
  try {
    await deps.search.replaceAll(userId, live);
  } catch (e) {
    indexed = false;
    console.warn("reindex: search rebuild failed:", (e as Error).message);
  }
  return { items: onDisk.size, removed, indexed };
}

/** Phase 1 has a single owner account, so any signed-in user is the admin. */
export function adminRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const auth = requireUser(deps.db);
  const repo = itemsRepo(deps.db);

  app.post("/api/admin/reprocess", auth, (c) => {
    const userId = c.var.userId;
    const ids = repo.liveIds(userId);
    for (const id of ids) deps.queue.enqueue("process", { id, userId });
    return c.json({ queued: ids.length });
  });

  app.post("/api/admin/reindex", auth, async (c) => c.json(await rebuildIndex(deps, c.var.userId)));
}
