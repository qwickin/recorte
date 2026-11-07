import { randomBytes } from "node:crypto";
import { loadConfig } from "./config";
import { openDb } from "./db";
import { accountForLogin, claimEmail, countUsers, isEmail, MIN_PASSWORD, normalizeEmail, setPassword } from "./auth/users";

const USAGE = "Usage: recorte reset-password <email> [--password <new password>]";

export async function runCli(argv: string[], log: (m: string) => void = console.log): Promise<number> {
  const [cmd, ...rest] = argv;
  const i = rest.indexOf("--password");
  const positional = rest.filter((_, k) => i < 0 || (k !== i && k !== i + 1));
  if (cmd !== "reset-password" || positional.length !== 1 || !isEmail(positional[0]!)) {
    log(USAGE);
    return 2;
  }
  const email = normalizeEmail(positional[0]!);
  const given = i >= 0 ? rest[i + 1] : undefined;
  if (i >= 0 && (!given || given.length < MIN_PASSWORD)) {
    log(`Password must have at least ${MIN_PASSWORD} characters.`);
    return 2;
  }
  const db = openDb(loadConfig().dataDir);
  try {
    if (countUsers(db) === 0) {
      log("No owner yet: open /setup in the browser (restart the container if the 15-minute window has passed).");
      return 1;
    }
    // An owner from the password-only build (no real email yet) takes this email.
    const user = accountForLogin(db, email);
    if (!user) {
      log(`No account for ${email}.`);
      return 1;
    }
    if (user.claim) claimEmail(db, user.id, email);
    const password = given ?? randomBytes(12).toString("base64url");
    await setPassword(db, user.id, password, undefined, true);
    log(
      given
        ? `Password updated for ${email}. All sessions and devices were revoked; extensions must reconnect.`
        : `New password for ${email}: ${password}\nAll sessions and devices were revoked; extensions must reconnect.`,
    );
  } finally {
    db.close();
  }
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("recorte.mjs")) {
  process.exitCode = await runCli(process.argv.slice(2));
}
