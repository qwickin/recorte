// Real server client (same origin, cookie session). Replaces the prototype mock; same method names where they exist.
import {
  API,
  type Category,
  type Device,
  type ExtensionInfo,
  type Item,
  type ItemPage,
  type ItemPatch,
  type ItemType,
  type SearchHit,
  type TagCount,
} from "@recorte/shared";

export type Filters = {
  tags: string[];
  site?: string;
  type?: ItemType;
  color?: string;
  category?: string;
  from?: string; // yyyy-mm-dd
  to?: string; // yyyy-mm-dd (inclusive, the server extends it to the end of the day)
};

export const EMPTY_FILTERS: Filters = { tags: [] };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
    this.name = "ApiError";
  }
}

/** Builds the listing/search query. Empty values are left out; tags go as one comma list. */
export function filtersToQuery(f: Filters, extra: Record<string, string | number | null | undefined> = {}): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(extra)) if (v !== null && v !== undefined && v !== "") p.set(k, String(v));
  if (f.tags.length) p.set("tags", f.tags.join(","));
  for (const k of ["site", "type", "color", "category", "from", "to"] as const) {
    const v = f[k]?.trim();
    if (v) p.set(k, v);
  }
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const hasFilters = (f: Filters) => f.tags.length > 0 || !!(f.site || f.type || f.color || f.category || f.from || f.to);

type Opts = { signal?: AbortSignal };
type Fetch = typeof fetch;

export type ClientOptions = {
  fetch?: Fetch;
  /** Called on any 401 except from the login call itself. */
  onUnauthorized?: () => void;
};

export function createClient({ fetch: f = (...a) => fetch(...a), onUnauthorized }: ClientOptions = {}) {
  async function req<T>(method: string, path: string, body?: unknown, opts: Opts & { no401?: boolean } = {}): Promise<T> {
    const res = await f(path, {
      method,
      credentials: "same-origin",
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: opts.signal,
    });
    if (res.status === 401 && !opts.no401) onUnauthorized?.();
    if (!res.ok) {
      let code = `http_${res.status}`;
      try {
        code = ((await res.json()) as { error?: string }).error ?? code;
      } catch {}
      throw new ApiError(res.status, code);
    }
    if (res.status === 204) return undefined as T;
    const type = res.headers.get("content-type") ?? "";
    return (type.includes("json") ? await res.json() : undefined) as T;
  }

  const get = <T>(path: string, o?: Opts) => req<T>("GET", path, undefined, o);

  return {
    // ---- auth ----
    setupStatus: (o?: Opts) => req<{ needsSetup: boolean }>("GET", API.setup, undefined, { ...o, no401: true }),
    setup: (b: { token: string; email: string; password: string }) => req<{ ok: true }>("POST", API.setup, b, { no401: true }),
    login: (b: { email: string; password: string }) => req<{ ok: true }>("POST", API.login, b, { no401: true }),
    logout: () => req<{ ok: true }>("POST", API.logout, {}, { no401: true }),
    me: (o?: Opts) => get<{ id: string; email: string }>("/api/me", o),
    changePassword: (b: { currentPassword: string; newPassword: string }) => req<{ ok: true }>("POST", "/api/me/password", b),

    // ---- items ----
    listItems(p: { filters?: Filters; cursor?: string | null; limit?: number; trash?: boolean } & Opts = {}) {
      const q = filtersToQuery(p.filters ?? EMPTY_FILTERS, { cursor: p.cursor, limit: p.limit, trash: p.trash ? 1 : undefined });
      return get<ItemPage>(API.items + q, p);
    },
    getItem: (id: string, o?: Opts) => get<Item>(API.item(id), o),
    patchItem: (id: string, patch: ItemPatch) => req<Item>("PATCH", API.item(id), patch),
    deleteItem: (id: string) => req<void>("DELETE", API.item(id)),
    restoreItem: (id: string) => req<Item>("POST", API.itemRestore(id), {}),
    bulk: (b: { ids: string[]; action: "delete" | "restore" | "patch"; patch?: ItemPatch }) => req<{ ids: string[] }>("POST", API.itemsBulk, b),
    listTags: (o?: Opts) => get<TagCount[]>(API.tags, o),
    search(q: string, p: { filters?: Filters; limit?: number } & Opts = {}) {
      return get<SearchHit[]>(API.search + filtersToQuery(p.filters ?? EMPTY_FILTERS, { q, limit: p.limit }), p);
    },

    // ---- categories ----
    listCategories: (o?: Opts) => get<Category[]>(API.categories, o),
    createCategory: (b: { name: string; color?: string }) => req<Category>("POST", API.categories, b),
    updateCategory: (id: string, b: { name?: string; color?: string | null }) => req<Category>("PATCH", API.category(id), b),
    deleteCategory: (id: string) => req<void>("DELETE", API.category(id)),

    // ---- devices / extension / admin ----
    listDevices: (o?: Opts) => get<Device[]>(API.devices, o),
    revokeDevice: (id: string) => req<{ ok: true }>("DELETE", API.device(id)),
    extensionInfo: (o?: Opts) => get<ExtensionInfo>(API.extension, o),
    reprocess: () => req<{ queued: number }>("POST", API.adminReprocess, {}),
    reindex: () => req<{ items: number; removed: number; indexed: boolean }>("POST", API.adminReindex, {}),
  };
}

export type Client = ReturnType<typeof createClient>;

export const originalUrl = (id: string) => API.itemFile(id, "original.webp");
