import type { Category, ItemType } from "@recorte/shared";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Filters } from "../api";
import { COLORS, typeLabel } from "../lib/text";
import { CloseIcon } from "./icons";

type Props = {
  filters: Filters;
  onChange: (f: Filters) => void;
  categories: Category[];
  sites: string[];
};

const dateLabel = (iso: string) => new Intl.DateTimeFormat("pt-PT", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso}T12:00:00`));

/** One chip that opens a small panel; shows the active value and a clear button once set. */
function FilterMenu({ label, value, onClear, children }: { label: string; value?: string; onClear: () => void; children: (close: () => void) => ReactNode }) {
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
  return (
    <div ref={ref} className="relative">
      <div className="filter-chip" data-active={!!value || undefined} data-open={open || undefined}>
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex items-center gap-1.5 py-1 pr-1 pl-3">
          <span className={value ? "text-[var(--ink-3)]" : ""}>{label}</span>
          {value && <span className="text-white">{value}</span>}
        </button>
        {value ? (
          <button type="button" onClick={onClear} aria-label={`Remover filtro ${label}`} className="py-1 pr-2 pl-0.5 text-white/55 hover:text-white">
            <CloseIcon width={13} height={13} />
          </button>
        ) : (
          <span className="pr-2" />
        )}
      </div>
      {open && <div className="filter-panel fade-in">{children(() => setOpen(false))}</div>}
    </div>
  );
}

const option = "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-[13.5px] text-[var(--ink-2)] hover:bg-white/[0.06] hover:text-white aria-[current=true]:text-white";
const input = "w-full rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1.5 text-[13.5px] text-white outline-none placeholder:text-white/30 focus:border-white/30 [color-scheme:dark]";

export function FilterBar({ filters: f, onChange, categories, sites }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...f, ...patch });
  const [siteDraft, setSiteDraft] = useState("");
  const category = categories.find((c) => c.id === f.category);
  const range = f.from || f.to ? `${f.from ? dateLabel(f.from) : "…"} – ${f.to ? dateLabel(f.to) : "hoje"}` : undefined;

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtros">
      <FilterMenu label="Site" value={f.site} onClear={() => set({ site: undefined })}>
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
            <input autoFocus value={siteDraft} onChange={(e) => setSiteDraft(e.target.value)} placeholder="exemplo.pt" aria-label="Site" className={input} />
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

      <FilterMenu label="Tipo" value={f.type ? typeLabel[f.type] : undefined} onClear={() => set({ type: undefined })}>
        {(close) =>
          (Object.keys(typeLabel) as ItemType[]).map((t) => (
            <button key={t} type="button" aria-current={f.type === t} className={option} onClick={() => (set({ type: t }), close())}>
              {typeLabel[t]}
            </button>
          ))
        }
      </FilterMenu>

      <FilterMenu label="Cor" value={f.color} onClear={() => set({ color: undefined })}>
        {(close) => (
          <div className="grid grid-cols-2 gap-0.5">
            {COLORS.map((c) => (
              <button key={c.name} type="button" aria-current={f.color === c.name} className={option} onClick={() => (set({ color: c.name }), close())}>
                <span className="h-3.5 w-3.5 shrink-0 rounded-full ring-1 ring-white/20" style={{ background: c.hex }} />
                {c.name}
              </button>
            ))}
          </div>
        )}
      </FilterMenu>

      <FilterMenu label="Data" value={range} onClear={() => set({ from: undefined, to: undefined })}>
        {() => (
          <div className="flex flex-col gap-2 p-1 text-[12.5px] text-[var(--ink-3)]">
            <label className="flex flex-col gap-1">
              Desde
              <input type="date" value={f.from ?? ""} max={f.to} onChange={(e) => set({ from: e.target.value || undefined })} className={input} />
            </label>
            <label className="flex flex-col gap-1">
              Até
              <input type="date" value={f.to ?? ""} min={f.from} onChange={(e) => set({ to: e.target.value || undefined })} className={input} />
            </label>
          </div>
        )}
      </FilterMenu>

      <FilterMenu label="Categoria" value={category?.name ?? (f.category ? "…" : undefined)} onClear={() => set({ category: undefined })}>
        {(close) =>
          categories.length ? (
            categories.map((c) => (
              <button key={c.id} type="button" aria-current={f.category === c.id} className={option} onClick={() => (set({ category: c.id }), close())}>
                {c.name}
              </button>
            ))
          ) : (
            <p className="px-2.5 py-2 text-[13px] text-[var(--ink-3)]">Ainda não tens categorias. Cria-as no detalhe de uma captura ou nas definições.</p>
          )
        }
      </FilterMenu>
    </div>
  );
}
