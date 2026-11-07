import type { Item, ItemSummary } from "@recorte/shared";
import type { Filters } from "../api";

/** §5: user title, else AI title, else the page title. */
export const displayTitle = (m: Item) => m.user.title || m.ai.title || m.source.pageTitle || m.source.site;

export type ShownTag = { tag: string; origin: "user" | "ai" };

/** §5: (user ∪ ai.tipo ∪ ai.visual) − hiddenAiTags, user first, each tag once. */
export function displayTags(m: Item): ShownTag[] {
  const hidden = new Set(m.user.hiddenAiTags);
  const out: ShownTag[] = [];
  const seen = new Set<string>();
  for (const tag of m.user.tags) if (!seen.has(tag)) (seen.add(tag), out.push({ tag, origin: "user" }));
  for (const tag of [...m.ai.tipo, ...m.ai.visual]) if (!hidden.has(tag) && !seen.has(tag)) (seen.add(tag), out.push({ tag, origin: "ai" }));
  return out;
}

/** AI tags the user removed (still produced by the AI, kept hidden across reprocessing). */
export const hiddenAiTags = (m: Item) => [...m.ai.tipo, ...m.ai.visual].filter((t) => m.user.hiddenAiTags.includes(t));

/**
 * Whether a live item belongs in the current listing. `null` = cannot tell from the summary
 * (category, colour), so the caller should not guess.
 */
export function matchesFilters(it: ItemSummary, f: Filters): boolean | null {
  if (f.category || f.color) return null;
  if (f.tags.some((t) => !it.tags.includes(t))) return false;
  if (f.site && it.site !== f.site.toLowerCase()) return false;
  if (f.type && it.type !== f.type) return false;
  const day = it.createdAt.slice(0, 10);
  if (f.from && day < f.from) return false;
  if (f.to && day > f.to) return false;
  return true;
}
