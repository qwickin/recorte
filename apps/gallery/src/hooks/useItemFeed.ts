import type { ItemSummary } from "@recorte/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, type Filters } from "../api";
import { createPager, mergePage, upsertItem, type Pager } from "../api/feed";

type Feed = {
  items: ItemSummary[];
  hasMore: boolean;
  loading: boolean;
  stale: boolean; // showing the previous filter's items while the new first page loads
  total: number | null;
  error: string | null;
};

const INITIAL: Feed = { items: [], hasMore: true, loading: false, stale: false, total: null, error: null };

/** Keyset-paginated feed of items for the given filters (tags AND). `trash` lists the bin instead. */
export function useItemFeed(filters: Filters, { pageSize = 24, trash = false } = {}) {
  const [feed, setFeed] = useState<Feed>(INITIAL);
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const filtersRef = useRef(filters);
  filtersRef.current = filters;
  const pagerRef = useRef<Pager | null>(null);
  const ctrlRef = useRef<AbortController | null>(null);
  const key = JSON.stringify(filters);

  const load = useCallback(
    async (reset: boolean) => {
      const cur = feedRef.current;
      if (!reset && (cur.loading || !cur.hasMore || cur.stale)) return;
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      if (reset || !pagerRef.current) {
        pagerRef.current = createPager((cursor) =>
          api.listItems({ filters: filtersRef.current, cursor, limit: pageSize, trash, signal: ctrl.signal }),
        );
      }
      const pager = pagerRef.current;
      const next: Feed = reset
        ? { ...INITIAL, items: cur.items, stale: cur.items.length > 0, loading: true, total: cur.total }
        : { ...cur, loading: true, error: null };
      feedRef.current = next;
      setFeed(next);
      try {
        const page = await pager.next();
        if (ctrl.signal.aborted || !page) return;
        setFeed((f) => ({
          items: mergePage(f.items, page, reset),
          hasMore: !pager.done,
          loading: false,
          stale: false,
          total: page.total,
          error: null,
        }));
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setFeed((f) => ({ ...f, loading: false, stale: false, error: "Não foi possível carregar mais capturas." }));
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, pageSize, trash],
  );

  useEffect(() => {
    load(true);
    return () => ctrlRef.current?.abort();
  }, [load]);

  const loadMore = useCallback(() => load(false), [load]);
  const reload = useCallback(() => load(true), [load]);

  /** Live updates (SSE / local edits). */
  const upsert = useCallback((it: ItemSummary) => {
    setFeed((f) => {
      const known = f.items.some((x) => x.id === it.id);
      return { ...f, items: upsertItem(f.items, it), total: f.total === null ? f.total : f.total + (known ? 0 : 1) };
    });
  }, []);
  const remove = useCallback((ids: string[]) => {
    const set = new Set(ids);
    setFeed((f) => {
      const items = f.items.filter((x) => !set.has(x.id));
      return { ...f, items, total: f.total === null ? null : Math.max(0, f.total - (f.items.length - items.length)) };
    });
  }, []);

  return { ...feed, loadMore, reload, upsert, remove };
}
