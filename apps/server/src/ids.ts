import { randomBytes } from "node:crypto";

const ENC = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
let lastTime = -1;
let lastRand: number[] = [];

/** Monotonic ULID: ids generated in the same millisecond still sort in creation order. */
export function ulid(now: number = Date.now()): string {
  let rand: number[];
  if (now <= lastTime) {
    now = lastTime;
    rand = [...lastRand];
    for (let i = 15; i >= 0; i--) {
      if (rand[i]! < 31) {
        rand[i]!++;
        break;
      }
      rand[i] = 0;
    }
  } else {
    rand = Array.from(randomBytes(16), (b) => b & 31);
  }
  lastTime = now;
  lastRand = rand;
  let t = "";
  let n = now;
  for (let i = 0; i < 10; i++) {
    t = ENC[n % 32]! + t;
    n = Math.floor(n / 32);
  }
  return t + rand.map((r) => ENC[r]).join("");
}

export const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

/** Millisecond timestamp encoded in a ULID, or null when it is not one. */
export function ulidTime(id: string): number | null {
  if (!ULID_RE.test(id)) return null;
  let n = 0;
  for (let i = 0; i < 10; i++) n = n * 32 + ENC.indexOf(id[i]!);
  return n;
}

let atTime = -1;
let atRand: number[] = [];

/**
 * ULID for a given (usually past) time, e.g. an item's capture time. Unlike `ulid()` it never clamps to the
 * latest time issued, so the id really encodes `time`. Ids minted in a row for the same millisecond still sort
 * in creation order.
 */
export function ulidAt(time: number): string {
  let rand: number[];
  if (time === atTime) {
    rand = [...atRand];
    for (let i = 15; i >= 0; i--) {
      if (rand[i]! < 31) {
        rand[i]!++;
        break;
      }
      rand[i] = 0;
    }
  } else {
    rand = Array.from(randomBytes(16), (b) => b & 31);
  }
  atTime = time;
  atRand = rand;
  let t = "";
  let n = time;
  for (let i = 0; i < 10; i++) {
    t = ENC[n % 32]! + t;
    n = Math.floor(n / 32);
  }
  return t + rand.map((r) => ENC[r]).join("");
}

/** Earliest capture time accepted as an item's `createdAt` (older means a broken clock). */
const MIN_CAPTURE_MS = Date.UTC(2000, 0, 1);
/** Small tolerance for a browser clock slightly ahead of the server's. */
const FUTURE_SKEW_MS = 5 * 60_000;

/**
 * Capture time to use as `createdAt`, so captures that waited offline sort by when they were taken.
 * Falls back to `now` when the value is not a date, is before 2000 or is in the future; never rejects.
 */
export function captureTime(capturedAt: string | undefined, now: number = Date.now()): number {
  const t = capturedAt ? Date.parse(capturedAt) : Number.NaN;
  if (!Number.isFinite(t) || t < MIN_CAPTURE_MS || t > now + FUTURE_SKEW_MS) return now;
  return Math.min(t, now);
}
