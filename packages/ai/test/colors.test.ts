import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { extractColors } from "../src/colors";

const solid = (hex: string) =>
  sharp({ create: { width: 64, height: 64, channels: 3, background: hex } }).png().toBuffer();

describe("extractColors", () => {
  it("names a solid blue", async () => {
    const r = await extractColors(await solid("#1d4ed8"));
    expect(r.names).toContain("azul");
    expect(r.dominant).toBe("#1d4ed8");
  });
  it("names black and white", async () => {
    expect((await extractColors(await solid("#050505"))).names).toContain("preto");
    expect((await extractColors(await solid("#fafafa"))).names).toContain("branco");
  });
  it("names red and green", async () => {
    expect((await extractColors(await solid("#dc2626"))).names).toContain("vermelho");
    expect((await extractColors(await solid("#16a34a"))).names).toContain("verde");
  });
});
