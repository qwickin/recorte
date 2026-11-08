import { z } from "zod";
import { UPLOAD_LIMITS } from "./limits";
import { normalizeTags } from "./tags";

/** `link` = "Guardar link" (a URL saved with its OG data); `post`/`article` stay reserved for phases 2-3. */
export const ItemType = z.enum(["screenshot", "link", "post", "article"]);
export type ItemType = z.infer<typeof ItemType>;

/** Screenshot kinds; `link` items use "link" (the context menu on a link) or "page" (the page itself). */
export const CaptureKind = z.enum(["area", "visible", "full", "image", "link", "page"]);
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

/**
 * Whole-page context sent with every capture (additive, optional for old items/extensions). For a "full"
 * capture the selection already is the page's main text, so `text` is left empty there.
 */
export const PageText = z.object({
  /** Readability main text of the whole page. */
  text: z.string(),
  /** `<meta name="keywords">`, split. */
  keywords: z.array(z.string()).optional(),
  /** h1–h3 inside the captured area or the closest ones above it. */
  nearHeadings: z.array(z.string()).optional(),
});
export type PageText = z.infer<typeof PageText>;

export const ItemText = z.object({
  selection: z.string(),
  meta: z.object({
    description: z.string().optional(),
    og: z.record(z.string(), z.string()).optional(),
  }),
  /** h1–h3 of the whole page (up to UPLOAD_LIMITS.headings). */
  headings: z.array(z.string()),
  alts: z.array(z.string()),
  page: PageText.optional(),
});
export type ItemText = z.infer<typeof ItemText>;

/** What the server learned about a saved link (`type: "link"`). The OG image, when any, is `media[0]`. */
export const LinkInfo = z.object({
  /** canonical / og:url, when it differs from `source.url`. */
  canonicalUrl: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  siteName: z.string().optional(),
  ogType: z.string().optional(),
  favicon: z.string().optional(),
  /** Video posts (x.com): the iframe the gallery shows on click. */
  embedUrl: z.string().optional(),
  /** Set once the server tried to fetch the URL; `fetchError` when it could not (the client data stays). */
  fetchedAt: z.string().optional(),
  fetchError: z.string().optional(),
});
export type LinkInfo = z.infer<typeof LinkInfo>;

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
    /** Set when a step could not run (e.g. "classifier_unavailable": no visual tags); a reprocess retries it. */
    skipped: z.string().optional(),
  }),
  text: ItemText,
  link: LinkInfo.optional(),
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
  /** null: no image (a link without an OG image): the gallery shows a text card. width/height are then 0. */
  thumb: z.string().nullable(),
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
 * description, alts and og values. `truncated` is true when anything was cut. The whole-page context (`page`)
 * has its own budget and is expected to be cut: it never sets `truncated`.
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
  const out: ItemText = { selection, meta, headings, alts };
  if (text.page) {
    const p = text.page;
    const page: PageText = { text: p.text.slice(0, L.pageText) };
    const kw = (p.keywords ?? []).map((k) => k.trim().slice(0, L.heading)).filter(Boolean).slice(0, L.pageKeywords);
    if (kw.length) page.keywords = kw;
    const near = (p.nearHeadings ?? []).map((h) => h.slice(0, L.heading)).filter(Boolean).slice(0, L.nearHeadings);
    if (near.length) page.nearHeadings = near;
    out.page = page;
  }
  return { text: out, truncated };
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

/** `GET /api/setup`: `open` is false once the 15-minute setup window after start has passed. */
export const SetupStatus = z.object({ needsSetup: z.boolean(), open: z.boolean() });
export type SetupStatus = z.infer<typeof SetupStatus>;

/** Server settings kept in the database; an environment variable of the same name overrides each one. */
export const SETTING_KEYS = ["publicUrl", "aiCloudUrl", "aiCloudKey", "aiCloudModel"] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];
export const SettingSource = z.enum(["env", "db"]);
export type SettingSource = z.infer<typeof SettingSource>;
const SettingValue = z.object({ value: z.string().nullable(), source: SettingSource });

/** `GET /api/settings`. `aiCloudKey.value` is masked ("••••abcd"); `set` tells whether a key exists. */
export const ServerSettings = z.object({
  publicUrl: SettingValue,
  aiCloudUrl: SettingValue,
  aiCloudModel: SettingValue,
  aiCloudKey: SettingValue.extend({ set: z.boolean() }),
});
export type ServerSettings = z.infer<typeof ServerSettings>;

/** `PUT /api/settings`: omitted = unchanged, null or "" = cleared. Keys set by the environment are refused. */
export const SettingsPatch = z
  .object({
    publicUrl: z.string().max(2048).nullable(),
    aiCloudUrl: z.string().max(2048).nullable(),
    aiCloudKey: z.string().max(4096).nullable(),
    aiCloudModel: z.string().max(200).nullable(),
  })
  .partial()
  .strict();
export type SettingsPatch = z.infer<typeof SettingsPatch>;

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
