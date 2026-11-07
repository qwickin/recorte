// In-browser stand-in for the server. Same contract as the real API (see ./types.ts).
// Search here is lexical over the AI tags + search keys (pt + en synonyms), which is close enough
// to feel the UX. The real server does hybrid search: embeddings (cosine) + full-text, fused.
import raw from "../data/captures.json";
import { EMBED } from "../lib/env";
import { domainOf, fold, tokenize } from "../lib/text";
import type { Capture, GalleryApi, SearchHit, TagCount } from "./types";

type RawCapture = Omit<Capture, "image"> & { width: number; height: number; color: string; src: string; thumb: string };

// Inline preview only: the host page carries each thumbnail as <img data-shot="id"> (already inlined).
const shot = (id: string, fallback: string) =>
  (EMBED && document.querySelector<HTMLImageElement>(`img[data-shot="${id}"]`)?.src) || fallback;

const ALL: Capture[] = (raw as unknown as RawCapture[])
  .filter((c) => c.tags?.length)
  .map(({ width, height, color, src, thumb, ...c }) => ({
    ...c,
    image: { src: shot(c.id, src), thumb: shot(c.id, thumb), width, height, color },
  }))
  .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

const wait = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => {
      clearTimeout(t);
      reject(new DOMException("Aborted", "AbortError"));
    });
  });

// ---- search index ----

const SYNONYMS: Record<string, string[]> = {
  comida: ["receita", "culinaria", "food", "doce"],
  doce: ["sobremesa", "pastelaria", "pastel"],
  mapa: ["map", "cartografia", "rua"],
  codigo: ["code", "programacao", "javascript"],
  programacao: ["codigo", "code", "developer"],
  escuro: ["dark", "preto"],
  preto: ["dark", "escuro"],
  grafico: ["chart", "dados", "visualizacao"],
  espaco: ["astronomia", "space", "nasa"],
  relogio: ["watch", "mecanismo"],
  ia: ["ai", "inteligencia", "machine", "transformer", "attention"],
  artigo: ["paper", "article", "cientifico"],
  noticias: ["news", "hacker"],
  tipografia: ["fonte", "font", "letra"],
  cidade: ["city", "lisboa", "lisbon"],
  banda: ["comic", "webcomic", "cartoon"],
  desenhada: ["comic", "webcomic", "cartoon"],
  portugues: ["portugal", "portuguese"],
  browsers: ["navegador", "browser"],
  tempo: ["meteorologia", "weather", "previsao"],
};

const FIELD_WEIGHTS = { tags: 3, title: 2.2, keywords: 2, domain: 1.6, visibleText: 1.2, pageTitle: 1.1, description: 1 } as const;
type Field = { weight: number; words: string[]; terms?: string[] };

const INDEX = ALL.map((c) => {
  const fields: Field[] = [
    { weight: FIELD_WEIGHTS.tags, words: c.tags.flatMap(tokenize), terms: c.tags },
    { weight: FIELD_WEIGHTS.title, words: tokenize(c.title) },
    { weight: FIELD_WEIGHTS.keywords, words: c.keywords.flatMap(tokenize), terms: c.keywords },
    { weight: FIELD_WEIGHTS.domain, words: tokenize(domainOf(c.url)) },
    { weight: FIELD_WEIGHTS.visibleText, words: tokenize(c.visibleText) },
    { weight: FIELD_WEIGHTS.pageTitle, words: tokenize(c.pageTitle) },
    { weight: FIELD_WEIGHTS.description, words: tokenize(c.description) },
  ];
  const phrases = [...c.tags, ...c.keywords, c.title].map(fold);
  return { c, fields, phrases };
});

// Light Portuguese/English stemming so "escura" finds "escuro" and "browsers" finds "browser".
const stem = (w: string) => (w.length > 4 ? w.replace(/(oes|aes|as|os|es|a|o|e|s)$/, "") : w);

const wordMatches = (word: string, t: string) => {
  const a = stem(word);
  const b = stem(t);
  return a === b || (b.length >= 3 && a.startsWith(b)) || (a.length >= 4 && b.startsWith(a));
};

function scoreToken(fields: Field[], t: string) {
  let best = 0;
  let term: string | undefined;
  for (const f of fields) {
    if (f.weight <= best) continue;
    if (f.words.some((w) => wordMatches(w, t))) {
      best = f.weight;
      term = f.terms?.find((x) => tokenize(x).some((w) => wordMatches(w, t)));
    }
  }
  return { best, term };
}

function runSearch(q: string, limit: number): SearchHit[] {
  const tokens = [...new Set(tokenize(q))];
  if (!tokens.length) return [];
  const phrase = fold(q.trim());
  const hits: SearchHit[] = [];
  for (const { c, fields, phrases } of INDEX) {
    let raw = 0;
    let covered = 0;
    const matched = new Set<string>();
    for (const t of tokens) {
      let { best, term } = scoreToken(fields, t);
      if (!best) {
        for (const s of SYNONYMS[t] ?? []) {
          const r = scoreToken(fields, s);
          if (r.best * 0.6 > best) ({ best, term } = { best: r.best * 0.6, term: r.term });
        }
      }
      if (best) {
        raw += best;
        covered++;
        if (term) matched.add(term);
      }
    }
    if (!covered) continue;
    const coverage = covered / tokens.length;
    let score = (raw / (tokens.length * 3)) * (0.45 + 0.55 * coverage);
    if (tokens.length > 1 && phrases.some((p) => p.includes(phrase))) score += 0.25;
    hits.push({ capture: c, score: Math.min(1, score), matched: [...matched].slice(0, 3) });
  }
  return hits.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---- API ----

export const api: GalleryApi = {
  async listCaptures({ cursor = null, tags = [], limit = 12, signal } = {}) {
    await wait(cursor ? 700 : 420, signal);
    const pool = tags.length ? ALL.filter((c) => tags.every((t) => c.tags.includes(t))) : ALL;
    // Cursor = id of the last item seen (keyset pagination, stable while new captures arrive).
    const start = cursor ? pool.findIndex((c) => c.id === cursor) + 1 : 0;
    const items = pool.slice(start, start + limit);
    const last = items.at(-1);
    return { items, nextCursor: last && start + limit < pool.length ? last.id : null, total: pool.length };
  },

  async listTags({ signal } = {}) {
    await wait(200, signal);
    const counts = new Map<string, number>();
    for (const c of ALL) for (const t of c.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts].map(([tag, count]): TagCount => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  },

  async search(q, { limit = 12, signal } = {}) {
    await wait(260 + Math.random() * 180, signal);
    return runSearch(q, limit);
  },
};

export const totalCaptures = ALL.length;
