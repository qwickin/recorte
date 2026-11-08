import { topicId } from "@recorte/ai";
import { type Item, SCREENSHOT_TAG_IDS, canonicalTag, canonicalTags, isTagId } from "@recorte/shared";
import type { Deps } from "./deps";
import { itemsRepo } from "./items/repo";
import { itemService } from "./items/service";

/**
 * Version of the stored tags' format, kept in `settings.tagIdsVersion` (like `taggerVersion`).
 * - 1: AI tags are language-neutral IDs (packages/shared/src/tag-labels.ts) in `ai.topics`, `user.hiddenAiTags`,
 *   `user.tags` (typed labels), SQLite `item_tags` and the search index.
 */
export const TAG_IDS_VERSION = "1";

/** An AI tag as stored before IDs (a pt-PT topic name or a raw screenshot label) → its ID; IDs and the rest unchanged. */
export function legacyTagId(tag: string): string {
  if (isTagId(tag)) return tag;
  return topicId(tag) ?? (Object.hasOwn(SCREENSHOT_TAG_IDS, tag) ? SCREENSHOT_TAG_IDS[tag] : undefined) ?? tag;
}

const dedupe = (a: string[]): string[] => [...new Set(a)];
const same = (a: readonly string[] | undefined, b: readonly string[] | undefined) =>
  (a ?? []).length === (b ?? []).length && (a ?? []).every((x, i) => x === b![i]);

/**
 * The item with its tags as IDs, or null when nothing changes. Idempotent: an ID maps to itself, and no old pt-PT
 * name is the ID of another tag (packages/ai/test/topic-ids.test.ts).
 * - `ai.topics`: pt-PT names → IDs. `ai.tipo` / `ai.visual` keep the screenshot model's raw keys (mapped for display).
 * - `user.hiddenAiTags`: the AI tags the person removed, as the old UI showed them (pt-PT names or screenshot
 *   labels) → IDs; anything else through the same label matching as a typed tag.
 * - `user.tags`: typed tags that equal a label of a tag in any of the five languages → the ID (as at every write).
 */
export function migrateItemTags(m: Item): Item | null {
  const topics = m.ai.topics ? dedupe(m.ai.topics.map(legacyTagId)) : undefined;
  const hidden = dedupe(
    m.user.hiddenAiTags.map((t) => {
      const id = legacyTagId(t);
      return id !== t ? id : canonicalTag(t);
    }),
  ).filter(Boolean);
  const tags = canonicalTags(m.user.tags);
  if (same(topics, m.ai.topics) && same(hidden, m.user.hiddenAiTags) && same(tags, m.user.tags)) return null;
  return {
    ...m,
    ai: { ...m.ai, ...(topics ? { topics } : {}) },
    user: { ...m.user, tags, hiddenAiTags: hidden },
  };
}

/**
 * Once per TAG_IDS_VERSION, synchronously at startup, before the worker starts and before the tagger-upgrade retag
 * is queued (otherwise a retag job could run first and an AI tag the person removed would come back under its new
 * ID). Every item, trashed ones included, gets its tags as IDs: meta.json is rewritten through `persist` (meta.json
 * + SQLite) when something changed, and the SQLite mirror is rebuilt for the others too (an item showing the
 * screenshot fallback has raw labels in `item_tags`). Each live item gets an `index` job, so the search index gets
 * the new tag fields; the pipeline never writes `user`, which is why this is not part of the retag.
 * Safe to run again after a crash halfway (the version is written last; the mapping is idempotent).
 */
export function migrateTagIds(deps: Deps): { items: number; changed: number; failed?: number } {
  const row = deps.db.prepare("SELECT value FROM settings WHERE key = 'tagIdsVersion'").get() as { value: string } | undefined;
  if (row?.value === TAG_IDS_VERSION) return { items: 0, changed: 0 };
  const svc = itemService(deps);
  const repo = itemsRepo(deps.db);
  const rows = deps.db.prepare("SELECT id, user_id AS userId FROM items ORDER BY created_at DESC").all() as { id: string; userId: string }[];
  let changed = 0;
  let failed = 0;
  for (const { id, userId } of rows) {
    try {
      const m = deps.storage.readMeta(userId, id);
      if (!m) continue;
      const next = migrateItemTags(m);
      if (next) {
        svc.persist(next);
        changed++;
      } else repo.upsertFromMeta(m);
      if (!m.deletedAt) deps.queue.enqueue("index", { id, userId });
    } catch (e) {
      // One unreadable item must not keep the server from starting; it keeps its old tags.
      failed++;
      console.warn(`tag migration failed for ${id}:`, (e as Error).message);
    }
  }
  // Not marked done: the next start tries again (the mapping is idempotent), and the caller holds the retag back.
  if (failed) return { items: rows.length, changed, failed };
  deps.db
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES ('tagIdsVersion', ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .run(TAG_IDS_VERSION, new Date().toISOString());
  if (rows.length) console.log(`tag IDs v${TAG_IDS_VERSION}: migrated ${rows.length} item(s), ${changed} changed; reindexing in the background`);
  return { items: rows.length, changed };
}
