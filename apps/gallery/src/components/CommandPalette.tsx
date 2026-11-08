import { Chip, Kbd, Modal, Spinner } from "@heroui/react";
import type { ItemSummary, SearchHit, TagCount } from "@recorte/shared";
import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { ApiError, api } from "../api";
import { PHONE, useMedia } from "../hooks/useMedia";
import { gridMove, isGridKey, paletteCols } from "../lib/grid";
import { type MessageKey, useFormat, useT, useTagLabel } from "../i18n";
import { LinkIcon, SearchIcon } from "./icons";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: TagCount[];
  onPick: (it: ItemSummary) => void;
  onTag: (tag: string) => void;
};

const SUGGESTIONS: MessageKey[] = [
  "palette.suggestion1",
  "palette.suggestion2",
  "palette.suggestion3",
  "palette.suggestion4",
  "palette.suggestion5",
  "palette.suggestion6",
];

type Option = { kind: "hit"; hit: SearchHit } | { kind: "suggestion"; text: string };

/** Server highlights are HTML-escaped except for <mark>, so they can be rendered as HTML. */
function Highlight({ html, fallback }: { html?: string; fallback: string }) {
  if (!html) return <>{fallback}</>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

export function CommandPalette({ open, onOpenChange, tags, onPick, onTag }: Props) {
  const t = useT();
  const label = useTagLabel();
  const fmt = useFormat();
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [active, setActive] = useState(0);
  // ↓ moves from the text field into the results; from then on ←/→ move between cards instead of the caret.
  const [inGrid, setInGrid] = useState(false);
  const [cols, setCols] = useState(3);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();
  const phone = useMedia(PHONE);

  // JS owns the column count, so arrow keys always agree with what is on screen.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!open || !el) return;
    const measure = () => setCols(paletteCols(el.clientWidth));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setHits(null);
    setError(null);
    setActive(0);
    setInGrid(false);
  }, [open]);

  // Debounced search; stale requests are aborted so results never arrive out of order.
  useEffect(() => {
    const query = q.trim();
    if (!query) {
      setHits(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ctrl = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const r = await api.search(query, { limit: 12, signal: ctrl.signal });
        setHits(r);
        setError(null);
        setActive(0);
        setInGrid(false);
        setLoading(false);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setHits([]);
        setError(e instanceof ApiError && e.status === 503 ? "palette.unavailable" : "palette.failed");
        setLoading(false);
      }
    }, 160);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [q]);

  const options: Option[] = q.trim() ? (hits ?? []).map((hit) => ({ kind: "hit", hit })) : SUGGESTIONS.map((k) => ({ kind: "suggestion", text: t(k) }));
  const grid = options[0]?.kind === "hit";

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (o: Option | undefined) => {
    if (!o) return;
    if (o.kind === "hit") onPick(o.hit.item);
    else setQ(o.text);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const n = options.length;
    if (!grid) {
      // Suggestions: a plain list.
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        setActive((a) => gridMove(a, e.key as "ArrowDown", 1, n));
      }
    } else if (!inGrid) {
      // The active card is already highlighted (Enter opens it); ↓ hands the arrows over to the grid.
      if (e.key === "ArrowDown" && n) {
        e.preventDefault();
        setInGrid(true);
      }
    } else if (isGridKey(e.key) && e.key !== "Home" && e.key !== "End") {
      e.preventDefault();
      // ↑ from the first row goes back to the text field.
      if (e.key === "ArrowUp" && active < cols) return setInGrid(false);
      setActive((a) => gridMove(a, e.key as "ArrowLeft", cols, n));
    }
    if (e.key === "Enter") {
      e.preventDefault();
      choose(options[active]);
    }
  };

  const optionId = (i: number) => `${uid}-opt-${i}`;

  return (
    <Modal isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop variant="blur" className="bg-black/60">
        <Modal.Container placement="top" size={phone ? "full" : undefined} className="sm:pt-[10vh]">
          <Modal.Dialog aria-label={t("palette.label")} className="palette-dialog max-w-none gap-0 overflow-hidden p-0">
            <div className="flex shrink-0 items-center gap-3 border-b border-white/[0.07] px-5">
              <SearchIcon className="shrink-0 text-white/45" width={18} height={18} />
              <input
                autoFocus
                value={q}
                onChange={(e) => (setQ(e.target.value), setInGrid(false))}
                onKeyDown={onKeyDown}
                placeholder={t("palette.placeholder")}
                role="combobox"
                aria-expanded="true"
                aria-controls={`${uid}-list`}
                aria-activedescendant={options.length ? optionId(active) : undefined}
                aria-autocomplete="list"
                className="h-16 min-w-0 flex-1 bg-transparent text-[18px] font-light tracking-[-0.01em] text-white placeholder:text-white/30 outline-none"
              />
              {loading ? <Spinner size="sm" color="current" className="text-white/50" /> : null}
              <Kbd variant="light" className="hidden sm:inline-flex">
                esc
              </Kbd>
              {phone && (
                <button type="button" onClick={() => onOpenChange(false)} className="-mr-2 h-11 shrink-0 px-2 text-[14px] text-[var(--ink-2)]">
                  {t("common.close")}
                </button>
              )}
            </div>

            <div ref={listRef} id={`${uid}-list`} role="listbox" aria-label={t("palette.results")} className="palette-list">
              {!q.trim() && <p className="px-3 pt-2 pb-1.5 text-[12.5px] text-[var(--ink-3)]">{t("palette.try")}</p>}

              {grid ? (
                <div className="grid gap-3 p-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
                  {options.map((o, i) =>
                    o.kind === "hit" ? (
                      <div
                        key={o.hit.item.id}
                        id={optionId(i)}
                        role="option"
                        aria-selected={i === active}
                        aria-label={`${o.hit.item.title}, ${o.hit.item.site}`}
                        onMouseMove={() => i !== active && setActive(i)}
                        onClick={() => choose(o)}
                        className="palette-card"
                        style={{ "--glow": o.hit.item.color } as CSSProperties}
                      >
                        <div className="palette-thumb">
                          {o.hit.item.thumb ? (
                            <img src={o.hit.item.thumb} alt="" loading="lazy" decoding="async" />
                          ) : (
                            <div className="palette-textcard">
                              <span className="tile-textcard-site">{o.hit.item.site}</span>
                              <p className="line-clamp-3 text-[14px] leading-snug font-light text-white">{o.hit.item.title}</p>
                            </div>
                          )}
                          {o.hit.item.type === "link" && (
                            <span className="tile-badge" aria-hidden="true">
                              <LinkIcon width={11} height={11} /> {t("common.link")}
                            </span>
                          )}
                          {o.hit.highlight.text && (
                            <p className="palette-snippet">
                              <Highlight html={o.hit.highlight.text} fallback="" />
                            </p>
                          )}
                        </div>
                        <p className="mt-2 truncate px-0.5 text-[13px] text-white">
                          <Highlight html={o.hit.highlight.title} fallback={o.hit.item.title} />
                        </p>
                        <p className="mt-0.5 flex gap-2 px-0.5 text-[11.5px] text-[var(--ink-4)]">
                          <span className="truncate">{o.hit.item.site}</span>
                          <span className="shrink-0">{fmt.relative(o.hit.item.createdAt)}</span>
                        </p>
                      </div>
                    ) : null,
                  )}
                </div>
              ) : (
                options.map((o, i) =>
                  o.kind === "suggestion" ? (
                    <div
                      key={o.text}
                      id={optionId(i)}
                      role="option"
                      aria-selected={i === active}
                      onMouseMove={() => setActive(i)}
                      onClick={() => choose(o)}
                      className="palette-row flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] text-[var(--ink-2)]"
                    >
                      <SearchIcon className="text-white/30" />
                      {o.text}
                    </div>
                  ) : null,
                )
              )}

              {q.trim() && error && !loading && (
                <div className="px-3 py-10 text-center" role="status">
                  <p className="text-[15px] text-white/80">{t(error)}</p>
                  <p className="mt-1.5 text-[13px] text-[var(--ink-3)]">{t("palette.failedHint")}</p>
                </div>
              )}

              {q.trim() && hits && !hits.length && !loading && !error && (
                <div className="px-3 py-10 text-center">
                  <p className="text-[15px] text-white/80">{t("palette.none", { query: q.trim() })}</p>
                  <p className="mt-1.5 text-[13px] text-[var(--ink-3)]">{t("palette.noneHint")}</p>
                </div>
              )}

              {!q.trim() && tags.length > 0 && (
                <div className="mt-2 border-t border-white/[0.06] px-3 pt-3 pb-2">
                  <p className="pb-2.5 text-[12.5px] text-[var(--ink-3)]">{t("palette.filterByTag")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.slice(0, 12).map((tag) => (
                      <button key={tag.tag} type="button" onClick={() => onTag(tag.tag)} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                        <Chip size="sm" variant="secondary" className="cursor-pointer bg-white/[0.06] text-[12.5px] text-white/80 transition-colors hover:bg-white/[0.12]">
                          {label(tag.tag)}
                        </Chip>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <footer className="hidden shrink-0 items-center gap-4 border-t border-white/[0.07] px-5 py-3 text-[12px] text-[var(--ink-3)] sm:flex">
              <span className="flex items-center gap-1.5">
                <Kbd variant="light">
                  <Kbd.Abbr keyValue="up" />
                </Kbd>
                <Kbd variant="light">
                  <Kbd.Abbr keyValue="down" />
                </Kbd>
                {grid && (
                  <>
                    <Kbd variant="light">
                      <Kbd.Abbr keyValue="left" />
                    </Kbd>
                    <Kbd variant="light">
                      <Kbd.Abbr keyValue="right" />
                    </Kbd>
                  </>
                )}
                {t("palette.navigate")}
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd variant="light">
                  <Kbd.Abbr keyValue="enter" />
                </Kbd>
                {t("palette.open")}
              </span>
            </footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
