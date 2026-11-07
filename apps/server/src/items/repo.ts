import { type Item, type ItemPage, type ItemSummary, type ListQuery, type TagCount, normalizeTags } from "@recorte/shared";
import type { Db } from "../db";

export class BadCursor extends Error {}

/** Shown tags = (user ∪ ai.tipo ∪ ai.visual) − hiddenAiTags, user first. */
export function displayedTags(meta: Item): { tag: string; origin: "user" | "ai" }[] {
  const hidden = new Set(meta.user.hiddenAiTags);
  const out: { tag: string; origin: "user" | "ai" }[] = [];
  for (const tag of meta.user.tags) out.push({ tag, origin: "user" });
  for (const tag of [...meta.ai.tipo, ...meta.ai.visual]) if (!hidden.has(tag)) out.push({ tag, origin: "ai" });
  return out;
}

export const displayTitle = (m: Item): string => m.user.title || m.ai.title || m.source.pageTitle;

export function summaryFromMeta(m: Item): ItemSummary {
  const media = m.media[0];
  const tags: string[] = [];
  for (const { tag } of displayedTags(m)) if (!tags.includes(tag)) tags.push(tag);
  return {
    id: m.id,
    type: m.type,
    ...(m.kind ? { kind: m.kind } : {}),
    site: m.source.site,
    url: m.source.url,
    title: displayTitle(m),
    createdAt: m.createdAt,
    thumb: media ? `/api/items/${m.id}/files/${media.thumb}` : null,
    width: media?.width ?? 0,
    height: media?.height ?? 0,
    color: media?.color ?? "#000000",
    tags,
    hasNote: !!m.user.note?.trim(),
  };
}

interface Row {
  id: string;
  user_id: string;
  type: ItemSummary["type"];
  kind: ItemSummary["kind"] | null;
  site: string;
  url: string;
  title: string;
  created_at: string;
  thumb: string;
  width: number;
  height: number;
  color: string;
  has_note: number;
}

export const encodeCursor = (createdAt: string, id: string): string => Buffer.from(`${createdAt}|${id}`).toString("base64url");

export function decodeCursor(cursor: string): { createdAt: string; id: string } {
  const raw = Buffer.from(cursor, "base64url").toString("utf8");
  const i = raw.indexOf("|");
  if (i < 1 || i === raw.length - 1 || !/^[0-9TZ:.\-+]+$/.test(raw.slice(0, i))) throw new BadCursor("bad cursor");
  return { createdAt: raw.slice(0, i), id: raw.slice(i + 1) };
}

function summariesFromRows(db: Db, rows: Row[]): ItemSummary[] {
  const tagMap = new Map<string, string[]>();
  if (rows.length) {
    const trows = db
      .prepare(`SELECT item_id, tag FROM item_tags WHERE item_id IN (${rows.map(() => "?").join(",")}) ORDER BY item_id, pos`)
      .all(...rows.map((r) => r.id)) as { item_id: string; tag: string }[];
    for (const t of trows) {
      const a = tagMap.get(t.item_id) ?? [];
      if (!a.includes(t.tag)) a.push(t.tag);
      tagMap.set(t.item_id, a);
    }
  }
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    ...(r.kind ? { kind: r.kind } : {}),
    site: r.site,
    url: r.url,
    title: r.title,
    createdAt: r.created_at,
    // "" = no image (a link without an OG image).
    thumb: r.thumb ? `/api/items/${r.id}/files/${r.thumb}` : null,
    width: r.width,
    height: r.height,
    color: r.color,
    tags: tagMap.get(r.id) ?? [],
    hasNote: !!r.has_note,
  }));
}

export function itemsRepo(db: Db) {
  const tx = <T>(fn: () => T): T => {
    if (db.isTransaction) return fn();
    db.exec("BEGIN");
    try {
      const r = fn();
      db.exec("COMMIT");
      return r;
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  };

  return {
    /** (Re)build the SQLite mirror of one item from its meta.json. */
    upsertFromMeta(m: Item): void {
      const media = m.media[0];
      tx(() => {
        db.prepare(
          `INSERT INTO items (id, user_id, type, kind, site, url, title, created_at, deleted_at, category_id, thumb, width, height, color, has_note)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(id) DO UPDATE SET type = excluded.type, kind = excluded.kind, site = excluded.site, url = excluded.url,
             title = excluded.title, deleted_at = excluded.deleted_at, category_id = excluded.category_id, thumb = excluded.thumb,
             width = excluded.width, height = excluded.height, color = excluded.color, has_note = excluded.has_note`,
        ).run(
          m.id, m.userId, m.type, m.kind ?? null, m.source.site, m.source.url, displayTitle(m), m.createdAt, m.deletedAt,
          m.user.categoryId, media?.thumb ?? "", media?.width ?? 0, media?.height ?? 0, media?.color ?? "#000000",
          m.user.note?.trim() ? 1 : 0,
        );
        db.prepare("DELETE FROM item_tags WHERE item_id = ?").run(m.id);
        db.prepare("DELETE FROM item_colors WHERE item_id = ?").run(m.id);
        const ins = db.prepare("INSERT OR IGNORE INTO item_tags (item_id, tag, origin, pos) VALUES (?, ?, ?, ?)");
        displayedTags(m).forEach((t, i) => ins.run(m.id, t.tag, t.origin, i));
        const insC = db.prepare("INSERT OR IGNORE INTO item_colors (item_id, color) VALUES (?, ?)");
        for (const c of m.ai.colors) insC.run(m.id, c.toLowerCase());
      });
    },

    /** Row owner check: the item's mirror row, scoped to the user. */
    owns(userId: string, id: string): { deletedAt: string | null } | null {
      const r = db.prepare("SELECT deleted_at FROM items WHERE id = ? AND user_id = ?").get(id, userId) as
        | { deleted_at: string | null }
        | undefined;
      return r ? { deletedAt: r.deleted_at } : null;
    },

    list(userId: string, q: ListQuery): ItemPage {
      const where = ["i.user_id = ?", q.trash ? "i.deleted_at IS NOT NULL" : "i.deleted_at IS NULL"];
      const params: (string | number)[] = [userId];
      const tags = normalizeTags(q.tags ?? []);
      if (tags.length) {
        where.push(
          `i.id IN (SELECT item_id FROM item_tags WHERE tag IN (${tags.map(() => "?").join(",")}) GROUP BY item_id HAVING COUNT(DISTINCT tag) = ?)`,
        );
        params.push(...tags, tags.length);
      }
      if (q.category) (where.push("i.category_id = ?"), params.push(q.category));
      if (q.site) (where.push("i.site = ?"), params.push(q.site.toLowerCase()));
      if (q.type) (where.push("i.type = ?"), params.push(q.type));
      if (q.color) (where.push("EXISTS (SELECT 1 FROM item_colors c WHERE c.item_id = i.id AND c.color = ?)"), params.push(q.color.toLowerCase()));
      if (q.from) (where.push("i.created_at >= ?"), params.push(q.from));
      if (q.to) (where.push("i.created_at <= ?"), params.push(q.to.length === 10 ? `${q.to}T23:59:59.999Z` : q.to));
      const base = where.join(" AND ");
      const total = (db.prepare(`SELECT COUNT(*) AS n FROM items i WHERE ${base}`).get(...params) as { n: number }).n;

      let pageWhere = base;
      const pageParams = [...params];
      if (q.cursor) {
        const c = decodeCursor(q.cursor);
        pageWhere += " AND (i.created_at < ? OR (i.created_at = ? AND i.id < ?))";
        pageParams.push(c.createdAt, c.createdAt, c.id);
      }
      const rows = db
        .prepare(`SELECT i.* FROM items i WHERE ${pageWhere} ORDER BY i.created_at DESC, i.id DESC LIMIT ?`)
        .all(...pageParams, q.limit + 1) as unknown as Row[];
      const hasMore = rows.length > q.limit;
      const pageRows = rows.slice(0, q.limit);

      const items = summariesFromRows(db, pageRows);
      const last = pageRows[pageRows.length - 1];
      return { items, nextCursor: hasMore && last ? encodeCursor(last.created_at, last.id) : null, total };
    },

    /** Tag counts over live items only, hidden AI tags already excluded at upsert time. */
    tagCounts(userId: string): TagCount[] {
      const rows = db
        .prepare(
          `SELECT t.tag AS tag, COUNT(DISTINCT t.item_id) AS count, GROUP_CONCAT(DISTINCT t.origin) AS origins
           FROM item_tags t JOIN items i ON i.id = t.item_id
           WHERE i.user_id = ? AND i.deleted_at IS NULL
           GROUP BY t.tag ORDER BY count DESC, t.tag ASC`,
        )
        .all(userId) as { tag: string; count: number; origins: string }[];
      return rows.map((r) => ({
        tag: r.tag,
        count: r.count,
        origin: r.origins.includes(",") ? "both" : (r.origins as "user" | "ai"),
      }));
    },

    /** Live (not deleted) summaries of the user's items among `ids`, keyed by id. */
    summariesByIds(userId: string, ids: string[]): Map<string, ItemSummary> {
      if (!ids.length) return new Map();
      const rows = db
        .prepare(`SELECT * FROM items WHERE user_id = ? AND deleted_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`)
        .all(userId, ...ids) as unknown as Row[];
      return new Map(summariesFromRows(db, rows).map((s) => [s.id, s]));
    },

    /** Ids of every mirror row of the user (live and trashed). */
    allIds(userId: string): string[] {
      return (db.prepare("SELECT id FROM items WHERE user_id = ?").all(userId) as { id: string }[]).map((r) => r.id);
    },

    idsByCategory(userId: string, categoryId: string): string[] {
      return (db.prepare("SELECT id FROM items WHERE user_id = ? AND category_id = ?").all(userId, categoryId) as { id: string }[]).map((r) => r.id);
    },

    liveIds(userId: string): string[] {
      return (
        db.prepare("SELECT id FROM items WHERE user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC, id DESC").all(userId) as { id: string }[]
      ).map((r) => r.id);
    },

    expiredTrash(before: string): { id: string; userId: string }[] {
      return (
        db.prepare("SELECT id, user_id FROM items WHERE deleted_at IS NOT NULL AND deleted_at < ?").all(before) as { id: string; user_id: string }[]
      ).map((r) => ({ id: r.id, userId: r.user_id }));
    },

    deleteRow(id: string): void {
      db.prepare("DELETE FROM items WHERE id = ?").run(id);
    },
  };
}
