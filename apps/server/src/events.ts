import type { ItemSummary } from "@recorte/shared";

export type ItemEvent =
  | { type: "item.created"; data: ItemSummary }
  | { type: "item.updated"; data: ItemSummary }
  | { type: "item.deleted"; data: { id: string } };

/** Per-user in-process pub/sub feeding the SSE stream. */
export class EventBus {
  private subs = new Map<string, Set<(e: ItemEvent) => void>>();

  constructor(readonly heartbeatMs = 25_000) {}

  subscribe(userId: string, fn: (e: ItemEvent) => void): () => void {
    let set = this.subs.get(userId);
    if (!set) this.subs.set(userId, (set = new Set()));
    set.add(fn);
    return () => {
      set.delete(fn);
      if (set.size === 0) this.subs.delete(userId);
    };
  }

  emit(userId: string, event: ItemEvent): void {
    for (const fn of [...(this.subs.get(userId) ?? [])]) {
      try {
        fn(event);
      } catch {}
    }
  }
}
