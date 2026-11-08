import type { Locale } from "@recorte/shared";
import { browser } from "wxt/browser";
import type { Connection } from "./api";
import { accountKey } from "./queue";

/** Everything persisted in `storage.local`. The password is never stored. */
export interface Settings {
  server: string | null;
  token: string | null;
  deviceId: string | null;
  /** Account id on the server (from /api/me); with `server` it scopes the offline queue. */
  userId: string | null;
  /** The account's email (shown in the options; pre-fills a reconnect). */
  email: string | null;
  /** "Save without asking": skip the pre-save dialog. */
  saveWithoutAsking: boolean;
  /** Options language override (lib/i18n/browser.ts LOCALE_KEY); null = follow the browser. */
  locale: Locale | null;
  /** Set when the server answered 401 (token revoked/expired). Cleared on a new login. */
  authNeeded: boolean;
}

const DEFAULTS: Settings = {
  server: null,
  token: null,
  deviceId: null,
  userId: null,
  email: null,
  saveWithoutAsking: false,
  locale: null,
  authNeeded: false,
};

export async function getSettings(): Promise<Settings> {
  const raw = (await browser.storage.local.get({ ...DEFAULTS })) as Partial<Settings>;
  return { ...DEFAULTS, ...raw };
}

export async function setSettings(patch: Partial<Settings>): Promise<void> {
  await browser.storage.local.set(patch);
}

export function connectionOf(s: Settings): Connection | null {
  return s.server && s.token ? { server: s.server, token: s.token } : null;
}

/** Queue scope of the current connection, or null when not connected. */
export function accountOf(s: Settings): string | null {
  return s.server && s.token && s.userId ? accountKey(s.server, s.userId) : null;
}

export const extensionVersion = (): string => browser.runtime.getManifest().version;
