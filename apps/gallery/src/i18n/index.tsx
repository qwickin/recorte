import { I18nProvider as AriaI18nProvider } from "@heroui/react";
import {
  compareText,
  createTranslator,
  formatDate,
  formatList,
  formatNumber,
  formatRelative,
  type Locale,
  type Primitive,
  type Translator,
  tagLabel,
} from "@recorte/shared";
import { createContext, Fragment, use, useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { DICTIONARIES, type MessageKey } from "./dictionaries";
import { getDetected, getLocale, getPreference, setPreference, subscribe } from "./store";

export type { MessageKey } from "./dictionaries";
export { DICTIONARIES } from "./dictionaries";

export type T = Translator<MessageKey> & {
  /** For messages whose arguments are elements (<code>, links): returns a node to render. */
  node(key: MessageKey, vars: Record<string, Primitive | ReactNode>): ReactNode;
};

export type Format = {
  /** "2 minutes ago". */
  relative(date: string | number | Date): string;
  date(date: string | number | Date, opts?: Intl.DateTimeFormatOptions): string;
  number(n: number): string;
  list(items: readonly string[], type?: Intl.ListFormatType): string;
  compare(a: string, b: string): number;
};

type Ctx = {
  locale: Locale;
  /** The saved choice; null = automatic. */
  preference: Locale | null;
  /** What "automatic" resolves to in this browser. */
  browser: Locale;
  setPreference(l: Locale | null): void;
  t: T;
  fmt: Format;
};

export function makeT(locale: Locale): T {
  const t = createTranslator(locale, DICTIONARIES) as T;
  t.node = (key, vars) => (
    <>
      {t.rich<ReactNode>(key, vars).map((p, i) => (
        <Fragment key={i}>{p}</Fragment>
      ))}
    </>
  );
  return t;
}

export function makeFormat(locale: Locale): Format {
  return {
    relative: (d) => formatRelative(d, locale),
    date: (d, opts) => formatDate(d, locale, opts),
    number: (n) => formatNumber(n, locale),
    list: (items, type) => formatList(items, locale, type),
    compare: compareText(locale),
  };
}

const I18nContext = createContext<Ctx | null>(null);

/** Gallery-wide language: our dictionaries, `<html lang>`, and React Aria / HeroUI's own locale. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const locale = useSyncExternalStore(subscribe, getLocale, getLocale);
  const preference = useSyncExternalStore(subscribe, getPreference, getPreference);
  const browser = useSyncExternalStore(subscribe, getDetected, getDetected);
  const value = useMemo<Ctx>(
    () => ({ locale, preference, browser, setPreference, t: makeT(locale), fmt: makeFormat(locale) }),
    [locale, preference, browser],
  );
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  return (
    <I18nContext value={value}>
      <AriaI18nProvider locale={locale}>{children}</AriaI18nProvider>
    </I18nContext>
  );
}

function useI18n(): Ctx {
  const c = use(I18nContext);
  if (!c) throw new Error("I18nProvider missing");
  return c;
}

export const useT = (): T => useI18n().t;
export const useFormat = (): Format => useI18n().fmt;
/** The current locale and the saved choice (Part 2's tag labels read `locale` from here too). */
export function useLocale(): Pick<Ctx, "locale" | "preference" | "browser" | "setPreference"> {
  const { locale, preference, browser, setPreference } = useI18n();
  return { locale, preference, browser, setPreference };
}

/** Labels a tag for display: an AI tag ID in the current language, a tag the person typed verbatim. */
export function useTagLabel(): (tag: string) => string {
  const { locale } = useI18n();
  return useCallback((tag: string) => tagLabel(tag, locale), [locale]);
}

/** A message kept in state as a key (not a translated string), so it follows a live language switch. */
export type Msg = { key: MessageKey; vars?: Record<string, Primitive>; error?: boolean };
export const msgText = (t: T, m: Msg | null | undefined): string | null => (m ? t(m.key, m.vars) : null);
