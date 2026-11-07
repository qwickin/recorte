import { type Classifier, MODEL_ID, extractColors, extractKeywords } from "@recorte/ai";
import type { Item } from "@recorte/shared";
import type { CloudAi } from "./cloud";
import type { Deps } from "./deps";
import { summaryFromMeta } from "./items/repo";
import { itemService, toSearchDoc } from "./items/service";

export interface PipelineDeps {
  deps: Deps;
  /** Loaded lazily (and once) by the caller; tests pass a fake. */
  classifier: () => Promise<Classifier>;
  cloud?: CloudAi | null;
}

/** Steps 1-5 of the processing spec. Never touches `user`; the ai block is merged into a fresh read of meta.json. */
export function createPipeline(p: PipelineDeps) {
  const { deps } = p;
  const svc = itemService(deps);

  async function process(userId: string, id: string): Promise<void> {
    const m0 = deps.storage.readMeta(userId, id);
    if (!m0) return; // item gone (purged): nothing to do
    const original = deps.storage.readFile(userId, id, "original.webp");
    if (!original) throw new Error(`original.webp missing for ${id}`);
    const thumb = deps.storage.readFile(userId, id, "thumb.webp") ?? original;

    const colors = await extractColors(thumb);
    const cls = await (await p.classifier()).classify(original);
    const keys = extractKeywords({
      title: m0.user.title || m0.source.pageTitle,
      text: m0.text.selection,
      headings: m0.text.headings,
      description: m0.text.meta.description,
      site: m0.source.site,
    });

    let cloud: { title?: string; description?: string; keys: string[] } | null = null;
    if (p.cloud) {
      try {
        cloud = await p.cloud({ image: original, pageTitle: m0.source.pageTitle, site: m0.source.site, text: m0.text.selection, headings: m0.text.headings });
      } catch (e) {
        console.warn(`cloud ai failed for ${id} (continuing):`, (e as Error).message);
      }
    }

    // Re-read right before writing: a PATCH may have changed `user` while we were classifying.
    const fresh = deps.storage.readMeta(userId, id);
    if (!fresh) return;
    const now = new Date().toISOString();
    const ai: Item["ai"] = {
      tipo: cls.tipo,
      visual: cls.visual,
      keys: [...new Set([...keys, ...(cloud?.keys ?? [])])],
      colors: colors.names,
      model: cloud ? `${MODEL_ID}+cloud` : MODEL_ID,
      processedAt: now,
    };
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
