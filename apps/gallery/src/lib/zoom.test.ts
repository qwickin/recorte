import { describe, expect, it } from "vitest";
import { clampView, containScale, initialView, isZoomed, maxScale, panBy, pinchView, wheelFactor, zoomAt } from "./zoom";

const vp = { w: 800, h: 600 };
const wide = { w: 1600, h: 1000 }; // contain = 0.5 (width-bound)
const page = { w: 1440, h: 9000 }; // a full-page capture

/** The image point shown at viewport point p. */
const under = (v: { s: number; x: number; y: number }, p: { x: number; y: number }) => ({ x: (p.x - v.x) / v.s, y: (p.y - v.y) / v.s });

describe("zoom math", () => {
  it("contain never upscales small captures", () => {
    expect(containScale(wide, vp)).toBe(0.5);
    expect(containScale({ w: 200, h: 100 }, vp)).toBe(1);
  });

  it("opens a normal capture centred and fully visible", () => {
    const v = initialView(wide, vp);
    expect(v.s).toBe(0.5);
    expect(v.x).toBe(0);
    expect(v.y).toBe((600 - 500) / 2);
  });

  it("opens a full-page capture at full width, at the top", () => {
    const v = initialView(page, vp);
    expect(v.s).toBeCloseTo(800 / 1440);
    expect(v).toMatchObject({ x: 0, y: 0 });
    expect(isZoomed(v, page, vp)).toBe(true); // bigger than contain: drag pans it vertically
  });

  it("keeps the image point under the cursor fixed while zooming in and out", () => {
    const v0 = initialView(wide, vp);
    const p = { x: 610, y: 222 };
    const before = under(v0, p);
    const v1 = zoomAt(v0, 2.5, p, wide, vp);
    expect(v1.s).toBeCloseTo(1.25);
    expect(under(v1, p).x).toBeCloseTo(before.x);
    expect(under(v1, p).y).toBeCloseTo(before.y);
    const v2 = zoomAt(v1, 0.8, p, wide, vp);
    expect(under(v2, p).x).toBeCloseTo(before.x);
    expect(under(v2, p).y).toBeCloseTo(before.y);
  });

  it("clamps scale between contain and the maximum", () => {
    const v0 = initialView(wide, vp);
    expect(zoomAt(v0, 0.1, { x: 10, y: 10 }, wide, vp).s).toBe(0.5);
    expect(zoomAt(v0, 1000, { x: 10, y: 10 }, wide, vp).s).toBe(maxScale(wide, vp));
    expect(maxScale(wide, vp)).toBe(4);
    expect(maxScale({ w: 200, h: 100 }, vp)).toBe(8); // contain 1 → 8×
  });

  it("zooming out to contain recentres (no drift left over from the pan)", () => {
    const zoomed = zoomAt(initialView(wide, vp), 3, { x: 700, y: 100 }, wide, vp);
    const back = zoomAt(zoomed, 1 / 3, { x: 20, y: 580 }, wide, vp);
    expect(back).toEqual(initialView(wide, vp));
  });

  it("pans only within the image: no empty margin past its edges", () => {
    const v = zoomAt(initialView(wide, vp), 2, { x: 400, y: 300 }, wide, vp); // s = 1, image 1600×1000
    expect(panBy(v, 5000, 5000, wide, vp)).toMatchObject({ x: 0, y: 0 });
    expect(panBy(v, -5000, -5000, wide, vp)).toMatchObject({ x: 800 - 1600, y: 600 - 1000 });
  });

  it("an axis smaller than the viewport stays centred while panning", () => {
    const v = initialView(page, vp);
    const moved = panBy(v, 300, -400, page, vp);
    expect(moved.x).toBe(0); // width fits exactly
    expect(moved.y).toBe(-400);
    const c = clampView({ s: containScale(page, vp), x: 99, y: 99 }, page, vp);
    expect(c.y).toBe(0);
    expect(c.x).toBeCloseTo((800 - 1440 * c.s) / 2);
  });

  it("wheel: up zooms in, down zooms out, lines are normalised, bursts are capped", () => {
    expect(wheelFactor(-100, 0)).toBeGreaterThan(1);
    expect(wheelFactor(100, 0)).toBeLessThan(1);
    expect(wheelFactor(-100, 0) * wheelFactor(100, 0)).toBeCloseTo(1);
    expect(wheelFactor(3, 1)).toBeCloseTo(wheelFactor(48, 0));
    expect(wheelFactor(-10_000, 0)).toBeCloseTo(wheelFactor(-120, 0));
    expect(wheelFactor(-10, 0, true)).toBeGreaterThan(wheelFactor(-10, 0));
  });

  it("pinch: spreading the fingers zooms around their midpoint and follows it", () => {
    const v0 = initialView(wide, vp);
    const a0 = { x: 350, y: 300 };
    const b0 = { x: 450, y: 300 };
    const mid = under(v0, { x: 400, y: 300 });
    // Fingers twice as far apart, midpoint moved 30 px right.
    const v1 = pinchView(v0, a0, b0, { x: 330, y: 300 }, { x: 530, y: 300 }, wide, vp);
    expect(v1.s).toBeCloseTo(1);
    expect(under(v1, { x: 430, y: 300 }).x).toBeCloseTo(mid.x);
    expect(under(v1, { x: 430, y: 300 }).y).toBeCloseTo(mid.y);
    // Pinching in past contain clamps back to the opening view.
    expect(pinchView(v0, a0, b0, { x: 399, y: 300 }, { x: 401, y: 300 }, wide, vp)).toEqual(v0);
  });
});
