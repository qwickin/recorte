import { useLayoutEffect, useMemo, useRef } from "react";
import type { TagCount } from "@recorte/shared";
import { type MessageKey, useT } from "../i18n";
import { Link } from "../lib/router";

type Props = {
  /** null while the first request is in flight. */
  tags: TagCount[] | null;
  selected: string[];
  onToggle: (tag: string) => void;
  /** Captures in the library (null = unknown): picks the empty-state copy. */
  libraryTotal?: number | null;
  rows?: number;
};

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

/** Lane speeds in px/s: slow enough to read, different enough that the rows drift apart. */
const SPEEDS = [16, 12, 19];

/**
 * The run's width decides the duration, so every lane moves at a steady pixel speed whatever its
 * length. Measured once per content change (no per-frame work): the track itself only animates
 * `transform: translate3d`, on its own compositor layer.
 */
function useLaneDurations(deps: unknown) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const apply = () =>
      el.querySelectorAll<HTMLElement>(".marquee-row").forEach((row, i) => {
        const run = row.querySelector<HTMLElement>(".marquee-run");
        if (!run?.offsetWidth) return;
        row.style.setProperty("--dur", `${(run.offsetWidth / SPEEDS[i % SPEEDS.length]).toFixed(1)}s`);
        row.dataset.ready = "true";
      });
    apply();
    // Fonts settling can change widths: measure again once they are in.
    document.fonts?.ready.then(apply, () => {});
  }, [deps]);
  return root;
}

/** Example tags of the ghost marquee: one comma-separated lane per message. */
const EXAMPLES: MessageKey[] = ["marquee.examples1", "marquee.examples2", "marquee.examples3"];

/** First visit: a ghost of what the hero will look like, and how to get there. */
function EmptyHero({ libraryTotal }: { libraryTotal?: number | null }) {
  const t = useT();
  const lanes = useMemo(() => EXAMPLES.map((k) => t(k).split(/\s*,\s*/)), [t]);
  const root = useLaneDurations(lanes);
  const waiting = !!libraryTotal; // captures exist, the AI has not tagged them yet
  return (
    <div className="flex flex-col items-center">
      <div ref={root} className="marquee marquee-ghost flex w-full flex-col gap-2.5 py-2" aria-hidden="true">
        {lanes.map((lane, i) => (
          <div key={i} className="marquee-row overflow-hidden py-1" data-dir={i % 2 ? "rtl" : "ltr"}>
            <div className="marquee-track">
              {[0, 1].map((copy) => (
                <div key={copy} className="marquee-run">
                  {[...lane, ...lane].map((w, j) => (
                    <span key={j} className="tag tag-ghost" data-level={[4, 2, 3, 1, 5, 2, 3, 1][(j + i) % 8]}>
                      {w}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="fade-in mt-6 flex min-h-[52px] max-w-[52ch] flex-col items-center gap-2 text-center">
        {libraryTotal === undefined || libraryTotal === null ? null : waiting ? (
          <>
            <p className="text-[16px] font-light text-white/85">{t("marquee.waitingTitle")}</p>
            <p className="text-[13.5px] leading-relaxed text-[var(--ink-3)]">{t("marquee.waitingBody")}</p>
          </>
        ) : (
          <>
            <p className="text-[16px] font-light text-white/85">{t("marquee.emptyTitle")}</p>
            <p className="text-[13.5px] leading-relaxed text-[var(--ink-3)]">
              {t.node("marquee.emptyBody", {
                extension: (
                  <Link href="/extensao" className="link-quiet text-white">
                    {t("marquee.extension")}
                  </Link>
                ),
              })}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

export function TagMarquee({ tags, selected, onToggle, libraryTotal, rows = 3 }: Props) {
  const t = useT();
  const list = tags ?? [];
  const lv = useMemo(() => levels(list), [list]);
  const lanes = useMemo(() => {
    const out: TagCount[][] = Array.from({ length: rows }, () => []);
    list.forEach((t, i) => out[i % rows].push(t));
    return out.map((lane) => ({
      tags: [...lane].sort((a, b) => hash(a.tag) - hash(b.tag)),
      // Short lanes are repeated so one run is always wider than the screen.
      reps: Math.max(1, Math.ceil(10 / Math.max(1, lane.length))),
    }));
  }, [list, rows]);
  const root = useLaneDurations(lanes);

  if (tags === null) return <div className="h-[168px]" aria-hidden="true" />;
  if (!tags.length) return <EmptyHero libraryTotal={libraryTotal} />;

  return (
    <div ref={root} className="marquee flex flex-col gap-2.5 py-2" role="group" aria-label={t("gallery.tags")}>
      {lanes.map((lane, i) => (
        <div key={i} className="marquee-row overflow-hidden py-1" data-dir={i % 2 ? "rtl" : "ltr"}>
          <div className="marquee-track">
            {/* Two identical runs; the track slides by exactly one run (-50%) for a seamless loop. */}
            {[0, 1].map((copy) => (
              <div key={copy} className="marquee-run" aria-hidden={copy === 1 || undefined}>
                {Array.from({ length: lane.reps }, (_, rep) =>
                  lane.tags.map((tag) => {
                    const primary = copy === 0 && rep === 0; // only one focusable instance per tag
                    return (
                      <button
                        key={`${tag.tag}-${rep}`}
                        type="button"
                        className="tag focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white/70"
                        data-level={lv.get(tag.tag)}
                        aria-pressed={selected.includes(tag.tag)}
                        aria-hidden={primary ? undefined : true}
                        tabIndex={primary ? 0 : -1}
                        onClick={() => onToggle(tag.tag)}
                      >
                        {tag.tag}
                        <span className="tag-count" aria-label={t("marquee.count", { count: tag.count })}>
                          {tag.count}
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
