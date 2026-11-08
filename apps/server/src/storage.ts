import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, rmdirSync, writeFileSync } from "node:fs";
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

  /** Absolute path of a known item file, or null when the name/id is not valid. Does not check existence. */
  filePath(userId: string, id: string, name: string): string | null {
    if (!FILE_NAME_RE.test(name) || !ULID_RE.test(id)) return null;
    return join(this.itemDir(userId, id), name);
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
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") console.warn(`readMeta ${id} failed:`, (e as Error).message);
      return null;
    }
  }

  /** Ids of every item directory of the user on disk (`items/<user>/<yyyy>/<mm>/<id>`). */
  listItemIds(userId: string): string[] {
    if (!SAFE_ID.test(userId)) return [];
    const out: string[] = [];
    const ls = (dir: string): string[] => {
      try {
        return readdirSync(dir);
      } catch {
        return [];
      }
    };
    const root = join(this.dataDir, "items", userId);
    for (const y of ls(root)) for (const mo of ls(join(root, y))) for (const id of ls(join(root, y, mo))) if (ULID_RE.test(id)) out.push(id);
    return out.sort();
  }

  /** Names of the user directories under `items/`. */
  listUserDirs(): string[] {
    try {
      return readdirSync(join(this.dataDir, "items"), { withFileTypes: true })
        .filter((d) => d.isDirectory() && SAFE_ID.test(d.name))
        .map((d) => d.name);
    } catch {
      return [];
    }
  }

  /**
   * Moves every item directory of `from` to `to` (same year/month layout), then removes the emptied folders of
   * `from`. An id that already exists under `to` is left where it is. Returns the moved ids. meta.json is not
   * touched here: the caller rewrites `userId` (a crash in between is repaired by the next run).
   */
  moveUserItems(from: string, to: string): { moved: string[]; skipped: string[] } {
    if (!SAFE_ID.test(from) || !SAFE_ID.test(to) || from === to) throw new Error("invalid user id");
    const moved: string[] = [];
    const skipped: string[] = [];
    for (const id of this.listItemIds(from)) {
      const src = this.itemDir(from, id);
      const dst = this.itemDir(to, id);
      if (existsSync(dst)) {
        skipped.push(id);
        continue;
      }
      mkdirSync(join(dst, ".."), { recursive: true });
      renameSync(src, dst);
      moved.push(id);
    }
    // Drop the empty month/year/user folders left behind (anything not empty stays).
    const root = join(this.dataDir, "items", from);
    const rmEmpty = (dir: string): void => {
      let names: string[];
      try {
        names = readdirSync(dir);
      } catch {
        return;
      }
      for (const n of names) rmEmpty(join(dir, n));
      try {
        rmdirSync(dir);
      } catch {}
    };
    try {
      for (const y of readdirSync(root)) rmEmpty(join(root, y));
      rmdirSync(root);
    } catch {}
    return { moved, skipped };
  }

  /** Removes one item file; the item directory goes too when nothing else is left in it. */
  removeFile(userId: string, id: string, name: string): void {
    if (!FILE_NAME_RE.test(name) || !ULID_RE.test(id)) return;
    const dir = this.itemDir(userId, id);
    rmSync(join(dir, name), { force: true });
    try {
      if (!readdirSync(dir).length) rmdirSync(dir);
    } catch {}
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
