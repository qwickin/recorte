import { browser } from "wxt/browser";
import type { Connection } from "./api";

/** Everything persisted in `storage.local`. The password is never stored. */
export interface Settings {
  server: string | null;
  token: string | null;
  deviceId: string | null;
  email: string | null;
  /** "Guardar sem perguntar": skip the pre-save dialog. */
  saveWithoutAsking: boolean;
  /** Set when the server answered 401 (token revoked/expired). Cleared on a new login. */
  authNeeded: boolean;
}

const DEFAULTS: Settings = {
  server: null,
  token: null,
  deviceId: null,
  email: null,
  saveWithoutAsking: false,
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

export const extensionVersion = (): string => browser.runtime.getManifest().version;
