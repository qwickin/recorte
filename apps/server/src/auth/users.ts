import type { Db } from "../db";
import { hashPassword, newId, sha256 } from "./crypto";

export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
}

export const MIN_PASSWORD = 8;
export const normalizeEmail = (e: string): string => e.trim().toLowerCase();
export const isEmail = (e: string): boolean => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e.trim()) && e.trim().length <= 254;

/**
 * Owners created by the short-lived password-only build have no real email, only this placeholder (no "@").
 * Such an owner claims an email on the first login, or with `recorte reset-password <email>` (see `claimEmail`).
 */
export const PLACEHOLDER_PREFIX = "owner-";
export const hasPlaceholderEmail = (u: Pick<UserRow, "email">): boolean => u.email.startsWith(PLACEHOLDER_PREFIX) && !u.email.includes("@");

export const countUsers = (db: Db): number =>
  (db.prepare("SELECT COUNT(*) AS n FROM users").get() as { n: number }).n;

/** The owner: the oldest account (phase 1 has exactly one). */
export const findOwner = (db: Db): UserRow | undefined =>
  db.prepare("SELECT id, email, password_hash FROM users ORDER BY created_at, rowid LIMIT 1").get() as UserRow | undefined;

export const findUserById = (db: Db, id: string): UserRow | undefined =>
  db.prepare("SELECT id, email, password_hash FROM users WHERE id = ?").get(id) as UserRow | undefined;

export const findUserByEmail = (db: Db, email: string): UserRow | undefined =>
  db.prepare("SELECT id, email, password_hash FROM users WHERE email = ?").get(normalizeEmail(email)) as UserRow | undefined;

/**
 * The account an email + password pair is checked against: the one with that email or, when nobody has it and
 * the owner still carries the placeholder, the owner (who then claims the email after a correct password).
 */
export function accountForLogin(db: Db, email: string): (UserRow & { claim: boolean }) | undefined {
  const byEmail = findUserByEmail(db, email);
  if (byEmail) return { ...byEmail, claim: false };
  const owner = findOwner(db);
  return owner && hasPlaceholderEmail(owner) && isEmail(email) ? { ...owner, claim: true } : undefined;
}

/** Gives a placeholder owner its real email. */
export function claimEmail(db: Db, userId: string, email: string): void {
  db.prepare("UPDATE users SET email = ? WHERE id = ?").run(normalizeEmail(email), userId);
}

/** Inserts an account unconditionally (tests and multi-user isolation checks). Use `createOwner` for setup. */
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
