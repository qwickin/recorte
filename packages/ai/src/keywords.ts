export interface KeywordInput {
  title?: string;
  /** Text of the captured area (highest weight, with `nearHeadings`). */
  selection?: string;
  /** Older name of `selection`. */
  text?: string;
  /** Headings inside / right above the captured area. */
  nearHeadings?: string[];
  /** h1–h3 of the whole page. */
  headings?: string[];
  description?: string;
  /** `<meta name="keywords">`. */
  keywords?: string[];
  site?: string;
  /** Main text of the whole page: lowest weight, and each term's contribution is capped so a long page cannot drown the selection. */
  pageText?: string;
}

const PT = "a o as os um uma uns umas de do da dos das em no na nos nas por para com sem sob sobre entre ate ao aos à às e ou mas que se como mais menos muito muita muitos muitas já ja não nao sim é são foi ser está estão era são tem têm ter há seu sua seus suas meu minha este esta estes estas esse essa esses essas isto isso aquilo aquele aquela também so só quando onde qual quais cujo pelo pela pelos pelas num numa nuns numas depois antes ainda mesmo cada outro outra outros outras";
const EN = "a an the and or but if of to in on at by for with without from into onto over under about as is are was were be been being am do does did done have has had having it its this that these those there here he she they them his her their we you your our my me i not no yes so than then too very can could will would shall should may might must also just only more most some any all each every other such what which who whom whose when where why how up down out off again once both few own same s t";
const STOP = new Set(`${PT} ${EN}`.split(/\s+/));
const CONNECTORS = new Set(["de", "da", "do", "das", "dos"]);
const MARKETING_NOISE = new Set(["http", "https", "www", "com"]);

/** Per-occurrence weights: the selection and the headings near it first, then the page's title/headings, then the rest. */
const W = { nearHeading: 5, title: 4, heading: 2.5, description: 2, keywords: 2, site: 1.5, selection: 2, page: 0.35 };
/** Most one term can get from the whole-page text. */
const PAGE_CAP = 2;
/** A term counts as "strong" (phrases kept without repetition) above this per-occurrence weight. */
const STRONG = 1.5;

interface Entry { score: number; first: number; n: number; phrase: boolean; strong: boolean }

function segments(s: string): string[][] {
  return s
    .toLowerCase()
    .split(/[^\p{L}\p{N}' ]+/u)
    .map((seg) => seg.split(/\s+/).map((w) => w.replace(/^'+|'+$/g, "")).filter(Boolean))
    .filter((seg) => seg.length > 0);
}

const isWord = (w: string) => w.length >= 3 && !STOP.has(w) && !MARKETING_NOISE.has(w) && !/^\d+$/.test(w);

/** Deterministic keyword extraction: pt+en stopwords, unigrams + bigrams (+ "x de y" trigrams), frequency x position, title/heading boost. */
export function extractKeywords(input: KeywordInput, max = 12): string[] {
  const entries = new Map<string, Entry>();
  let order = 0;
  const into = (map: Map<string, Entry>) => (term: string, weight: number, phrase: boolean) => {
    const e = map.get(term);
    if (e) { e.score += weight; e.n++; e.strong ||= weight > STRONG; }
    else map.set(term, { score: weight, first: order++, n: 1, phrase, strong: weight > STRONG });
  };
  let add = into(entries);

  const scan = (s: string | undefined, weight: number, positional: boolean) => {
    if (!s) return;
    const segs = segments(s);
    const total = segs.reduce((a, g) => a + g.length, 0) || 1;
    let pos = 0;
    for (const seg of segs) {
      for (let i = 0; i < seg.length; i++) {
        const w = seg[i]!;
        // earlier text counts up to 1.5x more than the tail
        const wt = weight * (positional ? 1 + 0.5 * (1 - (pos + i) / total) : 1);
        if (isWord(w)) {
          add(w, wt, false);
          const nx = seg[i + 1];
          if (nx && isWord(nx)) add(`${w} ${nx}`, wt * 1.5, true);
          const nx2 = seg[i + 2];
          if (nx && nx2 && CONNECTORS.has(nx) && isWord(nx2)) add(`${w} ${nx} ${nx2}`, wt * 2, true);
        }
      }
      pos += seg.length;
    }
  };

  for (const h of input.nearHeadings ?? []) scan(h, W.nearHeading, false);
  scan(input.title, W.title, false);
  scan(input.selection ?? input.text, W.selection, true);
  for (const h of input.headings ?? []) scan(h, W.heading, false);
  scan(input.description, W.description, false);
  for (const k of input.keywords ?? []) scan(k, W.keywords, false);
  scan(input.site, W.site, false);
  if (input.pageText) {
    const page = new Map<string, Entry>();
    add = into(page);
    scan(input.pageText, W.page, true);
    add = into(entries);
    for (const [term, e] of page) {
      const capped = Math.min(e.score, PAGE_CAP);
      const cur = entries.get(term);
      if (cur) { cur.score += capped; cur.n += e.n; }
      else entries.set(term, { ...e, score: capped });
    }
  }

  // phrases must be repeated or come from a prominent field; otherwise they only add noise
  const ranked = [...entries.entries()]
    .filter(([, e]) => !e.phrase || e.n >= 2 || e.strong)
    .sort((a, b) => b[1].score - a[1].score || a[1].first - b[1].first || (a[0] < b[0] ? -1 : 1));

  const out: string[] = [];
  for (const [term] of ranked) {
    if (out.length >= max) break;
    // a unigram already covered by a selected phrase is redundant
    if (!term.includes(" ") && out.some((o) => o.includes(" ") && o.split(" ").includes(term))) continue;
    out.push(term);
  }
  return out;
}
