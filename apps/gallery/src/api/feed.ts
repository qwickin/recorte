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

/**
 * Whether a live item (SSE) belongs inside the loaded part of the feed. Past the last loaded item it must wait
 * for its page, or later pages would append after it out of keyset order (e.g. a capture that waited offline
 * and is dated when it was taken, or a restored old item).
 */
export function inLoadedRange(items: ItemSummary[], hasMore: boolean, it: ItemSummary): boolean {
  if (!hasMore) return true;
  const last = items.at(-1);
  return !!last && newerFirst(it, last) < 0;
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

export type FeedState = {
  items: ItemSummary[];
  hasMore: boolean;
  loading: boolean;
  stale: boolean; // showing the previous filter's items while the new first page loads
  total: number | null;
  /** A code, not copy: the page shows its own translated message. */
  error: "load_failed" | null;
};

export const INITIAL_FEED: FeedState = { items: [], hasMore: true, loading: false, stale: false, total: null, error: null };

/**
 * Feed state machine behind useItemFeed, free of React so it can be tested.
 * Only `reset` aborts: it replaces the pager and its AbortController. `loadMore` reuses the live
 * controller, so a second page is never requested with an already aborted signal.
 */
export function createFeedLoader(
  list: (cursor: string | null, signal: AbortSignal) => Promise<ItemPage>,
  onChange: (s: FeedState) => void,
) {
  let state = INITIAL_FEED;
  let ctrl = new AbortController();
  let pager: Pager | null = null;
  const set = (s: FeedState) => {
    state = s;
    onChange(s);
  };

  async function run(reset: boolean) {
    if (reset) {
      ctrl.abort();
      ctrl = new AbortController();
      const signal = ctrl.signal;
      pager = createPager((cursor) => list(cursor, signal));
      set({ ...INITIAL_FEED, items: state.items, stale: state.items.length > 0, loading: true, total: state.total });
    } else {
      if (!pager || state.loading || !state.hasMore || state.stale) return;
      set({ ...state, loading: true, error: null });
    }
    const p = pager!;
    try {
      const page = await p.next();
      if (p !== pager) return; // a reset happened meanwhile
      if (!page) return set({ ...state, loading: false, hasMore: false });
      set({ items: mergePage(state.items, page, reset), hasMore: !p.done, loading: false, stale: false, total: page.total, error: null });
    } catch (e) {
      if (p !== pager || (e as Error).name === "AbortError") return;
      set({ ...state, loading: false, stale: false, error: "load_failed" });
    }
  }

  return {
    get state() {
      return state;
    },
    reset: () => run(true),
    loadMore: () => run(false),
    dispose: () => ctrl.abort(),
    /** Local edits / SSE: patch the items without touching the cursor. */
    update(fn: (s: FeedState) => FeedState) {
      set(fn(state));
    },
  };
}
