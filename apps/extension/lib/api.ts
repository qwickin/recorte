import { API, type CaptureKind, type Category, type ExtensionInfo, type ItemText, type TagCount, UploadMeta, normalizeTags } from "@recorte/shared";

/** Hard cap on extracted text sent with an item (spec §6). */
export const MAX_TEXT_CHARS = 20_000;

export interface Connection {
  server: string;
  token: string;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(`HTTP ${status}${code ? ` (${code})` : ""}`);
    this.name = "ApiError";
  }
}

export function isHttpUrl(url: string | undefined | null): url is string {
  if (!url) return false;
  try {
    const p = new URL(url).protocol;
    return p === "http:" || p === "https:";
  } catch {
    return false;
  }
}

/** "recorte.example.com/" → "https://recorte.example.com". Returns null when it cannot be a server URL. */
export function normalizeServerUrl(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.origin}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/** Server URLs in responses may be relative ("/auth/ticket?t=…"). */
export function absoluteUrl(server: string, url: string): string {
  return /^https?:\/\//i.test(url) ? url : `${server}${url.startsWith("/") ? "" : "/"}${url}`;
}

/** Applies the 20 000-char cap across all text fields: page metadata first, the captured text gets the rest. */
export function capItemText(text: ItemText, max = MAX_TEXT_CHARS): ItemText {
  let budget = max;
  const take = (s: string): string => {
    const out = s.slice(0, Math.max(0, budget));
    budget -= out.length;
    return out;
  };
  const description = text.meta.description !== undefined ? take(text.meta.description) : undefined;
  let og: Record<string, string> | undefined;
  if (text.meta.og) {
    og = {};
    for (const [k, v] of Object.entries(text.meta.og)) {
      if (budget <= 0) break;
      og[k] = take(v);
    }
  }
  const headings: string[] = [];
  for (const h of text.headings) {
    if (budget <= 0) break;
    headings.push(take(h));
  }
  const alts: string[] = [];
  for (const a of text.alts) {
    if (budget <= 0) break;
    alts.push(take(a));
  }
  const selection = take(text.selection);
  const meta: ItemText["meta"] = {};
  if (description !== undefined) meta.description = description;
  if (og && Object.keys(og).length) meta.og = og;
  return { selection, meta, headings, alts };
}

export interface MetaInput {
  kind: CaptureKind;
  url: string;
  pageTitle: string;
  title?: string;
  note?: string;
  tags?: string[];
  categoryId?: string | null;
  text: ItemText;
  truncated?: boolean;
  capturedAt?: string;
}

/** Builds the `meta` part of `POST /api/items`. Throws for non-http(s) pages — those cannot be captured. */
export function buildUploadMeta(input: MetaInput): UploadMeta {
  if (!isHttpUrl(input.url)) throw new Error("Só se podem guardar páginas http:// ou https://.");
  const title = input.title?.trim();
  const note = input.note?.trim();
  const meta: UploadMeta = {
    type: "screenshot",
    kind: input.kind,
    url: input.url,
    pageTitle: input.pageTitle.trim().slice(0, 500),
    tags: normalizeTags(input.tags ?? []),
    categoryId: input.categoryId ?? null,
    text: capItemText(input.text),
    capturedAt: input.capturedAt ?? new Date().toISOString(),
  };
  if (title) meta.title = title.slice(0, 500);
  if (note) meta.note = note;
  if (input.truncated) meta.truncated = true;
  return UploadMeta.parse(meta);
}

// ---------------------------------------------------------------------------------------------------------------
// HTTP. Only the background (service worker / event page) calls these; content scripts go through messages.

function headers(conn: Connection, version: string, extra?: Record<string, string>): Record<string, string> {
  return { authorization: `Bearer ${conn.token}`, "x-extension-version": version, ...extra };
}

async function errorCode(res: Response): Promise<string> {
  try {
    const b = (await res.json()) as { error?: unknown };
    return typeof b.error === "string" ? b.error : "";
  } catch {
    return "";
  }
}

async function getJson<T>(conn: Connection, version: string, path: string): Promise<T> {
  const res = await fetch(`${conn.server}${path}`, { headers: headers(conn, version), credentials: "omit" });
  if (!res.ok) throw new ApiError(res.status, await errorCode(res));
  return (await res.json()) as T;
}

async function postJson<T>(conn: Connection, version: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${conn.server}${path}`, {
    method: "POST",
    headers: headers(conn, version, { "content-type": "application/json" }),
    body: JSON.stringify(body ?? {}),
    credentials: "omit",
  });
  if (!res.ok) throw new ApiError(res.status, await errorCode(res));
  return (await res.json()) as T;
}

/** Exchanges credentials for a device token. The password is not stored anywhere. */
export async function registerDevice(
  server: string,
  email: string,
  password: string,
  name: string,
): Promise<{ token: string; id: string }> {
  const res = await fetch(`${server}${API.devices}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name }),
    credentials: "omit",
  });
  if (!res.ok) throw new ApiError(res.status, await errorCode(res));
  return (await res.json()) as { token: string; id: string };
}

export const fetchMe = (c: Connection, v: string) => getJson<{ id: string; email: string }>(c, v, "/api/me");
export const fetchTags = (c: Connection, v: string) => getJson<TagCount[]>(c, v, API.tags);
export const fetchCategories = (c: Connection, v: string) => getJson<Category[]>(c, v, API.categories);
export const createCategory = (c: Connection, v: string, name: string) => postJson<Category>(c, v, API.categories, { name });
export const fetchExtensionInfo = (c: Connection, v: string) => getJson<ExtensionInfo>(c, v, API.extension);
export const createTicket = (c: Connection, v: string) => postJson<{ ticket: string; url: string }>(c, v, API.authTicket);

export type UploadResult = { ok: true; status: number; body: unknown } | { ok: false; status: number; error: string };

/** `POST /api/items`. Never throws: network failures come back as status 0. */
export async function uploadItem(
  conn: Connection,
  version: string,
  image: ArrayBuffer,
  mime: string,
  meta: UploadMeta,
): Promise<UploadResult> {
  const form = new FormData();
  const ext = mime === "image/webp" ? "webp" : mime === "image/png" ? "png" : "jpg";
  form.append("image", new Blob([image], { type: mime }), `capture.${ext}`);
  form.append("meta", JSON.stringify(meta));
  try {
    const res = await fetch(`${conn.server}${API.items}`, {
      method: "POST",
      headers: headers(conn, version),
      body: form,
      credentials: "omit",
    });
    if (res.ok) return { ok: true, status: res.status, body: await res.json().catch(() => null) };
    return { ok: false, status: res.status, error: await errorCode(res) };
  } catch (e) {
    return { ok: false, status: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Best-effort revoke of this device's token (on "Desligar"). */
export async function revokeDevice(conn: Connection, version: string, deviceId: string): Promise<void> {
  await fetch(`${conn.server}${API.device(deviceId)}`, { method: "DELETE", headers: headers(conn, version), credentials: "omit" });
}
