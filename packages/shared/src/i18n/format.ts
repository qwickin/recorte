import type { Locale } from "./locale";

/** Intl formatters, built once per locale and options. */
const memo = new Map<string, unknown>();
function cached<T>(key: string, make: () => T): T {
  let v = memo.get(key) as T | undefined;
  if (!v) memo.set(key, (v = make()));
  return v;
}

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

/** "2 minutes ago", "yesterday", "now" in the locale. */
export function formatRelative(date: string | number | Date, locale: Locale, now = Date.now()): string {
  const rtf = cached(`rtf:${locale}`, () => new Intl.RelativeTimeFormat(locale, { numeric: "auto" }));
  const diff = (new Date(date).getTime() - now) / 1000;
  for (const [unit, secs] of UNITS) if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  return rtf.format(0, "second");
}

export function formatDate(date: string | number | Date, locale: Locale, opts: Intl.DateTimeFormatOptions = { dateStyle: "long", timeStyle: "short" }): string {
  return cached(`dtf:${locale}:${JSON.stringify(opts)}`, () => new Intl.DateTimeFormat(locale, opts)).format(new Date(date));
}

export function formatNumber(n: number, locale: Locale, opts: Intl.NumberFormatOptions = {}): string {
  return cached(`nf:${locale}:${JSON.stringify(opts)}`, () => new Intl.NumberFormat(locale, opts)).format(n);
}

export function formatList(items: readonly string[], locale: Locale, type: Intl.ListFormatType = "conjunction"): string {
  return cached(`lf:${locale}:${type}`, () => new Intl.ListFormat(locale, { type })).format(items);
}

/** Locale-aware, accent-insensitive-first string comparison (for sorting names). */
export function compareText(locale: Locale): (a: string, b: string) => number {
  return cached(`col:${locale}`, () => new Intl.Collator(locale, { sensitivity: "base", numeric: true })).compare;
}
