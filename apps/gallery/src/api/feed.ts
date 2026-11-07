import type { ItemPage, ItemSummary } from "@recorte/shared";

/** Keyset order of the server: createdAt DESC, id DESC. */
export const newerFirst = (a: ItemSummary, b: ItemSummary) =>
  a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.id < b.id ? 1 : a.id > b.id ? -1 : 0;

/** Appends a page (or replaces everything on reset), never duplicating an id already shown. */
export function mergePage(items: ItemSummary[], page: ItemPage, reset: boolean): ItemSummary[] {
  if (reset) return page.items;
  const seen = new Set(items.map((i) => i.id));
  return [...items, ...page.items.filter((i) => !seen.has(i.id))];
}

/** Inserts or replaces one item in place, keeping keyset order (SSE: new captures and restores). */
export function upsertItem(items: ItemSummary[], it: ItemSummary): ItemSummary[] {
  const at = items.findIndex((x) => x.id === it.id);
  if (at >= 0) return items.map((x, i) => (i === at ? it : x));
  const pos = items.findIndex((x) => newerFirst(it, x) <= 0);
  if (pos === -1) return [...items, it];
  return [...items.slice(0, pos), it, ...items.slice(pos)];
}

export type Pager = {
  readonly cursor: string | null;
  readonly done: boolean;
  /** Loads the next page; `null` when the end was already reached. */
  next(): Promise<ItemPage | null>;
};

/** Cursor bookkeeping for keyset pagination: first call without cursor, then the server's nextCursor until null. */
export function createPager(load: (cursor: string | null) => Promise<ItemPage>): Pager {
  let cursor: string | null = null;
  let done = false;
  return {
    get cursor() {
      return cursor;
    },
    get done() {
      return done;
    },
    async next() {
      if (done) return null;
      const page = await load(cursor);
      cursor = page.nextCursor;
      done = page.nextCursor === null;
      return page;
    },
  };
}
