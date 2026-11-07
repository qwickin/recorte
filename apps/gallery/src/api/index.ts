import { navigate } from "../lib/router";
import { createClient } from "./client";

const PUBLIC = new Set(["/login", "/setup"]);

/** The app-wide client: any 401 (expired session) sends the user to /login. */
export const api = createClient({
  onUnauthorized: () => {
    if (!PUBLIC.has(window.location.pathname)) navigate("/login", { replace: true });
  },
});

export { ApiError, EMPTY_FILTERS, filtersToQuery, hasFilters, originalUrl, type Filters } from "./client";
