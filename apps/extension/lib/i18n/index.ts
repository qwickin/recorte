import {
  createTranslator,
  type Dictionaries,
  type Locale,
  matchLocale,
  type Primitive,
  type Translator,
  DEFAULT_LOCALE,
} from "@recorte/shared";
import { type ExtKey, en } from "./en";
import { es } from "./es";
import { fr } from "./fr";
import { it } from "./it";
import { ptBR } from "./pt-BR";

export type { ExtKey } from "./en";
export type T = Translator<ExtKey>;

/** To add a language: a LOCALES entry in packages/shared, a messages file here and a public/_locales folder. */
export const DICTIONARIES: Dictionaries<typeof en> = { "en-US": en, "pt-BR": ptBR, es, fr, it };

/** The saved choice wins; otherwise the browser's UI language (what public/_locales shows), else English. */
export function resolveLocale(preference: Locale | null | undefined, uiLanguage: string | null | undefined): Locale {
  return preference ?? matchLocale(uiLanguage) ?? DEFAULT_LOCALE;
}

export const makeT = (locale: Locale): T => createTranslator(locale, DICTIONARIES);

/** An error whose message is translated where it is shown (background notifications and toasts). */
export class CodedError extends Error {
  constructor(
    readonly key: ExtKey,
    readonly vars?: Record<string, Primitive>,
  ) {
    super(key);
    this.name = "CodedError";
  }
}

export const errorMessage = (t: T, e: unknown): string =>
  e instanceof CodedError ? t(e.key, e.vars) : e instanceof Error ? e.message : String(e);

/**
 * Static copy in the extension pages: `data-i18n="key"` sets the text, `data-i18n-<attr>="key"` an attribute
 * (placeholder, aria-label, title). Also sets `<html lang>`.
 */
export function localizeDom(doc: Document, t: T): void {
  doc.documentElement.lang = t.locale;
  for (const el of doc.querySelectorAll<HTMLElement>("[data-i18n]")) el.textContent = t(el.dataset.i18n as ExtKey);
  for (const attr of ["placeholder", "aria-label", "title"]) {
    for (const el of doc.querySelectorAll<HTMLElement>(`[data-i18n-${attr}]`)) el.setAttribute(attr, t(el.getAttribute(`data-i18n-${attr}`) as ExtKey));
  }
}
