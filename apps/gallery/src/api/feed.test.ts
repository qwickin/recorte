import type { ItemPage, ItemSummary } from "@recorte/shared";
import { describe, expect, it } from "vitest";
import { createFeedLoader, type FeedState } from "./feed";

const item = (n: number): ItemSummary => ({
  id: `ID${String(n).padStart(3, "0")}`,
  type: "screenshot",
  site: "example.com",
  url: "https://example.com/",
  title: `#${n}`,
  createdAt: new Date(Date.UTC(2026, 0, 1) + n * 60_000).toISOString(),
  thumb: "",
  width: 640,
  height: 400,
  color: "#000",
  tags: [],
  hasNote: false,
});

/** Fake server over `total` items, pages of `size`, newest first; records each call's cursor and signal state. */
function fakeServer(total: number, size: number) {
  const all = Array.from({ length: total }, (_, i) => item(total - i));
  const calls: { cursor: string | null; abortedAtCall: boolean; signal: AbortSignal }[] = [];
  const list = async (cursor: string | null, signal: AbortSignal): Promise<ItemPage> => {
    calls.push({ cursor, abortedAtCall: signal.aborted, signal });
    await Promise.resolve();
    if (signal.aborted) throw new DOMException("Aborted", "AbortError");
    const start = cursor ? Number(cursor) : 0;
    const items = all.slice(start, start + size);
    return { items, nextCursor: start + size < total ? String(start + size) : null, total };
  };
  return { list, calls };
}

describe("createFeedLoader", () => {
  it("loads every page with a live signal (regression: 2nd page used an aborted signal)", async () => {
    const srv = fakeServer(30, 24);
    const states: FeedState[] = [];
    const feed = createFeedLoader(srv.list, (s) => states.push(s));
    await feed.reset();
    expect(feed.state.items).toHaveLength(24);
    expect(feed.state.hasMore).toBe(true);
    await feed.loadMore();
    expect(feed.state.items).toHaveLength(30);
    expect(feed.state.loading).toBe(false);
    expect(feed.state.hasMore).toBe(false);
    expect(srv.calls.map((c) => c.cursor)).toEqual([null, "24"]);
    expect(srv.calls.every((c) => !c.abortedAtCall && !c.signal.aborted)).toBe(true);
    await feed.loadMore(); // at the end: no request, not stuck loading
    expect(srv.calls).toHaveLength(2);
    expect(feed.state.loading).toBe(false);
  });

  it("ignores a second loadMore while one is in flight", async () => {
    const srv = fakeServer(60, 10);
    const feed = createFeedLoader(srv.list, () => {});
    await feed.reset();
    await Promise.all([feed.loadMore(), feed.loadMore()]);
    expect(srv.calls.map((c) => c.cursor)).toEqual([null, "10"]);
    expect(feed.state.items).toHaveLength(20);
  });

  it("a reset aborts the previous requests and drops their results", async () => {
    const srv = fakeServer(30, 10);
    const feed = createFeedLoader(srv.list, () => {});
    await feed.reset();
    const pending = feed.loadMore();
    const again = feed.reset(); // e.g. the filters changed
    await Promise.all([pending, again]);
    expect(srv.calls[1]!.signal.aborted).toBe(true);
    expect(srv.calls[2]!.cursor).toBeNull();
    expect(srv.calls[2]!.signal.aborted).toBe(false);
    expect(feed.state.items).toHaveLength(10);
    expect(feed.state.loading).toBe(false);
    await feed.loadMore();
    expect(feed.state.items).toHaveLength(20);
  });

  it("keeps the cursor after an error so retry asks for the same page", async () => {
    const srv = fakeServer(30, 10);
    let fail = true;
    const feed = createFeedLoader(async (cursor, signal) => {
      if (cursor === "10" && fail) {
        fail = false;
        throw new Error("network");
      }
      return srv.list(cursor, signal);
    }, () => {});
    await feed.reset();
    await feed.loadMore();
    expect(feed.state.error).not.toBeNull();
    expect(feed.state.loading).toBe(false);
    await feed.loadMore();
    expect(feed.state.error).toBeNull();
    expect(feed.state.items).toHaveLength(20);
  });
});
