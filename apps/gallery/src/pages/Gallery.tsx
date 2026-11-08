import { Button } from "@heroui/react";
import type { Category, Item, ItemSummary, TagCount } from "@recorte/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { api, EMPTY_FILTERS, hasFilters, type Filters } from "../api";
import { CaptureTile } from "../components/CaptureTile";
import { CommandPalette } from "../components/CommandPalette";
import { FilterDock, SelectionDock } from "../components/Dock";
import { isTyping, ItemModal } from "../components/ItemModal";
import { Masonry } from "../components/Masonry";
import { Sentinel } from "../components/Sentinel";
import { TagMarquee } from "../components/TagMarquee";
import { TopBar, type FilterChip } from "../components/TopBar";
import { useEvents } from "../hooks/useEvents";
import { useItemFeed } from "../hooks/useItemFeed";
import { displayTags, displayTitle, matchesFilters } from "../lib/item";
import { inLoadedRange } from "../api/feed";
import { takePaletteRequest } from "../lib/palette";
import { useFormat, useT } from "../i18n";
import { colorKey, isColorName, isMac, typeKey } from "../lib/text";

const ratio = (c: ItemSummary) => (c.width > 0 ? c.height / c.width : 0.62);
const keyOf = (c: ItemSummary) => c.id;

/**
 * Swaps the filters Dock and the selection Dock as one shared-layout morph: both carry
 * `view-transition-name: dock`, so the browser animates the box between their sizes and crossfades the
 * contents (styles.css). Instant where View Transitions are missing or motion is reduced.
 */
function morph(update: () => void) {
  const start = (document as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  if (!start || matchMedia("(prefers-reduced-motion: reduce)").matches) return update();
  start.call(document, () => flushSync(update));
}

export function GalleryPage() {
  const t = useT();
  const fmt = useFormat();
  // null until the first response: the empty hero must not flash on every load.
  const [tags, setTags] = useState<TagCount[] | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [paletteOpen, setPaletteOpen] = useState(takePaletteRequest);
  const [detail, setDetail] = useState<ItemSummary | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [libraryTotal, setLibraryTotal] = useState<number | null>(null);
  const feed = useItemFeed(filters);
  const gridTop = useRef<HTMLDivElement>(null);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const refreshTags = useCallback(() => {
    api.listTags().then(setTags, () => setTags((t) => t ?? []));
  }, []);

  useEffect(() => {
    refreshTags();
    api.listCategories().then(setCategories, () => {});
  }, [refreshTags]);

  useEffect(() => {
    if (!hasFilters(filters) && feed.total !== null && !feed.stale && !feed.loading) setLibraryTotal(feed.total);
  }, [filters, feed.total, feed.stale, feed.loading]);

  // Tag counts change with every edit; refetch at most every 1.5 s while events stream in.
  const tagTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleTags = useCallback(() => {
    if (tagTimer.current) return;
    tagTimer.current = setTimeout(() => {
      tagTimer.current = null;
      refreshTags();
    }, 1500);
  }, [refreshTags]);
  useEffect(() => () => void (tagTimer.current && clearTimeout(tagTimer.current)), []);

  useEffect(() => setSelected(new Set()), [filters]);

  // Ids trashed while this page is open. An `item.updated` for one of them (e.g. the AI step finishing after
  // the delete, from an older server) must not bring it back; `item.created` (restore) clears the mark.
  const trashed = useRef(new Set<string>());

  useEvents({
    onCreated: (it) => {
      trashed.current.delete(it.id);
      scheduleTags();
      setLibraryTotal((n) => (n === null ? n : n + 1));
      if (matchesFilters(it, filtersRef.current) !== true) return;
      if (!inLoadedRange(feed.items, feed.hasMore, it)) return; // its page will bring it
      setFresh((s) => new Set(s).add(it.id));
      feed.upsert(it);
    },
    onUpdated: (it) => {
      if (trashed.current.has(it.id)) return;
      scheduleTags();
      const match = matchesFilters(it, filtersRef.current);
      if (!feed.items.some((x) => x.id === it.id)) {
        // Now matches the filter (e.g. a tag was just added): insert it, but only inside the loaded range
        // so later pages still append in keyset order.
        if (match === true && inLoadedRange(feed.items, feed.hasMore, it)) feed.upsert(it);
        return;
      }
      if (match === false) feed.remove([it.id]);
      else feed.upsert(it);
      setDetail((d) => (d?.id === it.id ? it : d));
    },
    onDeleted: (id) => {
      trashed.current.add(id);
      scheduleTags();
      setLibraryTotal((n) => (n === null ? n : Math.max(0, n - 1)));
      feed.remove([id]);
    },
  });

  // ⌘K / Ctrl+K toggles the palette (preventDefault: Firefox uses Ctrl+K for its own search bar). "/" opens it too.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!detail) setPaletteOpen((o) => !o); // never stack the palette on top of the detail view
      } else if (e.key === "/" && !isTyping(e.target) && !detail) {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (e.key === "Escape" && selecting && !detail && !paletteOpen) {
        morph(() => {
          setSelecting(false);
          setSelected(new Set());
        });
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [detail, selecting, paletteOpen]);

  /** After a filter change, bring the top of the results into view if it is off screen. */
  const revealGrid = useCallback(() => {
    const el = gridTop.current;
    if (!el) return;
    const top = el.getBoundingClientRect().top;
    if (top < 0 || top > window.innerHeight * 0.7) window.scrollTo({ top: window.scrollY + top - 80, behavior: "smooth" });
  }, []);

  const changeFilters = (f: Filters) => {
    setFilters(f);
    requestAnimationFrame(revealGrid);
  };
  const toggleTag = (t: string) => changeFilters({ ...filters, tags: filters.tags.includes(t) ? filters.tags.filter((x) => x !== t) : [...filters.tags, t] });
  const showTag = (t: string) => {
    setDetail(null);
    setPaletteOpen(false);
    setFilters({ ...EMPTY_FILTERS, tags: [t] });
    setTimeout(revealGrid, 220);
  };
  const showSite = (site: string) => {
    setDetail(null);
    setFilters({ ...EMPTY_FILTERS, site });
    setTimeout(revealGrid, 220);
  };
  const pick = (c: ItemSummary) => {
    setPaletteOpen(false);
    setTimeout(() => setDetail(c), 160); // let the palette leave first
  };

  const colorLabel = (c: string) => (isColorName(c) ? t(colorKey(c)) : c);
  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? t("gallery.category");
  const chips: FilterChip[] = [
    ...filters.tags.map((t) => ({ key: `tag:${t}`, label: t, onRemove: () => toggleTag(t) })),
    ...(filters.site ? [{ key: "site", label: filters.site, onRemove: () => changeFilters({ ...filters, site: undefined }) }] : []),
    ...(filters.type ? [{ key: "type", label: t(typeKey(filters.type)), onRemove: () => changeFilters({ ...filters, type: undefined }) }] : []),
    ...(filters.color ? [{ key: "color", label: colorLabel(filters.color), onRemove: () => changeFilters({ ...filters, color: undefined }) }] : []),
    ...(filters.category
      ? [{ key: "cat", label: categoryName(filters.category), onRemove: () => changeFilters({ ...filters, category: undefined }) }]
      : []),
    ...(filters.from || filters.to ? [{ key: "date", label: t("gallery.date"), onRemove: () => changeFilters({ ...filters, from: undefined, to: undefined }) }] : []),
  ];

  const describe = () => {
    const parts: string[] = [];
    if (filters.tags.length) parts.push(t("gallery.withTags", { tags: fmt.list(filters.tags) }));
    if (filters.site) parts.push(t("gallery.fromSite", { site: filters.site }));
    if (filters.color) parts.push(t("gallery.inColor", { color: colorLabel(filters.color) }));
    if (filters.category) parts.push(t("gallery.inCategory", { category: categoryName(filters.category) }));
    return parts.join(" ");
  };

  // Detail navigation within the loaded feed.
  const index = detail ? feed.items.findIndex((x) => x.id === detail.id) : -1;
  const prev = index > 0 ? () => setDetail(feed.items[index - 1]!) : undefined;
  const next =
    index >= 0 && index < feed.items.length - 1
      ? () => {
          setDetail(feed.items[index + 1]!);
          if (index + 6 >= feed.items.length && feed.hasMore) feed.loadMore();
        }
      : undefined;

  const onChanged = (m: Item) => {
    const cur = feed.items.find((x) => x.id === m.id);
    if (cur) feed.upsert({ ...cur, title: displayTitle(m), tags: displayTags(m).map((t) => t.tag), hasNote: !!m.user.note });
    scheduleTags();
  };
  const onDeleted = (id: string) => {
    setDetail(null);
    feed.remove([id]);
    scheduleTags();
  };

  const sites = useMemo(() => [...new Set(feed.items.map((i) => i.site))].sort(), [feed.items]);

  const toggleSelect = (it: ItemSummary) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(it.id)) n.delete(it.id);
      else n.add(it.id);
      return n;
    });
  const stopSelecting = () =>
    morph(() => {
      setSelecting(false);
      setSelected(new Set());
    });
  const startSelecting = () => morph(() => setSelecting(true));

  const initial = feed.items.length === 0 && (feed.loading || feed.total === null);
  const ghosts = feed.loading && !feed.stale ? (feed.items.length ? 6 : 12) : 0;
  const emptyLibrary = libraryTotal === 0 && !hasFilters(filters);

  return (
    <div className="px-4 sm:px-6 lg:px-10">
      <TopBar chips={chips} onClear={() => changeFilters(EMPTY_FILTERS)} onSearch={() => setPaletteOpen(true)} />

      <main className="mx-auto max-w-[1680px] pb-28">
        <section className="hero-light -mx-4 px-4 pt-6 pb-6 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10" aria-label={t("gallery.tags")}>
          <TagMarquee tags={tags} selected={filters.tags} onToggle={toggleTag} libraryTotal={libraryTotal} />
          {/* Reserved while the tags load (no jump when they arrive); the empty hero brings its own copy. */}
          {(tags === null || tags.length > 0) && (
            <p aria-hidden={tags === null || undefined} className={`${tags === null ? "invisible" : "fade-in"} mx-auto mt-6 max-w-[62ch] text-center text-[14px] leading-relaxed text-[var(--ink-3)]`}>
              {t("gallery.summary", { captures: libraryTotal === null ? "…" : t("common.captures", { count: libraryTotal }), tags: tags?.length ?? 0 })}
              <span className="kbd-hint">
                {t.node("gallery.summarySearch", { shortcut: <span className="text-[var(--ink-2)]">{isMac ? "⌘K" : "Ctrl K"}</span> })}
              </span>
              .
            </p>
          )}
        </section>

        <div ref={gridTop} />
        <div className="flex min-h-10 items-center py-2 text-[13px] text-[var(--ink-3)]" aria-live="polite">
          {hasFilters(filters) && feed.total !== null && !feed.stale && (
            <span className="fade-in">
              {t("gallery.results", { count: feed.total, filters: describe() })}
            </span>
          )}
        </div>

        <Masonry
          items={feed.items}
          ratio={ratio}
          itemKey={keyOf}
          ghosts={initial && !emptyLibrary ? 12 : ghosts}
          stale={feed.stale}
          render={(c, box) => (
            <CaptureTile
              item={c}
              height={box.height}
              clipped={box.clipped}
              fresh={fresh.has(c.id)}
              selecting={selecting}
              selected={selected.has(c.id)}
              onOpen={selecting ? toggleSelect : setDetail}
            />
          )}
        />

        <Sentinel onVisible={feed.loadMore} disabled={feed.loading || !feed.hasMore || feed.stale} armKey={feed.items.length} />

        <footer className="flex min-h-[160px] flex-col items-center justify-center gap-3 py-12 text-center">
          {feed.error && (
            <>
              <p className="text-[14px] text-[var(--ink-2)]">{t("gallery.loadFailed")}</p>
              <Button size="sm" variant="outline" onPress={feed.items.length ? feed.loadMore : feed.reload}>
                {t("common.retry")}
              </Button>
            </>
          )}
          {!feed.error && !feed.loading && !feed.stale && feed.total === 0 && hasFilters(filters) && (
            <>
              <p className="text-[15px] text-white/80">{t("gallery.noMatch")}</p>
              <Button size="sm" variant="outline" onPress={() => (filters.tags.length ? toggleTag(filters.tags.at(-1)!) : changeFilters(EMPTY_FILTERS))}>
                {filters.tags.length ? t("gallery.removeTag", { tag: filters.tags.at(-1)! }) : t("gallery.clearFilters")}
              </Button>
            </>
          )}
          {!feed.error && !feed.hasMore && !feed.loading && feed.items.length > 0 && (
            <p className="fade-in flex items-center gap-4 text-[13px] text-[var(--ink-3)]">
              <span className="h-px w-16 bg-gradient-to-r from-transparent to-white/20" />
              {t("gallery.end")}
              <span className="h-px w-16 bg-gradient-to-l from-transparent to-white/20" />
            </p>
          )}
        </footer>
      </main>

      {selecting ? (
        <SelectionDock
          ids={[...selected]}
          categories={categories}
          onDone={(removed, refresh) => {
            if (removed.length) feed.remove(removed);
            if (refresh) feed.reload(); // e.g. category changed under a category filter
            setSelected(new Set());
            scheduleTags();
          }}
          onSelectAll={() => setSelected(new Set(feed.items.map((i) => i.id)))}
          onCancel={stopSelecting}
        />
      ) : (
        !emptyLibrary && <FilterDock filters={filters} onChange={changeFilters} categories={categories} sites={sites} onSelect={startSelecting} />
      )}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} tags={tags ?? []} onPick={pick} onTag={showTag} />
      <ItemModal
        summary={detail}
        categories={categories}
        onCategoryCreated={(c) => setCategories((cs) => [...cs, c].sort((a, b) => fmt.compare(a.name, b.name)))}
        onClose={() => setDetail(null)}
        onPrev={prev}
        onNext={next}
        onTag={showTag}
        onSite={showSite}
        onChanged={onChanged}
        onDeleted={onDeleted}
        onOpen={setDetail}
      />
    </div>
  );
}
