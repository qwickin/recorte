import { Button } from "@heroui/react";
import type { ItemSummary } from "@recorte/shared";
import { useState } from "react";
import { api, EMPTY_FILTERS } from "../api";
import { CaptureTile } from "../components/CaptureTile";
import { Masonry } from "../components/Masonry";
import { Sentinel } from "../components/Sentinel";
import { TopBar } from "../components/TopBar";
import { useItemFeed } from "../hooks/useItemFeed";

const ratio = (c: ItemSummary) => (c.width > 0 ? c.height / c.width : 0.62);
const keyOf = (c: ItemSummary) => c.id;

export function TrashPage() {
  const feed = useItemFeed(EMPTY_FILTERS, { trash: true });
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  /** One id: that tile. `"all"`: the whole bin, including pages not loaded yet. */
  const restore = async (target: string | "all") => {
    setBusy(target);
    setMsg(null);
    try {
      const r = target === "all" ? await api.restoreAllTrash() : { ids: [(await api.restoreItem(target)).id] };
      feed.remove(r.ids);
      if (target === "all") feed.reload();
      setMsg(r.ids.length === 1 ? "Captura reposta na galeria." : `${r.ids.length} capturas repostas na galeria.`);
    } catch {
      setMsg("Não foi possível repor.");
      if (target === "all") feed.reload(); // some chunks may have gone through
    } finally {
      setBusy(null);
    }
  };

  const initial = feed.items.length === 0 && (feed.loading || feed.total === null);

  return (
    <div className="px-4 sm:px-6 lg:px-10">
      <TopBar />
      <main className="mx-auto max-w-[1680px]">
        <header className="hero-light -mx-4 flex flex-wrap items-end justify-between gap-4 px-4 pt-8 pb-8 sm:-mx-6 sm:px-6 lg:-mx-10 lg:px-10">
          <div>
            <h1 className="text-[34px] leading-tight font-extralight tracking-[-0.02em] text-white">Lixo</h1>
            <p className="mt-2 max-w-[60ch] text-[14.5px] text-[var(--ink-3)]">
              As capturas apagadas ficam aqui 30 dias e depois desaparecem de vez.
              {feed.total ? ` ${feed.total} ${feed.total === 1 ? "captura" : "capturas"} no lixo.` : ""}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-[var(--ink-3)]" aria-live="polite">
              {msg}
            </span>
            {(feed.total ?? feed.items.length) > 1 && (
              <Button variant="outline" size="sm" isDisabled={!!busy} onPress={() => restore("all")}>
                Repor todas
              </Button>
            )}
          </div>
        </header>

        <Masonry
          items={feed.items}
          ratio={ratio}
          itemKey={keyOf}
          ghosts={initial ? 8 : feed.loading ? 4 : 0}
          render={(c, box) => (
            <CaptureTile
              item={c}
              height={box.height}
              clipped={box.clipped}
              onOpen={() => {}}
              action={
                <Button size="sm" variant="secondary" isDisabled={!!busy} onPress={() => restore(c.id)} className="bg-black/70 backdrop-blur">
                  Repor
                </Button>
              }
            />
          )}
        />
        <Sentinel onVisible={feed.loadMore} disabled={feed.loading || !feed.hasMore} armKey={feed.items.length} />

        <footer className="flex min-h-[160px] flex-col items-center justify-center gap-3 py-12 text-center">
          {feed.error && <p className="text-[14px] text-[var(--ink-2)]">{feed.error}</p>}
          {!feed.error && !feed.loading && feed.total === 0 && <p className="text-[15px] text-white/80">O lixo está vazio.</p>}
        </footer>
      </main>
    </div>
  );
}
