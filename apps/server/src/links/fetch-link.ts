import { decodeHtml, type ParsedPage, parsePage } from "./parse";
import { FetchFailedError, LINK_MAX_BYTES, type SafeFetchOptions, safeFetch } from "./safe-fetch";

/** x.com / twitter.com (incl. mobile.). */
export const isXUrl = (url: string): boolean => {
  try {
    return /(^|\.)(x|twitter)\.com$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
};

export const tweetId = (url: string): string | null => {
  try {
    return /\/status(?:es)?\/(\d{5,25})/.exec(new URL(url).pathname)?.[1] ?? null;
  } catch {
    return null;
  }
};

export const xEmbedUrl = (id: string): string => `https://platform.twitter.com/embed/Tweet.html?id=${id}&theme=dark&dnt=true`;

/** x.com serves its OG tags to link-preview crawlers only. */
export const X_CRAWLER_UAS = ["Twitterbot/1.0", "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"];

export interface FetchedLink extends ParsedPage {
  /** After redirects. */
  finalUrl: string;
  embedUrl?: string;
}

const HTML_RE = /^(text\/html|application\/xhtml\+xml)/i;

async function fetchPage(url: string, opts: SafeFetchOptions, ua?: string): Promise<FetchedLink> {
  const r = await safeFetch(url, { ...opts, truncate: true, maxBytes: opts.maxBytes ?? LINK_MAX_BYTES, headers: { ...opts.headers, ...(ua ? { "user-agent": ua } : {}) } });
  if (r.status < 200 || r.status >= 300) throw new FetchFailedError(`HTTP ${r.status}`, r.status);
  const ct = r.contentType.split(";")[0]!.trim();
  // A direct link to an image: the image is the content.
  if (/^image\//i.test(ct)) return { finalUrl: r.url, image: r.url, video: false, og: {}, headings: [], keywords: [], text: "" };
  if (ct && !HTML_RE.test(ct)) throw new FetchFailedError(`not a web page (${ct})`);
  return { finalUrl: r.url, ...parsePage(decodeHtml(r.body, r.contentType), r.url) };
}

/** publish.twitter.com oEmbed: author + text of a post when the OG tags are not served. */
async function xOembed(url: string, opts: SafeFetchOptions): Promise<Partial<ParsedPage> | null> {
  const r = await safeFetch(`https://publish.twitter.com/oembed?omit_script=1&dnt=true&url=${encodeURIComponent(url)}`, { ...opts, headers: { accept: "application/json" } });
  if (r.status !== 200) return null;
  const j = JSON.parse(r.body.toString("utf8")) as { author_name?: string; html?: string };
  const { parseHTML } = await import("linkedom");
  const p = j.html ? parseHTML(`<body>${j.html}</body>`).document.querySelector("p")?.textContent?.trim() : undefined;
  if (!p && !j.author_name) return null;
  return { title: j.author_name ? `${j.author_name} no X` : undefined, description: p, siteName: "X" };
}

/**
 * Fetches a link's page through the SSRF guard and parses it. For x.com, a crawler UA (then oEmbed) gets the
 * OG tags; a video post gets the platform.twitter.com embed. Throws (BlockedUrlError / FetchFailedError / network).
 */
export async function fetchLink(url: string, opts: SafeFetchOptions = {}): Promise<FetchedLink> {
  if (!isXUrl(url)) return fetchPage(url, opts);
  let best: FetchedLink | null = null;
  let lastError: unknown = null;
  for (const ua of X_CRAWLER_UAS) {
    try {
      const p = await fetchPage(url, opts, ua);
      best ??= p;
      if (p.og["og:title"] || p.og["og:description"]) {
        best = p;
        break;
      }
    } catch (e) {
      lastError = e;
    }
  }
  if (!best?.og["og:description"]) {
    const o = await xOembed(url, opts).catch(() => null);
    if (o) best = { ...(best ?? { finalUrl: url, video: false, og: {}, headings: [], keywords: [], text: "" }), ...o, title: best?.og["og:title"] ?? o.title, description: best?.og["og:description"] ?? o.description };
  }
  if (!best) throw lastError instanceof Error ? lastError : new FetchFailedError("x.com did not answer");
  const id = tweetId(best.canonicalUrl ?? best.finalUrl) ?? tweetId(url);
  // x.com's HTML body is a login wall ("Entrar ou inscrever-se…"): the post's own text is the description.
  return { ...best, text: best.description ?? "", ...(id && best.video ? { embedUrl: xEmbedUrl(id) } : {}) };
}

/** Downloads an image (og:image, favicon) through the same SSRF guard. */
export async function fetchImage(url: string, opts: SafeFetchOptions = {}): Promise<Buffer> {
  const r = await safeFetch(url, { ...opts, headers: { ...opts.headers, accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8" } });
  if (r.status !== 200) throw new FetchFailedError(`HTTP ${r.status}`, r.status);
  const ct = r.contentType.split(";")[0]!.trim();
  if (ct && !/^image\//i.test(ct) && ct !== "application/octet-stream") throw new FetchFailedError(`not an image (${ct})`);
  return r.body;
}
