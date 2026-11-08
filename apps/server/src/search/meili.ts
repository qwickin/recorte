import { tagLabel, tagLabelsAll } from "@recorte/shared";
import { type EnqueuedTaskPromise, Meilisearch } from "meilisearch";
import type { Search, SearchDoc, SearchQuery, SearchResult } from "./index";

export const INDEX_UID = "items";
export const EMBEDDER = "ml";
export const EMBEDDER_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2";
const REQUEST_TIMEOUT_MS = 5_000;
const SETTINGS_WAIT_MS = 10 * 60_000;

/** The embedder's text. `tagWords` is the English label of each tag (compact: the 2000-byte budget is for the text). */
export const DOCUMENT_TEMPLATE =
  "{{doc.title}}. {{doc.note}} {{doc.tagWords}} {{doc.keys}} {{doc.description}} {{doc.text|truncatewords: 120}}";

const HL_OPEN = "\u0001";
const HL_CLOSE = "\u0002";

/** Highlight strings are returned as safe HTML: everything escaped except the <mark> tags we inserted. */
export function safeHighlight(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split(HL_OPEN).join("<mark>")
    .split(HL_CLOSE).join("</mark>");
}

/** Escapes a value for a Meilisearch filter string literal. */
export const filterValue = (v: string): string => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

/**
 * Meilisearch document. Two tag fields: `tags` holds the IDs (filterable, what the gallery filters on) and
 * `tagLabels` the labels of every tag in all five languages (searchable: "receta" or "dark mode" find a recipe or
 * a dark-mode capture whatever the viewer's language). A tag the person typed is in both as typed. `tagWords` (English
 * labels) feeds the embedder's template. createdAt is epoch ms.
 */
export function toMeiliDoc(d: SearchDoc): Record<string, unknown> {
  const tagLabels = [...new Set(d.tags.flatMap((t) => tagLabelsAll(t)))];
  const tagWords = [...new Set(d.tags.map((t) => tagLabel(t, "en-US")))];
  return {
    id: d.id,
    userId: d.userId,
    type: d.type,
    site: d.site,
    title: d.title,
    note: d.note,
    description: d.description,
    tags: d.tags,
    tagLabels,
    tagWords,
    keys: d.keys,
    text: d.text,
    colors: d.colors,
    categoryId: d.categoryId,
    createdAt: Date.parse(d.createdAt) || 0,
  };
}

/** The filter always starts with the server-imposed `userId` clause. */
export function buildFilter(q: SearchQuery): string[] {
  const f = [`userId = ${filterValue(q.userId)}`];
  if (q.type) f.push(`type = ${filterValue(q.type)}`);
  if (q.site) f.push(`site = ${filterValue(q.site.toLowerCase())}`);
  if (q.category) f.push(`categoryId = ${filterValue(q.category)}`);
  if (q.color) f.push(`colors = ${filterValue(q.color.toLowerCase())}`);
  for (const t of q.tags ?? []) f.push(`tags = ${filterValue(t)}`);
  return f;
}

export interface MeiliOptions {
  url: string;
  apiKey?: string | null;
  timeoutMs?: number;
}

export class MeiliSearch implements Search {
  private client: Meilisearch;

  constructor(opts: MeiliOptions) {
    // Every HTTP request is bounded: a hung Meilisearch must not stall API requests.
    this.client = new Meilisearch({ host: opts.url, apiKey: opts.apiKey ?? undefined, timeout: opts.timeoutMs ?? REQUEST_TIMEOUT_MS });
  }

  private get idx() {
    return this.client.index(INDEX_UID);
  }

  private async wait(task: EnqueuedTaskPromise, timeout = SETTINGS_WAIT_MS): Promise<void> {
    const done = await task.waitTask({ timeout, interval: 500 });
    if (done.status === "failed") throw new Error(`meili task failed: ${done.error?.message ?? "unknown"}`);
  }

  /**
   * Creates the index if needed and (re)applies the settings on every start, so an existing index picks up changed
   * settings too (a new searchable field, a new template). Documents written before such a change are re-sent by
   * the startup tag migration (an `index` job per live item).
   */
  async ensureIndex(): Promise<void> {
    try {
      await this.client.getIndex(INDEX_UID);
    } catch {
      await this.wait(this.client.createIndex(INDEX_UID, { primaryKey: "id" }), 60_000);
    }
    await this.wait(
      this.idx.updateSettings({
        searchableAttributes: ["title", "note", "tagLabels", "keys", "description", "text", "site"],
        filterableAttributes: ["userId", "type", "site", "tags", "categoryId", "colors", "createdAt"],
        sortableAttributes: ["createdAt"],
        embedders: {
          [EMBEDDER]: {
            source: "huggingFace",
            model: EMBEDDER_MODEL,
            documentTemplate: DOCUMENT_TEMPLATE,
            documentTemplateMaxBytes: 2000,
          },
        },
      }),
    );
  }

  async index(doc: SearchDoc): Promise<void> {
    await this.idx.addDocuments([toMeiliDoc(doc)], { primaryKey: "id" });
  }

  async remove(id: string): Promise<void> {
    await this.idx.deleteDocument(id);
  }

  async replaceAll(userId: string, docs: SearchDoc[]): Promise<void> {
    await this.idx.deleteDocuments({ filter: `userId = ${filterValue(userId)}` });
    for (let i = 0; i < docs.length; i += 200) {
      await this.idx.addDocuments(docs.slice(i, i + 200).map(toMeiliDoc), { primaryKey: "id" });
    }
  }

  async search(q: SearchQuery): Promise<SearchResult[]> {
    const res = await this.idx.search(q.q, {
      filter: buildFilter(q),
      limit: q.limit ?? 20,
      hybrid: { embedder: EMBEDDER, semanticRatio: 0.6 },
      showRankingScore: true,
      attributesToHighlight: ["title", "text"],
      attributesToCrop: ["text"],
      cropLength: 24,
      highlightPreTag: HL_OPEN,
      highlightPostTag: HL_CLOSE,
    });
    return res.hits.map((h) => {
      const f = (h as { _formatted?: { title?: string; text?: string } })._formatted ?? {};
      return {
        id: String(h.id),
        score: (h as { _rankingScore?: number })._rankingScore ?? 0,
        highlight: { ...(f.title ? { title: safeHighlight(f.title) } : {}), ...(f.text ? { text: safeHighlight(f.text) } : {}) },
      };
    });
  }
}
