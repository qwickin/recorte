import { API, type ItemSummary } from "@recorte/shared";
import { useEffect, useRef } from "react";
import { api } from "../api";

export type ItemEvents = {
  onCreated?: (it: ItemSummary) => void;
  onUpdated?: (it: ItemSummary) => void;
  onDeleted?: (id: string) => void;
};

const MIN_DELAY = 1_000;
const MAX_DELAY = 30_000;

/**
 * Subscribes to /api/events (SSE). On any stream error the connection is closed and the session is
 * checked: a 401 sends the user to /login (via the client), anything else reconnects with backoff.
 */
export function useEvents(handlers: ItemEvents, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    let es: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let delay = MIN_DELAY;
    let stopped = false;

    const parse = <T,>(e: Event): T | null => {
      try {
        return JSON.parse((e as MessageEvent).data) as T;
      } catch {
        return null;
      }
    };

    const connect = () => {
      if (stopped) return;
      es = new EventSource(API.events, { withCredentials: true });
      es.onopen = () => (delay = MIN_DELAY);
      es.addEventListener("item.created", (e) => {
        const it = parse<ItemSummary>(e);
        if (it) ref.current.onCreated?.(it);
      });
      es.addEventListener("item.updated", (e) => {
        const it = parse<ItemSummary>(e);
        if (it) ref.current.onUpdated?.(it);
      });
      es.addEventListener("item.deleted", (e) => {
        const d = parse<{ id: string }>(e);
        if (d) ref.current.onDeleted?.(d.id);
      });
      es.onerror = () => {
        es?.close();
        es = null;
        if (stopped) return;
        api.me().then(
          () => schedule(),
          (err: { status?: number }) => err.status !== 401 && schedule(), // 401: the client already redirected
        );
      };
    };

    const schedule = () => {
      if (stopped) return;
      timer = setTimeout(connect, delay);
      delay = Math.min(MAX_DELAY, delay * 2);
    };

    connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [enabled]);
}
