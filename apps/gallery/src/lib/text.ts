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

const rtf = new Intl.RelativeTimeFormat("pt-PT", { numeric: "auto" });
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 31536000],
  ["month", 2592000],
  ["week", 604800],
  ["day", 86400],
  ["hour", 3600],
  ["minute", 60],
];

export function timeAgo(iso: string, now = Date.now()) {
  const diff = (Date.parse(iso) - now) / 1000;
  for (const [unit, secs] of UNITS) if (Math.abs(diff) >= secs) return rtf.format(Math.round(diff / secs), unit);
  return "agora mesmo";
}

export const fullDate = (iso: string) =>
  new Intl.DateTimeFormat("pt-PT", { dateStyle: "long", timeStyle: "short" }).format(new Date(iso));

export const kindLabel = {
  area: "Área selecionada",
  visible: "Parte visível",
  full: "Página inteira",
  image: "Imagem guardada",
  link: "Link guardado",
  page: "Página guardada (link)",
} as const;

export const typeLabel = { screenshot: "Captura", link: "Link", post: "Publicação", article: "Artigo" } as const;

/** Colour names the server extracts (packages/ai/src/colors.ts), with a swatch for the filter. */
export const COLORS: { name: string; hex: string }[] = [
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
];

export const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
