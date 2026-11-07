import type { Db } from "../db";
import { hashPassword, newId, sha256 } from "./crypto";

export interface UserRow {
  id: string;
  password_hash: string;
}

export const MIN_PASSWORD = 8;

/**
 * Access is password-only (one owner). `users.email` is a legacy NOT NULL UNIQUE column that nothing reads any
 * more; new rows get this unique placeholder. Existing installs keep whatever email they had.
 */
const placeholderEmail = (id: string): string => `owner-${id}`;

export const countUsers = (db: Db): number =>
  (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;

/** The owner: the oldest account (phase 1 has exactly one). */
export const findOwner = (db: Db): UserRow | undefined =>
  db.prepare("SELECT id, password_hash FROM users ORDER BY created_at, rowid LIMIT 1").get() as UserRow | undefined;

export const findUserById = (db: Db, id: string): UserRow | undefined =>
  db.prepare("SELECT id, password_hash FROM users WHERE id = ?").get(id) as UserRow | undefined;

/** Inserts an account unconditionally (tests and multi-user isolation checks). Use `createOwner` for setup. */
export async function createUser(db: Db, password: string): Promise<string> {
  const id = newId();
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    placeholderEmail(id),
    await hashPassword(password),
    new Date().toISOString(),
  );
  return id;
}

/** Sets a new password and drops sessions (all, or all except `keepSessionToken`). Devices stay valid. */
export async function setPassword(db: Db, userId: string, password: string, keepSessionToken?: string, revokeAccess = false) {
  const h = await hashPassword(password);
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(h, userId);
    if (keepSessionToken) {
      db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?").run(userId, sha256(keepSessionToken));
    } else {
      db.prepare("DELETE FROM sessions WHERE user_id = ?").run(userId);
    }
    if (revokeAccess) {
      db.prepare("DELETE FROM devices WHERE user_id = ?").run(userId);
      db.prepare("DELETE FROM tickets WHERE user_id = ?").run(userId);
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

/** Creates the owner only if no user exists yet (atomic, safe against concurrent /setup). Returns null otherwise. */
export async function createOwner(db: Db, password: string): Promise<string | null> {
  const id = newId();
  const h = await hashPassword(password);
  const r = db
    .prepare("INSERT INTO users (id, email, password_hash, created_at) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)")
    .run(id, placeholderEmail(id), h, new Date().toISOString());
  return r.changes ? id : null;
}
