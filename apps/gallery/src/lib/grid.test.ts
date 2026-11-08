import { describe, expect, it } from "vitest";
import { gridMove, isGridKey, paletteCols } from "./grid";

// 3 columns, 8 cells:
//   0 1 2
//   3 4 5
//   6 7
describe("gridMove", () => {
  const m = (i: number, k: Parameters<typeof gridMove>[1]) => gridMove(i, k, 3, 8);

  it("← / → walk in reading order and wrap between rows", () => {
    expect(m(0, "ArrowRight")).toBe(1);
    expect(m(2, "ArrowRight")).toBe(3);
    expect(m(3, "ArrowLeft")).toBe(2);
    expect(m(0, "ArrowLeft")).toBe(0);
    expect(m(7, "ArrowRight")).toBe(7);
  });

  it("↑ / ↓ keep the column and stop at the edges", () => {
    expect(m(1, "ArrowDown")).toBe(4);
    expect(m(4, "ArrowDown")).toBe(7);
    expect(m(7, "ArrowDown")).toBe(7);
    expect(m(4, "ArrowUp")).toBe(1);
    expect(m(1, "ArrowUp")).toBe(1);
  });

  it("↓ into a short last row lands on its last cell", () => {
    expect(m(5, "ArrowDown")).toBe(7);
    expect(m(6, "ArrowDown")).toBe(6); // already on the last row
  });

  it("Home / End, empty grids, out-of-range indexes, one column", () => {
    expect(m(4, "Home")).toBe(0);
    expect(m(4, "End")).toBe(7);
    expect(gridMove(3, "ArrowDown", 3, 0)).toBe(0);
    expect(gridMove(42, "ArrowLeft", 3, 8)).toBe(6);
    expect(gridMove(2, "ArrowDown", 1, 5)).toBe(3);
    expect(gridMove(2, "ArrowUp", 0, 5)).toBe(1); // cols < 1 behaves like a list
  });

  it("recognises only the grid keys", () => {
    expect(isGridKey("ArrowUp")).toBe(true);
    expect(isGridKey("Enter")).toBe(false);
  });

  it("palette columns by width", () => {
    expect(paletteCols(358)).toBe(2);
    expect(paletteCols(700)).toBe(3);
    expect(paletteCols(900)).toBe(4);
  });
});
