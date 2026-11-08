import type { CaptureKind, ItemText } from "@recorte/shared";
import { UPLOAD_LIMITS } from "@recorte/shared/limits";
import { Readability } from "@mozilla/readability";

/** DOM text extraction for the content script (spec §6). No raw HTML is ever sent. */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Margin (CSS px) added around the captured rect when collecting text. */
export const TEXT_MARGIN = 48;
export const MAX_HEADINGS = UPLOAD_LIMITS.headings;
export const MAX_NEAR_HEADINGS = UPLOAD_LIMITS.nearHeadings;
/** Whole-page Readability text cap (separate from the 20 000-char budget of the other fields). */
export const MAX_PAGE_TEXT = UPLOAD_LIMITS.pageText;
const MAX_ALTS = UPLOAD_LIMITS.alts;
const MAX_OG = UPLOAD_LIMITS.ogKeys;
const SKIP_TAGS = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "TEMPLATE", "SVG", "CANVAS", "IFRAME", "OBJECT", "SELECT"]);

/** Strict overlap: rects that only touch at an edge do not intersect; empty rects never intersect. */
export function rectsIntersect(a: Rect, b: Rect): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

export function expandRect(r: Rect, margin: number): Rect {
  return { x: r.x - margin, y: r.y - margin, width: r.width + 2 * margin, height: r.height + 2 * margin };
}

export function clampRect(r: Rect, bounds: Rect): Rect {
  const x = Math.max(bounds.x, Math.min(r.x, bounds.x + bounds.width));
  const y = Math.max(bounds.y, Math.min(r.y, bounds.y + bounds.height));
  const right = Math.max(x, Math.min(r.x + r.width, bounds.x + bounds.width));
  const bottom = Math.max(y, Math.min(r.y + r.height, bounds.y + bounds.height));
  return { x, y, width: right - x, height: bottom - y };
}

export const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Collapses runs of spaces but keeps paragraph breaks. */
function tidy(s: string): string {
  return s
    .split(/\n+/)
    .map((l) => collapse(l))
    .filter(Boolean)
    .join("\n");
}

function pageMeta(doc: Document): ItemText["meta"] {
  const meta: ItemText["meta"] = {};
  const desc = doc.querySelector<HTMLMetaElement>('meta[name="description" i]')?.content;
  if (desc && collapse(desc)) meta.description = collapse(desc).slice(0, UPLOAD_LIMITS.metaValue);
  const og: Record<string, string> = {};
  for (const m of doc.querySelectorAll<HTMLMetaElement>('meta[property^="og:" i]')) {
    const key = m.getAttribute("property")?.toLowerCase();
    const v = collapse(m.content ?? "");
    if (key && v && !(key in og)) og[key] = v.slice(0, UPLOAD_LIMITS.metaValue);
    if (Object.keys(og).length >= MAX_OG) break;
  }
  if (Object.keys(og).length) meta.og = og;
  return meta;
}

function metaKeywords(doc: Document): string[] {
  const raw = doc.querySelector<HTMLMetaElement>('meta[name="keywords" i]')?.content ?? "";
  const out: string[] = [];
  for (const k of raw.split(/[,;]/)) {
    const t = collapse(k).slice(0, UPLOAD_LIMITS.heading);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= UPLOAD_LIMITS.pageKeywords) break;
  }
  return out;
}

export interface PlacedHeading {
  text: string;
  /** Viewport coordinates. */
  rect: Rect;
}

/**
 * Headings that describe the captured area: the ones inside it (with the text margin), then the closest one above
 * it (the section the area belongs to). Nearest first, at most MAX_NEAR_HEADINGS.
 */
export function pickNearHeadings(hs: PlacedHeading[], area: Rect, margin = TEXT_MARGIN): string[] {
  const zone = expandRect(area, margin);
  const inside = hs.filter((h) => rectsIntersect(h.rect, zone));
  const above = hs
    .filter((h) => h.rect.height > 0 && h.rect.y + h.rect.height <= zone.y && !inside.includes(h))
    .sort((a, b) => b.rect.y - a.rect.y);
  const out: string[] = [];
  for (const h of [...inside, ...above.slice(0, 1)]) {
    if (h.text && !out.includes(h.text)) out.push(h.text);
    if (out.length >= MAX_NEAR_HEADINGS) break;
  }
  return out;
}

function placedHeadings(doc: Document): PlacedHeading[] {
  const out: PlacedHeading[] = [];
  for (const h of doc.querySelectorAll("h1, h2, h3, h4")) {
    const text = collapse(h.textContent ?? "").slice(0, UPLOAD_LIMITS.heading);
    if (!text) continue;
    const r = h.getBoundingClientRect();
    out.push({ text, rect: { x: r.left, y: r.top, width: r.width, height: r.height } });
    if (out.length >= 400) break;
  }
  return out;
}

function headings(doc: Document): string[] {
  const out: string[] = [];
  for (const h of doc.querySelectorAll("h1, h2, h3")) {
    const t = collapse(h.textContent ?? "").slice(0, UPLOAD_LIMITS.heading);
    if (t && !out.includes(t)) out.push(t);
    if (out.length >= MAX_HEADINGS) break;
  }
  return out;
}

function isHidden(el: Element): boolean {
  const s = getComputedStyle(el);
  return s.visibility === "hidden" || s.display === "none";
}

/** `rect` is in viewport coordinates (as at capture time). */
function altsIn(doc: Document, rect: Rect | null): string[] {
  const out: string[] = [];
  for (const img of doc.querySelectorAll("img[alt]")) {
    const alt = collapse(img.getAttribute("alt") ?? "");
    if (!alt || out.includes(alt)) continue;
    if (rect && !rectsIntersect(img.getBoundingClientRect(), rect)) continue;
    out.push(alt.slice(0, UPLOAD_LIMITS.alt));
    if (out.length >= MAX_ALTS) break;
  }
  return out;
}

function blockAncestor(n: Node): Element | null {
  let el = n.parentElement;
  while (el) {
    const d = getComputedStyle(el).display;
    if (d !== "inline" && d !== "contents") return el;
    el = el.parentElement;
  }
  return null;
}

/** Text of the text nodes whose boxes intersect `rect` (viewport coordinates). */
export function textInRect(doc: Document, rect: Rect, ignore?: Element | null): string {
  const body = doc.body;
  if (!body) return "";
  const range = doc.createRange();
  const parts: string[] = [];
  let lastBlock: Element | null = null;
  const parentOk = new Map<Element, boolean>();
  const walker = doc.createTreeWalker(body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p || !node.nodeValue?.trim()) return NodeFilter.FILTER_REJECT;
      let ok = parentOk.get(p);
      if (ok === undefined) {
        ok = !SKIP_TAGS.has(p.tagName.toUpperCase()) && !p.closest("script,style,noscript,template") && !(ignore && ignore.contains(p));
        if (ok) ok = rectsIntersect(p.getBoundingClientRect(), rect) && !isHidden(p);
        parentOk.set(p, ok);
      }
      return ok ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  let total = 0;
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    range.selectNodeContents(n);
    let hit = false;
    for (const r of range.getClientRects()) {
      if (rectsIntersect(r, rect)) {
        hit = true;
        break;
      }
    }
    if (!hit) continue;
    const block = blockAncestor(n);
    const t = collapse(n.nodeValue ?? "");
    parts.push(lastBlock && block !== lastBlock ? `\n${t}` : t);
    lastBlock = block;
    total += t.length;
    if (total > 40_000) break;
  }
  return tidy(parts.join(" "));
}

const BLOCK_TAGS = new Set([
  "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "BR", "DD", "DIV", "DL", "DT", "FIGCAPTION", "FIGURE", "FOOTER", "FORM",
  "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE", "SECTION", "TABLE", "TR", "UL",
]);

/** Text of a detached tree (no layout), with a line break around block elements. */
export function blockText(root: Node): string {
  let out = "";
  const walk = (n: Node) => {
    if (n.nodeType === 3) out += n.nodeValue ?? "";
    else if (n.nodeType === 1) {
      const block = BLOCK_TAGS.has((n as Element).tagName.toUpperCase());
      if (block) out += "\n";
      for (const c of n.childNodes) walk(c);
      if (block) out += "\n";
    }
  };
  walk(root);
  return out;
}

/** Main content of the page via Mozilla Readability (on a clone: Readability mutates the document). */
export function readableText(doc: Document): string {
  try {
    const clone = doc.cloneNode(true) as Document;
    clone.querySelectorAll("recorte-ui").forEach((e) => e.remove());
    const article = new Readability(clone, { charThreshold: 200 }).parse();
    const text = article?.content ? tidy(blockText(new DOMParser().parseFromString(article.content, "text/html").body)) : "";
    if (text) return text;
  } catch {
    // fall through
  }
  return tidy(doc.body?.innerText ?? "");
}

export interface ExtractRequest {
  kind: CaptureKind;
  /** Viewport rect for area/visible/image; ignored for full. */
  rect?: Rect;
  /** For "image": the element's own text (alt + caption) replaces the rect text. */
  image?: { alt: string; caption: string };
}

/**
 * Text payload of an item, before the caps (applied in buildUploadMeta). Every capture carries the whole page's
 * context in `page` (Readability text, meta keywords, headings near the area); the selection is the area's own text.
 */
export function extractText(doc: Document, req: ExtractRequest, ignore?: Element | null): ItemText {
  const meta = pageMeta(doc);
  const hs = headings(doc);
  const keywords = metaKeywords(doc);
  const page = (text: string, near: string[]): NonNullable<ItemText["page"]> => ({
    text: text.slice(0, MAX_PAGE_TEXT),
    ...(keywords.length ? { keywords } : {}),
    ...(near.length ? { nearHeadings: near } : {}),
  });
  // A full page: the selection already is the page's main text; do not send it twice.
  if (req.kind === "full") return { selection: readableText(doc), meta, headings: hs, alts: altsIn(doc, null), page: page("", []) };
  const whole = readableText(doc);
  // "Save link"/"Save this page": no area, the page itself is the content.
  if (req.kind === "link" || req.kind === "page") return { selection: "", meta, headings: hs, alts: [], page: page(whole, []) };
  const viewport: Rect = { x: 0, y: 0, width: innerWidth, height: innerHeight };
  const rect = req.rect ?? viewport;
  const near = pickNearHeadings(placedHeadings(doc), rect);
  if (req.kind === "image") {
    const alt = collapse(req.image?.alt ?? "");
    const caption = collapse(req.image?.caption ?? "");
    const selection = [alt, caption].filter((s, i, a) => s && a.indexOf(s) === i).join("\n");
    return { selection, meta, headings: hs, alts: alt ? [alt] : [], page: page(whole, near) };
  }
  return {
    selection: textInRect(doc, expandRect(rect, TEXT_MARGIN), ignore),
    meta,
    headings: hs,
    alts: altsIn(doc, expandRect(rect, TEXT_MARGIN)),
    page: page(whole, near),
  };
}
