import type { Db } from "../db";
import { hashPassword, newId, sha256 } from "./crypto";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

export const normalizeEmail = (e: string): string => e.trim().toLowerCase();
export const MIN_PASSWORD = 8;

export const countUsers = (db: Db): number =>
  (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;

export const findUserByEmail = (db: Db, email: string): UserRow | undefined =>
  db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(normalizeEmail(email)) as
    | UserRow
    | undefined;

export const findUserById = (db: Db, id: string): UserRow | undefined =>
  db.prepare("SELECT id, email, password_hash FROM users WHERE id = ?").get(id) as UserRow | undefined;

export async function createUser(db: Db, email: string, password: string): Promise<string> {
  const id = newId();
  db.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?, ?, ?, ?)").run(
    id,
    normalizeEmail(email),
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
export async function createOwner(db: Db, email: string, password: string): Promise<string | null> {
  const id = newId();
  const h = await hashPassword(password);
  const r = db
    .prepare("INSERT INTO users (id, email, password_hash, created_at) SELECT ?, ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM users)")
    .run(id, normalizeEmail(email), h, new Date().toISOString());
  return r.changes ? id : null;
}
