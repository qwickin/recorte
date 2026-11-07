import type { Db } from "../db";
import type { Storage } from "../storage";
import { itemsRepo } from "./repo";

export const TRASH_DAYS = 30;

/** Removes files and rows of items soft-deleted more than 30 days before `now`. Returns how many. */
export async function purgeTrash(ctx: { db: Db; storage: Storage }, now: Date = new Date()): Promise<number> {
  const repo = itemsRepo(ctx.db);
  const cutoff = new Date(now.getTime() - TRASH_DAYS * 86_400_000).toISOString();
  let n = 0;
  for (const { id, userId } of repo.expiredTrash(cutoff)) {
    try {
      ctx.storage.removeItem(userId, id);
      repo.deleteRow(id);
      n++;
    } catch (e) {
      console.warn(`purge failed for ${id}:`, (e as Error).message);
    }
  }
  return n;
}
