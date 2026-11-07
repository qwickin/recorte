import { API, type ItemSummary } from "@recorte/shared";
import { useEffect, useRef } from "react";

export type ItemEvents = {
  onCreated?: (it: ItemSummary) => void;
  onUpdated?: (it: ItemSummary) => void;
  onDeleted?: (id: string) => void;
};

/** Subscribes to /api/events (SSE). EventSource reconnects by itself after network errors. */
export function useEvents(handlers: ItemEvents, enabled = true) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;
    const es = new EventSource(API.events, { withCredentials: true });
    const parse = <T,>(e: MessageEvent): T | null => {
      try {
        return JSON.parse(e.data) as T;
      } catch {
        return null;
      }
    };
    es.addEventListener("item.created", (e) => {
      const it = parse<ItemSummary>(e as MessageEvent);
      if (it) ref.current.onCreated?.(it);
    });
    es.addEventListener("item.updated", (e) => {
      const it = parse<ItemSummary>(e as MessageEvent);
      if (it) ref.current.onUpdated?.(it);
    });
    es.addEventListener("item.deleted", (e) => {
      const d = parse<{ id: string }>(e as MessageEvent);
      if (d) ref.current.onDeleted?.(d.id);
    });
    return () => es.close();
  }, [enabled]);
}
