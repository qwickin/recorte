import type { ItemSummary } from "@recorte/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Filters } from "../api";
import { createFeedLoader, INITIAL_FEED, upsertItem, type FeedState } from "../api/feed";

/** Keyset-paginated feed of items for the given filters (tags AND). `trash` lists the bin instead. */
export function useItemFeed(filters: Filters, { pageSize = 24, trash = false } = {}) {
  const [feed, setFeed] = useState<FeedState>(INITIAL_FEED);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const loaderRef = useRef<ReturnType<typeof createFeedLoader> | null>(null);
  if (!loaderRef.current) {
    loaderRef.current = createFeedLoader(
      (cursor, signal) => api.listItems({ filters: filtersRef.current, cursor, limit: pageSize, trash, signal }),
      setFeed,
    );
  }
  const loader = loaderRef.current;
  const key = JSON.stringify(filters);

  useEffect(() => {
    void loader.reset();
  }, [key, loader]);
  useEffect(() => () => loader.dispose(), [loader]);

  const loadMore = useCallback(() => void loader.loadMore(), [loader]);
  const reload = useCallback(() => void loader.reset(), [loader]);

  /** Live updates (SSE / local edits). */
  const upsert = useCallback(
    (it: ItemSummary) =>
      loader.update((f) => {
        const known = f.items.some((x) => x.id === it.id);
        return { ...f, items: upsertItem(f.items, it), total: f.total === null ? f.total : f.total + (known ? 0 : 1) };
      }),
    [loader],
  );
  const remove = useCallback(
    (ids: string[]) => {
      const set = new Set(ids);
      loader.update((f) => {
        const items = f.items.filter((x) => !set.has(x.id));
        return { ...f, items, total: f.total === null ? null : Math.max(0, f.total - (f.items.length - items.length)) };
      });
    },
    [loader],
  );

  return { ...feed, loadMore, reload, upsert, remove };
}
