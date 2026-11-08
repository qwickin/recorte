/** UI languages. `en-US` is the default and the fallback for anything else. */
export const LOCALES = ["en-US", "pt-BR", "es", "fr", "it"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en-US";

/** Each language in its own name, for the language selectors. */
export const LOCALE_NAMES: Record<Locale, string> = {
  "en-US": "English",
  "pt-BR": "Português (Brasil)",
  es: "Español",
  fr: "Français",
  it: "Italiano",
};

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/**
 * One BCP 47 tag ("pt-PT", "es_419", "FR") to a supported locale by its language: `pt*` → pt-BR, `es*` → es,
 * `fr*` → fr, `it*` → it, `en*` → en-US. Anything else (or nothing) → null.
 */
export function matchLocale(tag: string | null | undefined): Locale | null {
  const lang = (tag ?? "").trim().toLowerCase().split(/[-_]/)[0];
  switch (lang) {
    case "en":
      return "en-US";
    case "pt":
      return "pt-BR";
    case "es":
      return "es";
    case "fr":
      return "fr";
    case "it":
      return "it";
    default:
      return null;
  }
}

/** The first supported language in the user's preference list (`navigator.languages`), else en-US. */
export function pickLocale(tags: readonly (string | null | undefined)[] | null | undefined): Locale {
  for (const t of tags ?? []) {
    const m = matchLocale(t);
    if (m) return m;
  }
  return DEFAULT_LOCALE;
}
