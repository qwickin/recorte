import type { ReactNode } from "react";
import { TopBar } from "./TopBar";

/** Shell for the secondary pages: same top bar and black canvas, a narrow column. */
export function Page({ title, intro, children }: { title: string; intro?: ReactNode; children: ReactNode }) {
  return (
    <div className="px-4 sm:px-6 lg:px-10">
      <TopBar />
      <main className="mx-auto max-w-[760px] pt-8 pb-24">
        <header className="hero-light -mx-4 mb-10 px-4 pt-4 pb-6">
          <h1 className="text-[34px] leading-tight font-extralight tracking-[-0.02em] text-white">{title}</h1>
          {intro && <p className="mt-3 max-w-[60ch] text-[14.5px] leading-relaxed text-[var(--ink-3)]">{intro}</p>}
        </header>
        <div className="flex flex-col gap-12">{children}</div>
      </main>
    </div>
  );
}

export function Section({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4">
      <div>
        <h2 className="text-[17px] font-light tracking-[-0.01em] text-white">{title}</h2>
        {description && <p className="mt-1 text-[13.5px] leading-relaxed text-[var(--ink-3)]">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export const inputClass =
  "w-full rounded-xl border border-white/[0.09] bg-white/[0.03] px-3.5 py-2.5 text-[14.5px] text-white outline-none transition-colors placeholder:text-white/30 hover:border-white/15 focus:border-white/35";
