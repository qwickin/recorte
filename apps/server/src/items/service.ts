import type { Item, ItemPatch } from "@recorte/shared";
import { canonicalTags } from "@recorte/shared";
import type { Deps } from "../deps";
import type { SearchDoc } from "../search";
import { displayTitle, displayedTags, itemsRepo, summaryFromMeta } from "./repo";

export function toSearchDoc(m: Item): SearchDoc {
  return {
    id: m.id,
    userId: m.userId,
    type: m.type,
    site: m.source.site,
    title: displayTitle(m),
    note: m.user.note ?? "",
    description: m.ai.description ?? m.link?.description ?? m.text.meta.description ?? "",
    tags: [...new Set(displayedTags(m).map((t) => t.tag))],
    keys: m.ai.keys,
    // The selection first; the whole page's text fills what is left of the excerpt.
    text: [m.text.selection, ...(m.text.page?.nearHeadings ?? []), ...m.text.headings, ...m.text.alts, m.text.page?.text ?? ""]
      .filter(Boolean)
      .join("\n")
      .slice(0, 4000),
    colors: m.ai.colors,
    categoryId: m.user.categoryId,
    createdAt: m.createdAt,
  };
}

/** Writes meta.json (source of truth), mirrors to SQLite, best-effort search sync, emits SSE. */
export function itemService(deps: Deps) {
  const repo = itemsRepo(deps.db);

  /** Search is optional infrastructure: never fail a request because of it; retry via a job. */
  async function syncSearch(m: Item, op: "index" | "remove"): Promise<void> {
    try {
      if (op === "index") await deps.search.index(toSearchDoc(m));
      else await deps.search.remove(m.id);
    } catch (e) {
      console.warn(`search ${op} failed for ${m.id}:`, (e as Error).message);
      try {
        deps.queue.enqueue("index", { id: m.id, userId: m.userId, op });
      } catch (qe) {
        console.warn("could not enqueue index retry:", (qe as Error).message);
      }
    }
  }

  function persist(m: Item): void {
    deps.storage.writeMeta(m);
    repo.upsertFromMeta(m);
  }

  return {
    persist,
    syncSearch,

    async create(m: Item) {
      persist(m);
      deps.queue.enqueue("process", { id: m.id, userId: m.userId });
      const summary = summaryFromMeta(m);
      deps.events.emit(m.userId, { type: "item.created", data: summary });
      await syncSearch(m, "index");
      return summary;
    },

    /** Only the `user` block can change here; unknown keys are already stripped by ItemPatch. */
    async patch(userId: string, id: string, p: ItemPatch): Promise<Item | null> {
      const m = deps.storage.readMeta(userId, id);
      if (!m || m.deletedAt) return null;
      const user = { ...m.user };
      if (p.title !== undefined) user.title = p.title.trim() || undefined;
      if (p.note !== undefined) user.note = p.note.trim() || undefined;
      // Typed text that is a label of an AI tag (any of the five languages) is stored as its ID (PATCH and bulk).
      if (p.tags !== undefined) user.tags = canonicalTags(p.tags);
      if (p.categoryId !== undefined) user.categoryId = p.categoryId;
      if (p.hiddenAiTags !== undefined) user.hiddenAiTags = canonicalTags(p.hiddenAiTags);
      if (user.title === undefined) delete user.title;
      if (user.note === undefined) delete user.note;
      const next: Item = { ...m, user, updatedAt: new Date().toISOString() };
      persist(next);
      deps.events.emit(userId, { type: "item.updated", data: summaryFromMeta(next) });
      await syncSearch(next, "index");
      return next;
    },

    async softDelete(userId: string, id: string): Promise<boolean> {
      const m = deps.storage.readMeta(userId, id);
      if (!m) return false;
      if (m.deletedAt) return true;
      const now = new Date().toISOString();
      const next: Item = { ...m, deletedAt: now, updatedAt: now };
      persist(next);
      deps.events.emit(userId, { type: "item.deleted", data: { id } });
      await syncSearch(next, "remove");
      return true;
    },

    async restore(userId: string, id: string): Promise<Item | null> {
      const m = deps.storage.readMeta(userId, id);
      if (!m) return null;
      if (!m.deletedAt) return m;
      const next: Item = { ...m, deletedAt: null, updatedAt: new Date().toISOString() };
      persist(next);
      deps.events.emit(userId, { type: "item.created", data: summaryFromMeta(next) });
      await syncSearch(next, "index");
      return next;
    },
  };
}
