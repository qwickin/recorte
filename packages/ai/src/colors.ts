import sharp from "sharp";

export const COLOR_NAMES = [
  "preto", "branco", "cinzento", "vermelho", "laranja", "amarelo", "verde", "azul", "roxo", "rosa", "castanho", "bege",
] as const;
export type ColorName = (typeof COLOR_NAMES)[number];

function hsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return [h, s, l];
}

export function colorName(r: number, g: number, b: number): ColorName {
  const [h, s, l] = hsl(r, g, b);
  if (l < 0.1) return "preto";
  if (l > 0.93) return "branco";
  if (s < 0.12) return l < 0.18 ? "preto" : l > 0.88 ? "branco" : "cinzento";
  // warm hues at low lightness / low saturation read as brown or beige
  if (h >= 12 && h < 50) {
    if (l < 0.42) return "castanho";
    if (l > 0.72 && s < 0.6) return "bege";
    if (s < 0.4) return l < 0.6 ? "castanho" : "bege";
  }
  if (h < 12 || h >= 345) return l > 0.78 ? "rosa" : "vermelho";
  if (h < 40) return "laranja";
  if (h < 70) return "amarelo";
  if (h < 170) return "verde";
  if (h < 255) return "azul";
  if (h < 290) return "roxo";
  return l > 0.5 || h >= 320 ? "rosa" : "roxo";
}

const hex = (r: number, g: number, b: number) => "#" + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, "0")).join("");

/** 3-colour palette (coarse 8x8x8 histogram on a 64px thumbnail) -> dominant hex + distinct colour names, by weight. */
export async function extractColors(img: Buffer): Promise<{ dominant: string; names: string[] }> {
  const { data, info } = await sharp(img).resize(64, 64, { fit: "inside" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>();
  for (let i = 0; i < data.length; i += info.channels) {
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const key = ((r >> 5) << 6) | ((g >> 5) << 3) | (b >> 5);
    const e = bins.get(key);
    if (e) { e.n++; e.r += r; e.g += g; e.b += b; } else bins.set(key, { n: 1, r, g, b });
  }
  const total = data.length / info.channels;
  const top = [...bins.entries()].sort((a, b) => b[1].n - a[1].n || a[0] - b[0]).slice(0, 3);
  const palette = top.map(([, e]) => ({ share: e.n / total, r: e.r / e.n, g: e.g / e.n, b: e.b / e.n }));
  const first = palette[0]!;
  const names: string[] = [];
  for (const p of palette) {
    if (p.share < 0.05 && p !== first) continue;
    const name = colorName(p.r, p.g, p.b);
    if (!names.includes(name)) names.push(name);
  }
  return { dominant: hex(first.r, first.g, first.b), names };
}
