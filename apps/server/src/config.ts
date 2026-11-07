import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Dev default: the gallery build next to this package (Docker sets GALLERY_DIR=/app/gallery). */
const DEV_GALLERY_DIR = fileURLToPath(new URL("../../gallery/dist", import.meta.url));

export interface Config {
  dataDir: string;
  port: number;
  /** Env overrides of the DB settings (settings.ts): null = not set in the environment. */
  publicUrl: string | null;
  /** Creates the owner at boot when there is none yet. Optional: the /setup wizard does the same. */
  adminPassword: string | null;
  /** External Meilisearch. When unset, the embedded one (`meiliBin`) is started as a child process. */
  meiliUrl: string | null;
  meiliMasterKey: string | null;
  /** Meilisearch binary for the embedded instance (the image sets MEILI_BIN). Unset and no MEILI_URL: search is off. */
  meiliBin: string | null;
  meiliPort: number;
  aiCloudUrl: string | null;
  aiCloudKey: string | null;
  aiCloudModel: string | null;
  appVersion: string;
  extensionVersion: string;
  downloadsDir: string;
  galleryDir: string;
}

const opt = (v: string | undefined): string | null => (v && v.trim() ? v.trim() : null);

export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const port = Number(env.PORT);
  const meiliPort = Number(env.MEILI_PORT);
  return {
    dataDir: resolve(opt(env.DATA_DIR) ?? "./data"),
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 8080,
    publicUrl: opt(env.PUBLIC_URL)?.replace(/\/+$/, "") ?? null,
    adminPassword: env.ADMIN_PASSWORD ? env.ADMIN_PASSWORD : null,
    meiliUrl: opt(env.MEILI_URL),
    meiliMasterKey: opt(env.MEILI_MASTER_KEY),
    meiliBin: opt(env.MEILI_BIN),
    meiliPort: Number.isInteger(meiliPort) && meiliPort > 0 && meiliPort < 65536 ? meiliPort : 7700,
    aiCloudUrl: opt(env.AI_CLOUD_URL),
    aiCloudKey: opt(env.AI_CLOUD_KEY),
    aiCloudModel: opt(env.AI_CLOUD_MODEL),
    appVersion: opt(env.APP_VERSION) ?? "0.0.0",
    extensionVersion: opt(env.EXTENSION_VERSION) ?? "0.0.0",
    downloadsDir: resolve(opt(env.DOWNLOADS_DIR) ?? "/app/downloads"),
    galleryDir: resolve(opt(env.GALLERY_DIR) ?? DEV_GALLERY_DIR),
  };
}
