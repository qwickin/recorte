import "fake-indexeddb/auto";
import type { UploadMeta } from "@recorte/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadResult } from "../lib/api";
import { IdbQueueStore, backoffMs, drainQueue, newQueueItem, openRecorteDb } from "../lib/queue";

const meta: UploadMeta = {
  type: "screenshot",
  kind: "visible",
  url: "https://example.com/",
  pageTitle: "Exemplo",
  tags: [],
  categoryId: null,
  text: { selection: "", meta: {}, headings: [], alts: [] },
  capturedAt: "2026-11-07T10:00:00.000Z",
};

let n = 0;
let store: IdbQueueStore;
beforeEach(() => {
  const name = `test-${++n}`;
  store = new IdbQueueStore(() => openRecorteDb(name));
});

const image = () => new Uint8Array([1, 2, 3, 4]).buffer;
const respond = (r: UploadResult) => vi.fn(async () => r);

describe("drainQueue", () => {
  it("removes the item on 201", async () => {
    await store.put(newQueueItem(image(), "image/webp", meta, 0));
    const up = respond({ ok: true, status: 201, body: { id: "x" } });
    const r = await drainQueue(store, up, { now: () => 1 });
    expect(up).toHaveBeenCalledOnce();
    expect(r.saved).toHaveLength(1);
    expect(await store.count()).toBe(0);
  });

  it("keeps the item untouched on 401 and reports authNeeded", async () => {
    const item = newQueueItem(image(), "image/webp", meta, 0);
    await store.put(item);
    await store.put(newQueueItem(image(), "image/webp", meta, 1));
    const up = respond({ ok: false, status: 401, error: "unauthorized" });
    const r = await drainQueue(store, up, { now: () => 10 });
    expect(r.authNeeded).toBe(true);
    expect(up).toHaveBeenCalledOnce(); // stops after the first 401
    expect(await store.count()).toBe(2);
    const kept = (await store.all())[0]!;
    expect(kept.attempts).toBe(0);
    expect(new Uint8Array(kept.image)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("drops the item on 413 and 400 (not retried)", async () => {
    await store.put(newQueueItem(image(), "image/webp", meta, 0));
    let r = await drainQueue(store, respond({ ok: false, status: 413, error: "payload_too_large" }), { now: () => 1 });
    expect(r.dropped).toHaveLength(1);
    expect(await store.count()).toBe(0);
    await store.put(newQueueItem(image(), "image/webp", meta, 0));
    r = await drainQueue(store, respond({ ok: false, status: 400, error: "invalid_meta" }), { now: () => 1 });
    expect(r.dropped[0]!.status).toBe(400);
    expect(await store.count()).toBe(0);
  });

  it("backs off exponentially on network errors and 5xx", async () => {
    await store.put(newQueueItem(image(), "image/webp", meta, 0));
    const fail = respond({ ok: false, status: 0, error: "Failed to fetch" });
    let r = await drainQueue(store, fail, { now: () => 1000 });
    expect(r.remaining).toBe(1);
    expect(r.nextAttemptAt).toBe(1000 + backoffMs(1));
    // Not due yet: not retried.
    r = await drainQueue(store, fail, { now: () => 2000 });
    expect(fail).toHaveBeenCalledOnce();
    // Due: retried, delay doubles.
    r = await drainQueue(store, respond({ ok: false, status: 503, error: "" }), { now: () => 1000 + backoffMs(1) });
    expect((await store.all())[0]!.attempts).toBe(2);
    expect(r.nextAttemptAt).toBe(1000 + backoffMs(1) + backoffMs(2));
    expect(backoffMs(2)).toBe(2 * backoffMs(1));
    expect(backoffMs(50)).toBe(30 * 60_000);
  });

  it("force sends items still in backoff", async () => {
    await store.put({ ...newQueueItem(image(), "image/webp", meta, 0), nextAttemptAt: 1e12 });
    const up = respond({ ok: true, status: 201, body: null });
    await drainQueue(store, up, { now: () => 1, force: true });
    expect(up).toHaveBeenCalledOnce();
  });
});
