import type { Hono } from "hono";
import { z } from "zod";
import { type AppEnv, requireUser } from "../auth/middleware";
import type { Deps } from "../deps";
import { ulid } from "../ids";
import { itemsRepo, summaryFromMeta } from "../items/repo";
import { itemService } from "../items/service";

const Create = z.object({ name: z.string().trim().min(1).max(60), color: z.string().trim().max(20).optional() });
const Update = z.object({ name: z.string().trim().min(1).max(60).optional(), color: z.string().trim().max(20).nullable().optional() });

interface Row {
  id: string;
  name: string;
  color: string | null;
}
const out = (r: Row) => ({ id: r.id, name: r.name, ...(r.color ? { color: r.color } : {}) });

export function categoryRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const auth = requireUser(deps.db);
  const { db } = deps;
  const find = (userId: string, id: string) =>
    db.prepare("SELECT id, name, color FROM categories WHERE id = ? AND user_id = ?").get(id, userId) as Row | undefined;
  const taken = (userId: string, name: string, exceptId = "") =>
    !!db.prepare("SELECT 1 FROM categories WHERE user_id = ? AND name = ? AND id != ?").get(userId, name, exceptId);

  app.get("/api/categories", auth, (c) =>
    c.json((db.prepare("SELECT id, name, color FROM categories WHERE user_id = ? ORDER BY name COLLATE NOCASE").all(c.var.userId) as unknown as Row[]).map(out)),
  );

  app.post("/api/categories", auth, async (c) => {
    const b = Create.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: "invalid_body" }, 400);
    if (taken(c.var.userId, b.data.name)) return c.json({ error: "name_taken" }, 409);
    const id = ulid();
    db.prepare("INSERT INTO categories (id, user_id, name, color, created_at) VALUES (?, ?, ?, ?, ?)").run(
      id, c.var.userId, b.data.name, b.data.color ?? null, new Date().toISOString(),
    );
    return c.json(out(find(c.var.userId, id)!), 201);
  });

  app.patch("/api/categories/:id", auth, async (c) => {
    const cur = find(c.var.userId, c.req.param("id"));
    if (!cur) return c.json({ error: "not_found" }, 404);
    const b = Update.safeParse(await c.req.json().catch(() => null));
    if (!b.success) return c.json({ error: "invalid_body" }, 400);
    const name = b.data.name ?? cur.name;
    if (taken(c.var.userId, name, cur.id)) return c.json({ error: "name_taken" }, 409);
    const color = b.data.color === undefined ? cur.color : b.data.color;
    db.prepare("UPDATE categories SET name = ?, color = ? WHERE id = ?").run(name, color, cur.id);
    return c.json(out({ id: cur.id, name, color }));
  });

  app.delete("/api/categories/:id", auth, async (c) => {
    const userId = c.var.userId;
    const cur = find(userId, c.req.param("id"));
    if (!cur) return c.json({ error: "not_found" }, 404);
    const repo = itemsRepo(db);
    const svc = itemService(deps);
    for (const itemId of repo.idsByCategory(userId, cur.id)) {
      const m = deps.storage.readMeta(userId, itemId);
      if (!m) continue;
      const next = { ...m, user: { ...m.user, categoryId: null }, updatedAt: new Date().toISOString() };
      svc.persist(next);
      if (next.deletedAt) continue; // trashed: not in the gallery nor in search
      deps.events.emit(userId, { type: "item.updated", data: summaryFromMeta(next) });
      await svc.syncSearch(next, "index"); // best effort; enqueues an `index` retry when search is down
    }
    db.prepare("DELETE FROM categories WHERE id = ?").run(cur.id);
    return c.body(null, 204);
  });
}
