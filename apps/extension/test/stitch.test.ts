import { describe, expect, it } from "vitest";
import { MAX_FULL_PAGE_HEIGHT, WEBP_MAX_DIMENSION, outputScale, planFullPageStrips, throttleDelay } from "../lib/stitch";

describe("planFullPageStrips", () => {
  it("truncates very tall pages at 12 000 px", () => {
    const p = planFullPageStrips(30000, 900);
    expect(p.truncated).toBe(true);
    expect(p.height).toBe(MAX_FULL_PAGE_HEIGHT);
    const last = p.offsets.at(-1)!;
    expect(last).toBeLessThanOrEqual(12000);
    expect(last + 900).toBeLessThanOrEqual(12000);
    expect(p.offsets[0]).toBe(0);
  });

  it("covers the page with no gaps and ascending offsets", () => {
    for (const [page, vh] of [
      [5000, 900],
      [1800, 900],
      [12000, 1000],
      [901, 900],
    ] as const) {
      const p = planFullPageStrips(page, vh);
      expect(p.truncated).toBe(false);
      expect(p.height).toBe(page);
      for (let i = 1; i < p.offsets.length; i++) {
        expect(p.offsets[i]!).toBeGreaterThan(p.offsets[i - 1]!);
        expect(p.offsets[i]! - p.offsets[i - 1]!).toBeLessThanOrEqual(vh);
      }
      expect(p.offsets.at(-1)! + vh).toBe(page);
    }
  });

  it("uses a single strip when the page fits the viewport", () => {
    expect(planFullPageStrips(700, 900)).toEqual({ offsets: [0], height: 700, truncated: false });
  });
});

describe("outputScale", () => {
  it("keeps the native scale when it fits", () => {
    expect(outputScale(1280, 4000, 2)).toBe(2);
  });
  it("downscales so no side exceeds the WebP limit", () => {
    const s = outputScale(1280, 12000, 2);
    expect(12000 * s).toBeLessThanOrEqual(WEBP_MAX_DIMENSION);
  });
});

describe("throttleDelay", () => {
  it("spaces captures at least 550 ms apart (Chrome: 2 calls/s)", () => {
    expect(throttleDelay(1000, 1100)).toBe(450);
    expect(throttleDelay(1000, 2000)).toBe(0);
  });
});
