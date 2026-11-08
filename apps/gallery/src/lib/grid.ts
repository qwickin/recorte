// Keyboard movement across a row-major grid of `count` cells laid out in `cols` columns.

export type GridKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown" | "Home" | "End";

export const isGridKey = (k: string): k is GridKey => ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(k);

/**
 * Next active index. ←/→ walk in reading order (wrapping to the previous/next row), ↑/↓ keep the column
 * and stop at the first/last row; ↓ from a row with no cell below goes to the last cell when there is a
 * shorter last row. Home/End jump to the ends.
 */
export function gridMove(index: number, key: GridKey, cols: number, count: number): number {
  if (count <= 0) return 0;
  const c = Math.max(1, Math.floor(cols));
  const i = Math.min(Math.max(0, index), count - 1);
  switch (key) {
    case "ArrowLeft":
      return Math.max(0, i - 1);
    case "ArrowRight":
      return Math.min(count - 1, i + 1);
    case "ArrowUp":
      return i - c >= 0 ? i - c : i;
    case "ArrowDown": {
      if (i + c < count) return i + c;
      const lastRowStart = Math.floor((count - 1) / c) * c;
      return i < lastRowStart ? count - 1 : i;
    }
    case "Home":
      return 0;
    case "End":
      return count - 1;
  }
}

/** Columns for the palette's result grid at a given width (JS owns this so arrows match the layout). */
export const paletteCols = (width: number) => (width < 420 ? 2 : width < 760 ? 3 : 4);
