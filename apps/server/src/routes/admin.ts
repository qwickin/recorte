import type { Hono } from "hono";
import { type AppEnv, requireUser } from "../auth/middleware";
import type { Deps } from "../deps";
import { countUsers, findUserById } from "../auth/users";
import { itemsRepo } from "../items/repo";
import { toSearchDoc } from "../items/service";

export interface RebuildResult {
  /** Items restored into SQLite from their meta.json. */
  items: number;
  /** Rows dropped because the item's directory no longer exists. */
  removed: number;
  indexed: boolean;
  /** Item directories moved in from orphan user folders (see below). */
  adopted: number;
  /** Item directories whose meta.json could not be read: their rows are kept, nothing is rebuilt for them. */
  unreadable: number;
}

/**
 * Rebuilds the SQLite mirror of the user's items from their meta.json files, then re-indexes search.
 *
 * Phase 1 has one owner. When app.db is lost, `/setup` creates the owner again with a new id and the files
 * stay under `items/<old id>/`. So, while there is exactly one account, folders of user ids that no longer
 * exist are adopted: moved under the current owner, with `userId` rewritten in meta.json.
 */
export async function rebuildIndex(deps: Deps, userId: string): Promise<RebuildResult> {
  const repo = itemsRepo(deps.db);
  const singleOwner = countUsers(deps.db) === 1;
  let adopted = 0;
  if (singleOwner) {
    for (const dir of deps.storage.listUserDirs()) {
      if (dir === userId || findUserById(deps.db, dir)) continue;
      const { moved, skipped } = deps.storage.moveUserItems(dir, userId);
      adopted += moved.length;
      console.warn(`reindex: adopted ${moved.length} item(s) from orphan user folder ${dir}`);
      if (skipped.length) console.warn(`reindex: ${skipped.length} item(s) of ${dir} already exist for ${userId}; left in place:`, skipped.join(", "));
    }
  }

  const onDisk = new Set<string>();
  const live = [];
  let items = 0;
  let unreadable = 0;
  for (const id of deps.storage.listItemIds(userId)) {
    onDisk.add(id); // the directory exists: never drop its row, even if meta.json is unreadable right now
    let m = deps.storage.readMeta(userId, id);
    if (!m) {
      unreadable++;
      console.warn(`reindex: meta.json of ${id} is missing or unreadable; row kept, item not rebuilt`);
      continue;
    }
    if (m.userId !== userId) {
      if (!singleOwner) {
        console.warn(`reindex: ${id} belongs to ${m.userId} in its meta.json; skipped`);
        continue;
      }
      m = { ...m, userId };
      deps.storage.writeMeta(m);
    }
    repo.upsertFromMeta(m);
    items++;
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
  return { items, removed, indexed, adopted, unreadable };
}

/** Phase 1 has a single owner account, so any signed-in user is the admin. */
export function adminRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const auth = requireUser(deps.db);
  const repo = itemsRepo(deps.db);

  app.post("/api/admin/reprocess", auth, (c) => {
    const userId = c.var.userId;
    const ids = repo.liveIds(userId);
    for (const id of ids) deps.queue.enqueue("process", { id, userId, refetch: true });
    return c.json({ queued: ids.length });
  });

  app.post("/api/admin/reindex", auth, async (c) => c.json(await rebuildIndex(deps, c.var.userId)));
}
