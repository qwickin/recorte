import { useMemo, type CSSProperties } from "react";
import type { TagCount } from "../api/types";

type Props = { tags: TagCount[]; selected: string[]; onToggle: (tag: string) => void; rows?: number };

const hash = (s: string) => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);

/** Size encodes how often a tag is used (rank-based, 5 steps). */
function levels(tags: TagCount[]) {
  const map = new Map<string, number>();
  tags.forEach((t, i) => {
    const r = i / Math.max(1, tags.length - 1);
    map.set(t.tag, r < 0.08 ? 5 : r < 0.22 ? 4 : r < 0.45 ? 3 : r < 0.72 ? 2 : 1);
  });
  return map;
}

export function TagMarquee({ tags, selected, onToggle, rows = 3 }: Props) {
  const lv = useMemo(() => levels(tags), [tags]);
  const lanes = useMemo(() => {
    const out: TagCount[][] = Array.from({ length: rows }, () => []);
    tags.forEach((t, i) => out[i % rows].push(t));
    return out.map((lane) => ({
      tags: [...lane].sort((a, b) => hash(a.tag) - hash(b.tag)),
      // Short lanes are repeated so one run is always wider than the screen.
      reps: Math.max(1, Math.ceil(10 / Math.max(1, lane.length))),
    }));
  }, [tags, rows]);

  if (!tags.length) return <div className="h-[168px]" aria-hidden="true" />;

  return (
    <div className="marquee flex flex-col gap-2.5 py-2" role="group" aria-label="Etiquetas">
      {lanes.map((lane, i) => (
        <div
          key={i}
          className="marquee-row overflow-hidden py-1"
          data-dir={i % 2 ? "rtl" : "ltr"}
          style={{ "--dur": `${Math.max(45, lane.tags.length * lane.reps * 3.6) + i * 9}s` } as CSSProperties}
        >
          <div className="marquee-track">
            {/* Two identical runs; the track slides by exactly one run (-50%) for a seamless loop. */}
            {[0, 1].map((copy) => (
              <div key={copy} className="marquee-run" aria-hidden={copy === 1 || undefined}>
                {Array.from({ length: lane.reps }, (_, rep) =>
                  lane.tags.map((t) => {
                    const primary = copy === 0 && rep === 0; // only one focusable instance per tag
                    return (
                      <button
                        key={`${t.tag}-${rep}`}
                        type="button"
                        className="tag focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
                        data-level={lv.get(t.tag)}
                        aria-pressed={selected.includes(t.tag)}
                        aria-hidden={primary ? undefined : true}
                        tabIndex={primary ? 0 : -1}
                        onClick={() => onToggle(t.tag)}
                      >
                        {t.tag}
                        <span className="tag-count" aria-label={`, ${t.count} capturas`}>
                          {t.count}
                        </span>
                      </button>
                    );
                  }),
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
