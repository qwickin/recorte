import type { UploadMeta } from "@recorte/shared";
import { type DBSchema, type IDBPDatabase, openDB } from "idb";
import type { UploadResult } from "./api";

/**
 * Offline upload queue (IndexedDB). Images are stored as ArrayBuffer (portable across Chrome/Firefox and
 * structured-clone friendly). Drafts hold a capture while the pre-save dialog is open, so a service-worker
 * restart does not lose it.
 */

export interface QueueItem {
  id: string;
  /** Connection the capture belongs to (`accountKey(server, userId)`). Only sent while that connection is active. */
  account: string;
  image: ArrayBuffer;
  mime: string;
  meta: UploadMeta;
  attempts: number;
  /** Epoch ms; the item is not retried before this. */
  nextAttemptAt: number;
  createdAt: number;
  lastError?: string;
  /** Tab the capture came from, for the in-page "Guardado" toast. */
  tabId?: number | null;
}

export interface Draft {
  id: string;
  account: string;
  image: ArrayBuffer;
  mime: string;
  /** Meta without the user's dialog input (title/note/tags/category are filled on save). */
  meta: UploadMeta;
  /** Small JPEG data URL shown in the dialog. */
  preview: string;
  tabId: number | null;
  createdAt: number;
}

export interface QueueStore {
  all(): Promise<QueueItem[]>;
  put(item: QueueItem): Promise<void>;
  delete(id: string): Promise<void>;
  count(): Promise<number>;
}

interface RecorteDb extends DBSchema {
  queue: { key: string; value: QueueItem };
  drafts: { key: string; value: Draft };
}

let dbPromise: Promise<IDBPDatabase<RecorteDb>> | null = null;

export function openRecorteDb(name = "recorte"): Promise<IDBPDatabase<RecorteDb>> {
  if (name !== "recorte") return openRaw(name);
  dbPromise ??= openRaw(name);
  return dbPromise;
}

function openRaw(name: string): Promise<IDBPDatabase<RecorteDb>> {
  return openDB<RecorteDb>(name, 1, {
    upgrade(db) {
      db.createObjectStore("queue", { keyPath: "id" });
      db.createObjectStore("drafts", { keyPath: "id" });
    },
  });
}

export class IdbQueueStore implements QueueStore {
  constructor(private readonly db: () => Promise<IDBPDatabase<RecorteDb>> = () => openRecorteDb()) {}
  async all(): Promise<QueueItem[]> {
    const items = await (await this.db()).getAll("queue");
    return items.sort((a, b) => a.createdAt - b.createdAt);
  }
  async put(item: QueueItem): Promise<void> {
    await (await this.db()).put("queue", item);
  }
  async delete(id: string): Promise<void> {
    await (await this.db()).delete("queue", id);
  }
  async count(): Promise<number> {
    return (await this.db()).count("queue");
  }
  // Drafts
  async putDraft(d: Draft): Promise<void> {
    await (await this.db()).put("drafts", d);
  }
  async getDraft(id: string): Promise<Draft | undefined> {
    return (await this.db()).get("drafts", id);
  }
  async deleteDraft(id: string): Promise<void> {
    await (await this.db()).delete("drafts", id);
  }
  async pruneDrafts(olderThan: number): Promise<void> {
    const db = await this.db();
    for (const d of await db.getAll("drafts")) if (d.createdAt < olderThan) await db.delete("drafts", d.id);
  }
}

/** Identifies a server + account. Device tokens change on every login, so the device id is not part of it:
 *  re-connecting the same account (e.g. after a revoked token) must still send the parked captures. */
export function accountKey(server: string, userId: string): string {
  return `${server}#${userId}`;
}

export function newQueueItem(image: ArrayBuffer, mime: string, meta: UploadMeta, account: string, now = Date.now()): QueueItem {
  return { id: crypto.randomUUID(), account, image, mime, meta, attempts: 0, nextAttemptAt: now, createdAt: now };
}

/** Pending items per account. */
export async function countByAccount(store: QueueStore): Promise<Map<string, number>> {
  const m = new Map<string, number>();
  for (const i of await store.all()) m.set(i.account, (m.get(i.account) ?? 0) + 1);
  return m;
}

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 30 * 60_000;

/** 5 s, 10 s, 20 s, … capped at 30 min. */
export function backoffMs(attempts: number): number {
  return Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1));
}

/** Server rejected the item itself: retrying would never succeed. */
export function isPermanentFailure(status: number): boolean {
  return status === 400 || status === 413 || status === 415 || status === 422;
}

export interface DrainResult {
  saved: { item: QueueItem; body: unknown }[];
  dropped: { item: QueueItem; status: number; error: string }[];
  /** True when the server answered 401: the device token is gone; the queue is kept and paused. */
  authNeeded: boolean;
  /** Items of this account still waiting. */
  remaining: number;
  /** Earliest retry time among remaining items (epoch ms), or null. */
  nextAttemptAt: number | null;
}

export type Uploader = (item: QueueItem) => Promise<UploadResult>;

/**
 * Sends every due item of `account`, oldest first. Items of other connections (another server or account)
 * are never sent: they stay parked until that connection is active again or the user discards them.
 * - 2xx → removed.
 * - 401 → kept untouched; draining stops (every other item would fail the same way).
 * - 400/413/415/422 → removed and reported as dropped (not retried).
 * - anything else (network, 5xx, 429…) → kept with exponential backoff.
 */
export async function drainQueue(
  store: QueueStore,
  upload: Uploader,
  opts: { account: string; now?: () => number; force?: boolean },
): Promise<DrainResult> {
  const now = opts.now ?? Date.now;
  const result: DrainResult = { saved: [], dropped: [], authNeeded: false, remaining: 0, nextAttemptAt: null };
  for (const item of await store.all()) {
    if (item.account !== opts.account) continue;
    if (!opts.force && item.nextAttemptAt > now()) continue;
    const r = await upload(item);
    if (r.ok) {
      await store.delete(item.id);
      result.saved.push({ item, body: r.body });
    } else if (r.status === 401) {
      result.authNeeded = true;
      break;
    } else if (isPermanentFailure(r.status)) {
      await store.delete(item.id);
      result.dropped.push({ item, status: r.status, error: r.error });
    } else {
      const attempts = item.attempts + 1;
      await store.put({ ...item, attempts, nextAttemptAt: now() + backoffMs(attempts), lastError: r.error || `HTTP ${r.status}` });
    }
  }
  const rest = (await store.all()).filter((i) => i.account === opts.account);
  result.remaining = rest.length;
  result.nextAttemptAt = rest.length ? Math.min(...rest.map((i) => i.nextAttemptAt)) : null;
  return result;
}
