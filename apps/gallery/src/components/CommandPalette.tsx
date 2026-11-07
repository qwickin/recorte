import { Chip, Kbd, Modal, Spinner } from "@heroui/react";
import type { ItemSummary, SearchHit, TagCount } from "@recorte/shared";
import { useEffect, useId, useRef, useState } from "react";
import { ApiError, api } from "../api";
import { timeAgo } from "../lib/text";
import { SearchIcon } from "./icons";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tags: TagCount[];
  onPick: (it: ItemSummary) => void;
  onTag: (tag: string) => void;
};

const SUGGESTIONS = [
  "mapa de Lisboa",
  "tabela de compatibilidade de browsers",
  "página escura com código",
  "banda desenhada sobre ciência",
  "artigo científico sobre IA",
  "doce português",
];

type Option = { kind: "hit"; hit: SearchHit } | { kind: "suggestion"; text: string };

/** Server highlights are HTML-escaped except for <mark>, so they can be rendered as HTML. */
function Highlight({ html, fallback }: { html?: string; fallback: string }) {
  if (!html) return <>{fallback}</>;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function Relevance({ value }: { value: number }) {
  const filled = Math.max(1, Math.round(value * 4));
  return (
    <span className="flex items-end gap-[3px]" role="img" aria-label={`Relevância ${filled} de 4`}>
      {[1, 2, 3, 4].map((i) => (
        <span key={i} className={`w-[3px] rounded-full ${i <= filled ? "bg-white/80" : "bg-white/15"}`} style={{ height: 4 + i * 3 }} />
      ))}
    </span>
  );
}

export function CommandPalette({ open, onOpenChange, tags, onPick, onTag }: Props) {
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SearchHit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const uid = useId();

  useEffect(() => {
    if (!open) return;
    setQ("");
    setHits(null);
    setError(null);
    setActive(0);
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
    const t = setTimeout(async () => {
      try {
        const r = await api.search(query, { limit: 12, signal: ctrl.signal });
        setHits(r);
        setError(null);
        setActive(0);
        setLoading(false);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setHits([]);
        setError(
          e instanceof ApiError && e.status === 503
            ? "A pesquisa não está disponível de momento. Tenta daqui a pouco."
            : "Não foi possível pesquisar. Verifica a ligação e tenta de novo.",
        );
        setLoading(false);
      }
    }, 160);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const options: Option[] = q.trim() ? (hits ?? []).map((hit) => ({ kind: "hit", hit })) : SUGGESTIONS.map((text) => ({ kind: "suggestion", text }));
  const top = hits?.[0]?.score ?? 1;

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (o: Option | undefined) => {
    if (!o) return;
    if (o.kind === "hit") onPick(o.hit.item);
    else setQ(o.text);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(options.length - 1, a + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(options[active]);
    }
  };

  const optionId = (i: number) => `${uid}-opt-${i}`;

  return (
    <Modal isOpen={open} onOpenChange={onOpenChange}>
      <Modal.Backdrop variant="blur" className="bg-black/60">
        <Modal.Container placement="top" className="sm:pt-[12vh]">
          <Modal.Dialog
            aria-label="Pesquisar capturas"
            className="w-[min(700px,calc(100vw-2rem))] max-w-none gap-0 overflow-hidden p-0"
          >
            <div className="flex items-center gap-3 border-b border-white/[0.07] px-5">
              <SearchIcon className="shrink-0 text-white/45" width={18} height={18} />
              <input
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Descreve a captura que procuras"
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
            </div>

            <div ref={listRef} id={`${uid}-list`} role="listbox" aria-label="Resultados" className="max-h-[min(56vh,520px)] overflow-y-auto p-2 [scrollbar-width:thin]">
              {!q.trim() && <p className="px-3 pt-2 pb-1.5 text-[12.5px] text-[var(--ink-3)]">Experimenta</p>}

              {options.map((o, i) =>
                o.kind === "suggestion" ? (
                  <div
                    key={o.text}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(o)}
                    className="palette-row flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] text-[var(--ink-2)]"
                  >
                    <SearchIcon className="text-white/30" />
                    {o.text}
                  </div>
                ) : (
                  <div
                    key={o.hit.item.id}
                    id={optionId(i)}
                    role="option"
                    aria-selected={i === active}
                    onMouseMove={() => setActive(i)}
                    onClick={() => choose(o)}
                    className="palette-row flex cursor-pointer items-center gap-4 rounded-xl p-2.5 pr-4"
                  >
                    <div className="h-[56px] w-[84px] shrink-0 overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10" style={{ backgroundColor: o.hit.item.color + "33" }}>
                      <img src={o.hit.item.thumb} alt="" className="h-full w-full object-cover object-top" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14.5px] text-white">
                        <Highlight html={o.hit.highlight.title} fallback={o.hit.item.title} />
                      </p>
                      {o.hit.highlight.text && (
                        <p className="mt-0.5 truncate text-[12.5px] text-[var(--ink-3)]">
                          <Highlight html={o.hit.highlight.text} fallback="" />
                        </p>
                      )}
                      <p className="mt-1 flex items-center gap-2 text-[12px] text-[var(--ink-4)]">
                        <span className="truncate">{o.hit.item.site}</span>
                        <span className="shrink-0">{timeAgo(o.hit.item.createdAt)}</span>
                        {o.hit.item.tags.slice(0, 3).map((m) => (
                          <span key={m} className="hidden shrink-0 rounded-full border border-white/10 px-2 py-px text-[11px] text-white/55 sm:inline">
                            {m}
                          </span>
                        ))}
                      </p>
                    </div>
                    <Relevance value={o.hit.score / top} />
                  </div>
                ),
              )}

              {q.trim() && error && !loading && (
                <div className="px-3 py-10 text-center" role="status">
                  <p className="text-[15px] text-white/80">{error}</p>
                  <p className="mt-1.5 text-[13px] text-[var(--ink-3)]">Entretanto, podes filtrar pelas etiquetas na galeria.</p>
                </div>
              )}

              {q.trim() && hits && !hits.length && !loading && !error && (
                <div className="px-3 py-10 text-center">
                  <p className="text-[15px] text-white/80">Nada parecido com “{q.trim()}”.</p>
                  <p className="mt-1.5 text-[13px] text-[var(--ink-3)]">Descreve o que lembras da imagem: o tipo de página, cores, texto visível ou o site.</p>
                </div>
              )}

              {!q.trim() && tags.length > 0 && (
                <div className="mt-2 border-t border-white/[0.06] px-3 pt-3 pb-2">
                  <p className="pb-2.5 text-[12.5px] text-[var(--ink-3)]">Filtrar por etiqueta</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.slice(0, 12).map((t) => (
                      <button key={t.tag} type="button" onClick={() => onTag(t.tag)} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                        <Chip size="sm" variant="secondary" className="cursor-pointer bg-white/[0.06] text-[12.5px] text-white/80 transition-colors hover:bg-white/[0.12]">
                          {t.tag}
                        </Chip>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <footer className="flex items-center gap-4 border-t border-white/[0.07] px-5 py-3 text-[12px] text-[var(--ink-3)]">
              <span className="flex items-center gap-1.5">
                <Kbd variant="light">
                  <Kbd.Abbr keyValue="up" />
                </Kbd>
                <Kbd variant="light">
                  <Kbd.Abbr keyValue="down" />
                </Kbd>
                navegar
              </span>
              <span className="flex items-center gap-1.5">
                <Kbd variant="light">
                  <Kbd.Abbr keyValue="enter" />
                </Kbd>
                abrir
              </span>
            </footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
