export const API = {
  setup: "/api/setup",
  login: "/api/login",
  logout: "/api/logout",
  authTicketRedirect: "/auth/ticket",
  authTicket: "/api/auth/ticket",
  devices: "/api/devices",
  device: (id: string) => `/api/devices/${id}`,
  items: "/api/items",
  item: (id: string) => `/api/items/${id}`,
  itemRestore: (id: string) => `/api/items/${id}/restore`,
  itemsBulk: "/api/items/bulk",
  itemFile: (id: string, name: string) => `/api/items/${id}/files/${name}`,
  tags: "/api/tags",
  categories: "/api/categories",
  category: (id: string) => `/api/categories/${id}`,
  search: "/api/search",
  events: "/api/events",
  extension: "/api/extension",
  downloadChrome: "/downloads/recorte-chrome.zip",
  downloadFirefox: "/downloads/recorte-firefox.zip",
  adminReprocess: "/api/admin/reprocess",
  adminReindex: "/api/admin/reindex",
  export: "/api/export",
  health: "/api/health",
  me: "/api/me",
  mePassword: "/api/me/password",
  settings: "/api/settings",
} as const;

/** Gallery pages (client-side routes). */
export const PAGE = {
  gallery: "/",
  extension: "/extension",
  settings: "/settings",
  trash: "/trash",
  login: "/login",
  setup: "/setup",
} as const;

/**
 * The gallery's old pt-PT slugs → the current ones. Kept forever: installed extensions (and bookmarks) link to
 * /extensao. The server answers them with a 301; the gallery also maps them itself (an offline PWA shell).
 */
export const LEGACY_PAGES: Readonly<Record<string, string>> = {
  "/extensao": PAGE.extension,
  "/definicoes": PAGE.settings,
  "/lixo": PAGE.trash,
};
