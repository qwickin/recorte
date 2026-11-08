import { Readability } from "@mozilla/readability";
import { parseHTML } from "linkedom";
import { UPLOAD_LIMITS } from "@recorte/shared";

/** What a saved link's HTML says about itself (OG / Twitter cards / canonical / favicon / readable text). */
export interface ParsedPage {
  title?: string;
  description?: string;
  siteName?: string;
  ogType?: string;
  /** Absolute http(s) URL of og:image / twitter:image. */
  image?: string;
  canonicalUrl?: string;
  favicon?: string;
  /** og:video or a twitter:player card (or og:type video.*). */
  video: boolean;
  /** og:* and twitter:* values (first of each key), for `text.meta.og`. */
  og: Record<string, string>;
  headings: string[];
  keywords: string[];
  /** Readability main text (block breaks kept), capped. */
  text: string;
  /** `<html lang>`, as written. */
  lang?: string;
}

const collapse = (s: string | null | undefined): string => (s ?? "").replace(/\s+/g, " ").trim();
const tidy = (s: string): string =>
  s
    .split(/\n+/)
    .map(collapse)
    .filter(Boolean)
    .join("\n");

function absolute(u: string | undefined, base: string): string | undefined {
  if (!u) return undefined;
  try {
    const abs = new URL(u.trim(), base);
    return abs.protocol === "http:" || abs.protocol === "https:" ? abs.href : undefined;
  } catch {
    return undefined;
  }
}

const BLOCK_TAGS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "DD", "DIV", "DL", "DT", "FIGCAPTION", "FIGURE", "FOOTER", "FORM",
  "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "TR", "UL",
]);
const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG"]);

function blockText(root: Node): string {
  let out = "";
  const walk = (n: Node) => {
    if (n.nodeType === 3) out += n.nodeValue ?? "";
    else if (n.nodeType === 1) {
      const tag = (n as Element).tagName.toUpperCase();
      if (SKIP.has(tag)) return;
      const block = BLOCK_TAGS.has(tag);
      if (block) out += "\n";
      for (const c of n.childNodes) walk(c);
      if (block) out += "\n";
    }
  };
  walk(root);
  return out;
}

/** Decodes an HTML body: charset from Content-Type, else a <meta charset> in the first bytes, else UTF-8. */
export function decodeHtml(body: Buffer, contentType: string): string {
  const fromHeader = /charset=["']?([\w.:-]+)/i.exec(contentType)?.[1];
  const head = body.subarray(0, 4096).toString("latin1");
  const fromMeta = /<meta[^>]+charset=["']?([\w.:-]+)/i.exec(head)?.[1];
  for (const label of [fromHeader, fromMeta, "utf-8"]) {
    if (!label) continue;
    try {
      return new TextDecoder(label).decode(body);
    } catch {
      // unknown label: try the next one
    }
  }
  return body.toString("utf8");
}

export function parsePage(html: string, pageUrl: string): ParsedPage {
  const { document } = parseHTML(html);
  const metas = new Map<string, string>();
  for (const m of document.querySelectorAll("meta")) {
    const key = (m.getAttribute("property") || m.getAttribute("name") || "").trim().toLowerCase();
    const v = collapse(m.getAttribute("content"));
    if (key && v && !metas.has(key)) metas.set(key, v.slice(0, UPLOAD_LIMITS.metaValue));
  }
  const get = (...keys: string[]) => keys.map((k) => metas.get(k)).find(Boolean);

  const og: Record<string, string> = {};
  for (const [k, v] of metas) {
    if ((k.startsWith("og:") || k.startsWith("twitter:")) && Object.keys(og).length < UPLOAD_LIMITS.ogKeys) og[k] = v;
  }

  const linkHref = (sel: string) => document.querySelector(sel)?.getAttribute("href") ?? undefined;
  const icons = [...document.querySelectorAll("link[rel]")].filter((l) => /(^|\s)(icon|shortcut icon|apple-touch-icon)(\s|$)/i.test(l.getAttribute("rel") ?? ""));
  // Prefer a real icon (png/svg) over the rest; apple-touch-icon is usually the biggest and good too.
  const icon = icons.find((l) => /png|svg/i.test(`${l.getAttribute("type")} ${l.getAttribute("href")}`)) ?? icons[0];

  const headings: string[] = [];
  for (const h of document.querySelectorAll("h1, h2, h3")) {
    const t = collapse(h.textContent).slice(0, UPLOAD_LIMITS.heading);
    if (t && !headings.includes(t)) headings.push(t);
    if (headings.length >= UPLOAD_LIMITS.headings) break;
  }
  const keywords = (get("keywords") ?? "")
    .split(/[,;]/)
    .map(collapse)
    .filter(Boolean)
    .slice(0, UPLOAD_LIMITS.pageKeywords);

  const ogType = get("og:type");
  const title = get("og:title", "twitter:title") ?? (collapse(document.querySelector("title")?.textContent) || undefined);
  return {
    title: title?.slice(0, UPLOAD_LIMITS.pageTitle),
    description: get("og:description", "twitter:description", "description"),
    siteName: get("og:site_name", "application-name"),
    ogType,
    image: absolute(get("og:image:secure_url", "og:image", "og:image:url", "twitter:image", "twitter:image:src"), pageUrl),
    canonicalUrl: absolute(linkHref('link[rel="canonical" i]') ?? get("og:url"), pageUrl),
    favicon: absolute(icon?.getAttribute("href") ?? "/favicon.ico", pageUrl),
    video: !!get("og:video", "og:video:url", "og:video:secure_url", "twitter:player") || /^video/i.test(ogType ?? "") || get("twitter:card") === "player",
    og,
    headings,
    keywords,
    text: readable(html, document),
    lang: collapse(document.documentElement?.getAttribute("lang")) || undefined,
  };
}

function readable(html: string, fallbackDoc: Document): string {
  try {
    // Readability mutates its document: give it its own copy.
    const { document } = parseHTML(html);
    const article = new Readability(document as unknown as Document, { charThreshold: 200 }).parse();
    if (article?.content) {
      const text = tidy(blockText(parseHTML(`<!doctype html><html><body>${article.content}</body></html>`).document.body));
      if (text) return text.slice(0, UPLOAD_LIMITS.pageText);
    }
  } catch {
    // fall through to the body text
  }
  return tidy(blockText(fallbackDoc.body ?? fallbackDoc)).slice(0, UPLOAD_LIMITS.pageText);
}
