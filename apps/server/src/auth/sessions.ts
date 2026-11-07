import type { Db } from "../db";
import { randomToken, sha256 } from "./crypto";

export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
export const TICKET_TTL_MS = 60 * 1000;

export function createSession(db: Db, userId: string): string {
  const token = randomToken();
  db.prepare("DELETE FROM sessions WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)").run(
    sha256(token),
    userId,
    new Date().toISOString(),
    Date.now() + SESSION_TTL_MS,
  );
  return token;
}

export function userForSession(db: Db, token: string): string | null {
  const r = db.prepare("SELECT user_id FROM sessions WHERE token_hash = ? AND expires_at > ?").get(sha256(token), Date.now()) as
    | { user_id: string }
    | undefined;
  return r?.user_id ?? null;
}

export const destroySession = (db: Db, token: string): void => {
  db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
};

export function createTicket(db: Db, userId: string): string {
  const token = randomToken();
  db.prepare("DELETE FROM tickets WHERE expires_at < ?").run(Date.now());
  db.prepare("INSERT INTO tickets (token_hash, user_id, expires_at) VALUES (?, ?, ?)").run(
    sha256(token),
    userId,
    Date.now() + TICKET_TTL_MS,
  );
  return token;
}

/** Atomically consumes a ticket: returns the user id once, null afterwards or when expired. */
export function consumeTicket(db: Db, token: string): string | null {
  const r = db
    .prepare("DELETE FROM tickets WHERE token_hash = ? AND expires_at > ? RETURNING user_id")
    .get(sha256(token), Date.now()) as { user_id: string } | undefined;
  return r?.user_id ?? null;
}
