import { type Classifier, MODEL_ID, TAGGER_ID, createTopicTagger, extractColors, extractKeywords, tagItem } from "@recorte/ai";
import { keywordInput, topicInput } from "./ai-input";
import { type Item, UPLOAD_LIMITS } from "@recorte/shared";
import { makeImages } from "./items/images";
import { type FetchedLink, fetchImage, fetchLink } from "./links/fetch-link";
import { type SafeFetchOptions, fetchErrorCode } from "./links/safe-fetch";
import type { CloudAi } from "./cloud";
import type { Deps } from "./deps";
import { summaryFromMeta } from "./items/repo";
import { itemService, toSearchDoc } from "./items/service";

export interface PipelineDeps {
  deps: Deps;
  /** Loaded lazily (and once) by the caller; tests pass a fake. */
  classifier: () => Promise<Classifier>;
  /** A fixed client (tests). */
  cloud?: CloudAi | null;
  /** Read at each job instead of `cloud`, so settings changed in the gallery apply at once. */
  cloudFrom?: () => CloudAi | null;
  /** Options of the SSRF-guarded fetches of saved links (tests relax the address policy for a local server). */
  linkFetch?: SafeFetchOptions;
}

/**
 * Merges what the server fetched into a saved link. The extension's own DOM extraction (the page was open in
 * the tab, maybe behind a login) wins where it has something; the fetch fills the gaps.
 */
export function mergeLink(m: Item, f: FetchedLink | null, error: string | null, now: string): Item {
  const prev = m.link ?? {};
  const clientOg = m.text.meta.og ?? {};
  const pick = <T>(...v: (T | undefined)[]) => v.find((x) => x !== undefined && x !== "");
  const link: NonNullable<Item["link"]> = {
    ...prev,
    ...(f
      ? {
          canonicalUrl: pick(f.canonicalUrl && f.canonicalUrl !== m.source.url ? f.canonicalUrl : undefined, prev.canonicalUrl),
          title: pick(clientOg["og:title"], f.title, prev.title),
          description: pick(clientOg["og:description"], m.text.meta.description, f.description, prev.description),
          siteName: pick(clientOg["og:site_name"], f.siteName, prev.siteName),
          ogType: pick(clientOg["og:type"], f.ogType, prev.ogType),
          favicon: pick(f.favicon, prev.favicon),
          embedUrl: pick(f.embedUrl, prev.embedUrl),
        }
      : {
          title: pick(prev.title, clientOg["og:title"]),
          description: pick(prev.description, clientOg["og:description"], m.text.meta.description),
          siteName: pick(prev.siteName, clientOg["og:site_name"]),
        }),
    fetchedAt: now,
  };
  if (error) link.fetchError = error.slice(0, 300);
  else delete link.fetchError;
  for (const k of Object.keys(link) as (keyof typeof link)[]) if (link[k] === undefined) delete link[k];

  const text = { ...m.text, meta: { ...m.text.meta } };
  if (f) {
    if (!text.meta.description && f.description) text.meta.description = f.description;
    const og = { ...f.og, ...clientOg };
    const keys = Object.keys(og).slice(0, UPLOAD_LIMITS.ogKeys);
    if (keys.length) text.meta.og = Object.fromEntries(keys.map((k) => [k, og[k]!]));
    if (!text.headings.length) text.headings = f.headings;
    const page = text.page ?? { text: "" };
    text.page = {
      ...page,
      text: page.text.trim() ? page.text : f.text,
      ...(page.keywords?.length || !f.keywords.length ? {} : { keywords: f.keywords }),
    };
  }
  // "Guardar link": the client only knew the anchor text ("ler mais"…), the page's own title is better. "Guardar
  // esta página": the client had the real document title.
  const clientTitle = m.source.pageTitle.trim() && m.source.pageTitle !== m.source.url ? m.source.pageTitle : "";
  const pageTitle = (m.kind === "link" ? f?.title || clientTitle : clientTitle || link.title) || link.title || m.source.pageTitle;
  return { ...m, link, text, source: { ...m.source, pageTitle } };
}

/** Steps 1-5 of the processing spec. Never touches `user`; the ai block is merged into a fresh read of meta.json. */
export function createPipeline(p: PipelineDeps) {
  const { deps } = p;
  const svc = itemService(deps);
  // Lexical text tagger (no embedding model): the winner of prototype/ai-eval on quality per cost.
  const tagger = createTopicTagger();

  /**
   * A saved link: fetch the page (SSRF-guarded), merge, and download its OG image as the tile's media. Persisted
   * at once, so a later failure (the classifier) retries only the AI step. Returns null when the item was purged
   * or trashed meanwhile: nothing is written and the files fetched here are removed.
   */
  async function enrichLink(m: Item): Promise<Item | null> {
    let fetched: FetchedLink | null = null;
    let error: string | null = null;
    try {
      fetched = await fetchLink(m.source.url, p.linkFetch);
    } catch (e) {
      error = fetchErrorCode(e);
      // Details (addresses, host names) only in the server log.
      console.warn(`link fetch failed for ${m.id} (keeping the extension's data): ${(e as Error)?.message ?? e}`);
    }
    let media = m.media;
    const written: string[] = [];
    const image = fetched?.image ?? m.text.meta.og?.["og:image"];
    if (!media.length && image) {
      try {
        const img = await makeImages(await fetchImage(new URL(image, m.source.url).href, p.linkFetch));
        // Re-check before writing: never recreate the directory of an item purged while we were downloading.
        if (!deps.storage.readMeta(m.userId, m.id)) return null;
        deps.storage.writeFile(m.userId, m.id, "original.webp", img.original);
        written.push("original.webp");
        deps.storage.writeFile(m.userId, m.id, "thumb.webp", img.thumb);
        written.push("thumb.webp");
        const color = (await extractColors(img.thumb).catch(() => null))?.dominant ?? "#000000";
        media = [{ file: "original.webp", thumb: "thumb.webp", width: img.width, height: img.height, color, role: "main" }];
      } catch (e) {
        console.warn(`og:image download failed for ${m.id}: ${(e as Error)?.message ?? e}`);
      }
    }
    // Re-read: a PATCH may have changed `user` while we were fetching; a purge or a delete stops here.
    const fresh = deps.storage.readMeta(m.userId, m.id);
    if (!fresh || fresh.deletedAt) {
      for (const name of written) deps.storage.removeFile(m.userId, m.id, name);
      return null;
    }
    const next = mergeLink({ ...fresh, media }, fetched, error, new Date().toISOString());
    svc.persist(next);
    if (!next.deletedAt) deps.events.emit(next.userId, { type: "item.updated", data: summaryFromMeta(next) });
    return next;
  }

  /** The classifier, or null when its model cannot be loaded (logged once): the AI step is then skipped, not retried. */
  let classifierMissingLogged = false;
  async function classifierOrNull(): Promise<Classifier | null> {
    try {
      return await p.classifier();
    } catch (e) {
      if (!classifierMissingLogged) {
        classifierMissingLogged = true;
        console.warn(`visual classifier unavailable, skipping visual tags until a restart + reprocess: ${(e as Error)?.message ?? e}`);
      }
      return null;
    }
  }

  /** `refetch`: fetch a saved link again (Reprocessar); otherwise a link is fetched once and retries only redo the AI. */
  async function process(userId: string, id: string, opts: { refetch?: boolean } = {}): Promise<void> {
    let m0 = deps.storage.readMeta(userId, id);
    if (!m0) return; // item gone (purged): nothing to do
    if (m0.type === "link" && (opts.refetch || !m0.link?.fetchedAt)) {
      if (m0.deletedAt) return;
      const enriched = await enrichLink(m0);
      if (!enriched) return;
      m0 = enriched;
    }
    const original = deps.storage.readFile(userId, id, "original.webp");
    // A link may have no image at all (no OG image): text card, no visual classification.
    if (!original && m0.type !== "link") throw new Error(`original.webp missing for ${id}`);
    const thumb = deps.storage.readFile(userId, id, "thumb.webp") ?? original;

    const colors = thumb ? await extractColors(thumb) : { dominant: "#000000", names: [] as string[] };
    const classifier = original ? await classifierOrNull() : null;
    const cls = classifier && original ? await classifier.classify(original) : null;
    const aiSkipped = !!original && !classifier;
    const keys = extractKeywords(keywordInput(m0));
    // Runs without an image or a model too (a link without an OG image, a missing model): text-only tags.
    const topics = await tagItem(tagger, topicInput(m0), cls);

    let cloud: { title?: string; description?: string; keys: string[] } | null = null;
    const cloudAi = p.cloudFrom ? p.cloudFrom() : (p.cloud ?? null);
    if (cloudAi && original) {
      try {
        cloud = await cloudAi({
          image: original,
          pageTitle: m0.source.pageTitle,
          site: m0.source.site,
          text: m0.text.selection || (m0.text.page?.text ?? "").slice(0, 4000),
          headings: m0.text.headings,
        });
      } catch (e) {
        console.warn(`cloud ai failed for ${id} (continuing):`, (e as Error).message);
      }
    }

    // Re-read right before writing: a PATCH may have changed `user` while we were classifying.
    const fresh = deps.storage.readMeta(userId, id);
    if (!fresh) return;
    const now = new Date().toISOString();
    const ai: Item["ai"] = {
      tipo: cls?.tipo ?? [],
      visual: cls?.visual ?? [],
      topics,
      keys: [...new Set([...keys, ...(cloud?.keys ?? [])])],
      colors: colors.names,
      model: `${MODEL_ID}+${TAGGER_ID}${cloud ? "+cloud" : ""}`,
      processedAt: now,
    };
    if (aiSkipped) ai.skipped = "classifier_unavailable";
    // A failed cloud step keeps what a previous run produced.
    const title = cloud ? cloud.title : fresh.ai.title;
    const description = cloud ? cloud.description : fresh.ai.description;
    if (title) ai.title = title;
    if (description) ai.description = description;

    const next: Item = { ...fresh, ai, updatedAt: now };
    // Persisted even when trashed, so a restore brings the AI tags back.
    svc.persist(next);
    // A trashed item stays out of the gallery and of search: an `item.updated` would re-insert it in open
    // galleries, and the delete already removed it from the index.
    if (next.deletedAt) return;
    deps.events.emit(userId, { type: "item.updated", data: summaryFromMeta(next) });
    await svc.syncSearch(next, "index");
  }

  /** `index` job: sync Meilisearch to the item's current state (idempotent). Throws so the worker retries. */
  async function reindexOne(userId: string, id: string): Promise<void> {
    const m = deps.storage.readMeta(userId, id);
    if (!m || m.deletedAt) await deps.search.remove(id);
    else await deps.search.index(toSearchDoc(m));
  }

  return { process, reindexOne };
}
