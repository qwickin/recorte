import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { Item } from "@recorte/shared";
import { ULID_RE, ulidTime } from "./ids";

/** Names an item directory may serve. Anything else is not a file of the item. */
export const FILE_NAME_RE = /^(original\.webp|thumb\.webp|media-\d{1,3}\.[a-z0-9]{2,5})$/;

/** What is written to meta.json: the Item plus the on-disk format version. */
export type StoredItem = Item & { schemaVersion: 1 };

const SAFE_ID = /^[A-Za-z0-9_-]{1,64}$/;

/** Files are the source of truth (spec §4); SQLite only mirrors them. */
export class Storage {
  constructor(readonly dataDir: string) {}

  /** `<data>/items/<userId>/<yyyy>/<mm>/<itemId>/` — year/month come from the ULID. */
  itemDir(userId: string, id: string): string {
    const t = ulidTime(id);
    if (t === null || !SAFE_ID.test(userId)) throw new Error("invalid item id");
    const d = new Date(t);
    return join(this.dataDir, "items", userId, String(d.getUTCFullYear()), String(d.getUTCMonth() + 1).padStart(2, "0"), id);
  }

  ensureItemDir(userId: string, id: string): string {
    const dir = this.itemDir(userId, id);
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  writeFile(userId: string, id: string, name: string, data: Buffer): void {
    if (!FILE_NAME_RE.test(name)) throw new Error("invalid file name");
    atomicWrite(join(this.ensureItemDir(userId, id), name), data);
  }

  readFile(userId: string, id: string, name: string): Buffer | null {
    if (!FILE_NAME_RE.test(name) || !ULID_RE.test(id)) return null;
    try {
      return readFileSync(join(this.itemDir(userId, id), name));
    } catch {
      return null;
    }
  }

  /** Atomic (temp file + rename) so a crash never leaves a half-written meta.json. */
  writeMeta(meta: Item): void {
    const stored: StoredItem = { ...meta, schemaVersion: 1 };
    atomicWrite(join(this.ensureItemDir(meta.userId, meta.id), "meta.json"), Buffer.from(JSON.stringify(stored, null, 2)));
  }

  readMeta(userId: string, id: string): Item | null {
    if (!ULID_RE.test(id)) return null;
    try {
      const raw = JSON.parse(readFileSync(join(this.itemDir(userId, id), "meta.json"), "utf8"));
      return Item.parse(raw);
    } catch {
      return null;
    }
  }

  removeItem(userId: string, id: string): void {
    rmSync(this.itemDir(userId, id), { recursive: true, force: true });
  }
}

function atomicWrite(path: string, data: Buffer): void {
  const tmp = `${path}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
  try {
    writeFileSync(tmp, data);
    renameSync(tmp, path);
  } catch (e) {
    rmSync(tmp, { force: true });
    throw e;
  }
}
