import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/mock";
import type { Capture } from "../api/types";

type Feed = {
  items: Capture[];
  cursor: string | null;
  hasMore: boolean;
  loading: boolean;
  stale: boolean; // showing the previous filter's items while the new first page loads
  total: number | null;
  error: string | null;
};

const INITIAL: Feed = { items: [], cursor: null, hasMore: true, loading: false, stale: false, total: null, error: null };

/** Cursor-paginated feed of captures for the given tag filter (AND). */
export function useCaptureFeed(tags: string[], pageSize = 12) {
  const [feed, setFeed] = useState<Feed>(INITIAL);
  const feedRef = useRef(feed);
  feedRef.current = feed;
  const tagsRef = useRef(tags);
  tagsRef.current = tags;
  const ctrlRef = useRef<AbortController | null>(null);
  const key = tags.join("\u0000");

  const load = useCallback(
    async (reset: boolean) => {
      const cur = feedRef.current;
      if (!reset && (cur.loading || !cur.hasMore || cur.stale)) return;
      ctrlRef.current?.abort();
      const ctrl = new AbortController();
      ctrlRef.current = ctrl;
      const next: Feed = reset
        ? { ...INITIAL, items: cur.items, stale: cur.items.length > 0, loading: true, total: cur.total }
        : { ...cur, loading: true, error: null };
      feedRef.current = next;
      setFeed(next);
      try {
        const page = await api.listCaptures({ cursor: reset ? null : cur.cursor, tags: tagsRef.current, limit: pageSize, signal: ctrl.signal });
        setFeed((f) => ({
          items: reset ? page.items : [...f.items, ...page.items],
          cursor: page.nextCursor,
          hasMore: page.nextCursor !== null,
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
    [key, pageSize],
  );

  useEffect(() => {
    load(true);
    return () => ctrlRef.current?.abort();
  }, [load]);

  const loadMore = useCallback(() => load(false), [load]);
  return { ...feed, loadMore };
}
