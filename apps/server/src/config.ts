import { resolve } from "node:path";

export interface Config {
  dataDir: string;
  port: number;
  publicUrl: string | null;
  setupToken: string | null;
  adminEmail: string | null;
  adminPassword: string | null;
  meiliUrl: string | null;
  meiliMasterKey: string | null;
  aiCloudUrl: string | null;
  aiCloudKey: string | null;
  aiCloudModel: string | null;
  appVersion: string;
  extensionVersion: string;
}

const opt = (v: string | undefined): string | null => (v && v.trim() ? v.trim() : null);

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const port = Number(env.PORT);
  return {
    dataDir: resolve(opt(env.DATA_DIR) ?? "./data"),
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 8080,
    publicUrl: opt(env.PUBLIC_URL)?.replace(/\/+$/, "") ?? null,
    setupToken: opt(env.SETUP_TOKEN),
    adminEmail: opt(env.ADMIN_EMAIL),
    adminPassword: env.ADMIN_PASSWORD ? env.ADMIN_PASSWORD : null,
    meiliUrl: opt(env.MEILI_URL),
    meiliMasterKey: opt(env.MEILI_MASTER_KEY),
    aiCloudUrl: opt(env.AI_CLOUD_URL),
    aiCloudKey: opt(env.AI_CLOUD_KEY),
    aiCloudModel: opt(env.AI_CLOUD_MODEL),
    appVersion: opt(env.APP_VERSION) ?? "0.0.0",
    extensionVersion: opt(env.EXTENSION_VERSION) ?? "0.0.0",
  };
}
