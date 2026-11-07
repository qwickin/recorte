import type { Hono } from "hono";
import { type AppEnv, requireUser } from "../auth/middleware";
import type { Deps } from "../deps";
import { itemsRepo } from "../items/repo";

export function tagRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const repo = itemsRepo(deps.db);
  app.get("/api/tags", requireUser(deps.db), (c) => c.json(repo.tagCounts(c.var.userId)));
}
