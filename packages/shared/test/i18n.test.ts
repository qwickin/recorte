import { describe, expect, it } from "vitest";
import {
  allDictionaryIssues,
  compareText,
  createTranslator,
  type Dictionaries,
  dictionaryIssues,
  formatList,
  formatMessage,
  formatNumber,
  formatRelative,
  LOCALES,
  matchLocale,
  messageArgs,
  type Messages,
  pickLocale,
} from "../src/index";

describe("locale matching", () => {
  it("maps languages to the supported locales", () => {
    expect(matchLocale("pt-PT")).toBe("pt-BR");
    expect(matchLocale("pt")).toBe("pt-BR");
    expect(matchLocale("pt_BR")).toBe("pt-BR");
    expect(matchLocale("es-419")).toBe("es");
    expect(matchLocale("es-ES")).toBe("es");
    expect(matchLocale("fr-CA")).toBe("fr");
    expect(matchLocale("IT-ch")).toBe("it");
    expect(matchLocale("en-GB")).toBe("en-US");
    expect(matchLocale("de-DE")).toBeNull();
    expect(matchLocale("")).toBeNull();
    expect(matchLocale(undefined)).toBeNull();
  });
  it("takes the first supported language of the list, else en-US", () => {
    expect(pickLocale(["de-DE", "fr-FR", "en-US"])).toBe("fr");
    expect(pickLocale(["pt-PT", "en"])).toBe("pt-BR");
    expect(pickLocale(["de", "ja"])).toBe("en-US");
    expect(pickLocale([])).toBe("en-US");
    expect(pickLocale(undefined)).toBe("en-US");
  });
});

describe("messages", () => {
  it("interpolates {name} and formats numbers in the locale", () => {
    expect(formatMessage("en-US", "Hello {name}", { name: "Ana" })).toBe("Hello Ana");
    expect(formatMessage("en-US", "{n} items", { n: 12345 })).toBe("12,345 items");
    expect(formatMessage("fr", "{n} éléments", { n: 12345 })).toBe("12 345 éléments");
    expect(formatMessage("en-US", "missing {x}")).toBe("missing {x}");
  });
  it("picks plural forms by the locale's CLDR rules, falling back to other", () => {
    const m = "{count, plural, =0 {nothing} one {# capture} other {# captures}}";
    expect(formatMessage("en-US", m, { count: 0 })).toBe("nothing");
    expect(formatMessage("en-US", m, { count: 1 })).toBe("1 capture");
    expect(formatMessage("en-US", m, { count: 2 })).toBe("2 captures");
    const fr = "{count, plural, one {# capture} other {# captures}}";
    // French and Portuguese treat 0 as "one"; 1 000 000 is "many", which falls back to "other".
    expect(formatMessage("fr", fr, { count: 0 })).toBe("0 capture");
    expect(formatMessage("fr", fr, { count: 1 })).toBe("1 capture");
    expect(formatMessage("fr", fr, { count: 1000000 })).toBe("1 000 000 captures");
    expect(new Intl.PluralRules("fr").select(1000000)).toBe("many");
    expect(formatMessage("pt-BR", "{n, plural, one {# item} other {# itens}}", { n: 0 })).toBe("0 item");
    expect(formatMessage("es", "{n, plural, one {# elemento} other {# elementos}}", { n: 0 })).toBe("0 elementos");
    expect(formatMessage("it", "{n, plural, one {# elemento} many {# di elementi} other {# elementi}}", { n: 1000000 })).toBe("1.000.000 di elementi");
  });
  it("nests arguments inside plural options and supports select", () => {
    const m = "{count, plural, one {# tag on {site}} other {# tags on {site}}}";
    expect(formatMessage("en-US", m, { count: 3, site: "x.com" })).toBe("3 tags on x.com");
    const s = "{kind, select, link {Link saved} other {Capture saved}}";
    expect(formatMessage("en-US", s, { kind: "link" })).toBe("Link saved");
    expect(formatMessage("en-US", s, { kind: "area" })).toBe("Capture saved");
    expect(formatMessage("en-US", "# is a hash")).toBe("# is a hash");
  });
  it("rejects malformed messages", () => {
    expect(() => formatMessage("en-US", "{n, plural, one {x}}", { n: 1 })).toThrow(/other/);
    expect(() => formatMessage("en-US", "{n, number}", { n: 1 })).toThrow(/unknown/);
    expect(() => formatMessage("en-US", "a } b")).toThrow();
    expect(() => formatMessage("en-US", "{n, plural, one {x} other {y}")).toThrow();
  });
  it("lists argument names", () => {
    expect(messageArgs("{a} {n, plural, one {# {b}} other {{c}}}")).toEqual(["a", "b", "c", "n"]);
  });
});

const en = { hello: "Hello {name}", items: "{count, plural, one {# item} other {# items}}", rich: "Open {url} now" };
const pt: Messages<typeof en> = { hello: "Olá {name}", items: "{count, plural, one {# item} other {# itens}}", rich: "Abra {url} agora" };
const dicts: Dictionaries<typeof en> = { "en-US": en, "pt-BR": pt, es: en, fr: en, it: en };

describe("translator", () => {
  it("translates with the locale's dictionary", () => {
    const t = createTranslator("pt-BR", dicts);
    expect(t("hello", { name: "Ana" })).toBe("Olá Ana");
    expect(t("items", { count: 2 })).toBe("2 itens");
    expect(t.locale).toBe("pt-BR");
  });
  it("keeps non-string values as their own parts (rich text)", () => {
    const t = createTranslator("en-US", dicts);
    const el = { tag: "code" };
    expect(t.rich("rich", { url: el })).toEqual(["Open ", el, " now"]);
  });
  it("falls back to English, then to the key, at runtime", () => {
    const broken = { ...dicts, fr: {} as Messages<typeof en> };
    const t = createTranslator("fr", broken);
    expect(t("hello", { name: "A" })).toBe("Hello A");
    expect((t as (k: string) => string)("nope")).toBe("nope");
  });
  it("a locale missing a key is a type error (checked by `tsc` in the typecheck step)", () => {
    // @ts-expect-error `rich` is missing
    const missing: Messages<typeof en> = { hello: "x", items: "y" };
    // @ts-expect-error `typo` is not an English key
    const extra: Messages<typeof en> = { hello: "x", items: "y", rich: "z", typo: "w" };
    // @ts-expect-error a key outside the dictionary
    createTranslator("en-US", dicts)("unknown.key");
    expect(missing && extra).toBeTruthy();
  });
  it("reports dictionary problems", () => {
    expect(dictionaryIssues(en, pt)).toEqual([]);
    expect(dictionaryIssues(en, { hello: "Oi {nome}", items: "", extra: "x" } as unknown as Record<string, string>)).toEqual([
      "missing: rich",
      "arguments differ in hello: {name} vs {nome}",
      "empty: items",
      "arguments differ in items: {count} vs {}",
      "extra: extra",
    ]);
    expect(allDictionaryIssues(dicts)).toEqual([]);
  });
});

describe("Intl helpers", () => {
  const now = Date.parse("2026-01-10T12:00:00Z");
  it("relative times replace the hand-written 'há 2 minutos'", () => {
    expect(formatRelative("2026-01-10T11:58:00Z", "en-US", now)).toBe("2 minutes ago");
    expect(formatRelative("2026-01-10T11:58:00Z", "pt-BR", now)).toBe("há 2 minutos");
    expect(formatRelative("2026-01-09T12:00:00Z", "fr", now)).toBe("hier");
    expect(formatRelative("2026-01-10T11:59:50Z", "es", now)).toBe("ahora");
    expect(formatRelative("2026-01-10T11:59:50Z", "en-US", now)).toBe("now");
  });
  it("numbers, lists and sorting follow the locale", () => {
    expect(formatNumber(1234.5, "it")).toBe("1234,5");
    expect(formatNumber(12345.5, "it")).toBe("12.345,5");
    expect(formatList(["a", "b", "c"], "en-US")).toBe("a, b, and c");
    expect(formatList(["a", "b", "c"], "pt-BR")).toBe("a, b e c");
    expect(["z", "é", "a", "Item 10", "Item 9"].sort(compareText("fr"))).toEqual(["a", "é", "Item 9", "Item 10", "z"]);
    expect(LOCALES).toHaveLength(5);
  });
});
