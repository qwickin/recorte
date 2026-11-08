import sharp from "sharp";

export const MAX_ORIGINAL_WIDTH = 3200;
export const THUMB_WIDTH = 640;
const WEBP_MAX_DIM = 16383;
// Full page max 12 000 CSS px x DPR 2 x ~2880 px wide ~ 69M pixels.
export const MAX_INPUT_PIXELS = 120_000_000;

export class ImageTooLarge extends Error {}
export class InvalidImage extends Error {}

/** original.webp (≤ 3200 px wide) + thumb.webp (640 px) from any image sharp reads. */
export async function makeImages(input: Buffer): Promise<{ original: Buffer; thumb: Buffer; width: number; height: number }> {
  try {
    // Header-only check, before any pixel decoding.
    const head = await sharp(input, { limitInputPixels: false }).metadata();
    if ((head.width ?? 0) * (head.height ?? 0) > MAX_INPUT_PIXELS) throw new ImageTooLarge("image too large");
  } catch (e) {
    if (e instanceof ImageTooLarge) throw e;
    throw new InvalidImage("invalid image");
  }
  try {
    const o = await sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
      .rotate()
      .resize({ width: MAX_ORIGINAL_WIDTH, height: WEBP_MAX_DIM, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer({ resolveWithObject: true });
    const thumb = await sharp(o.data).resize({ width: THUMB_WIDTH, withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    return { original: o.data, thumb, width: o.info.width, height: o.info.height };
  } catch {
    throw new InvalidImage("invalid image");
  }
}
