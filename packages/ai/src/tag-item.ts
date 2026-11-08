import type { ClassifyResult } from "./classify";
import { type TopicInput, type TopicTagger, TOPICS, topicId } from "./topics";
import { VOCAB } from "./vocab";

/**
 * Version of the tags an item shows (stored in ai.model): bump when the tagger's output changes. A bump re-tags every
 * live item at startup (runtime.ts `retagOutdated`).
 * - topics-v1: pt-PT tag names.
 * - topics-v2: language-neutral tag IDs (packages/shared/src/tag-labels.ts); same tags otherwise.
 */
export const TAGGER_ID = "topics-v2";
const MAX_TAGS = 7;
const NAMES = new Set(TOPICS.map((t) => t.pt));
/** Content types the screenshot model knows and the topic vocabulary also has: its probabilities are evidence. */
const VISUAL_TIPO = new Set(VOCAB.tipo.map((l) => l.pt).filter((pt) => NAMES.has(pt)));

/**
 * The tags an item shows (the "lexical-visual" approach of prototype/ai-eval): the text tagger over the whole-page
 * context, with the screenshot model's content-type probabilities as extra evidence, then its visual tags that
 * are in the vocabulary, up to 7. `cls` is null for an item without an image (or without the model).
 * The tagger works on its internal pt-PT names; what comes out are tag IDs.
 */
export async function tagItem(tagger: TopicTagger, input: TopicInput, cls: ClassifyResult | null): Promise<string[]> {
  const visual = cls ? Object.fromEntries(Object.entries(cls.scores).filter(([k]) => VISUAL_TIPO.has(k))) : {};
  const tags = [...(await tagger.tag(input, { visual })).tags];
  for (const v of cls?.visual ?? []) if (NAMES.has(v) && !tags.includes(v) && tags.length < MAX_TAGS) tags.push(v);
  return tags.map((pt) => topicId(pt)!);
}
