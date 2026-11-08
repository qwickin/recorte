import { TOPIC_PARENTS_RAW, TOPICS_RAW, type TopicGroup } from "./topics-vocab";
import type { KeywordInput } from "./keywords";

/**
 * Text tagging over the whole-page context: a curated closed vocabulary (topics-vocab.ts) matched by
 *  1. field-weighted alias hits (the captured area and the headings near it > title > description/meta keywords >
 *     page headings > page text, each field capped per tag so a long page cannot drown the selection),
 *  2. URL/site/og:type rules (a GitHub repo, a YouTube watch page, /docs/…),
 *  3. parent tags implied by strong children (deep learning -> inteligência artificial),
 *  4. optionally, a multilingual sentence-embedding model: page text vs. tag names, normalised per item (z-score).
 * Never emits a tag outside the vocabulary; UI component names only on pages about UI components.
 */

export interface Topic {
  pt: string;
  group: TopicGroup;
  /** English synonyms (indexed for search). */
  en: string[];
  /** Search-only words (indexed, never used as evidence). */
  searchOnly: string[];
  re: RegExp | null;
  reCase: RegExp | null;
}

export interface TopicInput extends KeywordInput {
  url?: string;
  /** Capture kind: on visible/full captures short selection lines are mostly the site's navigation. */
  kind?: string;
  ogType?: string;
  siteName?: string;
}

/** Turns texts into L2-normalised vectors (a sentence-embedding model). */
export type Embedder = (texts: string[]) => Promise<number[][]>;

export interface TopicOptions {
  embed?: Embedder;
  /** Visual evidence (SigLIP2), e.g. { mapa: 0.8 } for tipo labels; adds `4 * p` to that tag. */
  visual?: Record<string, number>;
  max?: number;
  threshold?: number;
}

export interface RankedTopic {
  tag: string;
  score: number;
  lex: number;
  sem: number;
  rule: number;
  parent: number;
}

export interface TopicResult {
  tags: string[];
  /** All candidates with their score, best first (debug / eval). */
  ranked: RankedTopic[];
}

const fold1 = (s: string): string => s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
/** Accent- and case-folding that keeps the string length (match positions stay valid in the original). */
function fold(s: string): string {
  let out = "";
  for (const c of s) {
    const f = fold1(c);
    out += f.length === c.length ? f : c.toLowerCase().length === c.length ? c.toLowerCase() : c;
  }
  return out;
}
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function aliasPattern(a: string): string {
  // optional plural for single words ending in a letter
  const plural = /^[\p{L}-]{4,}$/u.test(a) ? "(?:s|es)?" : "";
  return `${esc(a)}${plural}`;
}
const wrap = (alts: string[], flags: string): RegExp | null =>
  alts.length ? new RegExp(`(?<![\\p{L}\\p{N}])(?:${alts.join("|")})(?![\\p{L}\\p{N}])`, flags) : null;

function parse(raw: string): Topic[] {
  const out: Topic[] = [];
  for (const line of raw.split("\n")) {
    const parts = line.split("|");
    if (parts.length !== 4) continue;
    const [group, pt, en, aliases] = parts.map((p) => p.trim()) as [TopicGroup, string, string, string];
    const enList = en.split(",").map((s) => s.trim()).filter(Boolean);
    const ins = new Set<string>();
    const cs = new Set<string>();
    const searchOnly: string[] = [];
    for (const a of [pt, ...enList, ...aliases.split(",")].map((s) => s.trim()).filter(Boolean)) {
      if (a.startsWith("~")) searchOnly.push(a.slice(1));
      else if (a.startsWith("=")) cs.add(a.slice(1));
      else if (a.length >= 2) ins.add(fold(a));
    }
    out.push({
      pt, group, en: enList, searchOnly,
      re: wrap([...ins].sort((a, b) => b.length - a.length).map(aliasPattern), "gu"),
      reCase: wrap([...cs].map(esc), "gu"),
    });
  }
  return out;
}

export const TOPICS: readonly Topic[] = parse(TOPICS_RAW);
const BY_PT = new Map(TOPICS.map((t) => [t.pt, t]));
export const topicByName = (pt: string): Topic | undefined => BY_PT.get(pt);

/** child -> parents (a strong child implies its parent). */
export const TOPIC_PARENTS: ReadonlyMap<string, string[]> = new Map(
  TOPIC_PARENTS_RAW.split("\n")
    .filter((l) => l.includes(">"))
    .map((l) => {
      const [c, p] = l.split(">") as [string, string];
      return [c.trim(), p.split(",").map((x) => x.trim())];
    }),
);
/** Share of a child's score its parent gets (up to PARENT_CAP), applied over two levels. */
const PARENT_SHARE = 0.5;
const PARENT_CAP = 4;

/** Search-index words of a vocabulary tag: its pt-PT name, English synonyms and search-only words. */
export function topicSynonyms(pt: string): string[] {
  const t = BY_PT.get(pt);
  return t ? [...new Set([t.pt, ...t.en, ...t.searchOnly])] : [];
}

interface Span { topic: number; start: number; end: number }

/**
 * Every alias hit in one text. Overlapping hits of different tags keep only the longest ("deep learning" wins over
 * "learning", "design system" over "design", "neural networks" over "networks").
 */
function spans(text: string, folded: string): Span[] {
  const all: Span[] = [];
  TOPICS.forEach((t, topic) => {
    if (t.re) for (const m of folded.matchAll(t.re)) all.push({ topic, start: m.index, end: m.index + m[0].length });
    if (t.reCase) for (const m of text.matchAll(t.reCase)) all.push({ topic, start: m.index, end: m.index + m[0].length });
  });
  all.sort((a, b) => b.end - b.start - (a.end - a.start) || a.start - b.start);
  const kept: Span[] = [];
  for (const s of all) {
    if (kept.some((k) => k.topic !== s.topic && k.start < s.end && s.start < k.end)) continue;
    kept.push(s);
  }
  return kept;
}

/** Per-field weight per hit and the most one tag can get from that field. */
const FIELDS = {
  rule: { w: 8, cap: 8 },
  title: { w: 4, cap: 4 },
  near: { w: 3, cap: 5 },
  description: { w: 3, cap: 3 },
  keywords: { w: 2.5, cap: 4 },
  site: { w: 3, cap: 3 },
  headings: { w: 0.8, cap: 2.5 },
  selection: { w: 1, cap: 4 },
  /** The selection of an area capture: what the person chose. */
  area: { w: 1.5, cap: 5 },
  /** Short selection lines (≤ 3 words) of visible/full captures are mostly navigation / buttons. */
  selectionShort: { w: 0.4, cap: 1.5 },
  page: { w: 0.3, cap: 2.5 },
} as const;
type Field = keyof typeof FIELDS;

const DEFAULT_THRESHOLD = 3;
const DEFAULT_MAX = 7;
/** Embedding similarity: z-score above Z0 starts to count; SEM_W per unit of z. */
const Z0 = 2;
const SEM_W = 1.6;
const SEM_CAP = 4;

/** URL / site / og:type rules: deterministic content-type evidence. */
export function ruleTags(input: TopicInput): string[] {
  const out: string[] = [];
  let u: URL | null = null;
  try {
    u = input.url ? new URL(input.url) : null;
  } catch {
    u = null;
  }
  const host = (u?.hostname ?? input.site ?? "").replace(/^www\./, "").toLowerCase();
  let path = (u?.pathname ?? "").toLowerCase();
  try {
    path = decodeURIComponent(path);
  } catch {
    // keep the raw path
  }
  const segs = path.split("/").filter(Boolean);
  const add = (...t: string[]) => out.push(...t);
  if (/(^|\/)(docs?|documentation|reference|api-reference|manual)(\/|$)/.test(path) || /^(docs|developer|developers)\./.test(host)) add("documentação");
  if (host === "github.com" && segs.length >= 2 && !["orgs", "settings", "topics", "search", "marketplace"].includes(segs[0]!)) add("repositório");
  if (host === "gitlab.com" && segs.length >= 2) add("repositório");
  if (/(^|\.)youtube\.com$/.test(host) && (path === "/watch" || segs[0] === "shorts")) add("vídeo");
  if (host === "youtu.be" || host === "vimeo.com") add("vídeo");
  if (/(^|\.)(x|twitter)\.com$/.test(host) && /\/status(es)?\/\d+/.test(path)) add("publicação", "rede social");
  if (/(^|\.)(instagram|facebook|threads|bsky|mastodon)\./.test(`${host}.`)) add("rede social");
  if (/(^|\.)wikipedia\.org$/.test(host)) add("enciclopédia");
  if (host === "arxiv.org" && /^(abs|pdf|html)$/.test(segs[0] ?? "")) add("artigo científico");
  if (/(^|\/)(recipes?|receitas?)(\/|$)/.test(path)) add("receita");
  if (host === "openstreetmap.org" || (/(^|\.)google\.[a-z.]+$/.test(host) && segs[0] === "maps")) add("mapa");
  if (/(^|\/)(pricing|precos|preços|plans|planos)(\/|$)/.test(path)) add("preços");
  if (host === "news.ycombinator.com" && (segs.length === 0 || ["news", "newest", "front", "best"].includes(segs[0]!))) add("lista de links");
  if (/(^|\.)(dribbble|behance|awwwards)\.(com|net)$/.test(host)) add("inspiração");
  const og = (input.ogType ?? "").toLowerCase();
  if (segs.some((x) => /^(news|noticias?)$/.test(x))) add("notícia");
  // a dated URL of an article (news sites, blogs): /2026/11/07/… or /2026/nov/06/…
  if (og === "article" && /\/(19|20)\d\d\/(\d\d?|[a-z]{3})\/\d\d?\//.test(path)) add("artigo");
  if (og.startsWith("video")) add("vídeo");
  else if (og === "product" || og === "og:product") add("produto");
  else if (og === "book") add("livro");
  return [...new Set(out)];
}

const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

/** Lexical evidence per tag: the sum over fields of min(cap, hits × weight). */
export function lexicalScores(input: TopicInput): Map<string, number> {
  const fields: [Field, string][] = [];
  const push = (f: Field, s: string | undefined) => {
    if (s && s.trim()) fields.push([f, s]);
  };
  push("title", input.title);
  for (const h of input.nearHeadings ?? []) push("near", h);
  push("description", input.description);
  for (const k of input.keywords ?? []) push("keywords", k);
  push("site", [input.site, input.siteName].filter(Boolean).join(" "));
  for (const h of input.headings ?? []) push("headings", h);
  const sel = input.selection ?? input.text ?? "";
  // An area is what the person chose: its short lines (a UI mock-up's labels) are content, not navigation.
  if (input.kind === "area" || input.kind === "image") push("area", sel);
  else {
    const long: string[] = [];
    const short: string[] = [];
    for (const line of sel.split("\n")) (words(line) <= 3 ? short : long).push(line);
    push("selection", long.join("\n"));
    push("selectionShort", short.join("\n"));
  }
  push("page", input.pageText);

  const per = new Map<number, Map<Field, number>>();
  for (const [f, text] of fields) {
    for (const sp of spans(text, fold(text))) {
      const m = per.get(sp.topic) ?? new Map<Field, number>();
      m.set(f, (m.get(f) ?? 0) + FIELDS[f].w);
      per.set(sp.topic, m);
    }
  }
  const scores = new Map<string, number>();
  for (const [topic, m] of per) {
    let total = 0;
    for (const [f, v] of m) total += Math.min(FIELDS[f].cap, v);
    scores.set(TOPICS[topic]!.pt, total);
  }
  return scores;
}

/** Text the embedding model sees for a tag. */
export const topicPassage = (t: Topic): string => `${t.pt} (${t.en.slice(0, 3).join(", ")})`;

/** Up to three query texts: the item summary (title, headings near the area, description), the selection, the page. */
export function queryTexts(input: TopicInput): string[] {
  const summary = [input.title, ...(input.nearHeadings ?? []), input.description, ...(input.keywords ?? [])].filter(Boolean).join(". ");
  const sel = (input.selection ?? input.text ?? "").split("\n").filter((l) => words(l) > 3).join(" ").slice(0, 1200);
  const page = (input.pageText ?? "").slice(0, 1200);
  return [summary, sel, page].filter((s) => s.trim().length > 20);
}

export interface TopicTagger {
  tag(input: TopicInput, opts?: Omit<TopicOptions, "embed">): Promise<TopicResult>;
}

/** The tagger; with `embed`, the vocabulary passages are embedded once, on first use. */
export function createTopicTagger(embed?: Embedder): TopicTagger {
  let tagVecs: Promise<number[][]> | null = null;
  const vecs = () => (tagVecs ??= embed!(TOPICS.map(topicPassage)));
  return {
    async tag(input, opts = {}) {
      const sem = new Map<string, number>();
      if (embed) {
        const qs = queryTexts(input);
        if (qs.length) {
          const [tv, qv] = await Promise.all([vecs(), embed(qs)]);
          const sims = tv.map((v) => Math.max(...qv.map((q) => q.reduce((a, x, i) => a + x * v[i]!, 0))));
          const mean = sims.reduce((a, b) => a + b, 0) / sims.length;
          const sd = Math.sqrt(sims.reduce((a, b) => a + (b - mean) ** 2, 0) / sims.length) || 1;
          sims.forEach((s, i) => {
            const z = (s - mean) / sd;
            if (z > Z0) sem.set(TOPICS[i]!.pt, Math.min(SEM_CAP, (z - Z0) * SEM_W));
          });
        }
      }
      return selectTopics(input, sem, opts);
    },
  };
}

/** Scores every candidate (lexical + rules + semantic + visual + parents) and picks the tags. */
export function selectTopics(input: TopicInput, sem: Map<string, number> = new Map(), opts: Omit<TopicOptions, "embed"> = {}): TopicResult {
  const threshold = opts.threshold ?? DEFAULT_THRESHOLD;
  const max = opts.max ?? DEFAULT_MAX;
  const lex = lexicalScores(input);
  const rules = new Set(ruleTags(input));
  const base = new Map<string, { lex: number; sem: number; rule: number }>();
  for (const tag of new Set([...lex.keys(), ...sem.keys(), ...rules, ...Object.keys(opts.visual ?? {})])) {
    if (!BY_PT.has(tag)) continue;
    base.set(tag, { lex: lex.get(tag) ?? 0, sem: sem.get(tag) ?? 0, rule: (rules.has(tag) ? FIELDS.rule.w : 0) + (opts.visual?.[tag] ?? 0) * 4 });
  }
  const own = (tag: string) => {
    const b = base.get(tag);
    return b ? b.lex + b.sem + b.rule : 0;
  };
  // parents: two passes so grandparents get a share too (deep learning -> machine learning -> inteligência artificial)
  const inherited = new Map<string, number>();
  for (let pass = 0; pass < 2; pass++) {
    for (const [child, parents] of TOPIC_PARENTS) {
      const c = own(child) + (inherited.get(child) ?? 0);
      if (c < threshold) continue;
      for (const p of parents) inherited.set(p, Math.max(inherited.get(p) ?? 0, Math.min(PARENT_CAP, c * PARENT_SHARE)));
    }
  }
  const ranked: RankedTopic[] = [...new Set([...base.keys(), ...inherited.keys()])]
    .filter((tag) => BY_PT.has(tag))
    .map((tag) => {
      const b = base.get(tag) ?? { lex: 0, sem: 0, rule: 0 };
      const parent = inherited.get(tag) ?? 0;
      return { tag, ...b, parent, score: b.lex + b.sem + b.rule + parent };
    })
    .sort((a, b) => b.score - a.score || (a.tag < b.tag ? -1 : 1));

  const passed = ranked.filter((x) => x.score >= threshold);
  const has = (pt: string) => passed.some((x) => x.tag === pt);
  // UI component names (dialog, dropdown…) are page chrome everywhere; they are a topic only on a page about UI
  // components: one that says so, or one where two or more component names are strong.
  const strong = passed.filter((x) => BY_PT.get(x.tag)!.group === "componente" && x.tag !== "componentes ui");
  const uiPage = has("componentes ui") || has("design system") || has("ui kit") || strong.length >= 2;
  if (uiPage && !has("componentes ui") && strong.length) {
    passed.splice(passed.indexOf(strong[0]!), 0, { ...strong[0]!, tag: "componentes ui", lex: 0, sem: 0, rule: 0, parent: strong[0]!.score });
  }
  // Content type: URL/og rules are better evidence than a word on the page (an article *about* conversations is
  // not a chat), so rule-backed types come first.
  const tipoOrder = passed.filter((x) => BY_PT.get(x.tag)!.group === "tipo").sort((a, b) => Number(b.rule > 0) - Number(a.rule > 0) || b.score - a.score);
  const okTipo = new Set(tipoOrder.slice(0, 1).map((x) => x.tag));
  for (const x of tipoOrder.slice(1, 2)) if (x.score >= tipoOrder[0]!.score * 0.75) okTipo.add(x.tag);
  const out: string[] = [];
  for (const x of passed) {
    if (out.length >= max) break;
    const t = BY_PT.get(x.tag)!;
    if (t.group === "componente" && x.tag !== "componentes ui" && !uiPage) continue;
    // one content type, two when the second is nearly as strong
    if (t.group === "tipo" && !okTipo.has(x.tag)) continue;
    out.push(x.tag);
  }
  return { tags: out, ranked };
}
