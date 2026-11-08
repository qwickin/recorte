import type { KeywordInput, TopicInput } from "@recorte/ai";
import type { Item } from "@recorte/shared";

// Inputs of the text AI steps, built from an item (type-only imports: the eval harness loads this file alone).

/** Keyword sources, by weight: the captured area and its headings, then the page's title/headings, then the rest of the page. */
export function keywordInput(m: Item): KeywordInput {
  return {
    title: m.user.title || m.link?.title || m.source.pageTitle,
    selection: m.text.selection,
    nearHeadings: m.text.page?.nearHeadings,
    headings: m.text.headings,
    description: m.link?.description ?? m.text.meta.description,
    keywords: m.text.page?.keywords,
    site: m.source.site,
    pageText: m.text.page?.text,
  };
}

/** Input of the text tagger: the keyword sources plus the URL, og:type and site name (content-type rules). */
export function topicInput(m: Item): TopicInput {
  const og = m.text.meta.og ?? {};
  return { ...keywordInput(m), url: m.source.url, kind: m.kind, ogType: m.link?.ogType ?? og["og:type"], siteName: m.link?.siteName ?? og["og:site_name"] };
}
