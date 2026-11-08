import { DEFAULT_LOCALE, LOCALES, type Locale } from "./locale";
import { formatMessage, formatParts, messageArgs, type Primitive } from "./message";

/**
 * The English dictionary is the source of truth: every other locale is a `Messages<typeof en>`, so a missing (or
 * misspelled) key is a type error.
 */
export type Messages<D> = { readonly [K in keyof D]: string };
export type Dictionaries<D> = { readonly [L in Locale]: Messages<D> };

export interface Translator<K extends string> {
  (key: K, vars?: Record<string, Primitive>): string;
  /** Like `t()`, but non-string values (React elements, DOM nodes) come back as their own parts. */
  rich<V>(key: K, vars: Record<string, Primitive | V>): (string | V)[];
  readonly locale: Locale;
}

export function createTranslator<D extends Record<string, string>>(locale: Locale, dicts: Dictionaries<D>): Translator<keyof D & string> {
  const dict = dicts[locale] as Record<string, string | undefined>;
  const en = dicts[DEFAULT_LOCALE] as Record<string, string | undefined>;
  const msg = (key: string) => dict[key] ?? en[key] ?? key;
  const t = ((key: string, vars?: Record<string, Primitive>) => formatMessage(locale, msg(key), vars)) as Translator<keyof D & string>;
  (t as { rich: unknown }).rich = (key: string, vars: Record<string, unknown>) => formatParts(locale, msg(key), vars as Record<string, Primitive>);
  (t as { locale: Locale }).locale = locale;
  return t;
}

/**
 * Problems of one locale against English, for the apps' dictionary tests: missing/extra keys, a different set of
 * {arguments}, empty strings and syntax errors.
 */
export function dictionaryIssues(en: Record<string, string>, other: Record<string, string>): string[] {
  const issues: string[] = [];
  for (const k of Object.keys(en)) if (!(k in other)) issues.push(`missing: ${k}`);
  for (const [k, v] of Object.entries(other)) {
    if (!(k in en)) {
      issues.push(`extra: ${k}`);
      continue;
    }
    if (!v.trim()) issues.push(`empty: ${k}`);
    try {
      const a = messageArgs(en[k]!).join(",");
      const b = messageArgs(v).join(",");
      if (a !== b) issues.push(`arguments differ in ${k}: {${a}} vs {${b}}`);
    } catch (e) {
      issues.push(`syntax: ${k}: ${(e as Error).message}`);
    }
  }
  return issues;
}

/** Every locale of a dictionary set, checked against English. */
export function allDictionaryIssues<D extends Record<string, string>>(dicts: Dictionaries<D>): string[] {
  const en = dicts[DEFAULT_LOCALE] as Record<string, string>;
  return LOCALES.flatMap((l) => dictionaryIssues(en, dicts[l] as Record<string, string>).map((i) => `${l}: ${i}`));
}
