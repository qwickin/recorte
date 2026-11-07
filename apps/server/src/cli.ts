import { randomBytes } from "node:crypto";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { findUserByEmail, MIN_PASSWORD, setPassword } from "./auth/users";

const USAGE = "Usage: recorte reset-password <email> [--password <new password>]";

export async function runCli(argv: string[], log: (m: string) => void = console.log): Promise<number> {
  const [cmd, email, ...rest] = argv;
  if (cmd !== "reset-password" || !email) {
    log(USAGE);
    return 2;
  }
  const i = rest.indexOf("--password");
  const given = i >= 0 ? rest[i + 1] : undefined;
  if (i >= 0 && (!given || given.length < MIN_PASSWORD)) {
    log(`Password must have at least ${MIN_PASSWORD} characters.`);
    return 2;
  }
  const db = openDb(loadConfig().dataDir);
  const user = findUserByEmail(db, email);
  if (!user) {
    log(`No account for ${email}`);
    return 1;
  }
  const password = given ?? randomBytes(12).toString("base64url");
  await setPassword(db, user.id, password);
  log(given ? `Password updated for ${user.email}. All sessions were closed.` : `New password for ${user.email}: ${password}\nAll sessions were closed.`);
  db.close();
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("recorte.mjs")) {
  process.exitCode = await runCli(process.argv.slice(2));
}
