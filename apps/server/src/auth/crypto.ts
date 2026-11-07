import { createHash, randomBytes } from "node:crypto";
import { hash, verify } from "@node-rs/argon2";

export const sha256 = (s: string): string => createHash("sha256").update(s).digest("hex");
export const randomToken = (): string => randomBytes(32).toString("base64url");
export const newId = (): string => randomBytes(12).toString("base64url");

// Algorithm.Argon2id === 2 (const enum in @node-rs/argon2; avoid importing it under isolatedModules).
const ARGON2ID = 2;
export const hashPassword = (pw: string): Promise<string> => hash(pw, { algorithm: ARGON2ID });

// Verified against this when the account doesn't exist, to keep timing similar.
let dummy: Promise<string> | undefined;
export async function verifyPassword(stored: string | null, pw: string): Promise<boolean> {
  try {
    if (stored === null) {
      dummy ??= hashPassword("recorte-dummy-password");
      await verify(await dummy, pw);
      return false;
    }
    return await verify(stored, pw);
  } catch {
    return false;
  }
}
