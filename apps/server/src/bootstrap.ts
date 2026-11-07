import type { Config } from "./config";
import type { Db } from "./db";
import { countUsers, createOwner, isEmail, MIN_PASSWORD } from "./auth/users";
import { effectiveSettings } from "./settings";

/** The boot hint shown while there is no owner. */
export function setupHint(db: Db, config: Config): string {
  const publicUrl = effectiveSettings(db, config).publicUrl;
  const base = publicUrl ?? `http://<IP-deste-servidor>:${config.port}`;
  return `Abre ${base}/setup nos próximos 15 minutos para configurar.`;
}

/** First-run provisioning: ADMIN_EMAIL + ADMIN_PASSWORD create the owner; otherwise the /setup window is announced. */
export async function bootstrap(db: Db, config: Config, log: (m: string) => void = console.log): Promise<void> {
  if (countUsers(db) > 0) return;
  const { adminEmail, adminPassword } = config;
  if (adminEmail || adminPassword) {
    if (!adminEmail || !adminPassword) {
      log("ADMIN_EMAIL and ADMIN_PASSWORD must both be set to create the owner; ignoring them.");
    } else if (!isEmail(adminEmail)) {
      log("ADMIN_EMAIL ignored: it is not a valid email address.");
    } else if (adminPassword.length < MIN_PASSWORD) {
      log(`ADMIN_PASSWORD ignored: it must have at least ${MIN_PASSWORD} characters.`);
    } else if (await createOwner(db, adminEmail, adminPassword)) {
      log(`Owner account created for ${adminEmail.trim().toLowerCase()} from ADMIN_EMAIL/ADMIN_PASSWORD. You can remove ADMIN_PASSWORD from the environment now.`);
      return;
    }
  }
  if (countUsers(db) > 0) return;
  log(setupHint(db, config));
}
