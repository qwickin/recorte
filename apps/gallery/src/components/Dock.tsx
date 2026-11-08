import { Button } from "@heroui/react";
import { type Category, normalizeTags } from "@recorte/shared";
import { createContext, use, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { api, type Filters } from "../api";
import { type Msg, msgText, useFormat, useT } from "../i18n";
import { COLORS, colorKey, isColorName, ITEM_TYPES, typeKey } from "../lib/text";
import { CloseIcon, SelectIcon } from "./icons";

// The floating bottom Dock: filters (+ "Selecionar") or, while selecting, the bulk actions. Both render
// in the same shell with the same `view-transition-name`, so swapping one for the other morphs (see
// `morph` in Gallery.tsx). Filter panels open upwards, anchored to the shell (the chip row scrolls on
// phones, and a scroller would clip them).

const ShellContext = createContext<RefObject<HTMLDivElement | null> | null>(null);

function DockShell({ label, role, children }: { label: string; role?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  return (
    <ShellContext value={ref}>
      <div ref={ref} className="dock" role={role} aria-label={label}>
        {children}
      </div>
    </ShellContext>
  );
}

const PANEL_W = 300;
const CLOSE_MS = 150;

const DATE_CHIP: Intl.DateTimeFormatOptions = { day: "numeric", month: "short", year: "numeric" };

/** One chip that opens a panel above the Dock; shows the active value and a clear button once set. */
function FilterMenu({ label, value, onClear, children }: { label: string; value?: string; onClear: () => void; children: (close: () => void) => ReactNode }) {
  const t = useT();
  const shell = use(ShellContext);
  const [open, setOpen] = useState(false);
  const [closing, setClosing] = useState(false);
  const [left, setLeft] = useState(0);
  const chip = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const close = () => {
    if (!open || closing) return;
    setClosing(true);
    timer.current = setTimeout(() => (setOpen(false), setClosing(false)), CLOSE_MS);
  };
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  // Under the chip, kept inside the Dock's width.
  useLayoutEffect(() => {
    if (!open || !shell?.current || !chip.current) return;
    const s = shell.current.getBoundingClientRect();
    const c = chip.current.getBoundingClientRect();
    const w = Math.min(PANEL_W, s.width);
    setLeft(Math.max(0, Math.min(c.left - s.left, s.width - w)));
  }, [open, shell]);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !chip.current?.contains(e.target as Node) && !panel.current?.contains(e.target as Node) && close();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), close());
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc, true);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc, true);
    };
  });

  return (
    <>
      <div ref={chip} className="filter-chip" data-active={!!value || undefined} data-open={(open && !closing) || undefined}>
        <button type="button" aria-expanded={open && !closing} onClick={() => (open ? close() : setOpen(true))} className="filter-chip-main">
          <span className={value ? "text-[var(--ink-3)]" : ""}>{label}</span>
          {value && <span className="max-w-[12ch] truncate text-white">{value}</span>}
        </button>
        {value && (
          <button type="button" onClick={onClear} aria-label={t("dock.removeFilter", { label })} className="filter-chip-x">
            <CloseIcon width={13} height={13} />
          </button>
        )}
      </div>
      {open && (
        <div ref={panel} className="dock-panel" data-closing={closing || undefined} style={{ left, width: `min(${PANEL_W}px, 100%)` }} role="dialog" aria-label={label}>
          {children(close)}
        </div>
      )}
    </>
  );
}

const option = "flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] text-[var(--ink-2)] hover:bg-white/[0.06] hover:text-white aria-[current=true]:text-white max-sm:min-h-11";
const input = "w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[13.5px] text-white outline-none placeholder:text-white/30 focus:border-white/30 [color-scheme:dark] max-sm:min-h-11 max-sm:text-[16px]";

type FilterProps = {
  filters: Filters;
  onChange: (f: Filters) => void;
  categories: Category[];
  sites: string[];
  onSelect: () => void;
};

export function FilterDock({ filters: f, onChange, categories, sites, onSelect }: FilterProps) {
  const t = useT();
  const fmt = useFormat();
  const dateLabel = (iso: string) => fmt.date(`${iso}T12:00:00`, DATE_CHIP);
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch });
  const [siteDraft, setSiteDraft] = useState("");
  const category = categories.find((c) => c.id === f.category);
  const range = f.from || f.to ? `${f.from ? dateLabel(f.from) : "…"} – ${f.to ? dateLabel(f.to) : t("dock.today")}` : undefined;

  return (
    <DockShell label={t("dock.filters")} role="toolbar">
      <div className="dock-row">
        <FilterMenu label={t("dock.site")} value={f.site} onClear={() => set({ site: undefined })}>
          {(close) => (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const v = siteDraft.trim().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
                if (v) set({ site: v.toLowerCase() });
                setSiteDraft("");
                close();
              }}
              className="flex flex-col gap-1"
            >
              <input autoFocus value={siteDraft} onChange={(e) => setSiteDraft(e.target.value)} placeholder={t("dock.sitePlaceholder")} aria-label={t("dock.site")} className={input} />
              <div className="mt-1 max-h-60 overflow-y-auto">
                {sites
                  .filter((s) => s.includes(siteDraft.trim().toLowerCase()))
                  .slice(0, 12)
                  .map((s) => (
                    <button key={s} type="button" aria-current={f.site === s} className={option} onClick={() => (set({ site: s }), close())}>
                      {s}
                    </button>
                  ))}
              </div>
            </form>
          )}
        </FilterMenu>

        <FilterMenu label={t("dock.type")} value={f.type ? t(typeKey(f.type)) : undefined} onClear={() => set({ type: undefined })}>
          {(close) =>
            ITEM_TYPES.map((ty) => (
              <button key={ty} type="button" aria-current={f.type === ty} className={option} onClick={() => (set({ type: ty }), close())}>
                {t(typeKey(ty))}
              </button>
            ))
          }
        </FilterMenu>

        <FilterMenu label={t("dock.color")} value={f.color && (isColorName(f.color) ? t(colorKey(f.color)) : f.color)} onClear={() => set({ color: undefined })}>
          {(close) => (
            <div className="grid grid-cols-2 gap-0.5">
              {COLORS.map((c) => (
                <button key={c.name} type="button" aria-current={f.color === c.name} className={option} onClick={() => (set({ color: c.name }), close())}>
                  <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/20" style={{ background: c.hex }} />
                  {t(colorKey(c.name))}
                </button>
              ))}
            </div>
          )}
        </FilterMenu>

        <FilterMenu label={t("dock.date")} value={range} onClear={() => set({ from: undefined, to: undefined })}>
          {() => (
            <div className="flex flex-col gap-2 p-1 text-[12.5px] text-[var(--ink-3)]">
              <label className="flex flex-col gap-1">
                {t("dock.from")}
                <input type="date" value={f.from ?? ""} max={f.to} onChange={(e) => set({ from: e.target.value || undefined })} className={input} />
              </label>
              <label className="flex flex-col gap-1">
                {t("dock.to")}
                <input type="date" value={f.to ?? ""} min={f.from} onChange={(e) => set({ to: e.target.value || undefined })} className={input} />
              </label>
            </div>
          )}
        </FilterMenu>

        <FilterMenu label={t("dock.category")} value={category?.name ?? (f.category ? "…" : undefined)} onClear={() => set({ category: undefined })}>
          {(close) =>
            categories.length ? (
              categories.map((c) => (
                <button key={c.id} type="button" aria-current={f.category === c.id} className={option} onClick={() => (set({ category: c.id }), close())}>
                  {c.name}
                </button>
              ))
            ) : (
              <p className="px-2.5 py-2 text-[13px] text-[var(--ink-3)]">{t("dock.noCategories")}</p>
            )
          }
        </FilterMenu>
      </div>
      <span className="dock-sep" aria-hidden="true" />
      <button type="button" onClick={onSelect} className="dock-action" aria-label={t("dock.selectLabel")}>
        <SelectIcon /> <span className="max-sm:sr-only">{t("dock.select")}</span>
      </button>
    </DockShell>
  );
}

/** The server's /api/items/bulk limit; larger selections go in several requests. */
const BULK_MAX = 200;
const chunks = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

type SelectionProps = {
  ids: string[];
  categories: Category[];
  onDone: (removedIds: string[], refresh?: boolean) => void;
  onSelectAll: () => void;
  onCancel: () => void;
};

export function SelectionDock({ ids, categories, onDone, onSelectAll, onCancel }: SelectionProps) {
  const t = useT();
  const [tag, setTag] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Msg | null>(null);
  const none = ids.length === 0;

  const run = async (fn: () => Promise<string[]>, ok: (n: number) => Msg, refresh = false) => {
    setBusy(true);
    setMsg(null);
    try {
      const removed = await fn();
      setMsg(ok(ids.length));
      onDone(removed, refresh);
    } catch {
      setMsg({ key: "dock.failed", error: true });
    } finally {
      setBusy(false);
    }
  };

  const del = () =>
    run(async () => {
      const done: string[] = [];
      for (const part of chunks(ids, BULK_MAX)) done.push(...(await api.bulk({ ids: part, action: "delete" })).ids);
      return done;
    }, (n) => ({ key: "dock.deleted", vars: { count: n } }));

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
    }, (n) => ({ key: "dock.tagAdded", vars: { tag: add[0]!, count: n } }));
  };

  const setCategory = (categoryId: string) =>
    run(async () => {
      for (const part of chunks(ids, BULK_MAX)) await api.bulk({ ids: part, action: "patch", patch: { categoryId: categoryId || null } });
      return [];
    }, (n) => ({ key: "dock.categoryChanged", vars: { count: n } }), true);

  return (
    <DockShell label={t("dock.selectionLabel")} role="toolbar">
      <div className="dock-selection">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 pl-2 text-[13.5px] text-white tabular-nums">{none ? t("dock.pick") : t("dock.selected", { count: ids.length })}</span>
          <button type="button" onClick={onSelectAll} className="dock-link">
            {t("dock.all")}
          </button>
          <span className="min-w-0 truncate text-[12.5px] text-[var(--ink-3)] max-sm:sr-only" aria-live="polite">
            {msgText(t, msg)}
          </span>
          <button type="button" onClick={onCancel} className="dock-link ml-auto sm:hidden">
            {t("common.cancel")}
          </button>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <form
            className="flex min-w-0 flex-1 items-center sm:flex-none"
            onSubmit={(e) => {
              e.preventDefault();
              if (!none && !busy) void addTag();
            }}
          >
            <input
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder={t("dock.addTagPlaceholder")}
              aria-label={t("dock.addTag")}
              maxLength={40}
              disabled={none || busy}
              className="dock-field w-full sm:w-36"
            />
          </form>
          <select aria-label={t("dock.changeCategory")} value="__" disabled={none || busy} onChange={(e) => setCategory(e.target.value)} className="dock-field max-w-[9.5rem] text-[var(--ink-2)] [color-scheme:dark]">
            <option value="__" disabled>
              {t("dock.categoryPlaceholder")}
            </option>
            <option value="">{t("common.noCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <Button size="sm" variant="danger-soft" isDisabled={none || busy} onPress={del} className="dock-danger shrink-0">
            {t("common.delete")}
          </Button>
          <button type="button" onClick={onCancel} className="dock-link max-sm:hidden">
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </DockShell>
  );
}
