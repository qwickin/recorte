import { Button, Modal, Spinner } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { type Category, type Item, type ItemPatch, type ItemSummary, normalizeTag } from "@recorte/shared";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { api, originalUrl } from "../api";
import { displayTags, displayTitle, hiddenAiTags } from "../lib/item";
import { fullDate, kindLabel, timeAgo, typeLabel } from "../lib/text";
import { CheckIcon, ChevronIcon, CloseIcon, CopyIcon, ExternalIcon, TrashIcon } from "./icons";

type Props = {
  summary: ItemSummary | null;
  categories: Category[];
  onCategoryCreated: (c: Category) => void;
  onClose: () => void;
  onPrev?: () => void;
  onNext?: () => void;
  onTag: (tag: string) => void;
  onSite: (site: string) => void;
  onChanged: (m: Item) => void;
  onDeleted: (id: string) => void;
  onOpen: (it: ItemSummary) => void;
};

const NEW_CATEGORY = "__new__";

export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Text worth copying: the selection the extension extracted, else headings and the page description. */
const extractedText = (m: Item) =>
  m.text.selection.trim() || [...m.text.headings, m.text.meta.description ?? ""].filter(Boolean).join("\n");

const field =
  "w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13.5px] text-white outline-none transition-colors placeholder:text-white/30 hover:border-white/15 focus:border-white/35";

export function ItemModal({ summary, categories, onCategoryCreated, onClose, onPrev, onNext, onTag, onSite, onChanged, onDeleted, onOpen }: Props) {
  // Keep the last summary rendered while the exit animation runs.
  const last = useRef<ItemSummary | null>(summary);
  if (summary) last.current = summary;
  const s = summary ?? last.current;
  const id = summary?.id ?? null;

  const [loaded, setItem] = useState<Item | null>(null);
  // Never edit a previous item while the next one loads (←/→ swap the summary first).
  const item = loaded && loaded.id === s?.id ? loaded : null;
  const [loadError, setLoadError] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [newCat, setNewCat] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [related, setRelated] = useState<ItemSummary[]>([]);

  useEffect(() => {
    if (!id) return;
    const ctrl = new AbortController();
    setItem(null);
    setLoadError(false);
    setError(null);
    setNewCat(null);
    setTagDraft("");
    setRelated([]);
    api.getItem(id, { signal: ctrl.signal }).then(
      (m) => {
        setItem(m);
        setTitle(displayTitle(m));
        setNote(m.user.note ?? "");
      },
      (e) => (e as Error).name !== "AbortError" && setLoadError(true),
    );
    return () => ctrl.abort();
  }, [id]);

  // Related strip: same site, or tags in common (first two shown tags).
  useEffect(() => {
    if (!item) return;
    const ctrl = new AbortController();
    const tags = displayTags(item).slice(0, 2).map((t) => t.tag);
    const reqs = [
      api.listItems({ filters: { tags: [], site: item.source.site }, limit: 9, signal: ctrl.signal }),
      ...tags.map((t) => api.listItems({ filters: { tags: [t] }, limit: 9, signal: ctrl.signal })),
    ];
    Promise.allSettled(reqs).then((rs) => {
      if (ctrl.signal.aborted) return;
      const seen = new Set([item.id]);
      const out: ItemSummary[] = [];
      for (const r of rs) if (r.status === "fulfilled") for (const it of r.value.items) if (!seen.has(it.id)) (seen.add(it.id), out.push(it));
      setRelated(out.slice(0, 8));
    });
    return () => ctrl.abort();
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ←/→ move through the feed, except while typing in a field.
  useEffect(() => {
    if (!summary) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft" && onPrev) (e.preventDefault(), onPrev());
      else if (e.key === "ArrowRight" && onNext) (e.preventDefault(), onNext());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [summary, onPrev, onNext]);

  const save = async (patch: ItemPatch) => {
    if (!item) return;
    setSaving(true);
    setError(null);
    try {
      const next = await api.patchItem(item.id, patch);
      setItem(next);
      onChanged(next);
    } catch {
      setError("Não foi possível guardar. Tenta de novo.");
    } finally {
      setSaving(false);
    }
  };

  const saveTitle = () => {
    if (!item) return;
    const v = title.trim();
    if (v === displayTitle(item)) return;
    const fallback = item.ai.title || item.source.pageTitle;
    void save({ title: v === fallback ? "" : v }); // empty = back to the AI/page title
    if (!v) setTitle(fallback);
  };

  const saveNote = () => {
    if (item && note.trim() !== (item.user.note ?? "")) void save({ note });
  };

  const addTag = () => {
    if (!item) return;
    const t = normalizeTag(tagDraft);
    setTagDraft("");
    if (!t) return;
    if (item.user.hiddenAiTags.includes(t)) void save({ hiddenAiTags: item.user.hiddenAiTags.filter((x) => x !== t) });
    else if (!displayTags(item).some((x) => x.tag === t)) void save({ tags: [...item.user.tags, t] });
  };

  const removeTag = (tag: string, origin: "user" | "ai") => {
    if (!item) return;
    if (origin === "user") void save({ tags: item.user.tags.filter((t) => t !== tag) });
    else void save({ hiddenAiTags: [...item.user.hiddenAiTags, tag] });
  };

  const onCategory = (v: string) => {
    if (v === NEW_CATEGORY) return setNewCat("");
    void save({ categoryId: v || null });
  };

  const createCategory = async () => {
    const name = newCat?.trim();
    if (!name) return setNewCat(null);
    try {
      const c = await api.createCategory({ name });
      onCategoryCreated(c);
      setNewCat(null);
      await save({ categoryId: c.id });
    } catch (e) {
      setError((e as { code?: string }).code === "name_taken" ? "Já existe uma categoria com esse nome." : "Não foi possível criar a categoria.");
    }
  };

  const copy = async () => {
    if (!item) return;
    try {
      await navigator.clipboard.writeText(extractedText(item));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("O navegador não deixou copiar.");
    }
  };

  const remove = async () => {
    if (!item) return;
    try {
      await api.deleteItem(item.id);
      onDeleted(item.id);
    } catch {
      setError("Não foi possível apagar.");
    }
  };

  const enter = (fn: () => void) => (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) (e.preventDefault(), fn());
    if (e.key === "Escape") e.stopPropagation();
  };

  const shown = item ? displayTags(item) : [];
  const hidden = item ? hiddenAiTags(item) : [];
  const text = item ? extractedText(item) : "";

  return (
    <Modal isOpen={!!summary} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop variant="blur" className="bg-black/70">
        <Modal.Container placement="center" className="sm:p-8">
          <Modal.Dialog
            aria-label={s?.title ?? "Captura"}
            className="w-[min(1180px,calc(100vw-2rem))] max-w-none overflow-hidden p-0"
            style={{ "--glow": s?.color } as CSSProperties}
          >
            {s && (
              <div className="flex max-h-[min(86vh,880px)] flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_320px] md:grid-cols-[minmax(0,1fr)_360px]">
                <div className="relative flex max-h-[45vh] min-h-0 shrink-0 flex-col overflow-y-auto bg-black [scrollbar-width:thin] sm:max-h-none">
                  {/* Light bleeding from the capture's dominant colour. */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-40 blur-3xl"
                    style={{ background: `radial-gradient(50% 80% at 50% 0%, ${s.color}, transparent)` }}
                  />
                  <img
                    key={s.id}
                    src={originalUrl(s.id)}
                    alt={s.title}
                    width={s.width || undefined}
                    height={s.height || undefined}
                    className="fade-in relative my-auto block h-auto w-full"
                  />
                  {(onPrev || onNext) && (
                    <div className="pointer-events-none sticky bottom-3 mt-auto flex justify-between px-3">
                      <button type="button" disabled={!onPrev} onClick={onPrev} aria-label="Captura anterior" className="nav-arrow pointer-events-auto">
                        <ChevronIcon className="rotate-180" />
                      </button>
                      <button type="button" disabled={!onNext} onClick={onNext} aria-label="Captura seguinte" className="nav-arrow pointer-events-auto">
                        <ChevronIcon />
                      </button>
                    </div>
                  )}
                </div>

                <aside className="flex min-h-0 flex-col gap-5 overflow-y-auto border-t border-white/[0.07] p-6 sm:border-t-0 sm:border-l">
                  {!item && !loadError && (
                    <div className="flex flex-1 items-center justify-center py-16">
                      <Spinner size="sm" color="current" className="text-white/50" />
                    </div>
                  )}
                  {loadError && <p className="py-10 text-center text-[14px] text-[var(--ink-2)]">Não foi possível abrir esta captura.</p>}

                  {item && (
                    <>
                      <header className="flex flex-col gap-2 pr-8">
                        <label className="sr-only" htmlFor="item-title">
                          Título
                        </label>
                        <textarea
                          id="item-title"
                          rows={2}
                          value={title}
                          onChange={(e) => setTitle(e.target.value)}
                          onBlur={saveTitle}
                          onKeyDown={enter(saveTitle)}
                          className="title-edit -mx-2 resize-none rounded-lg border border-transparent bg-transparent px-2 py-1 text-[22px] leading-tight font-light tracking-[-0.015em] text-white outline-none hover:border-white/10 focus:border-white/25"
                        />
                        {item.ai.description && <p className="text-[14px] leading-relaxed text-[var(--ink-2)]">{item.ai.description}</p>}
                      </header>

                      <div className="flex flex-wrap gap-2">
                        <a href={item.source.url} target="_blank" rel="noreferrer noopener" className={buttonVariants({ size: "sm", variant: "primary" })}>
                          <ExternalIcon /> Abrir página
                        </a>
                        <Button size="sm" variant="ghost" onPress={copy} isDisabled={!text} className="text-[var(--ink-2)]">
                          {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Texto copiado" : "Copiar texto"}
                        </Button>
                        <Button size="sm" variant="ghost" onPress={remove} className="text-[var(--ink-2)] hover:text-white">
                          <TrashIcon /> Apagar
                        </Button>
                      </div>

                      <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
                        <dt className="text-[var(--ink-3)]">Página</dt>
                        <dd className="truncate text-[var(--ink-2)]" title={item.source.pageTitle}>
                          <button type="button" className="link-quiet" onClick={() => onSite(item.source.site)}>
                            {item.source.site}
                          </button>
                        </dd>
                        <dt className="text-[var(--ink-3)]">Capturada</dt>
                        <dd className="text-[var(--ink-2)]" title={fullDate(item.createdAt)}>
                          {timeAgo(item.createdAt)}
                        </dd>
                        <dt className="text-[var(--ink-3)]">Tipo</dt>
                        <dd className="text-[var(--ink-2)]">
                          {item.kind ? kindLabel[item.kind] : typeLabel[item.type]}
                          {item.media[0] ? `, ${item.media[0].width}×${item.media[0].height}` : ""}
                          {item.truncated ? " (cortada)" : ""}
                        </dd>
                        <dt className="self-center text-[var(--ink-3)]">Categoria</dt>
                        <dd>
                          {newCat === null ? (
                            <select
                              aria-label="Categoria"
                              value={item.user.categoryId ?? ""}
                              onChange={(e) => onCategory(e.target.value)}
                              className={`${field} py-1.5`}
                            >
                              <option value="">Sem categoria</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                              <option value={NEW_CATEGORY}>Nova categoria…</option>
                            </select>
                          ) : (
                            <div className="flex gap-1.5">
                              <input
                                autoFocus
                                aria-label="Nome da nova categoria"
                                placeholder="Nome"
                                value={newCat}
                                maxLength={60}
                                onChange={(e) => setNewCat(e.target.value)}
                                onKeyDown={enter(createCategory)}
                                className={`${field} py-1.5`}
                              />
                              <Button size="sm" variant="secondary" onPress={createCategory}>
                                Criar
                              </Button>
                            </div>
                          )}
                        </dd>
                      </dl>

                      <section className="flex flex-col gap-2.5">
                        <h3 className="flex items-center justify-between text-[13px] text-[var(--ink-3)]">
                          Etiquetas
                          <span className="flex items-center gap-1.5 text-[11.5px]">
                            <span className="origin-dot" data-origin="ai" /> sugerida pela IA
                          </span>
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {shown.map((t) => (
                            <span key={t.tag} className="tag-chip" data-origin={t.origin}>
                              <button type="button" onClick={() => onTag(t.tag)} title={t.origin === "ai" ? "Sugerida pela IA" : "Tua"}>
                                {t.origin === "ai" && <span className="origin-dot" data-origin="ai" />}
                                {t.tag}
                              </button>
                              <button type="button" onClick={() => removeTag(t.tag, t.origin)} aria-label={`Remover etiqueta ${t.tag}`} className="tag-chip-x">
                                <CloseIcon width={12} height={12} />
                              </button>
                            </span>
                          ))}
                          <input
                            aria-label="Adicionar etiqueta"
                            placeholder="+ etiqueta"
                            value={tagDraft}
                            maxLength={40}
                            onChange={(e) => setTagDraft(e.target.value)}
                            onKeyDown={enter(addTag)}
                            onBlur={() => tagDraft.trim() && addTag()}
                            className="h-7 w-28 rounded-full border border-dashed border-white/15 bg-transparent px-3 text-[12.5px] text-white outline-none placeholder:text-white/35 focus:border-white/35"
                          />
                        </div>
                        {hidden.length > 0 && (
                          <p className="text-[12px] text-[var(--ink-4)]">
                            Removidas da IA:{" "}
                            {hidden.map((t, i) => (
                              <span key={t}>
                                {i > 0 && ", "}
                                <button
                                  type="button"
                                  className="link-quiet"
                                  title="Repor esta etiqueta"
                                  onClick={() => save({ hiddenAiTags: item.user.hiddenAiTags.filter((x) => x !== t) })}
                                >
                                  {t}
                                </button>
                              </span>
                            ))}
                          </p>
                        )}
                      </section>

                      <section className="flex flex-col gap-2">
                        <label htmlFor="item-note" className="text-[13px] text-[var(--ink-3)]">
                          Nota
                        </label>
                        <textarea
                          id="item-note"
                          rows={3}
                          value={note}
                          placeholder="Escreve uma nota para te lembrares porquê"
                          onChange={(e) => setNote(e.target.value)}
                          onBlur={saveNote}
                          onKeyDown={(e) => e.key === "Escape" && e.stopPropagation()}
                          className={`${field} resize-y leading-relaxed`}
                        />
                      </section>

                      {text && (
                        <section className="flex flex-col gap-2">
                          <h3 className="text-[13px] text-[var(--ink-3)]">Texto extraído</h3>
                          <blockquote className="line-clamp-6 border-l border-white/15 pl-3 text-[13px] leading-relaxed whitespace-pre-line text-[var(--ink-2)] italic">
                            {text}
                          </blockquote>
                        </section>
                      )}

                      {related.length > 0 && (
                        <section className="flex flex-col gap-2.5">
                          <h3 className="text-[13px] text-[var(--ink-3)]">Relacionadas</h3>
                          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
                            {related.map((r) => (
                              <button
                                key={r.id}
                                type="button"
                                onClick={() => onOpen(r)}
                                title={r.title}
                                className="related-thumb"
                                style={{ "--glow": r.color } as CSSProperties}
                              >
                                <img src={r.thumb} alt={r.title} loading="lazy" />
                              </button>
                            ))}
                          </div>
                        </section>
                      )}

                      <p className="mt-auto min-h-[18px] text-[12px] text-[var(--ink-3)]" aria-live="polite">
                        {error ?? (saving ? "A guardar…" : "")}
                      </p>
                    </>
                  )}
                </aside>
              </div>
            )}
            <Modal.CloseTrigger className="absolute top-3 right-3 bg-black/50 text-white/80 backdrop-blur hover:bg-black/70" />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
