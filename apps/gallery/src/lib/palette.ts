// "Pesquisar" pressed on a secondary page: the gallery opens the palette once it mounts.
let pending = false;

export const requestPalette = () => void (pending = true);

export function takePaletteRequest(): boolean {
  const p = pending;
  pending = false;
  return p;
}
