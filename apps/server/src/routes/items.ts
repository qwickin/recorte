import { extractColors } from "@recorte/ai";
import { type Item, ItemPatch, ListQuery, UploadMeta, normalizeTags } from "@recorte/shared";
import type { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import sharp from "sharp";
import { z } from "zod";
import { type AppEnv, requireUser } from "../auth/middleware";
import type { Deps } from "../deps";
import { ULID_RE, captureTime, ulidAt } from "../ids";
import { BadCursor, itemsRepo } from "../items/repo";
import { itemService } from "../items/service";
import { FILE_NAME_RE } from "../storage";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const MAX_ORIGINAL_WIDTH = 3200;
const THUMB_WIDTH = 640;
const WEBP_MAX_DIM = 16383;
// Full page max 12 000 CSS px x DPR 2 x ~2880 px wide ~ 69M pixels.
const MAX_INPUT_PIXELS = 120_000_000;

const Bulk = z.object({
  ids: z.array(z.string()).min(1).max(200),
  action: z.enum(["delete", "restore", "patch"]),
  patch: ItemPatch.optional(),
});

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
};

const MIME: Record<string, string> = { webp: "image/webp", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", mp4: "video/mp4" };

export function itemRoutes(app: Hono<AppEnv>, deps: Deps): void {
  const auth = requireUser(deps.db);
  const repo = itemsRepo(deps.db);
  const svc = itemService(deps);
  const categoryOk = (userId: string, id: string): boolean =>
    !!deps.db.prepare("SELECT 1 FROM categories WHERE id = ? AND user_id = ?").get(id, userId);

  app.post(
    "/api/items",
    auth,
    bodyLimit({ maxSize: MAX_UPLOAD_BYTES + 512 * 1024, onError: (c) => c.json({ error: "payload_too_large" }, 413) }),
    async (c) => {
      const userId = c.var.userId;
      let form: Record<string, string | File | (string | File)[]>;
      try {
        form = await c.req.parseBody();
      } catch {
        return c.json({ error: "invalid_body" }, 400);
      }
      const image = form.image;
      const rawMeta = form.meta;
      if (!(image instanceof File) || typeof rawMeta !== "string") return c.json({ error: "invalid_body" }, 400);
      if (image.size > MAX_UPLOAD_BYTES) return c.json({ error: "payload_too_large" }, 413);
      let parsed: UploadMeta;
      try {
        parsed = UploadMeta.parse(JSON.parse(rawMeta));
      } catch {
        return c.json({ error: "invalid_meta" }, 400);
      }
      if (parsed.categoryId && !categoryOk(userId, parsed.categoryId)) {
        // A category deleted (or never ours) while the capture waited in the queue: keep the capture, drop the link.
        console.warn(`upload: unknown category ${parsed.categoryId.slice(0, 64)} for user ${userId}; saving without category`);
        parsed.categoryId = null;
      }

      let original: Buffer, thumb: Buffer;
      let width: number, height: number;
      const input = Buffer.from(await image.arrayBuffer());
      try {
        // Header-only check, before any pixel decoding.
        const head = await sharp(input, { limitInputPixels: false }).metadata();
        if ((head.width ?? 0) * (head.height ?? 0) > MAX_INPUT_PIXELS) return c.json({ error: "image_too_large" }, 413);
      } catch {
        return c.json({ error: "invalid_image" }, 400);
      }
      try {
        const base = () => sharp(input, { limitInputPixels: MAX_INPUT_PIXELS }).rotate();
        const o = await base()
          .resize({ width: MAX_ORIGINAL_WIDTH, height: WEBP_MAX_DIM, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 90 })
          .toBuffer({ resolveWithObject: true });
        original = o.data;
        width = o.info.width;
        height = o.info.height;
        thumb = await sharp(original).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
      } catch {
        return c.json({ error: "invalid_image" }, 400);
      }
      const colors = await extractColors(thumb).catch(() => ({ dominant: "#000000", names: [] as string[] }));

      // Ordered by capture time (keyset: createdAt DESC, id DESC), so a capture that waited in the offline queue
      // lands where it was taken. Normalised ISO string: the keyset compares created_at as text.
      const now = Date.now();
      const captured = captureTime(parsed.capturedAt, now);
      const id = ulidAt(captured);
      const createdAt = new Date(captured).toISOString();
      const nowIso = new Date(now).toISOString();
      const meta: Item = {
        id,
        userId,
        type: parsed.type,
        kind: parsed.kind,
        source: { url: parsed.url, site: hostOf(parsed.url), pageTitle: parsed.pageTitle },
        createdAt,
        updatedAt: nowIso,
        deletedAt: null,
        media: [{ file: "original.webp", thumb: "thumb.webp", width, height, color: colors.dominant, role: "main" }],
        user: {
          ...(parsed.title?.trim() ? { title: parsed.title.trim() } : {}),
          ...(parsed.note?.trim() ? { note: parsed.note.trim() } : {}),
          tags: normalizeTags(parsed.tags),
          categoryId: parsed.categoryId,
          hiddenAiTags: [],
        },
        ai: { tipo: [], visual: [], keys: [], colors: colors.names, model: "", processedAt: null },
        text: parsed.text,
        ...(parsed.truncated ? { truncated: true } : {}),
      };
      try {
        deps.storage.writeFile(userId, id, "original.webp", original);
        deps.storage.writeFile(userId, id, "thumb.webp", thumb);
        return c.json(await svc.create(meta), 201);
      } catch (e) {
        // Do not leave an orphan directory (files without a row) behind.
        try {
          if (!repo.owns(userId, id)) deps.storage.removeItem(userId, id);
        } catch {}
        throw e;
      }
    },
  );

  app.get("/api/items", auth, (c) => {
    const q = ListQuery.safeParse(flatQuery(c.req.queries()));
    if (!q.success) return c.json({ error: "invalid_query" }, 400);
    try {
      return c.json(repo.list(c.var.userId, q.data));
    } catch (e) {
      if (e instanceof BadCursor) return c.json({ error: "invalid_cursor" }, 400);
      throw e;
    }
  });

  // Registered before /:id routes' siblings; POST so no clash with GET/PATCH/DELETE on :id.
  app.post("/api/items/bulk", auth, async (c) => {
    const body = Bulk.safeParse(await c.req.json().catch(() => null));
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    const { ids, action, patch } = body.data;
    if (action === "patch" && !patch) return c.json({ error: "invalid_body" }, 400);
    if (patch?.categoryId && !categoryOk(c.var.userId, patch.categoryId)) return c.json({ error: "invalid_category" }, 400);
    const done: string[] = [];
    for (const id of new Set(ids)) {
      if (!ULID_RE.test(id) || !repo.owns(c.var.userId, id)) continue;
      const ok =
        action === "delete" ? await svc.softDelete(c.var.userId, id)
        : action === "restore" ? !!(await svc.restore(c.var.userId, id))
        : !!(await svc.patch(c.var.userId, id, patch!));
      if (ok) done.push(id);
    }
    return c.json({ ids: done });
  });

  app.get("/api/items/:id", auth, (c) => {
    const id = c.req.param("id");
    if (!ULID_RE.test(id) || !repo.owns(c.var.userId, id)) return c.json({ error: "not_found" }, 404);
    const m = deps.storage.readMeta(c.var.userId, id);
    return m ? c.json(m) : c.json({ error: "not_found" }, 404);
  });

  app.patch("/api/items/:id", auth, async (c) => {
    const id = c.req.param("id");
    const patch = ItemPatch.safeParse(await c.req.json().catch(() => null));
    if (!patch.success) return c.json({ error: "invalid_body" }, 400);
    if (!ULID_RE.test(id) || !repo.owns(c.var.userId, id)) return c.json({ error: "not_found" }, 404);
    if (patch.data.categoryId && !categoryOk(c.var.userId, patch.data.categoryId)) return c.json({ error: "invalid_category" }, 400);
    const m = await svc.patch(c.var.userId, id, patch.data);
    return m ? c.json(m) : c.json({ error: "not_found" }, 404);
  });

  app.delete("/api/items/:id", auth, async (c) => {
    const id = c.req.param("id");
    if (!ULID_RE.test(id) || !repo.owns(c.var.userId, id)) return c.json({ error: "not_found" }, 404);
    await svc.softDelete(c.var.userId, id);
    return c.body(null, 204);
  });

  app.post("/api/items/:id/restore", auth, async (c) => {
    const id = c.req.param("id");
    if (!ULID_RE.test(id) || !repo.owns(c.var.userId, id)) return c.json({ error: "not_found" }, 404);
    const m = await svc.restore(c.var.userId, id);
    return m ? c.json(m) : c.json({ error: "not_found" }, 404);
  });

  app.get("/api/items/:id/files/:name", auth, (c) => {
    const id = c.req.param("id");
    const name = c.req.param("name");
    if (!ULID_RE.test(id) || !FILE_NAME_RE.test(name) || !repo.owns(c.var.userId, id)) return c.json({ error: "not_found" }, 404);
    const data = deps.storage.readFile(c.var.userId, id, name);
    if (!data) return c.json({ error: "not_found" }, 404);
    return c.body(new Uint8Array(data), 200, {
      "content-type": MIME[name.split(".").pop()!] ?? "application/octet-stream",
      "cache-control": "private, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
    });
  });
}

/** Hono gives string[] per key; the schema wants a single value except tags ("a,b" or repeated). */
export function flatQuery(q: Record<string, string[]>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q)) out[k] = k === "tags" ? v.join(",") : v[0]!;
  return out;
}
