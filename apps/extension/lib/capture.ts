import { browser } from "wxt/browser";
import type { Rect } from "./extract";
import type { PageMetrics } from "./messages";
import { MIN_CAPTURE_INTERVAL_MS, WEBP_MAX_DIMENSION, outputScale, planFullPageStrips, throttleDelay } from "./stitch";

/**
 * Background-side image work: tab capture, crop, scroll-and-stitch, WebP encoding.
 * Runs in the Chrome service worker / Firefox background page; uses OffscreenCanvas only.
 */

const WEBP_QUALITY = 0.9;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

let lastCaptureAt = 0;

/** `captureVisibleTab`, spaced ≥550 ms apart (Chrome allows 2 calls/s). Returns a decoded bitmap.
 *  `guard` (see lib/guard.ts) runs right before and right after the call and throws if the user switched tabs
 *  or the tab navigated: captureVisibleTab captures whatever tab is active in the window. */
export async function captureVisible(windowId: number, guard?: () => Promise<void>): Promise<ImageBitmap> {
  const wait = throttleDelay(lastCaptureAt, Date.now(), MIN_CAPTURE_INTERVAL_MS);
  if (wait) await sleep(wait);
  await guard?.();
  lastCaptureAt = Date.now();
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: "png" });
  await guard?.();
  return dataUrlToBitmap(dataUrl);
}

export async function dataUrlToBitmap(dataUrl: string): Promise<ImageBitmap> {
  const blob = await (await fetch(dataUrl)).blob();
  return createImageBitmap(blob);
}

function canvas2d(w: number, h: number): [OffscreenCanvas, OffscreenCanvasRenderingContext2D] {
  const c = new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("OffscreenCanvas 2D unavailable");
  ctx.imageSmoothingQuality = "high";
  return [c, ctx];
}

/** Crops a viewport capture to `rect` (CSS px). The scale is measured (bitmap width / viewport width), which
 *  accounts for devicePixelRatio and zoom. The result never exceeds the WebP size limit. */
export function cropToRect(bitmap: ImageBitmap, rect: Rect, viewportWidth: number): OffscreenCanvas {
  const s = bitmap.width / Math.max(1, viewportWidth);
  const out = outputScale(rect.width, rect.height, s);
  const [c, ctx] = canvas2d(rect.width * out, rect.height * out);
  ctx.drawImage(bitmap, rect.x * s, rect.y * s, rect.width * s, rect.height * s, 0, 0, c.width, c.height);
  return c;
}

export function bitmapToCanvas(bitmap: ImageBitmap): OffscreenCanvas {
  const out = outputScale(bitmap.width, bitmap.height, 1);
  const [c, ctx] = canvas2d(bitmap.width * out, bitmap.height * out);
  ctx.drawImage(bitmap, 0, 0, c.width, c.height);
  return c;
}

/** WebP q≈0.9. Falls back to PNG only if the browser cannot encode WebP (the server accepts both). */
export async function encodeImage(c: OffscreenCanvas): Promise<{ data: ArrayBuffer; mime: string; width: number; height: number }> {
  let blob = await c.convertToBlob({ type: "image/webp", quality: WEBP_QUALITY });
  if (blob.type !== "image/webp") blob = await c.convertToBlob({ type: "image/png" });
  return { data: await blob.arrayBuffer(), mime: blob.type, width: c.width, height: c.height };
}

/** Small preview for the dialog (data URL; content scripts cannot read extension blobs). */
export async function previewDataUrl(c: OffscreenCanvas, maxWidth = 720, maxHeight = 2400): Promise<string> {
  const k = Math.min(1, maxWidth / c.width, maxHeight / c.height);
  const [p, ctx] = canvas2d(c.width * k, c.height * k);
  ctx.drawImage(c, 0, 0, p.width, p.height);
  const blob = await p.convertToBlob({ type: "image/jpeg", quality: 0.82 });
  return blobToDataUrl(blob);
}

export async function blobToDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:${blob.type};base64,${btoa(bin)}`;
}

export interface FullPageDriver {
  metrics(): Promise<PageMetrics>;
  /** Scrolls the window to `y`, waits for paint, returns the actual scrollY. */
  scrollTo(y: number, hideFixed: boolean): Promise<number>;
  /** Restores scroll position and any hidden fixed/sticky elements. */
  restore(x: number, y: number): Promise<void>;
}

/** Chrome: scroll and stitch `captureVisibleTab` strips (≤2 captures/s). Fixed/sticky elements are hidden from the
 *  second strip on; scroll is restored at the end, even on failure. */
export async function captureFullStitched(
  windowId: number,
  drive: FullPageDriver,
  guard?: () => Promise<void>,
): Promise<{ canvas: OffscreenCanvas; truncated: boolean }> {
  const m = await drive.metrics();
  const plan = planFullPageStrips(m.pageHeight, m.innerHeight);
  let canvas: OffscreenCanvas | null = null;
  let ctx: OffscreenCanvasRenderingContext2D | null = null;
  let out = 1;
  try {
    for (let i = 0; i < plan.offsets.length; i++) {
      const y = await drive.scrollTo(plan.offsets[i]!, i > 0);
      const bmp = await captureVisible(windowId, guard);
      const s = bmp.width / Math.max(1, m.innerWidth);
      if (!canvas) {
        out = outputScale(m.clientWidth, plan.height, s);
        [canvas, ctx] = canvas2d(m.clientWidth * out, plan.height * out);
      }
      const rows = Math.min(m.innerHeight, plan.height - y);
      if (rows > 0) {
        ctx!.drawImage(bmp, 0, 0, m.clientWidth * s, rows * s, 0, Math.round(y * out), canvas.width, Math.round(rows * out));
      }
      bmp.close();
    }
  } finally {
    await drive.restore(m.scrollX, m.scrollY).catch(() => {});
  }
  return { canvas: canvas!, truncated: plan.truncated };
}

/** Firefox: one `tabs.captureTab` call with a rect covering the page (Firefox 82+). */
export async function captureFullFirefox(tabId: number, m: PageMetrics): Promise<{ canvas: OffscreenCanvas; truncated: boolean }> {
  const plan = planFullPageStrips(m.pageHeight, m.innerHeight);
  const scale = outputScale(m.clientWidth, plan.height, m.dpr, WEBP_MAX_DIMENSION);
  const tabs = browser.tabs as unknown as {
    captureTab(tabId: number, opts: { format: string; rect: Rect; scale: number }): Promise<string>;
  };
  const dataUrl = await tabs.captureTab(tabId, {
    format: "png",
    rect: { x: 0, y: 0, width: m.clientWidth, height: plan.height },
    scale,
  });
  const bmp = await dataUrlToBitmap(dataUrl);
  const c = bitmapToCanvas(bmp);
  bmp.close();
  return { canvas: c, truncated: plan.truncated };
}
