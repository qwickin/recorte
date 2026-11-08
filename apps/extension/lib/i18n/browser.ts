import { isLocale, type Locale } from "@recorte/shared";
import { browser } from "wxt/browser";
import { makeT, resolveLocale, type T } from "./index";

/** `storage.local` key of the Options language override (absent/null = automatic). */
export const LOCALE_KEY = "locale";

export async function getLocalePreference(): Promise<Locale | null> {
  const v = (await browser.storage.local.get(LOCALE_KEY))[LOCALE_KEY];
  return isLocale(v) ? v : null;
}

/** `browser.i18n.getUILanguage()`: the same language public/_locales follows. */
export const uiLanguage = (): string => {
  try {
    return browser.i18n.getUILanguage();
  } catch {
    return globalThis.navigator?.language ?? "";
  }
};

export async function getLocale(): Promise<Locale> {
  return resolveLocale(await getLocalePreference(), uiLanguage());
}

export async function getT(): Promise<T> {
  return makeT(await getLocale());
}

/** Calls `fn` when the Options language changes (any extension page or the background). */
export function onLocaleChange(fn: () => void): () => void {
  const l = (changes: Record<string, unknown>, area: string) => {
    if (area === "local" && LOCALE_KEY in changes) fn();
  };
  browser.storage.onChanged.addListener(l);
  return () => browser.storage.onChanged.removeListener(l);
}
