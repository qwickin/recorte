import "fake-indexeddb/auto";
import type { UploadMeta } from "@recorte/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UploadResult } from "../lib/api";
import { IdbQueueStore, accountKey, backoffMs, countByAccount, drainQueue, newQueueItem, openRecorteDb } from "../lib/queue";

const ACC = accountKey("https://a.example", "user-1");
const OTHER = accountKey("https://b.example", "user-2");

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
    await store.put(newQueueItem(image(), "image/webp", meta, ACC, 0));
    const up = respond({ ok: true, status: 201, body: { id: "x" } });
    const r = await drainQueue(store, up, { account: ACC, now: () => 1 });
    expect(up).toHaveBeenCalledOnce();
    expect(r.saved).toHaveLength(1);
    expect(await store.count()).toBe(0);
  });

  it("keeps the item untouched on 401 and reports authNeeded", async () => {
    const item = newQueueItem(image(), "image/webp", meta, ACC, 0);
    await store.put(item);
    await store.put(newQueueItem(image(), "image/webp", meta, ACC, 1));
    const up = respond({ ok: false, status: 401, error: "unauthorized" });
    const r = await drainQueue(store, up, { account: ACC, now: () => 10 });
    expect(r.authNeeded).toBe(true);
    expect(up).toHaveBeenCalledOnce(); // stops after the first 401
    expect(await store.count()).toBe(2);
    const kept = (await store.all())[0]!;
    expect(kept.attempts).toBe(0);
    expect(new Uint8Array(kept.image)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it("drops the item on 413 and 400 (not retried)", async () => {
    await store.put(newQueueItem(image(), "image/webp", meta, ACC, 0));
    let r = await drainQueue(store, respond({ ok: false, status: 413, error: "payload_too_large" }), { account: ACC, now: () => 1 });
    expect(r.dropped).toHaveLength(1);
    expect(await store.count()).toBe(0);
    await store.put(newQueueItem(image(), "image/webp", meta, ACC, 0));
    r = await drainQueue(store, respond({ ok: false, status: 400, error: "invalid_meta" }), { account: ACC, now: () => 1 });
    expect(r.dropped[0]!.status).toBe(400);
    expect(await store.count()).toBe(0);
  });

  it("backs off exponentially on network errors and 5xx", async () => {
    await store.put(newQueueItem(image(), "image/webp", meta, ACC, 0));
    const fail = respond({ ok: false, status: 0, error: "Failed to fetch" });
    let r = await drainQueue(store, fail, { account: ACC, now: () => 1000 });
    expect(r.remaining).toBe(1);
    expect(r.nextAttemptAt).toBe(1000 + backoffMs(1));
    // Not due yet: not retried.
    r = await drainQueue(store, fail, { account: ACC, now: () => 2000 });
    expect(fail).toHaveBeenCalledOnce();
    // Due: retried, delay doubles.
    r = await drainQueue(store, respond({ ok: false, status: 503, error: "" }), { account: ACC, now: () => 1000 + backoffMs(1) });
    expect((await store.all())[0]!.attempts).toBe(2);
    expect(r.nextAttemptAt).toBe(1000 + backoffMs(1) + backoffMs(2));
    expect(backoffMs(2)).toBe(2 * backoffMs(1));
    expect(backoffMs(50)).toBe(30 * 60_000);
  });

  it("force sends items still in backoff", async () => {
    await store.put({ ...newQueueItem(image(), "image/webp", meta, ACC, 0), nextAttemptAt: 1e12 });
    const up = respond({ ok: true, status: 201, body: null });
    await drainQueue(store, up, { account: ACC, now: () => 1, force: true });
    expect(up).toHaveBeenCalledOnce();
  });

  it("only sends items of the active connection; others stay parked", async () => {
    await store.put(newQueueItem(image(), "image/webp", meta, OTHER, 0));
    await store.put(newQueueItem(image(), "image/webp", meta, ACC, 1));
    const up = respond({ ok: true, status: 201, body: null });
    const r = await drainQueue(store, up, { account: ACC, now: () => 10 });
    expect(up).toHaveBeenCalledOnce();
    expect(r.saved[0]!.item.account).toBe(ACC);
    expect(r.remaining).toBe(0);
    const left = await store.all();
    expect(left).toHaveLength(1);
    expect(left[0]!.account).toBe(OTHER);
    expect(await countByAccount(store)).toEqual(new Map([[OTHER, 1]]));
    // Same account re-connected later (new device token, same server + user) → sent.
    await drainQueue(store, up, { account: OTHER, now: () => 10 });
    expect(await store.count()).toBe(0);
  });

  it("never drops a transiently failing item, however many attempts or however old (spec §2)", async () => {
    const YEAR = 365 * 24 * 60 * 60_000;
    await store.put({ ...newQueueItem(image(), "image/webp", meta, ACC, 0), attempts: 10_000 });
    for (const status of [0, 500, 502, 503, 429, 404, 408]) {
      const r = await drainQueue(store, respond({ ok: false, status, error: status ? "" : "Failed to fetch" }), {
        account: ACC,
        now: () => YEAR,
        force: true,
      });
      expect(r.dropped).toHaveLength(0);
      expect(r.remaining).toBe(1);
    }
    expect(await store.count()).toBe(1);
  });

  it("keeps a 400 whose code is not about the capture (proxy page, old server's invalid_category)", async () => {
    await store.put(newQueueItem(image(), "image/webp", meta, ACC, 0));
    for (const error of ["", "invalid_category", "invalid_body"]) {
      const r = await drainQueue(store, respond({ ok: false, status: 400, error }), { account: ACC, now: () => 1e9, force: true });
      expect(r.dropped).toHaveLength(0);
    }
    expect(await store.count()).toBe(1);
  });

  it("drops (and reports) only true permanent rejections: 400 invalid_meta/invalid_image, 413, 415, 422", async () => {
    for (const [status, error] of [[400, "invalid_image"], [415, ""], [422, ""], [413, "image_too_large"]] as const) {
      await store.put(newQueueItem(image(), "image/webp", meta, ACC, 0));
      const r = await drainQueue(store, respond({ ok: false, status, error }), { account: ACC, now: () => 1 });
      expect(r.dropped.map((d) => d.status)).toEqual([status]);
      expect(await store.count()).toBe(0);
    }
  });

  it("a forced drain of an item still in backoff does not count as an attempt", async () => {
    await store.put({ ...newQueueItem(image(), "image/webp", meta, ACC, 0), attempts: 3, nextAttemptAt: 50_000 });
    const fail = respond({ ok: false, status: 0, error: "offline" });
    for (let i = 0; i < 5; i++) await drainQueue(store, fail, { account: ACC, now: () => 1000 + i, force: true });
    expect(fail).toHaveBeenCalledTimes(5);
    const kept = (await store.all())[0]!;
    expect(kept.attempts).toBe(3);
    expect(kept.nextAttemptAt).toBe(50_000);
    expect(kept.lastError).toBe("offline");
    // The scheduled retry still counts and backs off.
    await drainQueue(store, fail, { account: ACC, now: () => 50_000 });
    expect((await store.all())[0]!.attempts).toBe(4);
    expect((await store.all())[0]!.nextAttemptAt).toBe(50_000 + backoffMs(4));
  });

  it("never drops on 401, however old", async () => {
    await store.put(newQueueItem(image(), "image/webp", meta, ACC, 0));
    const r = await drainQueue(store, respond({ ok: false, status: 401, error: "" }), { account: ACC, now: () => 1e12 });
    expect(r.authNeeded).toBe(true);
    expect(await store.count()).toBe(1);
  });
});
