import { SETTING_KEYS, type ServerSettings, type SettingKey, type SettingsPatch, type SettingSource } from "@recorte/shared";
import type { Config } from "./config";
import type { Db } from "./db";

/** Effective server settings: the environment variable wins over the value saved in the gallery. */
export type EffectiveSettings = Record<SettingKey, string | null>;

const fromEnv = (config: Config, key: SettingKey): string | null => config[key] ?? null;

function dbValues(db: Db): Partial<Record<SettingKey, string>> {
  const rows = db.prepare("SELECT key, value FROM settings").all() as { key: string; value: string }[];
  const out: Partial<Record<SettingKey, string>> = {};
  for (const r of rows) if ((SETTING_KEYS as readonly string[]).includes(r.key) && r.value) out[r.key as SettingKey] = r.value;
  return out;
}

export function effectiveSettings(db: Db, config: Config): EffectiveSettings {
  const saved = dbValues(db);
  const out = {} as EffectiveSettings;
  for (const k of SETTING_KEYS) out[k] = fromEnv(config, k) ?? saved[k] ?? null;
  return out;
}

export const sourceOf = (config: Config, key: SettingKey): SettingSource => (fromEnv(config, key) !== null ? "env" : "db");

/** "sk-abcdef123456" → "••••3456". Short keys show only the dots. */
export const maskKey = (k: string): string => `••••${k.length >= 12 ? k.slice(-4) : ""}`;

export function settingsView(db: Db, config: Config): ServerSettings {
  const e = effectiveSettings(db, config);
  const v = (k: Exclude<SettingKey, "aiCloudKey">) => ({ value: e[k], source: sourceOf(config, k) });
  return {
    publicUrl: v("publicUrl"),
    aiCloudUrl: v("aiCloudUrl"),
    aiCloudModel: v("aiCloudModel"),
    aiCloudKey: { value: e.aiCloudKey ? maskKey(e.aiCloudKey) : null, set: !!e.aiCloudKey, source: sourceOf(config, "aiCloudKey") },
  };
}

/** http(s) origin + path without trailing slashes, or null. */
export function normalizeHttpUrl(input: string): string | null {
  try {
    const u = new URL(input.trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (u.username || u.password) return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}${u.search}`;
  } catch {
    return null;
  }
}

/** The public URL is an origin (scheme://host[:port]); a path would never match the browser's Origin header. */
export function normalizePublicUrl(input: string): string | null {
  const n = normalizeHttpUrl(input);
  if (!n) return null;
  const u = new URL(n);
  return u.pathname === "/" && !u.search ? u.origin : null;
}

/** Host of a URL, or null when it does not parse (a bad stored value must never take the Origin check down). */
export function hostOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

export type UpdateResult = { ok: true } | { ok: false; error: "overridden_by_env" | "invalid_url"; keys: SettingKey[] };

/** Applies a patch: omitted keys stay, null/"" removes the saved value. Keys set in the environment are refused. */
export function updateSettings(db: Db, config: Config, patch: SettingsPatch): UpdateResult {
  const keys = SETTING_KEYS.filter((k) => patch[k] !== undefined);
  const locked = keys.filter((k) => sourceOf(config, k) === "env");
  if (locked.length) return { ok: false, error: "overridden_by_env", keys: locked };
  const writes: [SettingKey, string | null][] = [];
  const invalid: SettingKey[] = [];
  for (const k of keys) {
    const raw = patch[k]?.trim() ?? "";
    if (!raw) {
      writes.push([k, null]);
      continue;
    }
    if (k === "publicUrl" || k === "aiCloudUrl") {
      const n = k === "publicUrl" ? normalizePublicUrl(raw) : normalizeHttpUrl(raw);
      if (!n) invalid.push(k);
      else writes.push([k, n]);
      continue;
    }
    // A masked value sent back by a form means "unchanged", never a new key.
    if (k === "aiCloudKey" && raw.startsWith("••••")) continue;
    writes.push([k, raw]);
  }
  if (invalid.length) return { ok: false, error: "invalid_url", keys: invalid };
  const now = new Date().toISOString();
  db.exec("BEGIN");
  try {
    for (const [k, v] of writes) {
      if (v === null) db.prepare("DELETE FROM settings WHERE key = ?").run(k);
      else
        db.prepare("INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at").run(
          k,
          v,
          now,
        );
    }
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return { ok: true };
}
