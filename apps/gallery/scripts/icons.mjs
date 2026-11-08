// Generates the PWA icons in public/icons from the crop-mark logo (src/components/icons.tsx → CropMark).
//   node apps/gallery/scripts/icons.mjs        (uses the server's sharp; outputs are committed)
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require = createRequire(new URL("../../server/package.json", import.meta.url));
const sharp = require("sharp");
const out = fileURLToPath(new URL("../public/icons/", import.meta.url));

/** The crop marks on black. `glyph` = share of the canvas the 24-unit glyph spans. */
const svg = (size, glyph, radius) => {
  const g = size * glyph;
  const o = (size - g) / 2;
  const k = g / 24;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${radius * size}" fill="#000"/>
  <radialGradient id="l" cx="50%" cy="46%" r="55%"><stop offset="0" stop-color="#fff" stop-opacity="0.10"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  <rect width="${size}" height="${size}" rx="${radius * size}" fill="url(#l)"/>
  <g transform="translate(${o} ${o}) scale(${k})" fill="none" stroke="#fff" stroke-width="1.25" stroke-linecap="round" stroke-linejoin="round">
    <path d="M7 2v15h15"/><path d="M2 7h15v15"/>
  </g>
</svg>`;
};

const jobs = [
  ["icon-192.png", 192, 0.62, 0.22],
  ["icon-512.png", 512, 0.62, 0.22],
  // Maskable: full-bleed, glyph inside the 80 % safe circle.
  ["icon-maskable-512.png", 512, 0.5, 0],
  // iOS rounds the corners itself.
  ["apple-touch-icon.png", 180, 0.6, 0],
];
for (const [name, size, glyph, radius] of jobs) {
  await sharp(Buffer.from(svg(size, glyph, radius))).png({ compressionLevel: 9 }).toFile(out + name);
  console.log(name);
}
