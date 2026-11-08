import { cleanLangTag } from "@recorte/shared";
import sharp from "sharp";
import { z } from "zod";

export interface CloudConfig {
  url: string;
  key: string;
  model: string;
}

export interface CloudInput {
  image: Buffer;
  pageTitle: string;
  site: string;
  text: string;
  headings: string[];
  /** The page's `<html lang>` (cleaned BCP 47 tag), when known. */
  lang?: string;
}

export interface CloudResult {
  title?: string;
  description?: string;
  keys: string[];
}

export type CloudAi = (input: CloudInput) => Promise<CloudResult>;
type FetchFn = typeof fetch;

const Answer = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  keys: z.array(z.string()).optional(),
});

/** Frequent short words that tell languages apart (each list leaves out what it shares with the others). */
const STOPWORDS: Record<string, string[]> = {
  en: ["the", "and", "of", "to", "is", "that", "for", "with", "this", "you", "are", "on", "it", "was", "from", "be", "by", "have", "not", "or", "which", "your"],
  pt: ["não", "uma", "com", "para", "também", "são", "você", "isso", "está", "pelo", "pela", "os", "das", "dos", "ao", "à", "foi", "seu", "sua", "muito", "já", "em", "mas", "ou"],
  es: ["el", "los", "las", "una", "con", "para", "también", "es", "está", "más", "pero", "del", "al", "por", "sus", "muy", "ya", "fue", "y", "se", "en", "lo", "o"],
  fr: ["le", "la", "les", "des", "une", "est", "et", "pour", "avec", "pas", "dans", "du", "au", "ce", "qui", "sur", "sont", "plus", "vous", "nous", "être", "en", "ou"],
  it: ["il", "gli", "della", "delle", "una", "con", "per", "anche", "è", "sono", "non", "che", "del", "nel", "alla", "più", "questo", "essere", "di", "da", "ma", "o"],
  de: ["der", "die", "das", "und", "ist", "nicht", "mit", "ein", "eine", "für", "auf", "den", "dem", "sich", "auch", "von", "zu", "im", "wird", "oder", "aber"],
  nl: ["de", "het", "een", "en", "van", "is", "niet", "met", "voor", "op", "zijn", "dat", "ook", "aan", "naar", "maar", "worden", "deze"],
};
const LOOKUP = new Map<string, string[]>();
for (const [lang, words] of Object.entries(STOPWORDS)) for (const w of words) LOOKUP.set(w, [...(LOOKUP.get(w) ?? []), lang]);

/** The language of a text from its stopwords (a primary subtag such as "pt"), or null when it is not clear. */
export function detectLanguage(text: string): string | null {
  const counts = new Map<string, number>();
  for (const w of text.toLowerCase().match(/\p{L}+/gu)?.slice(0, 2000) ?? []) {
    for (const lang of LOOKUP.get(w) ?? []) counts.set(lang, (counts.get(lang) ?? 0) + 1);
  }
  const [best, second] = [...counts].sort((a, b) => b[1] - a[1]);
  if (!best || best[1] < 3 || (second && best[1] < second[1] * 1.3)) return null;
  return best[0];
}

const LANGUAGE_NAMES = new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });

/**
 * The language the cloud AI writes in, as an English name for the prompt: the page's `<html lang>`, else what its
 * text looks like, else English.
 */
export function answerLanguage(input: Pick<CloudInput, "lang" | "pageTitle" | "text" | "headings">): string {
  const name = (tag: string | null | undefined) => {
    const clean = cleanLangTag(tag);
    try {
      return clean ? LANGUAGE_NAMES.of(clean) : undefined;
    } catch {
      return undefined;
    }
  };
  return name(input.lang) ?? name(detectLanguage([input.pageTitle, ...input.headings, input.text].join("\n"))) ?? "English";
}

const system = (language: string) =>
  "You describe screenshots of web pages for a personal, searchable gallery. " +
  `Write the title, the description and the keywords in ${language}, the language of the captured page. ` +
  'Answer only with JSON: {"title": string (up to 80 characters), "description": string (1 to 2 sentences), "keys": string[] (up to 8 keywords)}.';

export function cloudEndpoint(url: string): string {
  const base = url.replace(/\/+$/, "");
  return /\/chat\/completions$/.test(base) ? base : `${base}/chat/completions`;
}

/** Pulls the first JSON object out of a model reply (tolerates code fences / chatter). */
export function parseAnswer(content: string): CloudResult {
  const start = content.indexOf("{");
  const end = content.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("no JSON in cloud reply");
  const a = Answer.parse(JSON.parse(content.slice(start, end + 1)));
  const clean = (s: string | undefined, max: number) => s?.replace(/\s+/g, " ").trim().slice(0, max) || undefined;
  const title = clean(a.title, 200);
  const description = clean(a.description, 600);
  return {
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    keys: [...new Set((a.keys ?? []).map((k) => clean(k, 60)?.toLowerCase()).filter((k): k is string => !!k))].slice(0, 12),
  };
}

/** OpenAI-compatible chat completion with the (downscaled) image. Throws on any failure; callers decide to ignore. */
export function createCloudAi(cfg: CloudConfig, fetchFn: FetchFn = fetch, timeoutMs = 60_000): CloudAi {
  return async (input) => {
    const jpeg = await sharp(input.image).resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const context = [`Page title: ${input.pageTitle}`, `Site: ${input.site}`, input.headings.length ? `Headings: ${input.headings.slice(0, 8).join(" | ")}` : "", input.text ? `Text: ${input.text.slice(0, 1500)}` : ""]
      .filter(Boolean)
      .join("\n");
    const res = await fetchFn(cloudEndpoint(cfg.url), {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
      body: JSON.stringify({
        model: cfg.model,
        temperature: 0.2,
        max_tokens: 400,
        messages: [
          { role: "system", content: system(answerLanguage(input)) },
          {
            role: "user",
            content: [
              { type: "text", text: context },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${jpeg.toString("base64")}` } },
            ],
          },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`cloud ai http ${res.status}`);
    const body = (await res.json()) as { choices?: { message?: { content?: unknown } }[] };
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string") throw new Error("cloud ai: empty reply");
    return parseAnswer(content);
  };
}
