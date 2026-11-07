import { Button, Kbd } from "@heroui/react";
import { isMac } from "../lib/text";
import { CloseIcon, CropMark, SearchIcon } from "./icons";

type Props = { filter: string[]; onRemove: (tag: string) => void; onClear: () => void; onSearch: () => void };

export function TopBar({ filter, onRemove, onClear, onSearch }: Props) {
  return (
    <header className="topbar">
      <div className="mx-auto flex h-[72px] max-w-[1680px] items-center gap-4 pb-2">
        <a href="#" className="flex shrink-0 items-center gap-2 rounded-md text-[17px] font-light tracking-[-0.01em] text-white outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <CropMark width={18} height={18} className="text-white/80" />
          Recorte
        </a>

        <div className="-my-4 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-2 py-4 [scrollbar-width:none]" aria-live="polite">
          {filter.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => onRemove(t)}
              aria-label={`Remover filtro ${t}`}
              className="fade-in flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] py-1 pr-2 pl-3 text-[13px] text-white shadow-[0_0_16px_-6px_rgb(255_255_255/0.3)] transition-colors outline-none hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {t}
              <CloseIcon width={13} height={13} className="text-white/60" />
            </button>
          ))}
          {filter.length > 1 && (
            <button type="button" onClick={onClear} className="fade-in shrink-0 rounded-md px-2 py-1 text-[13px] text-[var(--ink-3)] transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/70">
              Limpar
            </button>
          )}
        </div>

        <Button
          variant="outline"
          onPress={onSearch}
          aria-label="Pesquisar capturas"
          className="h-10 shrink-0 gap-2.5 rounded-full border-white/12 bg-white/[0.03] pr-2 pl-3.5 font-light text-[var(--ink-2)] shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_0_40px_-12px_rgb(255_255_255/0.18)] hover:bg-white/[0.07] hover:text-white"
        >
          <SearchIcon />
          <span className="hidden text-[14px] sm:inline">Pesquisar</span>
          <Kbd variant="light" className="hidden sm:inline-flex">
            {isMac ? <Kbd.Abbr keyValue="command" /> : <Kbd.Abbr keyValue="ctrl" />}
            <Kbd.Content>K</Kbd.Content>
          </Kbd>
        </Button>
      </div>
    </header>
  );
}
