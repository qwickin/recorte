import { Button } from "@heroui/react";
import { type Category, type Item, type ItemSummary, type TagCount, normalizeTags } from "@recorte/shared";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, EMPTY_FILTERS, hasFilters, type Filters } from "../api";
import { CaptureTile } from "../components/CaptureTile";
import { CommandPalette } from "../components/CommandPalette";
import { FilterBar } from "../components/FilterBar";
import { isTyping, ItemModal } from "../components/ItemModal";
import { Masonry } from "../components/Masonry";
import { Sentinel } from "../components/Sentinel";
import { TagMarquee } from "../components/TagMarquee";
import { TopBar, type FilterChip } from "../components/TopBar";
import { SelectIcon } from "../components/icons";
import { useEvents } from "../hooks/useEvents";
import { useItemFeed } from "../hooks/useItemFeed";
import { displayTags, displayTitle, matchesFilters } from "../lib/item";
import { Link } from "../lib/router";
import { isMac, typeLabel } from "../lib/text";

const ratio = (c: ItemSummary) => (c.width > 0 ? c.height / c.width : 0.62);
const keyOf = (c: ItemSummary) => c.id;
const andList = new Intl.ListFormat("pt-PT", { type: "conjunction" });
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function GalleryPage() {
  const [tags, setTags] = useState<TagCount[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [paletteOpen, setPaletteOpen] = useState(false);
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
    api.listTags().then(setTags, () => {});
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

  useEvents({
    onCreated: (it) => {
      scheduleTags();
      setLibraryTotal((n) => (n === null ? n : n + 1));
      if (matchesFilters(it, filtersRef.current) !== true) return;
      setFresh((s) => new Set(s).add(it.id));
      feed.upsert(it);
    },
    onUpdated: (it) => {
      scheduleTags();
      if (!feed.items.some((x) => x.id === it.id)) return;
      if (matchesFilters(it, filtersRef.current) === false) feed.remove([it.id]);
      else feed.upsert(it);
      setDetail((d) => (d?.id === it.id ? it : d));
    },
    onDeleted: (id) => {
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
        setSelecting(false);
        setSelected(new Set());
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

  const chips: FilterChip[] = [
    ...filters.tags.map((t) => ({ key: `tag:${t}`, label: t, onRemove: () => toggleTag(t) })),
    ...(filters.site ? [{ key: "site", label: filters.site, onRemove: () => changeFilters({ ...filters, site: undefined }) }] : []),
    ...(filters.type ? [{ key: "type", label: typeLabel[filters.type], onRemove: () => changeFilters({ ...filters, type: undefined }) }] : []),
    ...(filters.color ? [{ key: "color", label: filters.color, onRemove: () => changeFilters({ ...filters, color: undefined }) }] : []),
    ...(filters.category
      ? [{ key: "cat", label: categories.find((c) => c.id === filters.category)?.name ?? "categoria", onRemove: () => changeFilters({ ...filters, category: undefined }) }]
      : []),
    ...(filters.from || filters.to ? [{ key: "date", label: "data", onRemove: () => changeFilters({ ...filters, from: undefined, to: undefined }) }] : []),
  ];

  const describe = () => {
    const parts: string[] = [];
    if (filters.tags.length) parts.push(`com ${andList.format(filters.tags)}`);
    if (filters.site) parts.push(`de ${filters.site}`);
    if (filters.color) parts.push(`em ${filters.color}`);
    if (filters.category) parts.push(`em ${categories.find((c) => c.id === filters.category)?.name ?? "categoria"}`);
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
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const initial = feed.items.length === 0 && (feed.loading || feed.total === null);
  const ghosts = feed.loading && !feed.stale ? (feed.items.length ? 6 : 12) : 0;
  const emptyLibrary = libraryTotal === 0 && !hasFilters(filters);

  return (
    <div className="px-4 sm:px-6 lg:px-10">
      <TopBar
        chips={chips}
        onClear={() => changeFilters(EMPTY_FILTERS)}
        onSearch={() => setPaletteOpen(true)}
        actions={
          <Button
            size="sm"
            variant={selecting ? "secondary" : "ghost"}
            onPress={() => (selecting ? stopSelecting() : setSelecting(true))}
            aria-pressed={selecting}
            className="shrink-0 text-[var(--ink-2)]"
          >
            <SelectIcon /> <span className="hidden lg:inline">{selecting ? "Terminar" : "Selecionar"}</span>
          </Button>
        }
      />

      <main className="mx-auto max-w-[1680px]">
        <section className="hero-light -mx-4 px-4 pt-6 pb-6 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10" aria-label="Etiquetas">
          <TagMarquee tags={tags} selected={filters.tags} onToggle={toggleTag} />
          <p className="mx-auto mt-6 max-w-[62ch] text-center text-[14px] leading-relaxed text-[var(--ink-3)]">
            {libraryTotal === null ? "…" : plural(libraryTotal, "captura", "capturas")} e {plural(tags.length, "etiqueta", "etiquetas")}. Clica numa etiqueta para filtrar
            <span className="kbd-hint">
              , ou carrega em <span className="text-[var(--ink-2)]">{isMac ? "⌘K" : "Ctrl K"}</span> para pesquisar pelo que te lembras da imagem
            </span>
            .
          </p>
        </section>

        <div ref={gridTop} />
        <div className="flex min-h-12 flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
          <FilterBar filters={filters} onChange={changeFilters} categories={categories} sites={sites} />
          <div className="text-[13px] text-[var(--ink-3)]" aria-live="polite">
            {hasFilters(filters) && feed.total !== null && !feed.stale && (
              <span className="fade-in">
                {plural(feed.total, "captura", "capturas")} {describe()}
              </span>
            )}
          </div>
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
              <p className="text-[14px] text-[var(--ink-2)]">{feed.error}</p>
              <Button size="sm" variant="outline" onPress={feed.items.length ? feed.loadMore : feed.reload}>
                Tentar de novo
              </Button>
            </>
          )}
          {!feed.error && emptyLibrary && (
            <>
              <p className="text-[15px] text-white/80">Ainda não tens capturas.</p>
              <p className="text-[13.5px] text-[var(--ink-3)]">
                Instala a <Link href="/extensao" className="text-white underline decoration-white/30 underline-offset-4">extensão</Link> e guarda o primeiro recorte.
              </p>
            </>
          )}
          {!feed.error && !feed.loading && !feed.stale && feed.total === 0 && hasFilters(filters) && (
            <>
              <p className="text-[15px] text-white/80">Nenhuma captura corresponde a estes filtros.</p>
              <Button size="sm" variant="outline" onPress={() => (filters.tags.length ? toggleTag(filters.tags.at(-1)!) : changeFilters(EMPTY_FILTERS))}>
                {filters.tags.length ? `Remover “${filters.tags.at(-1)}”` : "Limpar filtros"}
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

      {selecting && (
        <BulkBar
          ids={[...selected]}
          categories={categories}
          onDone={(removed) => {
            if (removed.length) feed.remove(removed);
            setSelected(new Set());
            scheduleTags();
          }}
          onSelectAll={() => setSelected(new Set(feed.items.map((i) => i.id)))}
          onCancel={stopSelecting}
        />
      )}

      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} tags={tags} onPick={pick} onTag={showTag} />
      <ItemModal
        summary={detail}
        categories={categories}
        onCategoryCreated={(c) => setCategories((cs) => [...cs, c].sort((a, b) => a.name.localeCompare(b.name, "pt")))}
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

type BulkProps = {
  ids: string[];
  categories: Category[];
  onDone: (removedIds: string[]) => void;
  onSelectAll: () => void;
  onCancel: () => void;
};

function BulkBar({ ids, categories, onDone, onSelectAll, onCancel }: BulkProps) {
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const none = ids.length === 0;

  const run = async (fn: () => Promise<string[]>, ok: (n: number) => string) => {
    setBusy(true);
    setMsg(null);
    try {
      const removed = await fn();
      setMsg(ok(ids.length));
      onDone(removed);
    } catch {
      setMsg("Algo falhou. Tenta de novo.");
    } finally {
      setBusy(false);
    }
  };

  const del = () =>
    run(async () => (await api.bulk({ ids, action: "delete" })).ids, (n) => `${plural(n, "captura movida", "capturas movidas")} para o lixo`);

  // PATCH replaces user.tags, so each item is merged on its own (summary tags also hold AI tags).
  const addTag = () => {
    const add = normalizeTags([tag]);
    if (!add.length) return;
    setTag("");
    return run(async () => {
      for (const id of ids) {
        const m = await api.getItem(id);
        const merged = normalizeTags([...m.user.tags, ...add]);
        const unhide = m.user.hiddenAiTags.filter((t) => !add.includes(t));
        await api.patchItem(id, { tags: merged, ...(unhide.length !== m.user.hiddenAiTags.length ? { hiddenAiTags: unhide } : {}) });
      }
      return [];
    }, (n) => `“${add[0]}” juntada a ${plural(n, "captura", "capturas")}`);
  };

  const setCategory = (categoryId: string) =>
    run(async () => {
      await api.bulk({ ids, action: "patch", patch: { categoryId: categoryId || null } });
      return [];
    }, (n) => `Categoria mudada em ${plural(n, "captura", "capturas")}`);

  return (
    <div className="bulk-bar fade-in" role="toolbar" aria-label="Ações para as capturas selecionadas">
      <span className="shrink-0 text-[13.5px] text-white">{none ? "Escolhe capturas" : plural(ids.length, "selecionada", "selecionadas")}</span>
      <button type="button" onClick={onSelectAll} className="shrink-0 text-[13px] text-[var(--ink-3)] hover:text-white">
        Todas
      </button>
      <span className="h-5 w-px bg-white/10" />
      <form
        className="flex items-center"
        onSubmit={(e) => {
          e.preventDefault();
          if (!none && !busy) void addTag();
        }}
      >
        <input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="Juntar etiqueta"
          aria-label="Juntar etiqueta"
          maxLength={40}
          disabled={none || busy}
          className="h-8 w-36 rounded-full border border-white/10 bg-white/[0.04] px-3 text-[13px] text-white outline-none placeholder:text-white/35 focus:border-white/30 disabled:opacity-40"
        />
      </form>
      <select
        aria-label="Mudar categoria"
        value="__"
        disabled={none || busy}
        onChange={(e) => setCategory(e.target.value)}
        className="h-8 rounded-full border border-white/10 bg-white/[0.04] px-3 text-[13px] text-[var(--ink-2)] outline-none disabled:opacity-40 [color-scheme:dark]"
      >
        <option value="__" disabled>
          Categoria…
        </option>
        <option value="">Sem categoria</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <Button size="sm" variant="danger-soft" isDisabled={none || busy} onPress={del}>
        Apagar
      </Button>
      <span className="hidden min-w-0 truncate text-[12.5px] text-[var(--ink-3)] sm:inline" aria-live="polite">
        {msg}
      </span>
      <Button size="sm" variant="ghost" onPress={onCancel} className="ml-auto text-[var(--ink-2)]">
        Cancelar
      </Button>
    </div>
  );
}
