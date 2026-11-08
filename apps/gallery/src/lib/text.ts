import type { CaptureKind, ItemType } from "@recorte/shared";

export const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

const STOP = new Set(
  (
    "a o as os um uma uns umas de da do das dos em no na nos nas por pela pelo para com sem que e ou ao aos se sobre entre " +
    "onde qual quais isto isso este esta essa esse algo coisa tipo the an of to in on for with and or is are this that"
  ).split(" "),
);

export const tokenize = (s: string) =>
  fold(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length > 1 && !STOP.has(t));

export const domainOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Message keys for the item kinds and types (`t(kindKey(k))`). */
export const kindKey = <K extends CaptureKind>(k: K) => `kind.${k}` as const;
export const typeKey = <K extends ItemType>(k: K) => `type.${k}` as const;
export const ITEM_TYPES: readonly ItemType[] = ["screenshot", "link", "post", "article"];

/**
 * Colour names the server extracts (packages/ai/src/colors.ts), with a swatch for the filter. The names are the
 * filter values the server matches on; the label shown is `t(colorKey(name))`.
 */
export const COLORS = [
  { name: "preto", hex: "#111" },
  { name: "branco", hex: "#f4f4f4" },
  { name: "cinzento", hex: "#8a8a8a" },
  { name: "vermelho", hex: "#e5484d" },
  { name: "laranja", hex: "#f76b15" },
  { name: "amarelo", hex: "#ffd60a" },
  { name: "verde", hex: "#30a46c" },
  { name: "azul", hex: "#3e63dd" },
  { name: "roxo", hex: "#8e4ec6" },
  { name: "rosa", hex: "#e93d82" },
  { name: "castanho", hex: "#8d5a3b" },
  { name: "bege", hex: "#d8c3a5" },
] as const;
export type ColorName = (typeof COLORS)[number]["name"];
export const isColorName = (v: string | undefined): v is ColorName => COLORS.some((c) => c.name === v);
/** Label key for a colour filter value; an unknown value (old link) is shown as is. */
export const colorKey = (name: ColorName) => `color.${name}` as const;

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
