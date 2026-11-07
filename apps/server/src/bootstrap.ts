import { randomBytes } from "node:crypto";
import type { Config } from "./config";
import type { Db } from "./db";
import { countUsers, createUser } from "./auth/users";

/** First-run provisioning. Returns the (possibly generated) config to use. */
export async function bootstrap(db: Db, config: Config, log: (m: string) => void = console.log): Promise<Config> {
  if (countUsers(db) > 0) return config;
  if (config.adminEmail && config.adminPassword) {
    await createUser(db, config.adminEmail, config.adminPassword);
    log(`Owner account created for ${config.adminEmail}`);
    return config;
  }
  const token = config.setupToken ?? randomBytes(18).toString("base64url");
  const base = config.publicUrl ?? `http://localhost:${config.port}`;
  log(`Setup: open ${base}/setup — token: ${token}`);
  return { ...config, setupToken: token };
}
