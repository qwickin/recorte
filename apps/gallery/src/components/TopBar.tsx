import { Kbd } from "@heroui/react";
import { useEffect, useRef, useState } from "react";
import { Link, navigate, usePath } from "../lib/router";
import { requestPalette } from "../lib/palette";
import { type MessageKey, useT } from "../i18n";
import { isMac } from "../lib/text";
import { CloseIcon, CropMark, MenuIcon, SearchIcon } from "./icons";

export type FilterChip = { key: string; label: string; onRemove: () => void };

type Props = { chips?: FilterChip[]; onClear?: () => void; onSearch?: () => void };

const NAV: { href: string; label: MessageKey }[] = [
  { href: "/trash", label: "nav.trash" },
  { href: "/extension", label: "nav.extension" },
  { href: "/settings", label: "nav.settings" },
];

/** Phones: the sections fold into a menu, so the bar keeps one row (and one height) everywhere. */
function NavMenu({ path }: { path: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  useEffect(() => setOpen(false), [path]);
  return (
    <div ref={ref} className="relative md:hidden">
      <button type="button" aria-label={t("nav.sections")} aria-expanded={open} onClick={() => setOpen((o) => !o)} className="topbar-icon">
        {open ? <CloseIcon width={18} height={18} /> : <MenuIcon width={18} height={18} />}
      </button>
      {open && (
        <nav className="nav-sheet" aria-label={t("nav.sections")}>
          <Link href="/" aria-current={path === "/" ? "page" : undefined} className="nav-sheet-link nav-link">
            {t("nav.gallery")}
          </Link>
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} aria-current={path === n.href ? "page" : undefined} className="nav-sheet-link nav-link">
              {t(n.label)}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}

export function TopBar({ chips = [], onClear, onSearch }: Props) {
  const path = usePath();
  const t = useT();
  // The search button is on every page (same bar, same widths: no shift between sections). Away from the
  // gallery it goes there and opens the palette.
  const search = onSearch ?? (() => (requestPalette(), navigate("/")));
  // ⌘K / Ctrl+K works on every page: away from the gallery it goes there with the palette open.
  useEffect(() => {
    if (onSearch) return; // the gallery owns the shortcut
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        requestPalette();
        navigate("/");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSearch]);
  return (
    <header className="topbar">
      <div className="mx-auto flex h-[72px] max-w-[1680px] items-center gap-2 pb-2 sm:gap-4">
        <Link href="/" className="flex h-11 shrink-0 items-center gap-2 rounded-md text-[17px] font-light tracking-[-0.01em] text-white outline-none focus-visible:ring-2 focus-visible:ring-white/70">
          <CropMark width={18} height={18} className="text-white/80" />
          <span className="max-[380px]:sr-only">Recorte</span>
        </Link>

        <div className="-my-4 flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto px-2 py-4 [scrollbar-width:none]" aria-live="polite">
          {chips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.onRemove}
              aria-label={t("topbar.removeFilter", { label: c.label })}
              className="fade-in flex shrink-0 items-center gap-1.5 rounded-full border border-white/15 bg-white/[0.06] py-1 pr-2 pl-3 text-[13px] text-white shadow-[0_0_16px_-6px_rgb(255_255_255/0.3)] transition-colors outline-none hover:bg-white/[0.12] focus-visible:ring-2 focus-visible:ring-white/70 max-sm:min-h-11"
            >
              {c.label}
              <CloseIcon width={13} height={13} className="text-white/60" />
            </button>
          ))}
          {chips.length > 1 && onClear && (
            <button type="button" onClick={onClear} className="fade-in shrink-0 rounded-md px-2 py-1 text-[13px] text-[var(--ink-3)] max-sm:min-h-11 transition-colors outline-none hover:text-white focus-visible:ring-2 focus-visible:ring-white/70">
              {t("topbar.clear")}
            </button>
          )}
        </div>

        <nav className="hidden shrink-0 items-center gap-1 md:flex" aria-label={t("nav.sections")}>
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={path === n.href ? "page" : undefined}
              className="nav-link rounded-md px-2.5 py-1.5 text-[13.5px] text-[var(--ink-3)] outline-none transition-colors hover:text-white focus-visible:ring-2 focus-visible:ring-white/70"
            >
              {t(n.label)}
            </Link>
          ))}
        </nav>

        <button type="button" onClick={search} aria-label={t("topbar.searchLabel")} className="search-pill">
          <SearchIcon />
          <span className="hidden text-[14px] sm:inline">{t("topbar.search")}</span>
          <Kbd variant="light" className="hidden sm:inline-flex">
            {isMac ? <Kbd.Abbr keyValue="command" title={t("kbd.command")} /> : <Kbd.Abbr keyValue="ctrl" title={t("kbd.ctrl")} />}
            <Kbd.Content>K</Kbd.Content>
          </Kbd>
        </button>

        <NavMenu path={path} />
      </div>
    </header>
  );
}
