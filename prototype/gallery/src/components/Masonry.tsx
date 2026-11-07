import { Skeleton } from "@heroui/react";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";

const ROW = 4; // px: grid-auto-rows unit
const GAP = 14;
const MAX_RATIO = 2.1; // very tall captures (full pages) are cropped and faded
const GHOST_RATIOS = [0.62, 1.3, 0.72, 1.7, 0.56, 0.95, 0.66, 1.15];

type Props<T> = {
  items: T[];
  ratio: (item: T) => number; // height / width, known up front so nothing jumps while images load
  itemKey: (item: T) => string;
  render: (item: T, box: { height: number; clipped: boolean }) => ReactNode;
  ghosts?: number; // skeletons appended to the shortest columns while a page loads
  stale?: boolean;
};

/**
 * Masonry on a real CSS grid: every item is placed explicitly in the shortest column with a row span
 * derived from its aspect ratio. Appending a page never moves items that are already on screen.
 */
export function Masonry<T>({ items, ratio, itemKey, render, ghosts = 0, stale }: Props<T>) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const el = ref.current!;
    setWidth(el.getBoundingClientRect().width);
    const ro = new ResizeObserver(([e]) => setWidth(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cols = width < 520 ? 2 : width < 900 ? 3 : width < 1280 ? 4 : 5;
  const colW = (width - GAP * (cols - 1)) / cols;

  const layout = useMemo(() => {
    const heights = new Array<number>(cols).fill(0);
    const place = (r: number) => {
      const clipped = r > MAX_RATIO;
      const height = Math.round(colW * Math.min(r, MAX_RATIO));
      const span = Math.ceil((height + GAP) / ROW);
      let col = 0;
      for (let i = 1; i < cols; i++) if (heights[i] < heights[col]) col = i;
      const start = heights[col] + 1;
      heights[col] += span;
      return { col: col + 1, start, span, height, clipped };
    };
    return {
      items: items.map((it) => place(ratio(it))),
      ghosts: Array.from({ length: ghosts }, (_, i) => place(GHOST_RATIOS[i % GHOST_RATIOS.length])),
    };
  }, [items, ratio, ghosts, cols, colW]);

  return (
    <div
      ref={ref}
      className={stale ? "grid-stale" : "grid-fresh"}
      style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: ROW, columnGap: GAP }}
    >
      {width > 0 &&
        items.map((it, i) => {
          const p = layout.items[i];
          return (
            <div key={itemKey(it)} style={{ gridColumn: p.col, gridRow: `${p.start} / span ${p.span}` }}>
              {render(it, { height: p.height, clipped: p.clipped })}
            </div>
          );
        })}
      {width > 0 &&
        layout.ghosts.map((g, i) => (
          <div key={`ghost-${i}`} style={{ gridColumn: g.col, gridRow: `${g.start} / span ${g.span}` }} aria-hidden="true">
            <Skeleton animationType="shimmer" className="w-full rounded-[14px] bg-white/[0.045]" style={{ height: g.height }} />
          </div>
        ))}
    </div>
  );
}
