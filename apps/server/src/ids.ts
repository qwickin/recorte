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
