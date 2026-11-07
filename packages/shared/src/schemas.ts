import { z } from "zod";
import { UPLOAD_LIMITS } from "./limits";
import { normalizeTags } from "./tags";

export const ItemType = z.enum(["screenshot", "post", "article"]);
export type ItemType = z.infer<typeof ItemType>;

export const CaptureKind = z.enum(["area", "visible", "full", "image"]);
export type CaptureKind = z.infer<typeof CaptureKind>;

export const Media = z.object({
  file: z.string(),
  thumb: z.string(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  color: z.string(),
  role: z.enum(["main", "photo", "video-poster"]),
});
export type Media = z.infer<typeof Media>;

export const ItemText = z.object({
  selection: z.string(),
  meta: z.object({
    description: z.string().optional(),
    og: z.record(z.string(), z.string()).optional(),
  }),
  headings: z.array(z.string()),
  alts: z.array(z.string()),
});
export type ItemText = z.infer<typeof ItemText>;

export const Post = z.object({
  author: z.object({ name: z.string(), handle: z.string(), avatar: z.string().optional() }),
  text: z.string(),
  publishedAt: z.string(),
  permalink: z.string(),
  quoted: z.object({ author: z.string(), text: z.string(), permalink: z.string() }).optional(),
  hasVideo: z.boolean(),
  embedUrl: z.string().optional(),
});
export type Post = z.infer<typeof Post>;

export const Item = z.object({
  id: z.string(),
  userId: z.string(),
  type: ItemType,
  kind: CaptureKind.optional(),
  source: z.object({ url: z.string(), site: z.string(), pageTitle: z.string() }),
  createdAt: z.string(),
  updatedAt: z.string(),
  deletedAt: z.string().nullable(),
  media: z.array(Media),
  user: z.object({
    title: z.string().optional(),
    note: z.string().optional(),
    tags: z.array(z.string()),
    categoryId: z.string().nullable(),
    hiddenAiTags: z.array(z.string()),
  }),
  ai: z.object({
    tipo: z.array(z.string()),
    visual: z.array(z.string()),
    keys: z.array(z.string()),
    colors: z.array(z.string()),
    title: z.string().optional(),
    description: z.string().optional(),
    model: z.string(),
    processedAt: z.string().nullable(),
  }),
  text: ItemText,
  post: Post.optional(),
  truncated: z.boolean().optional(),
});
export type Item = z.infer<typeof Item>;

export const ItemSummary = z.object({
  id: z.string(),
  type: ItemType,
  kind: CaptureKind.optional(),
  site: z.string(),
  url: z.string(),
  title: z.string(),
  createdAt: z.string(),
  thumb: z.string(),
  width: z.number().int().nonnegative(),
  height: z.number().int().nonnegative(),
  color: z.string(),
  tags: z.array(z.string()),
  hasNote: z.boolean(),
});
export type ItemSummary = z.infer<typeof ItemSummary>;

export const ItemPage = z.object({
  items: z.array(ItemSummary),
  nextCursor: z.string().nullable(),
  total: z.number().int().nonnegative(),
});
export type ItemPage = z.infer<typeof ItemPage>;

/**
 * Applies UPLOAD_LIMITS to the extracted text. The total budget goes to the selection first, then headings,
 * description, alts and og values. `truncated` is true when anything was cut.
 */
export function clampUploadText(text: ItemText): { text: ItemText; truncated: boolean } {
  const L = UPLOAD_LIMITS;
  let budget: number = L.text;
  let truncated = false;
  const take = (s: string, max: number): string => {
    const out = s.slice(0, Math.max(0, Math.min(max, budget)));
    if (out.length < s.length) truncated = true;
    budget -= out.length;
    return out;
  };
  const list = (a: string[], n: number, max: number): string[] => {
    if (a.length > n) truncated = true;
    const out: string[] = [];
    for (const v of a.slice(0, n)) {
      const t = take(v, max);
      if (t) out.push(t);
      else if (v) truncated = true;
    }
    return out;
  };
  const selection = take(text.selection, L.selection);
  const headings = list(text.headings, L.headings, L.heading);
  const meta: ItemText["meta"] = {};
  if (text.meta.description !== undefined) meta.description = take(text.meta.description, L.metaValue);
  const alts = list(text.alts, L.alts, L.alt);
  if (text.meta.og) {
    const entries = Object.entries(text.meta.og);
    if (entries.length > L.ogKeys) truncated = true;
    const og: Record<string, string> = {};
    for (const [k, v] of entries.slice(0, L.ogKeys)) {
      const t = take(v, L.metaValue);
      if (t) og[k.slice(0, 100)] = t;
      else if (v) truncated = true;
    }
    if (Object.keys(og).length) meta.og = og;
  }
  return { text: { selection, meta, headings, alts }, truncated };
}

const UploadMetaInput = z.object({
  type: ItemType,
  kind: CaptureKind,
  url: z
    .string()
    .url()
    .refine((u) => {
      try {
        const p = new URL(u).protocol;
        return p === "http:" || p === "https:";
      } catch {
        return false;
      }
    }, "url must be http(s)"),
  pageTitle: z.string(),
  title: z.string().optional(),
  note: z.string().optional(),
  tags: z.array(z.string()),
  categoryId: z.string().nullable(),
  text: ItemText,
  truncated: z.boolean().optional(),
  capturedAt: z.string(),
});

export const UploadMeta = UploadMetaInput.transform((m) => {
  const L = UPLOAD_LIMITS;
  const { text, truncated } = clampUploadText(m.text);
  const out = {
    ...m,
    pageTitle: m.pageTitle.slice(0, L.pageTitle),
    tags: normalizeTags(m.tags.slice(0, 500)).slice(0, L.tags),
    text,
  };
  if (m.title !== undefined) out.title = m.title.slice(0, L.title);
  if (m.note !== undefined) out.note = m.note.slice(0, L.note);
  if (truncated) out.truncated = true;
  return out;
});
export type UploadMeta = z.infer<typeof UploadMeta>;

export const ItemPatch = z.object({
  title: z.string().optional(),
  note: z.string().optional(),
  tags: z.array(z.string()).optional(),
  categoryId: z.string().nullable().optional(),
  hiddenAiTags: z.array(z.string()).optional(),
});
export type ItemPatch = z.infer<typeof ItemPatch>;

export const TagCount = z.object({
  tag: z.string(),
  count: z.number().int().nonnegative(),
  origin: z.enum(["user", "ai", "both"]).optional(),
});
export type TagCount = z.infer<typeof TagCount>;

export const Category = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
});
export type Category = z.infer<typeof Category>;

export const SearchHit = z.object({
  item: ItemSummary,
  score: z.number(),
  highlight: z.object({ title: z.string().optional(), text: z.string().optional() }),
});
export type SearchHit = z.infer<typeof SearchHit>;

export const ExtensionInfo = z.object({
  version: z.string(),
  chromeZip: z.string(),
  firefoxZip: z.string(),
});
export type ExtensionInfo = z.infer<typeof ExtensionInfo>;

export const Device = z.object({
  id: z.string(),
  name: z.string(),
  createdAt: z.string(),
  lastSeenAt: z.string().nullable(),
  extensionVersion: z.string().nullable(),
});
export type Device = z.infer<typeof Device>;

// Query-string friendly: numbers arrive as strings, tags as "a,b" or repeated params.
const tagsParam = z.preprocess(
  (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v),
  z.array(z.string()),
);

export const ListQuery = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(24),
  tags: tagsParam.optional(),
  category: z.string().optional(),
  site: z.string().optional(),
  type: ItemType.optional(),
  color: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  /** "1" lists the trash (soft-deleted items) instead of live items. */
  trash: z.enum(["1", "true"]).optional(),
});
export type ListQuery = z.infer<typeof ListQuery>;
