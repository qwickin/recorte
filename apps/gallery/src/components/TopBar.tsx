import { Button, Kbd } from "@heroui/react";
import type { ReactNode } from "react";
import { Link, usePath } from "../lib/router";
import { isMac } from "../lib/text";
import { CloseIcon, CropMark, SearchIcon } from "./icons";

export type FilterChip = { key: string; label: string; onRemove: () => void };

type Props = { chips?: FilterChip[]; onClear?: () => void; onSearch?: () => void; actions?: ReactNode };

const NAV = [
  { href: "/lixo", label: "Lixo" },
  { href: "/extensao", label: "Extensão" },
  { href: "/definicoes", label: "Definições" },
];

export function TopBar({ chips = [], onClear, onSearch, actions }: Props) {
  const path = usePath();
  return (
    <header className="topbar">
      <div className="mx-auto flex h-[72px] max-w-[1680px] items-center gap-4 pb-2">
        <Link href="/" className="flex shrink-0 items-center gap-2 rounded-md text-[17px] font-light tracking-[-0.01em] text-white outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <CropMark width={18} height={18} className="text-white/80" />
          Recorte
        </Link>

        <div className="-my-4 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-2 py-4 [scrollbar-width:none]" aria-live="polite">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onRemove}
              aria-label={`Remover filtro ${c.label}`}
              className="fade-in flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] py-1 pr-2 pl-3 text-[13px] text-white shadow-[0_0_16px_-6px_rgb(255_255_255/0.3)] transition-colors outline-none hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {c.label}
              <CloseIcon width={13} height={13} className="text-white/60" />
            </button>
          ))}
          {chips.length > 1 && onClear && (
            <button type="button" onClick={onClear} className="fade-in shrink-0 rounded-md px-2 py-1 text-[13px] text-[var(--ink-3)] transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/70">
              Limpar
            </button>
          )}
        </div>

        <nav className="hidden shrink-0 items-center gap-1 md:flex" aria-label="Secções">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={path === n.href ? "page" : undefined}
              className="nav-link rounded-md px-2.5 py-1.5 text-[13.5px] text-[var(--ink-3)] outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        {actions}

        {onSearch && (
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
        )}
      </div>
      <nav className="flex gap-1 pb-2 md:hidden" aria-label="Secções">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined} className="nav-link rounded-md px-2 py-1 text-[13px] text-[var(--ink-3)]">
            {n.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
