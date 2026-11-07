import { describe, expect, it } from "vitest";
import { clampRect, expandRect, rectsIntersect } from "../lib/extract";

describe("rectsIntersect", () => {
  const a = { x: 0, y: 0, width: 100, height: 100 };
  it("detects overlap", () => {
    expect(rectsIntersect(a, { x: 50, y: 50, width: 100, height: 100 })).toBe(true);
    expect(rectsIntersect(a, { x: 10, y: 10, width: 5, height: 5 })).toBe(true);
  });
  it("is false for disjoint rects and edge contact", () => {
    expect(rectsIntersect(a, { x: 200, y: 0, width: 10, height: 10 })).toBe(false);
    expect(rectsIntersect(a, { x: 100, y: 0, width: 10, height: 10 })).toBe(false);
    expect(rectsIntersect(a, { x: 0, y: 100, width: 10, height: 10 })).toBe(false);
  });
  it("is false for empty rects", () => {
    expect(rectsIntersect(a, { x: 10, y: 10, width: 0, height: 10 })).toBe(false);
  });
  it("text just outside the area is caught by the 48 px margin", () => {
    const text = { x: 130, y: 10, width: 40, height: 12 };
    expect(rectsIntersect(a, text)).toBe(false);
    expect(rectsIntersect(expandRect(a, 48), text)).toBe(true);
  });
});

describe("clampRect", () => {
  it("limits a rect to the viewport", () => {
    expect(clampRect({ x: -10, y: 20, width: 50, height: 2000 }, { x: 0, y: 0, width: 800, height: 600 })).toEqual({
      x: 0,
      y: 20,
      width: 40,
      height: 580,
    });
  });
});
