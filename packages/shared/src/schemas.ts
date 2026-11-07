import { z } from "zod";

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

export const UploadMeta = z.object({
  type: ItemType,
  kind: CaptureKind,
  url: z.string().min(1),
  pageTitle: z.string(),
  title: z.string().optional(),
  note: z.string().optional(),
  tags: z.array(z.string()),
  categoryId: z.string().nullable(),
  text: ItemText,
  truncated: z.boolean().optional(),
  capturedAt: z.string(),
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
});
export type ListQuery = z.infer<typeof ListQuery>;
