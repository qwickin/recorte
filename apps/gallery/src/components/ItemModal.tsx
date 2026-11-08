import { Button, Modal, Spinner, Tooltip } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { API, type Category, type Item, type ItemPatch, type ItemSummary, aiTags, canonicalTag } from "@recorte/shared";
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { api, originalUrl } from "../api";
import { PHONE, useMedia } from "../hooks/useMedia";
import { displayTags, displayTitle, hiddenAiTags } from "../lib/item";
import { type MessageKey, useFormat, useT, useTagLabel } from "../i18n";
import { kindKey, typeKey } from "../lib/text";
import { CheckIcon, ChevronIcon, CloseIcon, CopyIcon, ExternalIcon, TrashIcon } from "./icons";
import { ZoomImage } from "./ZoomImage";

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

/** First Esc in a field only leaves the field (focus back on the dialog); the next one closes the detail. */
const leaveField = (e: KeyboardEvent<HTMLElement>) => {
  if (e.key !== "Escape") return;
  e.stopPropagation();
  e.preventDefault();
  e.currentTarget.closest<HTMLElement>('[role="dialog"]')?.focus();
};

export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Text worth copying: the selection the extension extracted (a link: the page's main text), else headings and the description. */
const extractedText = (m: Item) =>
  m.text.selection.trim() ||
  (m.type === "link" ? (m.text.page?.text.trim() ?? "") : "") ||
  [...m.text.headings, m.link?.description ?? m.text.meta.description ?? ""].filter(Boolean).join("\n");

/** An icon-only action with a tooltip that names it (touch screens get the aria-label only). */
function IconAction({ label, onPress, isDisabled, danger, children }: { label: string; onPress: () => void; isDisabled?: boolean; danger?: boolean; children: ReactNode }) {
  return (
    <Tooltip delay={250} closeDelay={0}>
      <Button
        isIconOnly
        size="sm"
        variant={danger ? "danger-soft" : "ghost"}
        aria-label={label}
        onPress={onPress}
        isDisabled={isDisabled}
        className={danger ? "detail-icon detail-icon--danger" : "detail-icon text-[var(--ink-2)] hover:text-white"}
      >
        {children}
      </Button>
      <Tooltip.Content placement="top" offset={8} className="tooltip-quiet">
        {label}
      </Tooltip.Content>
    </Tooltip>
  );
}

/** A link's video (x.com): a poster with a play button until clicked, then the embed iframe. */
function LinkEmbed({ url, title }: { url: string; title: string }) {
  const t = useT();
  const [on, setOn] = useState(false);
  if (on) {
    return (
      <div className="fade-in absolute inset-0 z-[1] flex justify-center bg-black">
        <iframe
          src={url}
          title={title}
          // color-scheme "light" = the same as the embed's own document, so Chrome keeps its canvas transparent
          // (a mismatch paints it opaque white) and the black column shows around the post.
          style={{ colorScheme: "light" }}
          className="block h-full min-h-[320px] w-[min(560px,100%)] border-0 pt-6"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          sandbox="allow-scripts allow-same-origin allow-popups allow-presentation"
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setOn(true)} className="link-play" aria-label={t("detail.playVideo")}>
      <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
        <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
      </svg>
    </button>
  );
}

const field =
  "w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-3 py-2 text-[13.5px] text-white outline-none transition-colors placeholder:text-white/30 hover:border-white/15 focus:border-white/35";

/** navigator.clipboard only exists in secure contexts; http://<IP>:8080 (the default install) falls back to execCommand. */
async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.append(ta);
  ta.select();
  try {
    if (!document.execCommand("copy")) throw new Error("copy refused");
  } finally {
    ta.remove();
  }
}

export function ItemModal({ summary, categories, onCategoryCreated, onClose, onPrev, onNext, onTag, onSite, onChanged, onDeleted, onOpen }: Props) {
  const t = useT();
  const tagLabel = useTagLabel();
  const fmt = useFormat();
  // Keep the last summary rendered while the exit animation runs.
  const last = useRef<ItemSummary | null>(summary);
  if (summary) last.current = summary;
  const s = summary ?? last.current;
  const id = summary?.id ?? null;

  const [loaded, setItem] = useState<Item | null>(null);
  // Never edit a previous item while the next one loads (←/→ swap the summary first).
  const item = loaded && loaded.id === s?.id ? loaded : null;
  const shownId = useRef<string | null>(null);
  shownId.current = s?.id ?? null;
  const [loadError, setLoadError] = useState(false);
  const [title, setTitle] = useState("");
  const [note, setNote] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [newCat, setNewCat] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);
  const [copied, setCopied] = useState(false);
  const [related, setRelated] = useState<ItemSummary[]>([]);
  const phone = useMedia(PHONE);

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
      if (shownId.current === next.id) setItem(next); // the user may have moved on with ←/→
      onChanged(next);
    } catch {
      setError("common.saveFailed");
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
    // The server's matching: a label of an AI tag (any language) is its ID, so "modo escuro" restores a hidden
    // "dark mode" instead of adding a second tag.
    const t = canonicalTag(tagDraft);
    setTagDraft("");
    if (!t) return;
    if (item.user.hiddenAiTags.includes(t)) void save({ hiddenAiTags: item.user.hiddenAiTags.filter((x) => x !== t) });
    else if (!displayTags(item).some((x) => x.tag === t)) void save({ tags: [...item.user.tags, t] });
  };

  const removeTag = (tag: string, origin: "user" | "ai") => {
    if (!item) return;
    const fromAi = aiTags(item.ai).includes(tag);
    const hide = fromAi && !item.user.hiddenAiTags.includes(tag) ? { hiddenAiTags: [...item.user.hiddenAiTags, tag] } : {};
    // A tag can be both the user's and the AI's: one × removes it from both, or it would come back as an AI tag.
    if (origin === "user") void save({ tags: item.user.tags.filter((t) => t !== tag), ...hide });
    else void save(hide);
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
      setError((e as { code?: string }).code === "name_taken" ? "common.categoryTaken" : "detail.categoryFailed");
    }
  };

  const copy = async () => {
    if (!item) return;
    try {
      await copyText(extractedText(item));
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("detail.copyFailed");
    }
  };

  const remove = async () => {
    if (!item) return;
    try {
      await api.deleteItem(item.id);
      onDeleted(item.id);
    } catch {
      setError("common.deleteFailed");
    }
  };

  const enter = (fn: () => void) => (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Enter" && !e.shiftKey) (e.preventDefault(), fn());
    leaveField(e);
  };

  const shown = item ? displayTags(item) : [];
  const hidden = item ? hiddenAiTags(item) : [];
  const text = item ? extractedText(item) : "";

  return (
    <Modal isOpen={!!summary} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop variant="blur" className="bg-black/70">
        {/* Phones: a full-screen sheet, the image on top and the details scrolling below it. */}
        <Modal.Container placement={phone ? "bottom" : "center"} size={phone ? "full" : undefined} className="sm:p-8">
          <Modal.Dialog
            aria-label={s?.title ?? t("detail.capture")}
            className="detail-dialog max-w-none overflow-hidden p-0"
            style={{ "--glow": s?.color } as CSSProperties}
          >
            {s && (
              <div className="detail-layout">
                <div className="detail-media">
                  {/* Light bleeding from the capture's dominant colour. */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-40 blur-3xl"
                    style={{ background: `radial-gradient(50% 80% at 50% 0%, ${s.color}, transparent)` }}
                  />
                  {s.thumb ? (
                    <ZoomImage
                      key={s.id}
                      src={item?.media[0] ? API.itemFile(s.id, item.media[0].file) : originalUrl(s.id)}
                      alt={s.title}
                      width={s.width || undefined}
                      height={s.height || undefined}
                    />
                  ) : (
                    // A link without an image.
                    <div key={s.id} className="fade-in relative my-auto flex min-h-[240px] flex-col justify-center gap-3 px-8 py-12 sm:min-h-[420px] sm:px-12">
                      <span className="text-[12px] tracking-[0.08em] text-[var(--ink-3)] uppercase">{s.site}</span>
                      <p className="text-[26px] leading-tight font-extralight text-white">{s.title}</p>
                      {item?.link?.description && <p className="text-[15px] leading-relaxed text-[var(--ink-2)]">{item.link.description}</p>}
                    </div>
                  )}
                  {item?.link?.embedUrl && <LinkEmbed key={item.id} url={item.link.embedUrl} title={s.title} />}
                  {(onPrev || onNext) && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-[2] flex justify-between px-3">
                      <button type="button" disabled={!onPrev} onClick={onPrev} aria-label={t("detail.previous")} className="nav-arrow pointer-events-auto">
                        <ChevronIcon className="rotate-180" />
                      </button>
                      <button type="button" disabled={!onNext} onClick={onNext} aria-label={t("detail.next")} className="nav-arrow pointer-events-auto">
                        <ChevronIcon />
                      </button>
                    </div>
                  )}
                </div>

                <aside className="detail-aside">
                  {!item && !loadError && (
                    <div className="flex flex-1 items-center justify-center py-16">
                      <Spinner size="sm" color="current" className="text-white/50" />
                    </div>
                  )}
                  {loadError && <p className="py-10 text-center text-[14px] text-[var(--ink-2)]">{t("detail.openFailed")}</p>}

                  {item && (
                    <>
                      <header className="flex flex-col gap-2 pr-8">
                        <label className="sr-only" htmlFor="item-title">
                          {t("detail.titleLabel")}
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
                        {(item.ai.description || (item.media[0] && item.link?.description)) && (
                          <p className="text-[14px] leading-relaxed text-[var(--ink-2)]">{item.ai.description || item.link?.description}</p>
                        )}
                      </header>

                      <div className="flex flex-wrap items-center gap-1.5">
                        <a href={item.source.url} target="_blank" rel="noreferrer noopener" className={buttonVariants({ size: "sm", variant: "primary" })}>
                          <ExternalIcon /> {item.type === "link" ? t("detail.openLink") : t("detail.openPage")}
                        </a>
                        <IconAction label={copied ? t("detail.copied") : t("detail.copy")} onPress={copy} isDisabled={!text}>
                          {copied ? <CheckIcon /> : <CopyIcon />}
                        </IconAction>
                        <IconAction label={t("detail.delete")} onPress={remove} danger>
                          <TrashIcon />
                        </IconAction>
                      </div>

                      <dl className="grid grid-cols-[minmax(88px,max-content)_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
                        <dt className="text-[var(--ink-3)]">{t("detail.page")}</dt>
                        <dd className="truncate text-[var(--ink-2)]" title={item.source.pageTitle}>
                          <button type="button" className="link-quiet" onClick={() => onSite(item.source.site)}>
                            {item.source.site}
                          </button>
                        </dd>
                        <dt className="text-[var(--ink-3)]">{item.type === "link" ? t("detail.saved") : t("detail.captured")}</dt>
                        <dd className="text-[var(--ink-2)]" title={fmt.date(item.createdAt)}>
                          {fmt.relative(item.createdAt)}
                        </dd>
                        <dt className="text-[var(--ink-3)]">{t("detail.type")}</dt>
                        <dd className="text-[var(--ink-2)]">
                          {item.kind ? t(kindKey(item.kind)) : t(typeKey(item.type))}
                          {item.media[0] ? `, ${item.media[0].width}×${item.media[0].height}` : ""}
                          {item.truncated ? t("detail.cropped") : ""}
                        </dd>
                        <dt className="self-center text-[var(--ink-3)]">{t("detail.category")}</dt>
                        <dd>
                          {newCat === null ? (
                            <select
                              aria-label={t("detail.category")}
                              value={item.user.categoryId ?? ""}
                              onChange={(e) => onCategory(e.target.value)}
                              className={`${field} py-1.5`}
                            >
                              <option value="">{t("common.noCategory")}</option>
                              {categories.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                              <option value={NEW_CATEGORY}>{t("detail.newCategory")}</option>
                            </select>
                          ) : (
                            <div className="flex gap-1.5">
                              <input
                                autoFocus
                                aria-label={t("detail.newCategoryName")}
                                placeholder={t("detail.name")}
                                value={newCat}
                                maxLength={60}
                                onChange={(e) => setNewCat(e.target.value)}
                                onKeyDown={enter(createCategory)}
                                className={`${field} py-1.5`}
                              />
                              <Button size="sm" variant="secondary" onPress={createCategory}>
                                {t("common.create")}
                              </Button>
                            </div>
                          )}
                        </dd>
                      </dl>

                      <section className="flex flex-col gap-2.5">
                        <h3 className="flex items-center justify-between text-[13px] text-[var(--ink-3)]">
                          {t("detail.tags")}
                          <span className="flex items-center gap-1.5 text-[11.5px]">
                            <span className="origin-dot" data-origin="ai" /> {t("detail.aiSuggested")}
                          </span>
                        </h3>
                        <div className="flex flex-wrap gap-1.5">
                          {shown.map((tag) => (
                            <span key={tag.tag} className="tag-chip" data-origin={tag.origin}>
                              <button type="button" onClick={() => onTag(tag.tag)} title={tag.origin === "ai" ? t("detail.aiTag") : t("detail.yourTag")}>
                                {tag.origin === "ai" && <span className="origin-dot" data-origin="ai" />}
                                {tagLabel(tag.tag)}
                              </button>
                              <button type="button" onClick={() => removeTag(tag.tag, tag.origin)} aria-label={t("detail.removeTag", { tag: tagLabel(tag.tag) })} className="tag-chip-x">
                                <CloseIcon width={12} height={12} />
                              </button>
                            </span>
                          ))}
                          <input
                            aria-label={t("detail.addTag")}
                            placeholder={t("detail.addTagPlaceholder")}
                            value={tagDraft}
                            maxLength={40}
                            onChange={(e) => setTagDraft(e.target.value)}
                            onKeyDown={enter(addTag)}
                            onBlur={() => tagDraft.trim() && addTag()}
                            className="tag-add h-7 w-28 rounded-full border border-dashed border-white/15 bg-transparent px-3 text-[12.5px] text-white outline-none placeholder:text-white/35 focus:border-white/35"
                          />
                        </div>
                        {hidden.length > 0 && (
                          <p className="text-[12px] text-[var(--ink-4)]">
                            {t("detail.hidden")}{" "}
                            {hidden.map((tag, i) => (
                              <span key={tag}>
                                {i > 0 && ", "}
                                <button
                                  type="button"
                                  className="link-quiet"
                                  title={t("detail.restoreTag")}
                                  onClick={() => save({ hiddenAiTags: item.user.hiddenAiTags.filter((x) => x !== tag) })}
                                >
                                  {tagLabel(tag)}
                                </button>
                              </span>
                            ))}
                          </p>
                        )}
                      </section>

                      <section className="flex flex-col gap-2">
                        <label htmlFor="item-note" className="text-[13px] text-[var(--ink-3)]">
                          {t("detail.note")}
                        </label>
                        <textarea
                          id="item-note"
                          rows={3}
                          value={note}
                          placeholder={t("detail.notePlaceholder")}
                          onChange={(e) => setNote(e.target.value)}
                          onBlur={saveNote}
                          onKeyDown={leaveField}
                          className={`${field} resize-y leading-relaxed`}
                        />
                      </section>

                      {text && (
                        <section className="flex flex-col gap-2">
                          <h3 className="text-[13px] text-[var(--ink-3)]">{t("detail.text")}</h3>
                          <blockquote className="line-clamp-6 border-l border-white/15 pl-3 text-[13px] leading-relaxed whitespace-pre-line text-[var(--ink-2)] italic">
                            {text}
                          </blockquote>
                        </section>
                      )}

                      {related.length > 0 && (
                        <section className="flex flex-col gap-2.5">
                          <h3 className="text-[13px] text-[var(--ink-3)]">{t("detail.related")}</h3>
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
                                {r.thumb ? <img src={r.thumb} alt={r.title} loading="lazy" /> : <span className="related-text">{r.title}</span>}
                              </button>
                            ))}
                          </div>
                        </section>
                      )}

                      <p className="mt-auto min-h-[18px] text-[12px] text-[var(--ink-3)]" aria-live="polite">
                        {error ? t(error) : saving ? t("common.saving") : ""}
                      </p>
                    </>
                  )}
                </aside>
              </div>
            )}
            <Modal.CloseTrigger aria-label={t("common.close")} className="absolute top-3 right-3 bg-black/50 text-white/80 backdrop-blur hover:bg-black/70" />
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
