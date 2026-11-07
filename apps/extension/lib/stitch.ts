/** Full-page capture planning. Pure: no browser APIs, unit-tested. */

/** Maximum full-page height in CSS px (spec §6). Taller pages are truncated. */
export const MAX_FULL_PAGE_HEIGHT = 12_000;

/** WebP cannot encode images with a side longer than this (libwebp limit). */
export const WEBP_MAX_DIMENSION = 16_383;

/** Chrome allows at most 2 `captureVisibleTab` calls per second; keep a small safety margin. */
export const MIN_CAPTURE_INTERVAL_MS = 550;

export interface StripPlan {
  /** Scroll offsets (CSS px, top of viewport) for each strip, ascending. */
  offsets: number[];
  /** Total height that will be captured (CSS px): min(pageHeight, max). */
  height: number;
  /** True when the page is taller than `max` and the capture is cut. */
  truncated: boolean;
}

/**
 * Plans the scroll offsets for a scroll-and-stitch capture.
 * Strips are one viewport tall; the last strip is pulled up so it never scrolls past the captured height
 * (it overlaps the previous one instead of leaving a gap).
 */
export function planFullPageStrips(pageHeight: number, viewportHeight: number, max = MAX_FULL_PAGE_HEIGHT): StripPlan {
  const vh = Math.max(1, Math.floor(viewportHeight));
  const page = Math.max(0, Math.ceil(pageHeight));
  const height = Math.max(Math.min(page, max), Math.min(vh, page) || 1);
  const truncated = page > max;
  const offsets: number[] = [];
  if (height <= vh) return { offsets: [0], height, truncated };
  const last = height - vh;
  for (let y = 0; y < last; y += vh) offsets.push(y);
  offsets.push(last);
  return { offsets, height, truncated };
}

/**
 * Output scale (device px per CSS px) for a capture of `width` × `height` CSS px, never above the native
 * scale and never producing a side longer than the WebP limit.
 */
export function outputScale(width: number, height: number, nativeScale: number, maxSide = WEBP_MAX_DIMENSION): number {
  const longest = Math.max(1, width, height);
  return Math.min(nativeScale, maxSide / longest);
}

/** Milliseconds to wait so consecutive captures stay at least `interval` apart. */
export function throttleDelay(lastAt: number, now: number, interval = MIN_CAPTURE_INTERVAL_MS): number {
  return Math.max(0, lastAt + interval - now);
}
