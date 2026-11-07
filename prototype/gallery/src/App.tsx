import { Button } from "@heroui/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, totalCaptures } from "./api/mock";
import type { Capture, TagCount } from "./api/types";
import { CaptureModal } from "./components/CaptureModal";
import { CaptureTile } from "./components/CaptureTile";
import { CommandPalette } from "./components/CommandPalette";
import { Masonry } from "./components/Masonry";
import { TagMarquee } from "./components/TagMarquee";
import { TopBar } from "./components/TopBar";
import { useCaptureFeed } from "./hooks/useCaptureFeed";
import { EMBED, ScrollRootContext, useScrollRoot } from "./lib/env";
import { isMac } from "./lib/text";

const ratio = (c: Capture) => c.image.height / c.image.width;
const keyOf = (c: Capture) => c.id;
const andList = new Intl.ListFormat("pt-PT", { type: "conjunction" });

/** Fires `onVisible` when the end of the list gets near; re-arms after every page. */
function Sentinel({ onVisible, disabled, armKey }: { onVisible: () => void; disabled: boolean; armKey: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const root = useScrollRoot();
  useEffect(() => {
    if (disabled || !ref.current || (EMBED && !root)) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && onVisible(), {
      root,
      rootMargin: "0px 0px 900px 0px",
    });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [onVisible, disabled, root, armKey]);
  return <div ref={ref} className="h-px" aria-hidden="true" />;
}

export default function App() {
  const [root, setRoot] = useState<HTMLElement | null>(null);
  const [tags, setTags] = useState<TagCount[]>([]);
  const [filter, setFilter] = useState<string[]>([]);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [detail, setDetail] = useState<Capture | null>(null);
  const feed = useCaptureFeed(filter);
  const gridTop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api.listTags({ signal: ctrl.signal }).then(setTags, () => {});
    return () => ctrl.abort();
  }, []);

  // ⌘K / Ctrl+K toggles the palette (preventDefault: Firefox uses Ctrl+K for its own search bar). "/" opens it too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!detail) setPaletteOpen((o) => !o); // never stack the palette on top of the detail view
      } else if (e.key === "/" && !typing && !detail) {
        e.preventDefault();
        setPaletteOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail]);

  /** After a filter change, bring the top of the results into view if it is off screen. */
  const revealGrid = useCallback(() => {
    const el = gridTop.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top - (root?.getBoundingClientRect().top ?? 0);
    const viewH = root?.clientHeight ?? window.innerHeight;
    if (top < 0 || top > viewH * 0.7) {
      const scroller = root ?? window;
      const current = root ? root.scrollTop : window.scrollY;
      scroller.scrollTo({ top: current + top - 80, behavior: "smooth" });
    }
  }, [root]);

  const toggleTag = (t: string) => {
    setFilter((f) => (f.includes(t) ? f.filter((x) => x !== t) : [...f, t]));
    requestAnimationFrame(revealGrid);
  };
  const showTag = (t: string) => {
    setDetail(null);
    setPaletteOpen(false);
    setFilter([t]);
    setTimeout(revealGrid, 220);
  };
  const pick = (c: Capture) => {
    setPaletteOpen(false);
    setTimeout(() => setDetail(c), 160); // let the palette leave first
  };

  const initial = feed.items.length === 0 && (feed.loading || feed.total === null);
  const ghosts = feed.loading && !feed.stale ? (feed.items.length ? 6 : 12) : 0;

  return (
    <ScrollRootContext value={root}>
      <div ref={EMBED ? setRoot : undefined} className={EMBED ? "embed-root" : "px-4 sm:px-6 lg:px-10"}>
        <TopBar filter={filter} onRemove={toggleTag} onClear={() => setFilter([])} onSearch={() => setPaletteOpen(true)} />

        <main className="mx-auto max-w-[1680px]">
          <section className={`hero-light -mx-4 px-4 pt-6 pb-6 ${EMBED ? "" : "sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10"}`} aria-label="Etiquetas">
            <TagMarquee tags={tags} selected={filter} onToggle={toggleTag} />
            <p className="mx-auto mt-6 max-w-[62ch] text-center text-[14px] leading-relaxed text-[var(--ink-3)]">
              {totalCaptures} capturas e {tags.length || "…"} etiquetas. Clica numa etiqueta para filtrar
              <span className="kbd-hint">
                , ou carrega em <span className="text-[var(--ink-2)]">{isMac ? "⌘K" : "Ctrl K"}</span> para pesquisar pelo que te lembras da imagem
              </span>
              .
            </p>
          </section>

          <div ref={gridTop} />
          <div className="flex h-10 items-center text-[13px] text-[var(--ink-3)]" aria-live="polite">
            {filter.length > 0 && feed.total !== null && !feed.stale && (
              <span className="fade-in">
                {feed.total} {feed.total === 1 ? "captura" : "capturas"} com {andList.format(filter)}
              </span>
            )}
          </div>

          <Masonry
            items={feed.items}
            ratio={ratio}
            itemKey={keyOf}
            ghosts={initial ? 12 : ghosts}
            stale={feed.stale}
            render={(c, box) => <CaptureTile capture={c} height={box.height} clipped={box.clipped} onOpen={setDetail} />}
          />

          <Sentinel onVisible={feed.loadMore} disabled={feed.loading || !feed.hasMore || feed.stale} armKey={feed.items.length} />

          <footer className="flex min-h-[160px] flex-col items-center justify-center gap-3 py-12 text-center">
            {feed.error && (
              <>
                <p className="text-[14px] text-[var(--ink-2)]">{feed.error}</p>
                <Button size="sm" variant="outline" onPress={feed.loadMore}>
                  Tentar de novo
                </Button>
              </>
            )}
            {!feed.error && !feed.loading && !feed.stale && feed.total === 0 && (
              <>
                <p className="text-[15px] text-white/80">Nenhuma captura tem todas estas etiquetas.</p>
                <Button size="sm" variant="outline" onPress={() => setFilter(filter.slice(0, -1))}>
                  Remover “{filter.at(-1)}”
                </Button>
              </>
            )}
            {!feed.error && !feed.hasMore && !feed.loading && feed.items.length > 0 && (
              <p className="fade-in flex items-center gap-4 text-[13px] text-[var(--ink-3)]">
                <span className="h-px w-16 bg-gradient-to-r from-transparent to-white/20" />
                Chegaste à primeira captura
                <span className="h-px w-16 bg-gradient-to-l from-transparent to-white/20" />
              </p>
            )}
          </footer>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} tags={tags} onPick={pick} onTag={showTag} />
      <CaptureModal capture={detail} onClose={() => setDetail(null)} onTag={showTag} />
    </ScrollRootContext>
  );
}
