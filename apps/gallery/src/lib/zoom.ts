// Pan/zoom math for the detail image viewer. Pure: the component feeds pointer positions and sizes in.
//
// The image is drawn at its natural size (iw × ih) with `transform: translate3d(x, y, 0) scale(s)` and
// `transform-origin: 0 0`, inside a viewport of vw × vh. A point p of the viewport shows the image point
// (p - t) / s, so zooming by f around p keeps that image point under p: t' = p - (p - t) · s'/s.

export type Size = { w: number; h: number };
export type View = { s: number; x: number; y: number };
export type Point = { x: number; y: number };

/** Scale at which the whole image fits; never above 1 (small captures are not blown up). */
export const containScale = (img: Size, vp: Size) => Math.min(1, vp.w / img.w, vp.h / img.h);

/** Scale at which the image fills the viewport's width (capped at 1). */
export const fitWidthScale = (img: Size, vp: Size) => Math.min(1, vp.w / img.w);

export const minScale = containScale;

/** Up to 8× past "contain" and never less than 2× the natural size, so small and huge captures both get detail. */
export const maxScale = (img: Size, vp: Size) => Math.max(containScale(img, vp) * 8, 2);

/** Centres an axis that is smaller than the viewport, otherwise keeps the image edge-to-edge (no empty margin). */
function clampAxis(t: number, content: number, viewport: number) {
  if (content <= viewport) return (viewport - content) / 2;
  return Math.min(0, Math.max(viewport - content, t));
}

export function clampView(v: View, img: Size, vp: Size): View {
  const s = Math.min(maxScale(img, vp), Math.max(minScale(img, vp), v.s));
  return { s, x: clampAxis(v.x, img.w * s, vp.w), y: clampAxis(v.y, img.h * s, vp.h) };
}

/**
 * Where a capture opens: the whole image when it fits, the top of the page at full width when it is
 * much taller than the viewport (a full-page capture), so it reads like the page did.
 */
export function initialView(img: Size, vp: Size): View {
  const fw = fitWidthScale(img, vp);
  const tall = img.h * fw > vp.h * 1.15;
  const s = tall ? fw : containScale(img, vp);
  return clampView({ s, x: 0, y: 0 }, img, vp);
}

/** Zooms by `factor` keeping the image point under `p` fixed (then clamps). */
export function zoomAt(v: View, factor: number, p: Point, img: Size, vp: Size): View {
  const s = Math.min(maxScale(img, vp), Math.max(minScale(img, vp), v.s * factor));
  const k = s / v.s;
  return clampView({ s, x: p.x - (p.x - v.x) * k, y: p.y - (p.y - v.y) * k }, img, vp);
}

export const panBy = (v: View, dx: number, dy: number, img: Size, vp: Size): View => clampView({ ...v, x: v.x + dx, y: v.y + dy }, img, vp);

/** Wheel delta → zoom factor. Lines and pages are normalised to pixels; a trackpad pinch (ctrlKey) is finer, so it is boosted. */
export function wheelFactor(deltaY: number, deltaMode: number, pinch = false) {
  const px = deltaMode === 1 ? deltaY * 16 : deltaMode === 2 ? deltaY * 400 : deltaY;
  const clamped = Math.max(-120, Math.min(120, px));
  return Math.exp(-clamped * (pinch ? 0.01 : 0.0022));
}

/** Two-finger pinch: from the gesture's start (view + the two touch points) to the current two points. */
export function pinchView(start: View, a0: Point, b0: Point, a1: Point, b1: Point, img: Size, vp: Size): View {
  const d0 = Math.hypot(b0.x - a0.x, b0.y - a0.y) || 1;
  const d1 = Math.hypot(b1.x - a1.x, b1.y - a1.y);
  const m0 = { x: (a0.x + b0.x) / 2, y: (a0.y + b0.y) / 2 };
  const m1 = { x: (a1.x + b1.x) / 2, y: (a1.y + b1.y) / 2 };
  const s = Math.min(maxScale(img, vp), Math.max(minScale(img, vp), start.s * (d1 / d0)));
  const k = s / start.s;
  // The image point under the starting midpoint follows the current midpoint (zoom + pan in one gesture).
  return clampView({ s, x: m1.x - (m0.x - start.x) * k, y: m1.y - (m0.y - start.y) * k }, img, vp);
}

/** "Zoomed" for UI purposes: anything bigger than the opening view (or bigger than contain). */
export const isZoomed = (v: View, img: Size, vp: Size) => v.s > minScale(img, vp) * 1.001;

export const sameView = (a: View, b: View) => Math.abs(a.s - b.s) < 1e-6 && Math.abs(a.x - b.x) < 0.5 && Math.abs(a.y - b.y) < 0.5;
