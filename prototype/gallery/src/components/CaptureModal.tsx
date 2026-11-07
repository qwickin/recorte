import { Button, Chip, Modal } from "@heroui/react";
import { buttonVariants } from "@heroui/styles";
import { useRef, useState, type CSSProperties } from "react";
import type { Capture } from "../api/types";
import { domainOf, fullDate, kindLabel, timeAgo } from "../lib/text";
import { CheckIcon, CopyIcon, ExternalIcon } from "./icons";

type Props = { capture: Capture | null; onClose: () => void; onTag: (tag: string) => void };

export function CaptureModal({ capture, onClose, onTag }: Props) {
  // Keep the last capture rendered while the exit animation runs.
  const last = useRef<Capture | null>(capture);
  if (capture) last.current = capture;
  const c = capture ?? last.current;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    if (!c) return;
    try {
      await navigator.clipboard.writeText(c.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked (e.g. inside an iframe) */
    }
  };

  return (
    <Modal isOpen={!!capture} onOpenChange={(open) => !open && onClose()}>
      <Modal.Backdrop variant="blur" className="bg-black/70">
        <Modal.Container placement="center" className="sm:p-8">
          <Modal.Dialog
            aria-label={c?.title ?? "Captura"}
            className="w-[min(1180px,calc(100vw-2rem))] max-w-none overflow-hidden p-0"
            style={{ "--glow": c?.image.color } as CSSProperties}
          >
            {c && (
              <div className="flex max-h-[min(86vh,880px)] flex-col sm:grid sm:grid-cols-[minmax(0,1fr)_300px] md:grid-cols-[minmax(0,1fr)_340px]">
                <div className="relative flex max-h-[45vh] min-h-0 shrink-0 flex-col overflow-y-auto bg-black [scrollbar-width:thin] sm:max-h-none">
                  {/* Light bleeding from the capture's dominant colour. */}
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-x-0 top-0 h-48 opacity-40 blur-3xl"
                    style={{ background: `radial-gradient(50% 80% at 50% 0%, ${c.image.color}, transparent)` }}
                  />
                  <img
                    src={c.image.src}
                    alt={c.description}
                    width={c.image.width}
                    height={c.image.height}
                    className="fade-in relative my-auto block h-auto w-full"
                  />
                </div>

                <aside className="flex min-h-0 flex-col gap-6 overflow-y-auto border-t border-white/[0.07] p-6 sm:border-t-0 sm:border-l">
                  <header className="flex flex-col gap-2 pr-8">
                    <h2 className="text-[22px] leading-tight font-light tracking-[-0.015em] text-white">{c.title}</h2>
                    <p className="text-[14px] leading-relaxed text-[var(--ink-2)]">{c.description}</p>
                  </header>

                  <div className="flex flex-wrap gap-2">
                    <a href={c.url} target="_blank" rel="noreferrer noopener" className={buttonVariants({ size: "sm", variant: "primary" })}>
                      <ExternalIcon /> Abrir página
                    </a>
                    <Button size="sm" variant="ghost" onPress={copy} className="text-[var(--ink-2)]">
                      {copied ? <CheckIcon /> : <CopyIcon />} {copied ? "Link copiado" : "Copiar link"}
                    </Button>
                  </div>

                  <dl className="grid grid-cols-[88px_minmax(0,1fr)] gap-x-3 gap-y-2 text-[13px]">
                    <dt className="text-[var(--ink-3)]">Página</dt>
                    <dd className="truncate text-[var(--ink-2)]" title={c.pageTitle}>
                      {domainOf(c.url)}
                    </dd>
                    <dt className="text-[var(--ink-3)]">Capturada</dt>
                    <dd className="text-[var(--ink-2)]" title={fullDate(c.createdAt)}>
                      {timeAgo(c.createdAt)}
                    </dd>
                    <dt className="text-[var(--ink-3)]">Tipo</dt>
                    <dd className="text-[var(--ink-2)]">
                      {kindLabel[c.kind]}, {c.image.width}×{c.image.height}
                    </dd>
                  </dl>

                  <section className="flex flex-col gap-2.5">
                    <h3 className="text-[13px] text-[var(--ink-3)]">Etiquetas</h3>
                    <div className="flex flex-wrap gap-1.5">
                      {c.tags.map((t) => (
                        <button key={t} type="button" onClick={() => onTag(t)} className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-white/70">
                          <Chip size="sm" variant="secondary" className="cursor-pointer bg-white/[0.06] text-[12.5px] text-white/85 transition-colors hover:bg-white/[0.12]">
                            {t}
                          </Chip>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="flex flex-col gap-2">
                    <h3 className="text-[13px] text-[var(--ink-3)]">Chaves de pesquisa</h3>
                    <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">{c.keywords.join(", ")}</p>
                  </section>

                  {c.visibleText && (
                    <section className="flex flex-col gap-2">
                      <h3 className="text-[13px] text-[var(--ink-3)]">Texto na imagem</h3>
                      <blockquote className="border-l border-white/15 pl-3 text-[13px] leading-relaxed text-[var(--ink-2)] italic">
                        {c.visibleText}
                      </blockquote>
                    </section>
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
