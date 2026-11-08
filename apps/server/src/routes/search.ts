import { ListQuery, type SearchHit, canonicalTags } from "@recorte/shared";
import type { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireUser } from "../auth/middleware";
import type { Deps } from "../deps";
import { itemsRepo } from "../items/repo";
import { flatQuery } from "./items";

const SearchParams = ListQuery.pick({ type: true, site: true, category: true, color: true, tags: true }).extend({
  q: z.string().trim().min(1).max(300),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function searchRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const repo = itemsRepo(deps.db);
  app.get("/api/search", requireUser(deps.db), async (c) => {
    const p = SearchParams.safeParse(flatQuery(c.req.queries()));
    if (!p.success) return c.json({ error: "invalid_query" }, 400);
    const userId = c.var.userId; // always the session's user, never a query parameter
    let results;
    try {
      results = await deps.search.search({ ...p.data, userId, tags: canonicalTags(p.data.tags ?? []) });
    } catch (e) {
      console.warn("search failed:", (e as Error).message);
      return c.json({ error: "search_unavailable" }, 503);
    }
    const rows = repo.summariesByIds(userId, results.map((r) => r.id));
    const hits: SearchHit[] = [];
    for (const r of results) {
      const item = rows.get(r.id);
      if (item) hits.push({ item, score: r.score, highlight: r.highlight });
    }
    return c.json(hits);
  });
}
