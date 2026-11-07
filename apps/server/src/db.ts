import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Db = DatabaseSync;

/**
 * Ordered migrations. Append new entries at the END (later tasks add theirs);
 * never edit or reorder an entry that has shipped. Version = index + 1.
 */
export const MIGRATIONS: readonly string[] = [
  // 1: accounts, sessions, devices, tickets
  `CREATE TABLE users (
     id TEXT PRIMARY KEY,
     email TEXT NOT NULL UNIQUE,
     password_hash TEXT NOT NULL,
     created_at TEXT NOT NULL
   );
   CREATE TABLE sessions (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     created_at TEXT NOT NULL,
     expires_at INTEGER NOT NULL
   );
   CREATE INDEX sessions_user ON sessions(user_id);
   CREATE TABLE devices (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     token_hash TEXT NOT NULL UNIQUE,
     created_at TEXT NOT NULL,
     last_seen_at TEXT,
     extension_version TEXT
   );
   CREATE INDEX devices_user ON devices(user_id);
   CREATE TABLE tickets (
     token_hash TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     expires_at INTEGER NOT NULL
   );`,
  // 2: items mirror, tags, colours, categories, jobs
  `CREATE TABLE categories (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     name TEXT NOT NULL,
     color TEXT,
     created_at TEXT NOT NULL,
     UNIQUE (user_id, name)
   );
   CREATE TABLE items (
     id TEXT PRIMARY KEY,
     user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
     type TEXT NOT NULL,
     kind TEXT,
     site TEXT NOT NULL,
     url TEXT NOT NULL,
     title TEXT NOT NULL,
     created_at TEXT NOT NULL,
     deleted_at TEXT,
     category_id TEXT,
     thumb TEXT NOT NULL,
     width INTEGER NOT NULL,
     height INTEGER NOT NULL,
     color TEXT NOT NULL,
     has_note INTEGER NOT NULL DEFAULT 0
   );
   CREATE INDEX items_user_created ON items(user_id, deleted_at, created_at DESC, id DESC);
   CREATE INDEX items_category ON items(category_id);
   CREATE TABLE item_tags (
     item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
     tag TEXT NOT NULL,
     origin TEXT NOT NULL CHECK (origin IN ('user', 'ai')),
     pos INTEGER NOT NULL,
     PRIMARY KEY (item_id, tag, origin)
   );
   CREATE INDEX item_tags_tag ON item_tags(tag);
   CREATE TABLE item_colors (
     item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
     color TEXT NOT NULL,
     PRIMARY KEY (item_id, color)
   );
   CREATE TABLE jobs (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     type TEXT NOT NULL,
     payload TEXT NOT NULL,
     status TEXT NOT NULL DEFAULT 'pending',
     attempts INTEGER NOT NULL DEFAULT 0,
     run_at INTEGER NOT NULL,
     last_error TEXT,
     created_at TEXT NOT NULL
   );
   CREATE INDEX jobs_pending ON jobs(status, run_at);`,
];

export function migrate(db: Db, migrations: readonly string[] = MIGRATIONS): void {
  db.exec("CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)");
  const row = db.prepare("SELECT MAX(version) AS v FROM schema_version").get() as { v: number | null };
  const current = row.v ?? 0;
  for (let i = current; i < migrations.length; i++) {
    db.exec("BEGIN");
    try {
      db.exec(migrations[i]!);
      db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(i + 1);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
}

export function openDb(dataDir: string): Db {
  mkdirSync(dataDir, { recursive: true });
  return openDbAt(join(dataDir, "recorte.db"));
}

export function openDbAt(path: string): Db {
  const db = new DatabaseSync(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;");
  migrate(db);
  return db;
}
